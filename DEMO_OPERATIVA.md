> Actualización 4.3.0: órdenes de producción, cambios con aprobación, jornada e incidencias y ensayo de recuperación. Detalle vigente en [PRODUCCION_EVENTOS.md](PRODUCCION_EVENTOS.md). Las limitaciones de infraestructura y proveedores indicadas aquí se mantienen.

# V4 Operativa — revisión e implementación del plan

Fecha: 8 de septiembre de 2026. Marca visible: **Marquee Audiovisuales**. Terminología: **espacio de eventos**. Entrega destinada a demostración pública; las cuentas y expedientes de trabajo anteriores permanecen separados.

## Estado de cada bloque

| Función solicitada | Entrega y límite real |
| --- | --- |
| PostgreSQL | Adaptador y migración de copia SQLite a una base vacía. Transacciones, archivos, reinicio y restauración probados con PGlite, motor PostgreSQL embebido. Pendiente conectar y validar PostgreSQL alojado; la demo usa SQLite aislado. |
| Autenticación y multiusuario | Sesiones de servidor, contraseñas con scrypt, CSRF, permisos en cada operación, segundo factor y recuperación para el portal privado. Los tres perfiles públicos conservan sus credenciales de muestra. |
| Permisos por espacio | Administración crea cuentas; uno o varios espacios por usuario. Consultas, mensajes, estadísticas, archivos y calendarios se filtran en servidor. |
| S3/R2 y archivos seguros | Subida autenticada, descarga con permisos y PDF.js local. Réplicas cifradas: administración revisa documentos y destino y confirma el lote; lectura posterior y verificación de hash. Los originales siguen en la base. En demo se simula sin red externa. |
| Datos compartidos | Estado del servidor con revisión de conflictos y avisos SSE; se preservan formularios en edición. Cada instancia consulta revisiones periódicamente. No depende del almacenamiento del navegador. |
| Copias y auditoría | Copias automáticas locales, cifrado y adaptador de copia externa, política de retención, recuperación en carpeta nueva y huellas verificadas. Pendiente ensayo real de recuperación en Railway con almacenamiento persistente y copia fuera del servicio. |
| Pendiente de mí | Bandeja por perfil, siguiente acción, fecha límite, responsable y quién responde. Petición rápida con nombre y fecha como mínimo. |
| Comunicación | Mensajes por evento, no leídos, solicitudes de información, notas internas, borrador, estado de lectura, chat ampliable y ajuste móvil. |
| Presupuestos | Versión vigente, historial, visor sin descarga, lecturas/descargas, importes, aceptación/rechazo y generación de PDF con líneas e impuestos. |
| Borradores | Peticiones y mensajes persistentes, con revisión y recuperación de conflictos. |
| Recordatorios y reglas | Reglas editables por estado, responsable y próxima acción obligatorios, seguimiento cercano al crear/cambiar estado, avisos de vencimiento e inactividad, sin duplicar el mismo aviso diario. |
| Resumen diario por email | Resumen dentro del portal y cola diaria desde las 09:00 de Madrid, respetando permisos y preferencias. El envío real requiere Resend y dominio verificado. La demo no envía. |
| Calendario | Conflictos por horario, espacio, sala y recursos; exportación y enlace privado revocable para Google/Outlook. Es una suscripción de solo lectura, no sincronización bidireccional; el proveedor controla cuándo actualiza. |
| Aceptación y firma | Nombre, consentimiento, usuario, momento, versión y huella del PDF. Es aceptación simple registrada; no firma cualificada ni certificado de un proveedor. |
| Odoo | Adaptador de JSON-2 de Odoo 19 para crear una oportunidad CRM con confirmación e idempotencia. Pendiente comprobar versión, plan, permisos y cuenta real. No genera facturas ni confirma ventas. |
| WhatsApp Business | Adaptador de plantilla aprobada, número internacional, revisión y consentimiento del destinatario; control de duplicados. Pendiente cuenta, plantilla, número y versión de API. La demo simula. |
| Estadísticas | Aceptación de presupuestos, importes, clientes recurrentes y actividad, filtrados por espacio y permisos. |
| Asistente IA | Consulta acotada a un evento autorizado mediante Responses API, sin herramientas de escritura, con resultado para revisar. Modelo y credenciales configurables; la demo devuelve una simulación claramente identificada. |

## Conservación de datos

Cancelar o realizar un evento conserva el expediente completo, mensajes, documentos, versiones y decisiones. Los apartados «Eventos cancelados» y «Eventos realizados» son archivo consultable con los permisos originales; no sustituyen a una copia externa. Reabrir requiere administración.

La demo utiliza muestras separadas y rechaza abrir una base que ya contenga datos privados. El portal privado rechaza una base de demo. Cambiar a PostgreSQL vacío con datos SQLite existentes exige migrar primero una copia verificada. La migración conserva el origen, exige destino vacío e invalida sesiones anteriores.

