/* モルモット1匹分の物理・状態・入力処理 */
(function () {
  'use strict';

  const GRAVITY   = 2200;   // px/s^2
  const WALK      = 44;     // px/s
  const RUN       = 132;
  const JUMP_V    = 760;
  const MAX_FALL  = 2000;
  const BOUNCE    = 0.3;
  const AIR_DRAG  = 0.995;
  const FOOT      = 0.94;   // 要素高さに対する足元の位置

  // 個体差（ばらつき 1.0 のときの振れ幅）
  const SIZE_SPREAD  = 0.45;   // 大きさ ±45%
  const SPEED_SPREAD = 0.55;   // 速さ ±55%
  const REACT_MAX    = 1.1;    // カーソルに反応するまでの待ち時間の上限(s)
  const AIM_EPS      = 12;     // これ以下のカーソル移動には反応しない(px)

  const WHEEKS = ['プイプイ！', 'キュイーン', 'ぷぅ〜', 'キュルルル', 'プッププ', 'ごはん！'];
  const HAPPY  = ['♥', 'プイ♪', 'キュン', 'なでなで♪'];

  const rand  = (a, b) => a + Math.random() * (b - a);
  const pick  = (arr) => arr[(Math.random() * arr.length) | 0];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  class Pet {
    constructor(ctx, index) {
      this.ctx = ctx;
      this.index = index;

      this.el = document.createElement('div');
      this.el.className = 'moru';
      this.flip = document.createElement('div');
      this.flip.className = 'moru-flip';
      this.bubble = document.createElement('div');
      this.bubble.className = 'moru-bubble';
      this.el.append(this.flip, this.bubble);

      this.x = rand(40, Math.max(80, innerWidth - 160));
      this.y = 0;
      this.vx = 0;
      this.vy = 0;
      this.dir = Math.random() < 0.5 ? 1 : -1;
      this.state = 'idle';
      this.timer = rand(0.6, 2.0);
      this.platformEl = null;
      this.surfaceY = innerHeight;
      this.dragging = false;
      this.history = [];
      this.keys = { left: false, right: false };
      this.squashTimer = 0;
      this.aimX = null;        // 追いかけている先。反応時間ぶん遅れてカーソルに追いつく
      this.reactTimer = 0;

      this.randomizeTiming();
      this.applySettings(ctx.settings);
      this.y = this.groundY();
      this.bindInput();
      this.render(true);
    }

    /**
     * まばたき・耳・呼吸・歩調の位相と周期を個体ごとにずらす。
     * 負の delay を入れることで、生成直後からサイクルの途中で始まる。
     */
    randomizeTiming() {
      const st = this.el.style;
      const stagger = (name, min, max) => {
        const dur = rand(min, max);
        st.setProperty('--' + name + '-dur', dur.toFixed(2) + 's');
        st.setProperty('--' + name + '-delay', (-rand(0, dur)).toFixed(2) + 's');
      };
      stagger('blink', 3.6, 5.8);
      stagger('ear', 4.2, 7.0);
      stagger('breathe', 2.3, 3.5);
      st.setProperty('--gait-delay', (-rand(0, 0.9)).toFixed(2) + 's');
    }

    /* ---------- 設定 ---------- */

    /**
     * 個体差のくじを引く。ここでは -1〜1（反応だけ 0〜1）の素の値だけを持ち、
     * 実際の振れ幅は設定の variation を掛けて applySettings で決める。
     * こうしておくと、ばらつきの強さを変えても個体の性格（大きい方／速い方）は変わらない。
     */
    rollVariation() {
      this.vary = { size: rand(-1, 1), speed: rand(-1, 1), react: Math.random() };
    }

    applySettings(s) {
      this.settings = s;
      const C = globalThis.MoruCharacter;
      const seedChanged = this.seed !== s.variantSeed;

      // 'random' のときは 1 匹ずつ別の姿を引く。
      // 指定が変わったときとシードが進んだときだけ引き直し、
      // 大きさや速さをいじっただけでは姿が変わらないようにする。
      if (this.colorSetting !== s.color || (s.color === 'random' && seedChanged)) {
        this.colorSetting = s.color;
        this.color = C.resolveColor(s.color);
      }
      if (this.accessorySetting !== s.accessory || (s.accessory === 'random' && seedChanged)) {
        this.accessorySetting = s.accessory;
        this.accessory = C.resolveAccessory(s.accessory);
      }
      if (!this.vary || seedChanged) this.rollVariation();
      this.seed = s.variantSeed;

      // 個体差。大きさ・速さは設定値を中心に上下し、反応時間は 0 から伸びる
      const v = clamp(s.variation || 0, 0, 1);
      const sizeMul = clamp(1 + this.vary.size * v * SIZE_SPREAD, 0.4, 2);
      this.speedMul = clamp(1 + this.vary.speed * v * SPEED_SPREAD, 0.35, 2.2);
      this.reactDelay = this.vary.react * v * REACT_MAX;

      const h = Math.max(16, Math.round(s.size * sizeMul));
      const changed = this.h !== h ||
        this.drawnColor !== this.color || this.drawnAccessory !== this.accessory;
      this.h = h;
      this.w = h * C.ASPECT;

      if (changed || !this.flip.firstChild) {
        this.drawnColor = this.color;
        this.drawnAccessory = this.accessory;
        this.flip.innerHTML = C.build({
          id: this.index, color: this.color, accessory: this.accessory
        });
      }
      this.el.style.width = this.w + 'px';
      this.el.style.height = this.h + 'px';
      this.el.style.setProperty('--walk',
        clamp(0.42 / ((s.speed || 1) * this.speedMul), 0.16, 0.9) + 's');
      this.bubble.style.fontSize = clamp(this.h * 0.2, 10, 20) + 'px';
      this.setState(this.state, null);
    }

    /* ---------- 状態 ---------- */

    setState(state, duration) {
      if (this.state !== state) {
        this.el.classList.remove('st-' + this.state);
        this.state = state;
      }
      this.el.classList.add('st-' + state);
      if (duration != null) this.timer = duration;
    }

    say(text) {
      if (!this.settings.wheek) return;
      this.bubble.textContent = text;
      this.bubble.classList.remove('show');
      void this.bubble.offsetWidth; // アニメーションを頭から再生
      this.bubble.classList.add('show');
    }

    squash() {
      this.el.classList.remove('squash');
      void this.el.offsetWidth;
      this.el.classList.add('squash');
      this.squashTimer = 0.28;
    }

    airborne() {
      return this.state === 'jump' || this.state === 'fall';
    }

    grounded() {
      return !this.airborne() && !this.dragging;
    }

    groundY() {
      return innerHeight - this.h * FOOT;
    }

    /** 足元の Y 座標（個体同士が同じ高さにいるかの判定に使う） */
    feetY() {
      return this.y + this.h * FOOT;
    }

    /* ---------- 入力 ---------- */

    bindInput() {
      this.el.addEventListener('pointerdown', (e) => this.onDown(e));
      this.el.addEventListener('pointermove', (e) => this.onMove(e));
      this.el.addEventListener('pointerup', (e) => this.onUp(e));
      this.el.addEventListener('pointercancel', (e) => this.onUp(e));
      this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    onDown(e) {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      try { this.el.setPointerCapture(e.pointerId); } catch (_) {}
      this.dragging = true;
      this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
      this.grabOffset = { x: e.clientX - this.x, y: e.clientY - this.y };
      this.history = [];
      this.platformEl = null;
      this.vx = 0;
      this.vy = 0;
      this.el.classList.add('dragging');
      this.setState('drag', 0);
    }

    onMove(e) {
      if (!this.dragging) return;
      e.preventDefault();
      this.x = e.clientX - this.grabOffset.x;
      this.y = e.clientY - this.grabOffset.y;
      this.history.push({ t: performance.now(), x: this.x, y: this.y });
      if (this.history.length > 8) this.history.shift();
      this.render();
    }

    onUp(e) {
      if (!this.dragging) return;
      this.dragging = false;
      this.el.classList.remove('dragging');
      try { this.el.releasePointerCapture(e.pointerId); } catch (_) {}

      const moved = this.downAt
        ? Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y) : 0;
      const held = this.downAt ? performance.now() - this.downAt.t : 0;

      if (moved < 6 && held < 400) {   // クリック＝なでる
        this.vx = 0;
        this.vy = -JUMP_V * 0.55;
        this.setState('jump', 0);
        this.say(pick(HAPPY));
        return;
      }

      const h = this.history;
      if (h.length >= 2) {
        const a = h[0];
        const b = h[h.length - 1];
        const dt = Math.max(16, b.t - a.t) / 1000;
        this.vx = clamp((b.x - a.x) / dt, -1600, 1600);
        this.vy = clamp((b.y - a.y) / dt, -1600, 1600);
      } else {
        this.vx = 0;
        this.vy = 0;
      }
      if (Math.abs(this.vx) > 60) this.dir = this.vx > 0 ? 1 : -1;
      this.setState('fall', 0);
    }

    onKey(action, down) {
      if (action === 'left' || action === 'right') {
        this.keys[action] = down;
        if (down) this.dir = action === 'right' ? 1 : -1;
      } else if (action === 'jump' && down && this.grounded()) {
        this.vy = -JUMP_V;
        this.setState('jump', 0);
      }
    }

    /* ---------- カーソル追従 ---------- */

    /**
     * カーソルの位置をそのまま追わず、個体ごとの反応時間ぶん遅れて拾い直す。
     * 気づくのが早い子と鈍い子ができるので、複数匹いると動き出しがばらける。
     */
    trackCursor(dt) {
      const m = this.ctx.mouse;
      if (!m.seen) return;
      if (this.aimX == null) this.aimX = this.x + this.w / 2;   // 最初の一歩も遅れて出す
      if (Math.abs(m.x - this.aimX) < AIM_EPS) {
        this.reactTimer = 0;
        return;
      }
      this.reactTimer += dt;
      if (this.reactTimer >= this.reactDelay) {
        this.aimX = m.x;
        this.reactTimer = 0;
      }
    }

    /* ---------- 行動選択 ---------- */

    /** 届く高さにある足場を探して跳び乗る。跳んだら true */
    jumpToPlatform() {
      if (!this.settings.walkOnElements) return false;
      const maxRise = (JUMP_V * JUMP_V) / (2 * GRAVITY) - 14;   // 到達できる高さ
      const cx = this.x + this.w / 2;
      const options = [];
      for (const p of this.ctx.platforms()) {
        if (p.el === this.platformEl) continue;
        const rise = this.surfaceY - p.top;
        if (rise < 24 || rise > maxRise) continue;
        if (p.right - p.left < this.w * 0.8) continue;
        const target = clamp(cx, p.left + this.w / 2, p.right - this.w / 2);
        if (Math.abs(target - cx) > 340) continue;
        options.push(target - cx);
      }
      if (!options.length) return false;
      const dx = pick(options);
      this.vy = -JUMP_V;
      this.vx = clamp(dx / 0.42, -300, 300);
      if (Math.abs(dx) > 20) this.dir = dx > 0 ? 1 : -1;
      this.setState('jump', 0);
      return true;
    }

    decide() {
      const r = Math.random();
      if (r < 0.30) {
        this.vx = 0;
        this.setState('idle', rand(1.2, 3.4));
      } else if (r < 0.66) {
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.setState('walk', rand(1.4, 4.0));
      } else if (r < 0.74) {
        this.dir = Math.random() < 0.5 ? 1 : -1;
        this.setState('run', rand(0.8, 1.8));
      } else if (r < 0.82) {           // ポップコーンジャンプ（モルモット特有の跳ね方）
        this.vy = -JUMP_V * 0.5;
        this.vx = this.dir * 30;
        this.setState('popcorn', 0.5);
        if (Math.random() < 0.4) this.say(pick(WHEEKS));
      } else if (r < 0.88) {
        if (!this.jumpToPlatform()) {
          this.vy = -JUMP_V;
          this.vx = this.dir * 90;
          this.setState('jump', 0);
        }
      } else if (r < 0.94) {
        this.vx = 0;
        this.setState('eat', rand(1.6, 3.0));
      } else if (r < 0.97) {
        this.vx = 0;
        this.setState('idle', 0.6);
        this.say(pick(WHEEKS));
      } else {
        this.vx = 0;
        this.setState('sleep', rand(4, 10));
      }
    }

    /* ---------- 毎フレーム ---------- */

    update(dt) {
      if (this.squashTimer > 0) {
        this.squashTimer -= dt;
        if (this.squashTimer <= 0) this.el.classList.remove('squash');
      }
      if (this.dragging) {
        this.clampToViewport();
        this.render();
        return;
      }

      const s = this.settings;
      if (s.followCursor) this.trackCursor(dt);
      const wasAir = this.airborne();
      const prevFeet = this.y + this.h * FOOT;
      const onSurface = !!this.platformEl || this.y >= this.groundY() - 1;

      if (!wasAir && onSurface) {
        this.timer -= dt;

        if (s.keyboardControls && this.index === 0 && (this.keys.left || this.keys.right)) {
          this.dir = this.keys.right ? 1 : -1;
          this.setState('walk', 0.2);
        } else if (s.followCursor && this.aimX != null) {
          const gap = this.aimX - (this.x + this.w / 2);
          if (Math.abs(gap) > 24) {
            this.dir = gap > 0 ? 1 : -1;
            this.setState(Math.abs(gap) > 320 ? 'run' : 'walk', 0.2);
          } else if (this.state === 'walk' || this.state === 'run') {
            this.setState('idle', rand(0.8, 2));
          }
        } else if (this.timer <= 0) {
          this.decide();
        }

        // decide() がこのフレームで跳び出していることがあるので、
        // 空中の状態になっていたら横速度を消さない
        if (this.state === 'walk') this.vx = this.dir * WALK * s.speed * this.speedMul;
        else if (this.state === 'run') this.vx = this.dir * RUN * s.speed * this.speedMul;
        else if (!this.airborne() && this.state !== 'popcorn') this.vx = 0;
      }

      // 重力。接地して静止しているあいだは加算しない。
      // ここで足し続けると、地面に立っているだけで毎フレーム
      // 「着地した」と判定されて idle に戻され、歩き出せなくなる。
      if (!wasAir && onSurface && this.vy >= 0) {
        this.vy = 0;
      } else {
        this.vy = Math.min(this.vy + GRAVITY * dt, MAX_FALL);
        if (this.vy > 0 && this.state === 'jump') this.setState('fall', 0);
      }

      this.x += this.vx * dt;
      this.y += this.vy * dt;
      if (this.airborne()) this.vx *= Math.pow(AIR_DRAG, dt * 60);

      // 左右の壁で跳ね返る / 折り返す
      if (this.x < 0) {
        this.x = 0;
        this.dir = 1;
        this.vx = this.airborne() ? Math.abs(this.vx) * BOUNCE : 0;
      }
      const maxX = innerWidth - this.w;
      if (this.x > maxX) {
        this.x = maxX;
        this.dir = -1;
        this.vx = this.airborne() ? -Math.abs(this.vx) * BOUNCE : 0;
      }

      // 乗っている要素に追従する
      if (this.platformEl && (this.airborne() || this.vy < 0)) {
        this.platformEl = null;   // 跳んだら足場から離れる（着地時に拾い直す）
      }
      if (this.platformEl) {
        const rect = this.platformEl.getBoundingClientRect();
        if (!rect.width || rect.bottom < 0 || rect.top > innerHeight - 4) {
          this.platformEl = null;
          this.setState('fall', 0);
        } else {
          this.y = rect.top - this.h * FOOT;
          this.surfaceY = rect.top;
          this.vy = 0;
          const cx = this.x + this.w / 2;
          if (cx < rect.left || cx > rect.right) {
            if (Math.random() < 0.7) {      // 端まで来たら引き返す
              this.dir *= -1;
              this.x = clamp(this.x, rect.left - this.w / 2, rect.right - this.w / 2);
            } else {
              this.platformEl = null;
              this.setState('fall', 0);
            }
          }
        }
      }

      const feet = this.y + this.h * FOOT;

      // 着地判定
      if (this.vy > 0 && !this.platformEl) {
        let landed = false;
        if (feet >= innerHeight) {
          this.y = this.groundY();
          this.surfaceY = innerHeight;
          landed = true;
        } else if (s.walkOnElements) {
          const cx = this.x + this.w / 2;
          for (const p of this.ctx.platforms()) {
            if (cx < p.left + 4 || cx > p.right - 4) continue;
            if (prevFeet <= p.top + 2 && feet >= p.top) {
              this.y = p.top - this.h * FOOT;
              this.surfaceY = p.top;
              this.platformEl = p.el;
              landed = true;
              break;
            }
          }
        }
        if (landed) {
          const impact = this.vy;
          this.vy = 0;
          this.vx = 0;   // 着地したフレームで横に滑らせない
          if (impact > 420) this.squash();
          if (impact > 1100 && Math.random() < 0.5) this.say(pick(WHEEKS));
          this.setState('idle', rand(0.3, 1.2));
        }
      }

      // 地面の上に留める
      if (!this.platformEl && !this.airborne()) {
        const g = this.groundY();
        if (this.y >= g) {
          this.y = g;
          this.vy = 0;
          this.surfaceY = innerHeight;
        }
      }

      this.clampToViewport();
      this.render();
    }

    clampToViewport() {
      this.x = clamp(this.x, -this.w * 0.25, Math.max(0, innerWidth - this.w * 0.75));
      this.y = clamp(this.y, -this.h, innerHeight - this.h * 0.2);
    }

    render(force) {
      const air = clamp(this.surfaceY - (this.y + this.h * FOOT), 0, 400);
      this.el.style.transform =
        'translate3d(' + this.x.toFixed(1) + 'px,' + this.y.toFixed(1) + 'px,0)';
      this.flip.style.transform = 'scaleX(' + this.dir + ')';
      const sh = clamp(1 - air / 90, 0, 1).toFixed(2);
      if (force || this._sh !== sh) {
        this.el.style.setProperty('--sh', sh);
        this._sh = sh;
      }
    }

    destroy() {
      this.el.remove();
    }
  }

  globalThis.MoruPet = Pet;
})();
