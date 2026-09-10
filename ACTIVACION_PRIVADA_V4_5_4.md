# V4.5.4 — acceso privado y dominio de eventos

La aplicación deja de depender de un arranque que fuerza siempre la demostración. `npm start` respeta `DEMO_MODE=0` para el portal privado y `DEMO_MODE=1` para una demo aislada. En un servidor publicado, el modo debe configurarse expresamente. El original V4 y la identidad Marquee · B2BE se conservan.

## Retirada de los ejemplos

La retirada es una operación de despliegue, sin endpoint público. Un archivo temporal `.private-activation.json` dentro del volumen contiene una confirmación, la huella exacta de los datos revisados y un hash con sal de la contraseña del administrador. La contraseña no se incluye en el código, logs o configuración publicada del repositorio.

El proceso solo admite una base marcada como demo. Rechaza cuentas personales ajenas al administrador protegido, comprueba que nada ha cambiado y crea una copia completa. Verifica su integridad mediante recuperación independiente y, en producción, exige haber subido y descargado correctamente esa copia cifrada del almacén externo. Si falla cualquier comprobación previa, conserva la base original.

Una única transacción retira eventos, espacios, usuarios y archivos de demostración, junto con sus notificaciones, borradores, trabajos pendientes y respuestas de operaciones almacenadas. Revoca las sesiones y conserva solo la cuenta activa `info@marquee.es`, con rol de administrador y protección frente a desactivación o reasignación. El histórico de la demo queda en la copia completa. La auditoría del portal registra la retirada y la huella de su respaldo.

El archivo temporal se elimina tras activar el portal. Repetir el arranque no repite la limpieza ni cambia la contraseña. No se modifican la clave de seguridad ni los respaldos anteriores. El botón de limpieza de una demo mantiene su comportamiento anterior; no puede borrar una base privada.

Antes de desplegar hay que guardar el archivo de activación fuera del repositorio en el volumen existente, establecer el modo privado, el origen HTTPS, la clave de seguridad y las credenciales de copias externas, y comprobar la revisión de datos. Si el contenido cambia, debe revisarse una nueva huella; no se elimina la comprobación para forzar la operación. Una vez retirados los datos demo, no debe volver a ejecutarse el arranque de demostración sobre ese volumen.

## Dominio

El origen del portal es `https://eventos.marquee.es`. IONOS requiere el CNAME `eventos → j60f192g.up.railway.app` y el TXT de propiedad emitido por Railway en `_railway-verify.eventos`. Solo se sustituyen los registros automáticos del nuevo subdominio. La web principal y el correo `@marquee.es` mantienen sus registros.

Las peticiones de lectura a la dirección anterior se redirigen al origen configurado, conservando ruta y parámetros. La comprobación de salud sigue disponible para el alojamiento; las escrituras de otros orígenes se rechazan. El destino de una redirección nunca se toma de una cabecera del visitante. Railway gestiona el certificado HTTPS del subdominio. [Documentación de dominios de Railway](https://docs.railway.com/networking/domains/working-with-domains).

## Validación y límites

59 pruebas automáticas aprobadas: retirada, copia recuperable con archivos, bloqueo ante cambios concurrentes o fallo de la copia externa, rechazo de cuentas personales, cierre de sesiones, administrador protegido, repetición de arranque, configuración de seguridad y redirección canónica. Se mantienen las pruebas de permisos por espacio, documentos, copias, PostgreSQL, producción, reservas y borradores.

Sobre una copia aislada del conjunto publicado se comprobó el acceso privado con una sola cuenta y cero eventos. Se recorrieron usuarios, eventos, espacios, calendario, comunicación, estadísticas, reservas y configuración, sin errores de consola. La fuente original de 812.095 bytes conserva SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.

El portal utiliza el almacenamiento persistente existente y sus copias cifradas. Esta entrega no migra esa base a PostgreSQL ni activa por sí sola el correo, Odoo, WhatsApp, IA o un proveedor de firma certificada. Las cuentas e integraciones externas requieren su propia configuración y verificación. iCloud sigue pendiente de identificar y comprobar la carpeta privada elegida. El piloto de uso real y de teclados móviles continúa siendo necesario.
