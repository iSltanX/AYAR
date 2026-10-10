// خادم ثابت صغير للتشغيل اليدوي: node server.mjs [المنفذ]. يقدّم الملفات و/api/items من mocks/items.json.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = import.meta.dirname;
const port = Number(process.argv[2] ?? 4173);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.woff2': 'font/woff2', '.png': 'image/png' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/items') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(fs.readFileSync(path.join(root, 'mocks', 'items.json')));
    return;
  }
  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(root, rel);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}).listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}`));
