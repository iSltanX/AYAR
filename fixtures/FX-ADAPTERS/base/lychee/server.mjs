// خادم محلي لاختبار lychee: /ok 200، /gone 404، /forbidden 403، /hang لا يستجيب أبدًا.
// يستمع على 127.0.0.1 و::1 معًا، ويسجّل كل طلب يصله في hits.log بمجلده: عِيَار لا يطرق العناوين المحلية (D-DEV6-17)،
// فيبقى السجل غائبًا بعد فحصه عبر المحرك؛ وأمر الأداة الخام في SANITY يطرقه عمدًا.
// node server.mjs [المنفذ=18231]
import { appendFileSync } from 'node:fs';
import http from 'node:http';

const port = Number(process.argv[2] ?? 18231);
const handler = (req, res) => {
  appendFileSync('hits.log', `${req.headers.host ?? '-'} ${req.url}\n`);
  const route = new URL(req.url, 'http://x').pathname;
  if (route === '/ok') { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<h1>ok</h1>'); return; }
  if (route === '/gone') { res.writeHead(404); res.end('not found'); return; }
  if (route === '/forbidden') { res.writeHead(403); res.end('forbidden'); return; }
  if (route === '/hang') return; // لا استجابة أبدًا
  res.writeHead(404); res.end();
};
for (const host of ['127.0.0.1', '::1']) http.createServer(handler).listen(port, host, () => console.log(`listening ${host} ${port}`));