La cuenta privada protegida `info@marquee.es` permanece fuera de la demo pública. Su contraseña no se incluye en código, documentación ni repositorio. No se han eliminado respaldos anteriores.

## Criterios de comodidad y pruebas

- Petición básica: formulario único con dos campos obligatorios; creación comprobada desde el perfil espacio. El objetivo de menos de 60 segundos debe medirse con usuarios reales.
- Encontrar un evento: búsqueda global por evento/cliente/espacio y filtros disponibles. El objetivo de 10 segundos requiere una prueba de uso con un volumen representativo.
- Presupuesto vigente: acceso directo y visor integrado; generación, total y apertura comprobados en navegador móvil.
- Seguimiento: la prueba de reglas verifica que ningún evento abierto creado o actualizado queda sin responsable, acción o fecha. Al cambiar de estado se respetan los plazos introducidos expresamente.
- Permisos: pruebas de aislamiento entre espacios, archivos, calendarios, mensajes internos y rutas administrativas.
- Recuperación: copia, integridad y restauración en destino vacío con comparación de bytes; también sobre motor PostgreSQL embebido.
- Móvil: login de los tres perfiles, formulario de petición, navegación operativa y visor comprobados. El chat conserva el ajuste adaptable de la auditoría.
- Rendimiento: búsqueda y filtros locales sobre la vista autorizada; actualización del servidor sin sustituir formularios en edición. Falta ensayo de carga y medición en móviles y redes reales; no se declara cumplido un SLA.

Validación automatizada: **21 pruebas**, que cubren arranque original, autenticación, permisos, archivos, archivo/reapertura, concurrencia, borradores, importación, PDF, segundo factor, correo con transporte de prueba, copias y restauración, demo, reglas, SSE, firma simple, calendario, adaptadores externos simulados y PostgreSQL. Se verifica el hash original y la sintaxis del HTML generado. Las dependencias se fijan mediante lockfile.

## Activación privada pendiente

1. Elegir infraestructura persistente y presupuesto operativo; conectar PostgreSQL y almacenamiento de copias/documentos.
2. Migrar una copia verificada en un destino vacío y comprobar cuentas, eventos y archivos sin tocar el original.
3. Configurar secretos fuera de GitHub y validar las cuentas de correo, Odoo, WhatsApp e IA. Las acciones externas muestran su contenido y requieren confirmación.
4. Elegir proveedor si se necesita firma con certificado; definir necesidades antes de desarrollar sincronización bidireccional de calendarios.
5. Ensayar recuperación externa completa, concurrencia entre instancias y tiempos reales de respuesta. El adaptador PostgreSQL mantiene el modelo síncrono existente: la espera de cada consulta bloquea el proceso solicitante; requiere medir latencia y capacidad antes de ampliar carga.

No se han contratado servicios, creado recursos de pago ni enviado mensajes reales. La demo debe mostrar siempre su condición y la posibilidad de reinicio de los datos de muestra al publicar.

## Referencias de integración

- [PostgreSQL: consultas parametrizadas](https://node-postgres.com/features/queries) y [transacciones](https://node-postgres.com/features/transactions).
- [Motor PostgreSQL embebido de pruebas PGlite](https://pglite.dev/docs/).
- [Odoo 19: API externa JSON-2](https://www.odoo.com/documentation/19.0/developer/reference/external_api.html).
- [WhatsApp: mensajes de plantilla](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/messages/template/).
- [OpenAI: generación de texto](https://developers.openai.com/api/docs/guides/text).
- [Google: suscripción desde URL](https://support.google.com/calendar/answer/37100?hl=en-uk) y [Outlook: importar o suscribirse](https://support.microsoft.com/es-es/outlook/import-or-subscribe-to-a-calendar-in-outlook-com-or-outlook-on-the-web).

## Limpieza de la demo desde administración

En **Configuración → Limpiar datos de demostración → Borrar eventos y usuarios demo**, administración puede revisar el número y la lista de eventos y cuentas afectados. Es necesario escribir **BORRAR DEMO** y pulsar **Crear copia y borrar demo**.

La operación solo está disponible en la base aislada de demostración. Incluye todos sus eventos, cancelados y realizados, archivos, mensajes, borradores y avisos, y sus usuarios de prueba. Conserva la cuenta que realiza la operación, el administrador de acceso a la demo y cualquier administrador protegido, además de espacios, clientes, recursos, ajustes, auditoría y copias anteriores. El portal privado no dispone de esta operación.

Antes de borrar se crea una copia completa con comprobación de integridad y SHA-256. Si la copia falla, no se borra nada. Una revisión desactualizada exige volver a revisar. Se revocan las sesiones de las cuentas eliminadas, se retiran sus perfiles del acceso y no se recrean al reiniciar la misma base. Reemplazar una instancia demo sin volumen puede volver a inicializar las muestras. Limpiar la demo no la convierte en un entorno privado ni activa almacenamiento de producción.

La entrega publica el botón disponible, sin ejecutarlo sobre la demo pública: los tres perfiles iniciales se mantienen hasta que administración decida realizar la limpieza.
