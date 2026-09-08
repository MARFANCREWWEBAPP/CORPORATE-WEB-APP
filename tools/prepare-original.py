#!/usr/bin/env python3
"""Prepare a clean tree from the approved ZIP, without changing Git refs."""
import hashlib
import json
import pathlib
import shutil
import sys
import zipfile

ZIP_HASH = 'b8d48996fbc562df979d9de7031aeba6434609d404e026f15dcea39b8b35d106'
HTML_HASH = 'e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472'
ROOT = 'MARQUEE_V4_ORIGINAL_RESTAURADA/'
ALLOWED = {
    '.env.example', '.gitignore', 'README.md', 'REVISION_GITHUB.md',
    'V4_ORIGINAL_MANIFEST.json', 'index.html', 'package.json', 'package-lock.json',
    'server.js', 'scripts/check-original.js', 'scripts/server.test.js',
}

def prepare(source, destination):
    source = pathlib.Path(source)
    destination = pathlib.Path(destination)
    if hashlib.sha256(source.read_bytes()).hexdigest() != ZIP_HASH:
        raise ValueError('ZIP distinto del aprobado: no se publicara ninguna rama.')
    if destination.exists():
        raise ValueError('El destino debe ser nuevo y estar vacio.')
    with zipfile.ZipFile(source) as archive:
        entries = {entry.filename: entry for entry in archive.infolist()}
        if set(entries) != {ROOT + name for name in ALLOWED}:
            raise ValueError('La estructura del ZIP no es la prevista.')
        html = archive.read(ROOT + 'index.html')
        if len(html) != 812095 or hashlib.sha256(html).hexdigest() != HTML_HASH:
            raise ValueError('El HTML no es la V4 original.')
        destination.mkdir(parents=True)
        for name in sorted(ALLOWED):
            entry = entries[ROOT + name]
            if entry.file_size > 2000000:
                raise ValueError('Archivo demasiado grande.')
            output = destination / name
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(archive.read(entry))
    config = {
        '$schema': 'https://railway.com/railway.schema.json',
        'deploy': {'startCommand': 'npm start', 'healthcheckPath': '/health',
                   'healthcheckTimeout': 100, 'restartPolicyType': 'ON_FAILURE',
                   'restartPolicyMaxRetries': 3},
    }
    (destination / 'railway.json').write_text(json.dumps(config, indent=2) + '\n')
    alias = """'use strict';
// Compatibility with an existing Railway start-command override.
// The child always serves the same hash-verified original index.html.
const { spawn } = require('node:child_process');
const path = require('node:path');
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => process.exit(1));
child.on('exit', code => process.exit(code === null ? 1 : code));
"""
    for name in ['launch-v4.js', 'start.js']:
        (destination / name).write_text(alias)
    workflows = destination / '.github/workflows'
    workflows.mkdir(parents=True)
    (workflows / 'ci.yml').write_text("""name: Verificar V4 original exacta
on:
  push:
    branches: [main, railway-demo]
  pull_request:
    branches: [main, railway-demo]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  verify:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4
        with:
          persist-credentials: false
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: npm ci --ignore-scripts
      - run: npm run check
      - run: npm test
      - name: Verificar arranques compatibles
        run: node --check launch-v4.js && node --check start.js
""")
    with (destination / 'README.md').open('a') as readme:
        readme.write("""
## Arranque unificado

Railway utiliza `npm start` y `/health`. Los antiguos comandos `node start.js`
y `node launch-v4.js` redirigen al mismo servidor original, no a otras interfaces.
El healthcheck informa del SHA-256 del HTML servido.

La restauracion no configura credenciales, dominios ni copias de datos en Railway.
No se deben introducir clientes reales en esta demo local de navegador.
""")
    actual = hashlib.sha256((destination / 'index.html').read_bytes()).hexdigest()
    assert actual == HTML_HASH
    print(json.dumps({'prepared': True, 'html_bytes': 812095, 'sha256': actual}))

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit('Uso: prepare-original.py ZIP DIRECTORIO_NUEVO')
    prepare(sys.argv[1], sys.argv[2])
