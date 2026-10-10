// خادم محلي لاختبار lychee: /ok 200، /gone 404، /forbidden 403، /hang لا يستجيب أبدًا.
// node server.mjs [المنفذ=18231]
import http from 'node:http';

const port = Number(process.argv[2] ?? 18231);
http.createServer((req, res) => {
  const route = new URL(req.url, 'http://x').pathname;
  if (route === '/ok') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>ok</h1>'); return; }
  if (route === '/gone') { res.writeHead(404); res.end('not found'); return; }
  if (route === '/forbidden') { res.writeHead(403); res.end('forbidden'); return; }
  if (route === '/hang') return; // لا استجابة أبدًا
  res.writeHead(404); res.end();
}).listen(port, '127.0.0.1', () => console.log(`listening ${port}`));
