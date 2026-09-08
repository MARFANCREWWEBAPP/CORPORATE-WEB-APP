# Restauración exacta V4 — 2026-09-08

## Fuente de verdad

Se recuperó el HTML original de los archivos locales correspondientes a la conversación `6a9eb061-b874-83eb-8aa9-b19c33ea9c93`. Coinciden los tres ejemplares comprobados:

- `MARQUEE_EVENTOS_CORPORATIVOS_V4_DEMO.html`.
- `MARQUEE_FLOW_V4_DEMO/ABRIR_MARQUEE_FLOW_V4.html`.
- El mismo HTML dentro de `MARQUEE_FLOW_V4_DEMO.zip`.

Tamaño: **812095 bytes**. SHA-256: **e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472**.

El hash también coincide con `MARQUEE_V4_PRUEBAS_INTEGRIDAD.txt`, recuperado localmente. El ZIP `MARQUEE_V4_ORIGINAL_RESTAURADA_GITHUB.zip` mencionado en la conversación no estaba disponible: se recuperó el HTML exacto y se implementó de nuevo únicamente el servidor. No se reconstruyó ni alteró la interfaz.

## Cambios

- `index.html` es una copia binaria exacta del original: incluye CSS, los dos scripts y logotipos embebidos.
- `server.js` sirve ese documento y cancela el arranque si cambia su hash o tamaño. Permite GET/HEAD, gzip/Brotli, healthcheck, no indexación y protección HTTP externa. La CSP autoriza los scripts originales mediante sus hashes.
- `launch-v4.js` y `start.js` delegan en ese servidor para mantener los puntos de entrada existentes.
- Se retiran exclusivamente las interfaces divergentes y restos de las subidas fallidas: `app-bundle/`, `app-payload/`, `index-v4.html`, `app-v4.css`, `app-v4.js`, `brand-v4.svg`, `UPLOAD_STATUS.md`, `railway-test.txt`, `test-multi.txt` y el smoke test insuficiente.
- Se incorpora verificación de integridad/sintaxis y pruebas HTTP reales. No hay dependencias nuevas.
- `railway.json` y los workflows existentes quedan intactos. No se opera Railway.

## Backups preservados

- `backup/pre-v4-original-main-20260908`: `1c21ab1a49179125d8186db42643cc929375101e`.
- `backup/pre-v4-original-railway-demo-20260908`: `1ad30313e356ea627444738331f2231ec4c9a4f8`.
- `railway-demo` permanece en `1ad30313e356ea627444738331f2231ec4c9a4f8`.
- No se elimina ninguna rama, historial ni artefacto de GitHub Actions.

## Verificación nueva

- Hash y tamaño contrastados con las tres fuentes; sintaxis válida en ambos scripts originales y servidor.
- Pruebas locales aprobadas para los tres puntos de entrada: bytes HTTP exactos, autenticación correcta/incorrecta, gzip/Brotli, q=0, HEAD, healthcheck, robots, 404 en rutas internas/inexistentes, 405 y rechazo de HTML alterado/configuración incompleta.
- Navegador integrado: acceso administrador, comercial y finca; panel original, bandeja, comunicación, calendario, eventos, fincas, contactos, archivos, usuarios, copias y configuración.
- Expediente Aurora: presupuesto vigente, conservación de versiones y vista previa con logo original y contenido del evento.
- Comparación visual con captura original del dashboard: mismo logo, menú por áreas, cabecera y tarjetas. Es una revisión visual, no una comparación automatizada de píxeles.
- Móvil 390×844: dashboard de finca y formulario guiado de tres pasos; ancho de documento 390, sin desbordamiento horizontal; imágenes cargadas. Menú de finca sin administración crítica.
- Sin errores o avisos registrados por el navegador durante el recorrido comprobado.

Alcance: estas pruebas no son una auditoría exhaustiva de todos los flujos, ni pruebas de Railway. La aplicación sigue siendo la demo autónoma original: datos locales, identidades simuladas y sin sincronización multiusuario. Se conserva incluso su texto demostrativo; las etiquetas de sincronización/protección no acreditan servicios externos.
