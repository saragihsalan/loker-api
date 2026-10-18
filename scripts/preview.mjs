// Server lokal mini buat preview site/ — zero dependency, hanya untuk development.
// Pakai: npm run preview → http://localhost:8788/
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'site');
const PORT = 8788;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const candidates = urlPath.endsWith('/')
    ? [path.join(ROOT, urlPath, 'index.html')]
    : [path.join(ROOT, urlPath), path.join(ROOT, urlPath, 'index.html')];
  let body = null;
  let file = null;
  let status = 200;
  for (const c of candidates) {
    if (!c.startsWith(ROOT)) continue;
    try {
      body = await readFile(c);
      file = c;
      break;
    } catch {}
  }
  if (!body) {
    try {
      file = path.join(ROOT, '404.html');
      body = await readFile(file);
      status = 404;
    } catch {}
  }
  if (!body) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('site/ belum dibuat — jalankan npm run site dulu');
    return;
  }
  res.writeHead(status, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(body);
}).listen(PORT, () => console.log(`Preview site: http://localhost:${PORT}/`));
