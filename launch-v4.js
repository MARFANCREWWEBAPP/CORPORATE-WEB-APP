'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || '3000', 10);
const ACCESS_USER = process.env.SITE_ACCESS_USER || '';
const ACCESS_PASSWORD = process.env.SITE_ACCESS_PASSWORD || '';
const ROOT = __dirname;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) throw new Error('PORT no válido.');

const files = new Map([
  ['/', ['index-v4.html', 'text/html; charset=utf-8', 'no-store, max-age=0']],
  ['/index-v4.html', ['index-v4.html', 'text/html; charset=utf-8', 'no-store, max-age=0']],
  ['/app-v4.css', ['app-v4.css', 'text/css; charset=utf-8', 'public, max-age=300, must-revalidate']],
  ['/app-v4.js', ['app-v4.js', 'text/javascript; charset=utf-8', 'public, max-age=300, must-revalidate']],
  ['/brand-v4.svg', ['brand-v4.svg', 'image/svg+xml; charset=utf-8', 'public, max-age=86400']]
]);

const assets = new Map();
for (const [route, [filename, type, cache]] of files) {
  const body = fs.readFileSync(path.join(ROOT, filename));
  assets.set(route, { filename, type, cache, body, etag: `"${crypto.createHash('sha256').update(body).digest('hex').slice(0, 24)}"` });
}

function equal(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function authorized(request) {
  if (!ACCESS_USER || !ACCESS_PASSWORD) return true;
  const header = request.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  try {
    const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    return separator >= 0 && equal(decoded.slice(0, separator), ACCESS_USER) && equal(decoded.slice(separator + 1), ACCESS_PASSWORD);
  } catch { return false; }
}

function secure(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests");
}

function send(response, status, body, type, method, headers = {}) {
  secure(response);
  response.statusCode = status;
  response.setHeader('Content-Type', type);
  for (const [name, value] of Object.entries(headers)) response.setHeader(name, value);
  if (body !== null && body !== undefined) response.setHeader('Content-Length', Buffer.byteLength(body));
  if (method === 'HEAD' || body === null || body === undefined) return response.end();
  response.end(body);
}

const server = http.createServer((request, response) => {
  const started = Date.now();
  const method = request.method || 'GET';
  let pathname = '/';
  try { pathname = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`).pathname; }
  catch { return send(response, 400, 'Solicitud no válida', 'text/plain; charset=utf-8', method); }

  response.on('finish', () => console.log(`${new Date().toISOString()} ${method} ${pathname} ${response.statusCode} ${Date.now() - started}ms`));

  if (pathname === '/health') return send(response, 200, JSON.stringify({ status: 'ok', service: 'marquee-flow-v4-demo', version: '4.0.0-demo.4' }), 'application/json; charset=utf-8', method, { 'Cache-Control': 'no-store' });
  if (!['GET', 'HEAD'].includes(method)) return send(response, 405, 'Método no permitido', 'text/plain; charset=utf-8', method, { Allow: 'GET, HEAD' });
  if (!authorized(request)) return send(response, 401, 'Acceso restringido', 'text/plain; charset=utf-8', method, { 'WWW-Authenticate': 'Basic realm="Marquee Flow V4 Demo", charset="UTF-8"', 'Cache-Control': 'no-store' });
  if (pathname === '/robots.txt') return send(response, 200, 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8', method, { 'Cache-Control': 'public, max-age=3600' });

  const asset = assets.get(pathname) || assets.get('/');
  if (request.headers['if-none-match'] === asset.etag) {
    secure(response); response.statusCode = 304; response.setHeader('ETag', asset.etag); return response.end();
  }

  let body = asset.body;
  const headers = { 'Cache-Control': asset.cache, ETag: asset.etag, Vary: 'Accept-Encoding' };
  if (/\bgzip\b/.test(request.headers['accept-encoding'] || '') && /\.(?:html|css|js|svg)$/.test(asset.filename)) {
    body = zlib.gzipSync(asset.body, { level: zlib.constants.Z_BEST_COMPRESSION });
    headers['Content-Encoding'] = 'gzip';
  }
  return send(response, 200, body, asset.type, method, headers);
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 30000;
server.listen(PORT, HOST, () => {
  console.log(`Marquee Flow V4 Demo escuchando en http://${HOST}:${PORT}`);
  console.log(ACCESS_USER && ACCESS_PASSWORD ? 'Protección externa activada.' : 'AVISO: configura SITE_ACCESS_USER y SITE_ACCESS_PASSWORD en Railway.');
});

function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);
  server.close((error) => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => { console.error('Excepción no controlada:', error); process.exit(1); });
process.on('unhandledRejection', (reason) => { console.error('Promesa rechazada:', reason); process.exit(1); });
