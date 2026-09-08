'use strict';

const { spawn } = require('node:child_process');
const http = require('node:http');

const PORT = 43177;
const child = spawn(process.execPath, ['server.js'], {
  cwd: require('node:path').join(__dirname, '..'),
  env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let output = '';
child.stdout.on('data', (chunk) => { output += chunk.toString(); });
child.stderr.on('data', (chunk) => { output += chunk.toString(); });

function request(pathname) {
  return new Promise((resolve, reject) => {
    const req = http.get({ hostname: '127.0.0.1', port: PORT, path: pathname, timeout: 3000 }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
    });
    req.on('timeout', () => req.destroy(new Error('Timeout')));
    req.on('error', reject);
  });
}

async function waitUntilReady() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const result = await request('/health');
      if (result.status === 200) return;
    } catch {
      // El servidor aún puede estar arrancando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`El servidor no arrancó a tiempo.\n${output}`);
}

(async () => {
  try {
    await waitUntilReady();
    const health = await request('/health');
    const home = await request('/');
    const robots = await request('/robots.txt');

    if (health.status !== 200 || !health.body.includes('"status":"ok"')) {
      throw new Error('El healthcheck no devolvió la respuesta esperada.');
    }
    if (home.status !== 200 || !home.body.includes('Marquee Flow V4')) {
      throw new Error('La página principal no contiene Marquee Flow V4.');
    }
    if (robots.status !== 200 || !robots.body.includes('Disallow: /')) {
      throw new Error('robots.txt no está configurado para impedir indexación.');
    }
    if (home.headers['x-content-type-options'] !== 'nosniff') {
      throw new Error('Falta la cabecera de seguridad X-Content-Type-Options.');
    }

    console.log('Smoke test correcto: /health, /, robots.txt y cabeceras de seguridad.');
  } finally {
    child.kill('SIGTERM');
  }
})().catch((error) => {
  console.error(error);
  child.kill('SIGTERM');
  process.exitCode = 1;
});
