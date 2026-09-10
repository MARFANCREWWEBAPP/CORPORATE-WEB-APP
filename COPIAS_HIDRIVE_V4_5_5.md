# Copias adicionales en IONOS HiDrive

Entrega del 10 de septiembre de 2026: destino adicional de copias cifradas en HiDrive, con recuperación independiente. Se activó el HiDrive incluido en el contrato IONOS Business de marquee.es: 5 GB y WebDAV, sin contratar una ampliación. La cuenta `marqueeb2be` tiene confirmado el correo `info@marquee.es` y utiliza la carpeta privada `B2BE-Copias`.

## Comportamiento

El servidor genera sus puntos de recuperación al arrancar y en su comprobación horaria. Si no hay cambios, reutiliza el punto reciente según la política actual. Además del almacén externo existente, puede enviar cada copia a una carpeta privada de HiDrive. No depende de que el Mac esté encendido.

La copia incluye el estado completo de negocio y los archivos conservados en la base. Se cifra con AES-256-GCM antes de salir del servidor. Se sube, se vuelve a descargar y se comprueban la huella del archivo cifrado y la del contenido descifrado. También se comprueba el manifiesto descargándolo. Solo después se marca esa copia como verificada en HiDrive.

Cada destino conserva su propio resultado. Un error de HiDrive no impide la copia externa existente, no borra los datos activos y conserva las copias locales pendientes de enviar. Cada ejecución procesa hasta cinco copias pendientes. Las copias ya verificadas no se vuelven a subir tras un reinicio; cambiar la cuenta o carpeta obliga a verificar el destino nuevo. No se borran automáticamente archivos de HiDrive.

El panel de copias muestra el estado de HiDrive, la última verificación y los envíos pendientes. Configuración permite ensayar una recuperación desde HiDrive en una carpeta aislada. El ensayo compara eventos, archivos, identidad y órdenes de producción; revoca sesiones en la copia restaurada y conserva intacta la base activa.

## Configuración del servicio

1. Iniciar sesión en HiDrive desde el navegador. No enviar la contraseña por el chat.
2. Comprobar que la cuenta dispone de WebDAV y habilitarlo si procede. Elegir una carpeta privada exclusiva para B2BE; su carpeta padre debe existir.
3. Configurar un acceso de servicio con escritura en esa carpeta. Preferir una cuenta dedicada si el plan lo permite; no modificar ni desactivar el segundo factor de la cuenta principal. No contratar ampliaciones sin revisar antes el coste y la necesidad con el propietario.
4. Guardar `BACKUP_HIDRIVE_URL`, `BACKUP_HIDRIVE_USER` y `BACKUP_HIDRIVE_PASSWORD` en los secretos de Railway. La URL debe ser HTTPS de `webdav.hidrive.ionos.com` y apuntar a la carpeta elegida. Se conserva la `BACKUP_ENCRYPTION_KEY` existente y el almacén S3 actual. Ninguna contraseña o clave va al repositorio.
5. Comprobar acceso, subida, descarga y recuperación reales; publicar la versión verificada y comprobar un nuevo punto generado por el servidor. No presentar la integración como activa antes de completar estas verificaciones.

La sesión web de HiDrive no sustituye por sí sola el acceso de servicio que utilizará Railway. Si el plan no permite crearlo, habrá que introducir las credenciales necesarias directamente en el gestor de secretos, sin exponerlas en la conversación.

[WebDAV en HiDrive, documentación de IONOS](https://www.ionos.es/ayuda/almacenamiento-cloud/configuracion/conectar-hidrive-por-webdav-apple-macos/). [Segundo factor y accesos recurrentes](https://www.ionos.es/ayuda/almacenamiento-cloud/cifrado/activar-la-autenticacion-de-dos-factores/).

## Validación realizada

64 pruebas automáticas aprobadas, incluidas cinco específicas de HiDrive: recuperación completa con documentos, conservación simultánea en dos destinos, reintentos, fallo de acceso sin pérdida de datos, descarga corrupta rechazada, configuración incompleta o destino ajeno rechazados y aislamiento de las demos. Estas pruebas usan un servicio de almacenamiento simulado. El original V4 conserva su huella.

Además, se comprobó la cuenta real: copia completa descargada desde el respaldo externo existente, cifrada y enviada a HiDrive, descargada de nuevo y recuperada en una carpeta aislada. La recuperación contiene 1 administrador, 0 eventos y 0 archivos, igual que el portal privado en ese momento. Coinciden las huellas de negocio y archivos; las sesiones se revocan solo en la copia restaurada. SHA-256 de la copia original comprobada: `a87baa531a0404cab3856976a84b8fad843e36c890c6b3eeca48a73b2547917c`. La comprobación posterior al despliegue se registra por separado con su revisión y copia concreta.

HiDrive funciona como destino de copias; la base activa sigue en el volumen persistente del servidor. Esta integración no migra la base a una carpeta sincronizada ni sustituye la migración pendiente a PostgreSQL.
