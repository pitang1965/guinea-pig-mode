/* モルモットの見た目（SVG）を組み立てる */
(function () {
  'use strict';

  const PALETTES = {
    ginger:   { body: '#c9793f', shade: '#a75f2d', inner: '#eda285', outline: '#48291a', paw: '#f0a98d', pawShade: '#d78b6e', patches: [['rump', '#f7e9d2'], ['face', '#f7e9d2']] },
    agouti:   { body: '#8a6844', shade: '#6d5033', inner: '#c69a7a', outline: '#2e1d10', paw: '#dfa88a', pawShade: '#bd8a6d', patches: [['belly', '#cbb18d']] },
    cream:    { body: '#f0d7a8', shade: '#dcbe86', inner: '#f6c6ab', outline: '#7d5a33', paw: '#f7c3a6', pawShade: '#dda88b', patches: [['face', '#fdf3e0']] },
    white:    { body: '#f8f3ea', shade: '#e4dbcd', inner: '#f3bfa8', outline: '#9a8a74', paw: '#f5c2ab', pawShade: '#dba78f', patches: [] },
    black:    { body: '#423931', shade: '#2f2823', inner: '#8d6a5c', outline: '#1a1512', paw: '#a5796a', pawShade: '#8a6355', patches: [['face', '#efe7dc']] },
    tricolor: { body: '#c9793f', shade: '#a75f2d', inner: '#eda285', outline: '#402518', paw: '#f0a98d', pawShade: '#d78b6e', patches: [['rump', '#fbf3e6'], ['saddle', '#3b332c'], ['face', '#fbf3e6']] }
  };

  const PATCH_SHAPES = {
    rump:   '<ellipse cx="26" cy="52" rx="28" ry="28"/>',
    face:   '<ellipse cx="120" cy="62" rx="20" ry="15"/>',
    saddle: '<ellipse cx="78" cy="27" rx="31" ry="18"/>',
    belly:  '<ellipse cx="72" cy="80" rx="42" ry="14"/>'
  };

  const TORSO = [
    '<circle cx="34" cy="51" r="31"/>',
    '<ellipse cx="68" cy="51" rx="41" ry="31"/>',
    '<ellipse cx="106" cy="48" rx="23" ry="21"/>',
    '<ellipse cx="122" cy="56" rx="12" ry="10"/>'
  ].join('');

  /** 脚。胴の下からは足先だけがちょこんと覗く */
  function leg(cx, cls, pawColor) {
    return `<g class="leg ${cls}">` +
      `<rect x="${cx - 6.5}" y="58" width="13" height="25" rx="6.5"/>` +
      `<g fill="${pawColor}">` +
        `<ellipse cx="${cx + 1}" cy="82.5" rx="7.5" ry="4"/>` +
        `<circle cx="${cx - 3.5}" cy="84.6" r="2.2"/>` +
        `<circle cx="${cx + 1}" cy="85" r="2.4"/>` +
        `<circle cx="${cx + 5.5}" cy="84.6" r="2.2"/>` +
      `</g></g>`;
  }

  function accessorySvg(kind, p) {
    switch (kind) {
      case 'flower':
        return '<g class="acc acc-flower">' +
          '<g fill="#f492b6">' +
          '<circle cx="92" cy="9" r="5.2"/><circle cx="99" cy="14" r="5.2"/>' +
          '<circle cx="96" cy="22" r="5.2"/><circle cx="88" cy="22" r="5.2"/>' +
          '<circle cx="85" cy="14" r="5.2"/></g>' +
          '<circle cx="92" cy="16" r="3.6" fill="#ffd45e"/></g>';
      case 'ribbon':
        return '<g class="acc acc-ribbon" fill="#ef6f8e">' +
          '<path d="M92,17 L78,9 q-4,8 0,16 z"/><path d="M92,17 L106,9 q4,8 0,16 z"/>' +
          '<circle cx="92" cy="17" r="4.4" fill="#ffb3c6"/></g>';
      case 'hat':
        return '<g class="acc acc-hat">' +
          '<path d="M80,26 L104,26 L92,1 z" fill="#5ec5c8"/>' +
          '<path d="M85,15 L99,15" stroke="#fff" stroke-width="2.6" opacity=".8"/>' +
          '<circle cx="92" cy="1" r="4" fill="#ffd45e"/></g>';
      case 'crown':
        return '<g class="acc acc-crown">' +
          '<path d="M78,24 L80,6 L88,15 L94,4 L100,15 L108,6 L110,24 z" fill="#ffcf47" stroke="#d59f12" stroke-width="1.6" stroke-linejoin="round"/>' +
          '<circle cx="94" cy="19" r="2.4" fill="#ef6f8e"/></g>';
      case 'glasses':
        return '<g class="acc acc-glasses" fill="none" stroke="#2f2a26" stroke-width="2.4">' +
          '<circle cx="112" cy="42" r="10" fill="#dff2fb" fill-opacity=".55"/>' +
          '<path d="M102.5,38.5 q-5,-6 -7.5,-11" stroke-linecap="round"/></g>';
      case 'carrot':
        return '<g class="acc acc-carrot" transform="rotate(18 140 62)">' +
          '<path d="M134,58 L156,64 L134,68 z" fill="#f28c3b"/>' +
          '<path d="M155,58 q6,3 3,8 M158,63 q6,1 5,6" stroke="#63b34a" stroke-width="3" fill="none" stroke-linecap="round"/></g>';
      default:
        return '';
    }
  }

  /** インスタンスごとの SVG マークアップを返す */
  function build(opts) {
    const id = opts.id;
    const p = PALETTES[opts.color] || PALETTES.ginger;
    const fid = 'moru-out-' + id;
    const sid = 'moru-soft-' + id;
    const cid = 'moru-clip-' + id;

    const patches = (p.patches || [])
      .map(([key, color]) => `<g fill="${color}">${PATCH_SHAPES[key] || ''}</g>`)
      .join('');

    return `
<svg class="moru-svg" viewBox="-2 0 158 93" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <filter id="${fid}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="1.6" result="b"/>
      <feComponentTransfer in="b" result="s"><feFuncA type="linear" slope="24"/></feComponentTransfer>
      <feFlood flood-color="${p.outline}" result="c"/>
      <feComposite in="c" in2="s" operator="in" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <filter id="${sid}" x="-25%" y="-45%" width="150%" height="190%" color-interpolation-filters="sRGB">
      <feGaussianBlur in="SourceAlpha" stdDeviation="0.55" result="b"/>
      <feComponentTransfer in="b" result="s"><feFuncA type="linear" slope="24"/></feComponentTransfer>
      <feFlood flood-color="${p.outline}" flood-opacity="0.4" result="c"/>
      <feComposite in="c" in2="s" operator="in" result="o"/>
      <feMerge><feMergeNode in="o"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <clipPath id="${cid}">${TORSO}</clipPath>
  </defs>

  <ellipse class="moru-shadow" cx="70" cy="87.4" rx="52" ry="5"/>

  <g class="moru-body" filter="url(#${fid})">
    <g class="legs-back" fill="${p.shade}">${leg(40, 'leg-a', p.pawShade)}${leg(96, 'leg-b', p.pawShade)}</g>

    <g class="torso" fill="${p.body}">${TORSO}</g>
    <g class="patches" clip-path="url(#${cid})">${patches}</g>

    <ellipse class="ear-far" cx="88" cy="24" rx="10" ry="7.6" transform="rotate(-16 88 24)" fill="${p.shade}"/>

    <g class="legs-front" fill="${p.body}">${leg(50, 'leg-b', p.paw)}${leg(108, 'leg-a', p.paw)}</g>

    <g class="ear">
      <ellipse cx="99" cy="25" rx="12" ry="9" transform="rotate(-18 99 25)" fill="${p.body}"/>
      <ellipse cx="100.5" cy="26.5" rx="7" ry="5" transform="rotate(-18 100.5 26.5)" fill="${p.inner}"/>
    </g>

    <g class="face">
      <g class="eye">
        <circle class="eye-open" cx="112" cy="42" r="5.4" fill="#241611"/>
        <circle class="eye-shine" cx="113.8" cy="40" r="1.9" fill="#ffffff"/>
        <path class="eye-closed" d="M106.6,42 q5.4,4.6 10.8,0" fill="none" stroke="#241611" stroke-width="2.4" stroke-linecap="round"/>
      </g>
      <path class="nose" d="M125,52 h8.6 a2.2,2.2 0 0 1 1.6,3.7 l-4.3,4.5 a2.4,2.4 0 0 1-3.2,0 l-4.3,-4.5 A2.2,2.2 0 0 1 125,52 z" fill="#8f5457"/>
      <path class="mouth" d="M129.3,60.2 v2.6 M129.3,62.8 q-3.6,3.2 -6.8,.4 M129.3,62.8 q3.2,3 5.6,.4"
            fill="none" stroke="#7d4548" stroke-width="1.7" stroke-linecap="round"/>
    </g>

    ${accessorySvg(opts.accessory, p)}
  </g>

  <g class="whiskers" filter="url(#${sid})" fill="none" stroke="#ffffff"
     stroke-width="1.1" stroke-linecap="round">
    <path d="M134,54 q8,-3 13,-5.6"/><path d="M135,58 q9,-1 14.5,-.6"/><path d="M134,61.5 q8,2 13,4.6"/>
  </g>

</svg>`;
  }

  const COLOR_KEYS = Object.keys(PALETTES);
  const ACCESSORY_KEYS = ['none', 'flower', 'ribbon', 'hat', 'glasses', 'crown', 'carrot'];

  const randomOf = (arr) => arr[(Math.random() * arr.length) | 0];

  /** 'random' なら 1 匹ぶんの姿を抽選する。それ以外はそのまま返す */
  function resolveColor(value) {
    return value === 'random' ? randomOf(COLOR_KEYS) : value;
  }

  function resolveAccessory(value) {
    return value === 'random' ? randomOf(ACCESSORY_KEYS) : value;
  }

  globalThis.MoruCharacter = {
    build, PALETTES, COLOR_KEYS, ACCESSORY_KEYS,
    resolveColor, resolveAccessory, ASPECT: 158 / 93
  };
})();
