# V4.5.2 — integridad de PostgreSQL y migración privada

Entrega del 10 de septiembre de 2026. La aplicación pública continúa en modo demo. Esta entrega prepara el almacenamiento del portal privado y corrige riesgos reproducidos con órdenes de producción reales de ensayo. No migra los datos de la demo ni activa correos o integraciones externas.

## Correcciones

El adaptador anterior guardaba el estado en `JSONB`. PostgreSQL puede cambiar el orden de las propiedades de ese formato. Una orden publicada contiene una huella calculada sobre su representación JSON: después de guardar y volver a leer, la comprobación de recuperación podía fallar aunque los valores parecieran iguales. Se reprodujo con un presupuesto generado, aceptado y convertido en orden de producción.

El nuevo estado PostgreSQL utiliza `JSON`, conservando el orden utilizado para calcular las huellas. Una base que ya tenga la columna antigua `JSONB` se rechaza expresamente; no se convierte, no se borran registros y no se recalculan firmas antiguas para ocultar el problema. Debe recuperarse una copia que supere la verificación en una base nueva. [Comportamiento documentado por PostgreSQL](https://www.postgresql.org/docs/16/datatype-json.html).

La migración ahora comprueba previamente la integridad de la copia, los archivos referenciados, los logotipos y las órdenes publicadas. Conserva el registro de reintentos, de modo que repetir una petición pendiente después del cambio de base no crea una segunda operación. Solo admite un destino vacío, incluidos archivos, sesiones y registros de reintentos.

Las sesiones anteriores no se trasladan. Los enlaces de recuperación anteriores se invalidan y los correos de recuperación pendientes se cancelan. Los eventos, usuarios, identidades de espacios, archivos e histórico se conservan; se añade una entrada de auditoría de migración. La copia de origen se abre en lectura y mantiene su SHA-256.

## Verificación reproducible

`npm test` incluye recorridos con un motor PostgreSQL embebido: persistencia y reinicio de órdenes firmadas, recuperación de archivos, migración con reintentos, rechazo de archivos dañados, conservación de bases del formato anterior y rechazo de destinos ocupados. `npm run check` verifica la integración, sintaxis y fuente V4 aprobada de 812.095 bytes, SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.

El ensayo alojado utiliza `scripts/verify-hosted-postgres.js`. Requiere `VERIFY_POSTGRES_ISOLATED=1` y una conexión administrativa mediante el secreto `VERIFY_POSTGRES_ADMIN_URL`. Se ejecuta en un servicio temporal, sin dominio público, sin volumen de negocio y con reinicios automáticos desactivados. Crea dos bases con nombres aleatorios `b2be_verify_…` y solo elimina las que él mismo ha creado; si la limpieza falla informa de sus nombres. No se debe interrumpir antes de que termine la limpieza.

El ensayo crea cuentas con contraseñas aleatorias y datos ficticios. Verifica el presupuesto PDF con la identidad del espacio, aceptación, publicación, reinicio, migración a un segundo destino vacío, acceso HTTP de los tres perfiles, cambio de contraseña temporal y protección del administrador. Dos procesos independientes comprueban sesiones compartidas, reintentos y conflictos de edición. Otro espacio recibe un rechazo al pedir documentos ajenos. Finalmente se archivan expedientes cancelados y realizados, se comprueban sus documentos y se restaura una copia independiente con las sesiones revocadas.

También mide 48 lecturas con seis clientes simultáneos sobre el pequeño conjunto sintético, dentro de la misma región. Este ensayo comprueba concurrencia funcional; no representa latencia desde España, capacidad con miles de eventos ni experiencia de uso móvil. El estado de negocio continúa almacenado en un registro y las consultas del adaptador esperan su respuesta de forma síncrona.

## Operación y límites

La validación de esta entrega terminó con **42 pruebas locales aprobadas** y el ensayo alojado satisfactorio sobre PostgreSQL 18.6, el 10 de septiembre a las 07:26 UTC. La recuperación independiente conservó cuatro usuarios sintéticos, dos expedientes archivados, un archivo y una orden publicada; coincidieron las huellas de negocio y archivos y se eliminaron las sesiones recuperadas. La limpieza confirmó cero bases de ensayo pendientes. En las 48 lecturas de este conjunto pequeño, la mediana fue 25 ms y el percentil 95, 32 ms, dentro del servidor de ensayo.

Antes de una migración real: disponer de una copia verificada y su clave de recuperación, bloquear escrituras durante el corte, migrar sobre una base nueva, comprobar recuentos/archivos/órdenes, conservar el origen y cambiar la conexión únicamente después de la validación. La carpeta persistente también debe conservar `.security-key` y las copias; PostgreSQL no sustituye estos elementos. No se deben fusionar las cuentas públicas de demostración con las privadas.

El acceso privado definitivo, el correo real, la copia adicional en iCloud y el piloto con usuarios siguen pendientes de su configuración y ensayo. iCloud requiere identificar la carpeta privada de este Mac y verificar la sincronización; un enlace público no se considera un destino de subida automática del servidor. Las copias cifradas ya configuradas para la demo continúan en su destino actual.

Esta entrega conserva el diseño Marquee · B2BE, la identidad de los espacios, la V4 original y los respaldos existentes. El ensayo alojado no envía emails, WhatsApp, datos a Odoo ni consultas de IA.
