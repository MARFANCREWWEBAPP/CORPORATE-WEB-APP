# Portal privado — configuración técnica

> Estado actual: [V4 Operativa](../DEMO_OPERATIVA.md). `npm start` y Railway arrancan la demo aislada. Para el portal privado se utiliza `PORTAL_ENABLED=1 node server.js`, sin DEMO_MODE, y se mantienen las protecciones de producción. Las secciones V4.1 siguientes son históricas; las actualizaciones posteriores prevalecen.

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

# Actualización 4.2.0 — aplicación de la auditoría

El estado actualizado y las limitaciones de la entrega están en `../IMPLEMENTACION_AUDITORIA.md`; las secciones anteriores describen el punto de partida 4.1. Instalar con `npm ci` antes de arrancar. PDF.js es la única dependencia directa nueva y se sirve desde el propio servidor; no se envían PDFs a un visor externo.

## Variables nuevas

- `PORTAL_SECRET_KEY`: 32 bytes aleatorios codificados en base64. Obligatoria en producción. Cifra secretos TOTP y enlaces temporales en la cola de correo. Guardarla fuera del repositorio en el gestor de secretos de infraestructura y conservar una copia fuera del servicio para recuperación. En desarrollo se genera `.security-key` en DATA_DIR; no debe incluirse en Git.
- `TRUST_RAILWAY_PROXY=1`: acepta `X-Real-IP` únicamente cuando existe `RAILWAY_ENVIRONMENT_ID`. En otros entornos se usa la conexión directa.
- `RESEND_API_KEY`, `MAIL_FROM`, opcional `MAIL_REPLY_TO`: activan la entrega de correo. El dominio de `MAIL_FROM` debe estar verificado en Resend. Sin ellas el sistema muestra que el correo está pendiente y no envía.
- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_BUCKET`, `BACKUP_S3_REGION` (por defecto `auto`), `BACKUP_S3_ACCESS_KEY`, `BACKUP_S3_SECRET_KEY`, opcional `BACKUP_S3_SESSION_TOKEN`: destino privado compatible con S3. Conceder solo acceso al depósito de copias.
- `BACKUP_ENCRYPTION_KEY`: otros 32 bytes aleatorios en base64, conservados fuera del servicio. Cifra las copias antes de subirlas; es imprescindible para recuperarlas.

No poner credenciales en parámetros de URL, scripts versionados o el código del navegador. El usuario mantiene el control de las claves del administrador. No activar segundo factor en su cuenta sin que haya vinculado y probado su autenticador.

## Política de recuperación

Se comprueban cambios cada hora y al archivar expedientes. Un arranque sin cambios no genera una copia redundante durante las primeras 24 horas. Se conservan el mínimo de cinco copias recientes, un punto por día de los últimos 31 días, un punto por mes de los últimos 12 meses y todas las copias manuales o previas a una importación. Solo se limpian copias automáticas redundantes; nunca expedientes archivados. Con destino externo configurado, una copia no se limpia antes de subirse.

La subida externa incluye el archivo cifrado y un manifiesto con la huella SHA-256 de la copia original y del objeto cifrado. Las copias externas no se borran automáticamente en esta entrega. Configurar el ciclo de vida del depósito según el volumen y la retención acordados, manteniendo copias mensuales. El panel distingue configuración, última subida y errores; eso no sustituye a realizar una recuperación real de una copia descargada.

Recuperación en carpeta nueva:

```
node scripts/restore-backup.js /ruta/copia.sqlite /ruta/recuperacion-nueva SHA256_ORIGINAL
```

Para una copia `.enc`, facilitar `BACKUP_ENCRYPTION_KEY` mediante el gestor de secretos. El comando verifica, descifra, comprueba SQLite y anula las sesiones y enlaces de recuperación antiguos. Arrancar la copia aislada con el mismo `PORTAL_SECRET_KEY` para que los autenticadores existentes sigan funcionando. Conservar intacta la base anterior hasta terminar las pruebas. No sustituir la base en uso desde el navegador.

Objetivo inicial de recuperación propuesto: pérdida máxima de una hora de cambios ante pérdida del servicio cuando las copias externas funcionen, y recuperación dentro de cuatro horas. Son objetivos operativos pendientes de validar en Railway, no garantías de esta versión local.

## Modelo y reglas

- Las membresías `venueId` y `venueIds` se comprueban en el servidor; pertenecer a una organización no concede automáticamente todos sus espacios.
- Los borradores son de su autor y usan revisión. En caso de conflicto, conservar una copia antes de elegir qué continuar.
- La aceptación referencia presupuesto, versión, huella, actor y fecha. La validez se comprueba en el servidor. Una nueva versión no sobrescribe el documento anterior.
- La planificación considera fecha local del evento, horas, sala y minutos de montaje/desmontaje. Hora final anterior o igual a la inicial se interpreta como finalización al día siguiente. Se detectan solapes entre confirmados y se requiere un motivo para la excepción de Marquee.
- Las credenciales temporales de usuarios no se conservan en el historial de reintentos. Las operaciones persistentes de eventos, comentarios, archivos y borradores mantienen su identificador durante 90 días.
- El correo se envía en lotes desde una cola persistente, con reintentos y claves de idempotencia. Los enlaces de recuperación caducan en 30 minutos y los códigos de recuperación son de un solo uso. El segundo factor se mantiene tras un cambio de contraseña.
- Las importaciones no crean accesos de la demo, no sustituyen expedientes actuales y conservan autores históricos como texto. Deben partir de una copia completa que incluya todos los archivos referenciados.


## V4 Operativa — conexiones preparadas

`npm start` fuerza DEMO_MODE y no utiliza servicios externos aunque herede claves. Para producción privada: `PORTAL_ENABLED=1 node server.js`, sin DEMO_MODE. Se siguen exigiendo APP_ORIGIN HTTPS, volumen en DATA_DIR, PORTAL_SECRET_KEY y configuración inicial. PostgreSQL no elimina la necesidad de almacenar copias locales en un volumen.

- `DATABASE_URL`: conexión PostgreSQL con TLS según el proveedor. SQLite sigue disponible cuando no existe esta variable. El adaptador usa `pg`; PGlite es dependencia exclusiva de desarrollo para probar el motor.
- Migración: `DATABASE_URL=... DATA_DIR=/destino/nuevo node scripts/migrate-postgres.js /copia/verificada.sqlite SHA256`. Facilitar DATABASE_URL mediante el gestor de secretos, no guardar la línea con secretos en el historial. Destino vacío obligatorio, origen intacto, sin migrar sesiones ni datos demo.
- `FILES_S3_ENDPOINT`, `FILES_S3_BUCKET`, `FILES_S3_ACCESS_KEY`, `FILES_S3_SECRET_KEY`, opcionales `FILES_S3_REGION` (auto) y `FILES_S3_SESSION_TOKEN`; `FILES_ENCRYPTION_KEY` son 32 bytes aleatorios base64. Copias de documentos cifradas con revisión y confirmación de lote y destino. No hay transferencia automática de documentos. Los archivos originales permanecen en la base.
- `ODOO_URL` HTTPS, `ODOO_DATABASE`, `ODOO_API_KEY`: CRM por JSON-2 (Odoo 19). Validar versión/plan/permisos y renovación de claves antes de activar.
- `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_TEMPLATE`, `WHATSAPP_API_VERSION`, opcional `WHATSAPP_LANGUAGE` (es). La plantilla recibe nombre de evento y próxima acción. Validar formato con la plantilla aprobada real. Un identificador de proveedor confirma recepción de la petición, no entrega al destinatario.
- `OPENAI_API_KEY`, `OPENAI_MODEL`: asistente con contexto autorizado del evento, `store:false`, sin escrituras autónomas. Validar consentimiento y condiciones del proveedor antes de operar con datos reales.
- Las operaciones externas mantienen un registro y clave de idempotencia; si una respuesta es incierta exigen comprobar el servicio antes de repetir. No rotar la clave de envío para forzar reintentos.
- Los enlaces de calendario son secretos revocables por usuario, guardados como hash y limitados a sus espacios. Compartirlos concede lectura del calendario a quien reciba el enlace.

La prueba PostgreSQL usa el motor embebido; no acredita la conexión TCP/TLS de Railway, la carga de producción ni una restauración desde un proveedor real. La réplica S3 se prueba con transporte controlado y comparación de bytes; la activación requiere un ensayo con el destino acordado.

## Limpieza de muestras

`GET /api/demo/cleanup` devuelve a administración un plan ligado a la revisión, actor y registros. `POST /api/demo/cleanup` exige CSRF, digest vigente y `confirmation: "BORRAR DEMO"`. Solo funciona con DEMO_MODE y estado de base aislada demo. Guarda una copia local verificada antes de la transacción, borra eventos/archivos y cuentas de prueba salvo administradores preservados, revoca sus sesiones y registra la acción. Un fallo de copia impide la eliminación. El estado demo conserva una marca para no reinicializar las muestras al reiniciar la misma base. No hay un endpoint equivalente para vaciar datos privados.
