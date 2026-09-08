# Marquee Flow V4 original

Restauración exacta de la demo aprobada. `index.html` contiene toda la interfaz, estilos, scripts y logotipos originales, sin modificaciones.

## Ejecutar

Requiere Node.js 20 o posterior. No hay dependencias externas.

```sh
npm ci
npm run check
npm test
npm start
```

Escucha en `PORT` (3000 por defecto). `/health` comprueba el servidor. Los puntos de entrada `server.js`, `start.js` y `launch-v4.js` sirven la misma versión verificada.

`SITE_ACCESS_USER` y `SITE_ACCESS_PASSWORD` activan la protección HTTP externa; deben configurarse conjuntamente. En producción es obligatoria y la contraseña debe tener al menos 16 caracteres. No guardar secretos en GitHub.

## Integridad y alcance

El servidor cancela el arranque si `index.html` difiere de los 812095 bytes originales o de su SHA-256. `npm run check` también verifica los dos scripts embebidos.

Esta entrega es una demo de diseño y flujo con datos guardados en el navegador. Los perfiles son simulados; no hay sincronización multiusuario, autenticación backend ni copias externas. Los textos demostrativos de la interfaz se conservan como parte del original.

Railway no se modifica ni despliega durante esta restauración. Su configuración existente queda intacta. Antes de una futura publicación se debe revisar la vinculación de ramas y el despliegue automático.

Fuente, limpieza, backups y pruebas: [RESTORE_V4_ORIGINAL.md](RESTORE_V4_ORIGINAL.md).
