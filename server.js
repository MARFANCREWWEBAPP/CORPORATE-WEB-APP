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
const ACCESS_PROTECTION_ENABLED = Boolean(ACCESS_USER && ACCESS_PASSWORD);
const ROOT = __dirname;
const BUNDLE_DIR = path.join(ROOT, 'app-bundle');

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT debe ser un número válido entre 1 y 65535.');
}

function loadBundle(name) {
  if (!fs.existsSync(BUNDLE_DIR)) {
    throw new Error('No se encuentra el directorio app-bundle.');
  }

  const prefix = `${name}.br.b64.part-`;
  const parts = fs.readdirSync(BUNDLE_DIR)
    .filter((fileName) => fileName.startsWith(prefix))
    .sort();

  if (!parts.length) {
    throw new Error(`No se encontraron las partes de ${name}.`);
  }

  const encoded = parts
    .map((fileName) => fs.readFileSync(path.join(BUNDLE_DIR, fileName), 'utf8').trim())
    .join('');

  const compressed = Buffer.from(encoded, 'base64');
  return zlib.brotliDecompressSync(compressed);
}

const assets = {
  index: loadBundle('index.html'),
  css: loadBundle('styles.css'),
  js: loadBundle('app.js'),
};

if (!assets.index.includes(Buffer.from('Marquee Flow V4'))) {
  throw new Error('El bundle no contiene la versión esperada de Marquee Flow V4.');
}

const publicFiles = new Map([
  ['/styles.css', { body: assets.css, type: 'text/css; charset=utf-8', cache: 'public, max-age=300' }],
  ['/app.js', { body: assets.js, type: 'text/javascript; charset=utf-8', cache: 'public, max-age=300' }],
]);

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request) {
  if (!ACCESS_PROTECTION_ENABLED) return true;
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    return safeEqual(decoded.slice(0, separator), ACCESS_USER)
      && safeEqual(decoded.slice(separator + 1), ACCESS_PASSWORD);
  } catch {
    return false;
  }
}

function applySecurityHeaders(response, contentType = '') {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  if (contentType.startsWith('text/html')) {
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'self' data: blob:; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
    );
  }
}

function send(response, statusCode, body, contentType, method = 'GET', cache = 'no-store') {
  applySecurityHeaders(response, contentType);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', body.length ?? Buffer.byteLength(body));
  response.setHeader('Cache-Control', cache);
  if (method === 'HEAD') return response.end();
  return response.end(body);
}

const server = http.createServer((request, response) => {
  const startedAt = Date.now();
  const method = request.method || 'GET';
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  response.on('finish', () => {
    console.log(`${new Date().toISOString()} ${method} ${pathname} ${response.statusCode} ${Date.now() - startedAt}ms`);
  });

  if (pathname === '/health') {
    const body = Buffer.from(JSON.stringify({
      status: 'ok',
      service: 'marquee-flow-v4-staging',
      version: '4.0.0-staging.1',
    }));
    return send(response, 200, body, 'application/json; charset=utf-8', method, 'no-store');
  }

  if (!['GET', 'HEAD'].includes(method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return send(response, 405, Buffer.from('Método no permitido'), 'text/plain; charset=utf-8', method);
  }

  if (!isAuthorized(request)) {
    applySecurityHeaders(response, 'text/plain; charset=utf-8');
    response.statusCode = 401;
    response.setHeader('WWW-Authenticate', 'Basic realm="Marquee Flow V4 Staging", charset="UTF-8"');
    response.setHeader('Cache-Control', 'no-store');
    return response.end('Acceso restringido');
  }

  if (pathname === '/robots.txt') {
    return send(
      response,
      200,
      Buffer.from('User-agent: *\nDisallow: /\n'),
      'text/plain; charset=utf-8',
      method,
      'public, max-age=3600'
    );
  }

  if (publicFiles.has(pathname)) {
    const asset = publicFiles.get(pathname);
    return send(response, 200, asset.body, asset.type, method, asset.cache);
  }

  // La interfaz utiliza navegación SPA; cualquier ruta devuelve el documento principal.
  return send(response, 200, assets.index, 'text/html; charset=utf-8', method, 'no-store, max-age=0');
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, HOST, () => {
  console.log(`Marquee Flow V4 Staging escuchando en http://${HOST}:${PORT}`);
  console.log(
    ACCESS_PROTECTION_ENABLED
      ? 'Protección externa activada.'
      : 'AVISO: protección externa desactivada. Configura SITE_ACCESS_USER y SITE_ACCESS_PASSWORD en Railway.'
  );
});

function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);
  server.close((error) => process.exit(error ? 1 : 0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('uncaughtException', (error) => {
  console.error('Excepción no controlada:', error);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  console.error('Promesa rechazada no controlada:', reason);
  process.exit(1);
});
