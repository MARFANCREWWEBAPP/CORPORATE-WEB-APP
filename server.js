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

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error('PORT debe ser un número válido entre 1 y 65535.');
}

function loadIndexHtml() {
  const directFile = path.join(__dirname, 'index.html');
  if (fs.existsSync(directFile)) return fs.readFileSync(directFile);

  const payloadDirectory = path.join(__dirname, 'app-payload');
  if (!fs.existsSync(payloadDirectory)) {
    throw new Error('No se encuentra index.html ni el directorio app-payload.');
  }

  const payloadFiles = fs
    .readdirSync(payloadDirectory)
    .filter((name) => /^v4\.html\.br\.b64\.segment-\d+$/.test(name))
    .sort();

  if (payloadFiles.length === 0) {
    throw new Error('No se encontraron las partes comprimidas de index.html.');
  }

  const encodedPayload = payloadFiles
    .map((name) => fs.readFileSync(path.join(payloadDirectory, name), 'utf8').trim())
    .join('');

  const compressed = Buffer.from(encodedPayload, 'base64');
  return zlib.brotliDecompressSync(compressed);
}

const indexHtml = loadIndexHtml();

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isAuthorized(request) {
  if (!ACCESS_PROTECTION_ENABLED) return true;
  const authorization = request.headers.authorization || '';
  if (!authorization.startsWith('Basic ')) return false;

  try {
    const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    const separator = decoded.indexOf(':');
    if (separator < 0) return false;
    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return safeEqual(username, ACCESS_USER) && safeEqual(password, ACCESS_PASSWORD);
  } catch {
    return false;
  }
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none';"
  );
}

function send(response, statusCode, body, contentType, method = 'GET') {
  applySecurityHeaders(response);
  response.statusCode = statusCode;
  response.setHeader('Content-Type', contentType);
  response.setHeader('Content-Length', Buffer.byteLength(body));
  if (method === 'HEAD') return response.end();
  response.end(body);
}

const server = http.createServer((request, response) => {
  const startedAt = Date.now();
  const method = request.method || 'GET';
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  response.on('finish', () => {
    const duration = Date.now() - startedAt;
    console.log(`${new Date().toISOString()} ${method} ${pathname} ${response.statusCode} ${duration}ms`);
  });

  if (pathname === '/health') {
    return send(
      response,
      200,
      JSON.stringify({ status: 'ok', service: 'marquee-flow-v4-demo', version: '4.0.0-demo.2' }),
      'application/json; charset=utf-8',
      method
    );
  }

  if (!['GET', 'HEAD'].includes(method)) {
    response.setHeader('Allow', 'GET, HEAD');
    return send(response, 405, 'Método no permitido', 'text/plain; charset=utf-8', method);
  }

  if (!isAuthorized(request)) {
    applySecurityHeaders(response);
    response.statusCode = 401;
    response.setHeader('WWW-Authenticate', 'Basic realm="Marquee Flow V4 Demo", charset="UTF-8"');
    response.setHeader('Cache-Control', 'no-store');
    return response.end('Acceso restringido');
  }

  if (pathname === '/robots.txt') {
    response.setHeader('Cache-Control', 'public, max-age=3600');
    return send(response, 200, 'User-agent: *\nDisallow: /\n', 'text/plain; charset=utf-8', method);
  }

  applySecurityHeaders(response);
  response.statusCode = 200;
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.setHeader('Content-Length', indexHtml.length);
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  if (method === 'HEAD') return response.end();
  response.end(indexHtml);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

server.listen(PORT, HOST, () => {
  console.log(`Marquee Flow V4 Demo escuchando en http://${HOST}:${PORT}`);
  console.log(
    ACCESS_PROTECTION_ENABLED
      ? 'Protección externa activada mediante SITE_ACCESS_USER/SITE_ACCESS_PASSWORD.'
      : 'AVISO: protección externa desactivada. Configura SITE_ACCESS_USER y SITE_ACCESS_PASSWORD en Railway.'
  );
});

function shutdown(signal) {
  console.log(`${signal} recibido. Cerrando servidor...`);
  server.close((error) => {
    if (error) {
      console.error('Error al cerrar el servidor:', error);
      process.exit(1);
    }
    process.exit(0);
  });

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
