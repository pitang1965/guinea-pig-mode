import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, resolve, sep } from 'node:path';

const ROOT = resolve(process.cwd());
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const path = decodeURIComponent(req.url.split('?')[0]);
  const file = resolve(join(ROOT, path));
  // ROOT の外へ出る要求（../ など）は拒否する
  if (file !== ROOT && !file.startsWith(ROOT + sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('nope');
  }
// 開発用なのでループバックだけに公開する
}).listen(8765, '127.0.0.1', () => console.log('serving', ROOT, 'on http://localhost:8765'));
