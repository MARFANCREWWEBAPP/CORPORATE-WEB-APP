# Portal V4.1 — versión para revisión

Se conserva `index.html` con los bytes originales. `template.js` integra la capa de cuentas y almacenamiento al generar la respuesta; no altera el fichero de referencia. La nueva versión se activa expresamente con `PORTAL_ENABLED=1`. Sin esa variable continúa la V4 original.

## Estado

Implementación local para revisión funcional y de producto. No está publicada en Railway. Consultar `AUDITORIA_V4_1.md` antes de activar usuarios reales. La cuenta protegida se ha creado en el almacenamiento local de la vista previa, que no se incorpora al repositorio.

## Entorno

Node.js >=22.16. No hay dependencias externas. Se utiliza SQLite con WAL, sincronización FULL y transacciones. Es una solución de un único proceso y volumen, no una base de datos compartida entre servicios Railway independientes.

Variables:

- `PORTAL_ENABLED=1` activa el portal.
- `PORT` y `HOST` controlan el servidor.
- `APP_ORIGIN`: origen exacto de la aplicación; HTTPS en producción.
- `DATA_DIR`: carpeta persistente que contiene `marquee.sqlite` y `backups/`.
- En Railway, `DATA_DIR` debe coincidir con `RAILWAY_VOLUME_MOUNT_PATH`. El arranque se rechaza si no hay volumen.
- `BOOTSTRAP_TOKEN`: secreto de un único uso para la primera cuenta, mínimo 32 caracteres. No se registra ni se guarda en Git. El enlace de activación usa el fragmento `#setup=...` y se retira de la barra al abrirlo.
- `PORTAL_REDIRECT_URL`: opción de redirección HTTPS para un dominio secundario. No se ha configurado en Railway. Ambos dominios deben conducir a la misma fuente de datos antes de operar.

La primera cuenta es `info@marquee.es` y queda marcada como protegida. En una base existente, `scripts/provision-admin.js` recibe la contraseña por entrada estándar y requiere `DATA_DIR`. Rechaza sobrescribir una cuenta protegida existente. No pasar contraseñas en archivos versionados ni añadirlas a variables de compilación del cliente.

Las contraseñas se almacenan con scrypt y sal aleatoria. Las sesiones se guardan mediante hashes de tokens, caducan a las 12 horas y usan cookies HttpOnly, SameSite=Strict y Secure en producción. Las escrituras comprueban origen y CSRF. Las cuentas nuevas reciben una contraseña temporal y deben cambiarla.

## Archivo y copias

Cambiar a CANCELLED, NOT_ACCEPTED o COMPLETED no elimina ningún dato. Se conserva el expediente, incluyendo mensajes, versiones, documentos e histórico. Solo administración puede reabrir un evento cerrado. No existe un endpoint de eliminación de eventos o usuarios; las cuentas ordinarias se desactivan. La cuenta protegida no admite desactivación, cambio de email/rol/espacio ni restablecimiento de contraseña desde otra cuenta.

Las copias SQLite se crean al arrancar, cada 24 horas y al archivar eventos, con verificación de integridad y SHA-256. Son copias dentro del mismo almacenamiento; aún faltan copias externas, política de retención y alertas para producción. No se elimina automáticamente ninguna copia en esta entrega.

La exportación JSON incluye expedientes y archivos, sin contraseñas ni sesiones. No sustituye a una copia íntegra de SQLite para recuperar las cuentas. La descarga por categoría incluye toda la categoría, no solo los filtros visuales de fecha o espacio; pendiente de mejorar según la auditoría.

## Recuperación comprobada

1. Conservar el almacenamiento actual; no sobrescribirlo.
2. Seleccionar una copia y contrastar su SHA-256 con el archivo de metadatos asociado.
3. Copiarla como `marquee.sqlite` en una carpeta de recuperación nueva.
4. Abrir esa copia con SQLite y ejecutar `PRAGMA integrity_check`; el resultado debe ser `ok`.
5. Probar en una instancia aislada: cuentas, expedientes archivados y descarga de archivos.
6. Solo después, detener las escrituras de la instancia activa y planificar el cambio de almacenamiento. Conservar el original para revertir.

La prueba automatizada realiza la recuperación en otra carpeta, verifica un evento cancelado y compara los bytes de su PDF. No se ha realizado una restauración de Railway.

## Verificación

`npm run check` valida el original, la sintaxis del portal y la terminología. `npm test` comprueba cuentas, aislamiento de espacios, CSRF, contraseñas temporales, cuenta protegida, concurrencia, archivos, archivo/reapertura, persistencia tras reinicio y recuperación de una copia; también mantiene las comprobaciones de los tres arranques de la V4 original.

Las pruebas de navegador se realizan con datos de muestra, separados de la producción. No migrar esas cuentas o eventos de prueba a Railway.
