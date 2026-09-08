'use strict';
const fs = require('node:fs');
const http = require('node:http');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const EXPECTED = 'e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472';
const html = fs.readFileSync(require('node:path').join(__dirname, 'index.html'));
if (html.length !== 812095 || crypto.createHash('sha256').update(html).digest('hex') !== EXPECTED) {
  throw new Error('La integridad de la V4 original no coincide. Arranque cancelado.');
}
const user = process.env.SITE_ACCESS_USER || '';
const password = process.env.SITE_ACCESS_PASSWORD || '';
if (Boolean(user) !== Boolean(password)) throw new Error('Configura usuario y contraseña juntos.');
if (process.env.NODE_ENV === 'production' && (!user || password.length < 16)) throw new Error('Producción requiere protección externa con contraseña de al menos 16 caracteres.');
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT no válido.');
const scripts = [...html.toString('utf8').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(m => "'sha256-" + crypto.createHash('sha256').update(m[1]).digest('base64') + "'");
const csp = `default-src 'self'; script-src ${scripts.join(' ')}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; frame-src 'self' blob: data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
const variants = { br: zlib.brotliCompressSync(html), gzip: zlib.gzipSync(html) };
function equal(a, b) { a = Buffer.from(a); b = Buffer.from(b); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function authorized(req) {
  if (!user) return true;
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Basic ')) return false;
  return equal(Buffer.from(auth.slice(6), 'base64').toString('utf8'), `${user}:${password}`);
}
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Content-Security-Policy', csp);
  function send(code, body, type = 'text/plain; charset=utf-8') {
    res.statusCode = code;
    res.setHeader('Content-Type', type);
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(req.method === 'HEAD' ? undefined : body);
  }
  if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return send(405, 'Método no permitido'); }
  let route;
  try { route = new URL(req.url, 'http://localhost').pathname; } catch { return send(400, 'Petición inválida'); }
  if (route === '/health') return send(200, JSON.stringify({status:'ok', version:'4.0.0-original', sha256:EXPECTED}), 'application/json');
  if (route === '/robots.txt') return send(200, 'User-agent: *\nDisallow: /\n');
  if (!authorized(req)) { res.setHeader('WWW-Authenticate', 'Basic realm="Marquee V4", charset="UTF-8"'); return send(401, 'Acceso restringido'); }
  if (!['/', '/index.html'].includes(route)) return send(404, 'No encontrado');
  const accepted = (req.headers['accept-encoding'] || '').split(',').map(entry => {
    const [name, ...params] = entry.trim().split(';');
    const q = params.find(p => p.trim().startsWith('q='));
    return {name, q: q ? Number(q.trim().slice(2)) : 1};
  }).filter(x => x.q > 0 && variants[x.name]).sort((a,b) => b.q-a.q);
  const encoding = accepted[0]?.name;
  res.setHeader('Vary', 'Accept-Encoding');
  if (encoding) res.setHeader('Content-Encoding', encoding);
  return send(200, encoding ? variants[encoding] : html, 'text/html; charset=utf-8');
});
server.listen(port, process.env.HOST || '0.0.0.0', () => console.log(`V4 original verificada, puerto ${port}`));
for (const signal of ['SIGTERM','SIGINT']) process.on(signal, () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(1), 5000).unref(); });
