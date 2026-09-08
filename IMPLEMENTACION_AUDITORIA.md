> Actualización: el estado vigente y la demo están documentados en [DEMO_OPERATIVA.md](DEMO_OPERATIVA.md). Este documento conserva el registro de la auditoría anterior.

# Aplicación de la auditoría de Marquee Audiovisuales

8 de septiembre de 2026 · versión de trabajo 4.2.0

## Resultado

Se ha ampliado el portal manteniendo intacto el HTML V4 aprobado. La versión de trabajo está disponible en `http://localhost:3210/` y contiene exclusivamente muestras para las comprobaciones. No se han trasladado estas muestras a Railway.

La ampliación se conserva en el PR #3. La web pública sigue con la V4 original. La activación de los servicios de producción necesita completar la configuración externa que se detalla al final; no se presenta como terminada.

## Mejoras incorporadas

| Área de la auditoría | Cambio realizado |
|---|---|
| Conservación y recuperación | Copias consistentes con comprobación de integridad y SHA-256, selección de copias diarias y mensuales, conservación de copias manuales y recuperación en una carpeta nueva sin sobrescribir la actual. Se invalidan las sesiones y enlaces de recuperación al restaurar. |
| Copias externas | Integración con almacenamiento compatible con S3. Cifrado AES-256-GCM antes de subir, manifiesto con huellas de integridad, reintentos y estado de la última transferencia. Necesita un depósito y credenciales reales para activarse. |
| Capacidad y fallos | Información de espacio libre, avisos a administración por capacidad baja o errores de copia, y cola de correo para esos avisos cuando se active el proveedor. |
| Ediciones simultáneas | Comparación entre la edición del usuario y los datos nuevos. Selección explícita por campo antes de guardar; volver al formulario conserva el texto pendiente. No se recarga silenciosamente una versión nueva para sobrescribirla en un segundo intento. |
| Reintentos | Identificadores persistentes de operación para peticiones, mensajes, archivos y otras escrituras. Repetir la misma solicitud no crea un segundo expediente ni duplica mensajes. |
| Accesos detrás de Railway | Uso explícito del encabezado de dirección de cliente documentado por Railway cuando se activa su proxy de confianza. Se ignoran encabezados reenviados en otros entornos. |
| Borradores | Guardado en la cuenta, recuperación tras recargar o cambiar de dispositivo, listado de borradores y envío una sola vez. Los borradores de cada persona son privados. |
| Presupuestos | Importe total en euros, fecha de validez, aceptación, rechazo o solicitud de cambios sobre una versión concreta. Registro de persona, fecha, motivo, versión y huella del documento. Se rechazan decisiones sobre una versión sustituida, caducada o ya decidida. |
| Documentos | Visor PDF propio con PDF.js servido desde la aplicación, navegación de páginas y zoom. Corregida una regla heredada que ocultaba los visores. La descarga y la lectura siguen requiriendo los permisos del expediente. |
| Cancelaciones | Motivo de cancelación o rechazo, expediente completo conservado y acceso a su histórico. La aceptación histórica se conserva aunque el evento se cancele posteriormente. |
| Correo | Cola persistente, preferencias personales, reintentos e identificadores de envío para evitar duplicados. Integración preparada para Resend; no se han enviado emails reales ni creado cuentas en proveedores. |
| Seguridad personal | Segundo factor con autenticador TOTP, códigos de recuperación de un solo uso y recuperación de contraseña por email. Contraseñas con hash; secretos del autenticador cifrados. El administrador protegido mantiene sus restricciones. |
| Clientes | Catálogo por espacio, nombres alternativos y fusión de duplicados sin borrar los expedientes ni sus nombres históricos. Vinculación de las peticiones al cliente y agrupación de estadísticas por ficha. |
| Estadísticas | Importes de propuestas vigentes, aceptados activos o realizados, oportunidades canceladas/rechazadas y motivos de pérdida. Se distinguen los presupuestos sin importe y se evitan duplicados por versiones. |
| Histórico y exportación | Búsqueda por evento, cliente, agencia, contacto, teléfono, email y nombre de documento; filtros de fechas, espacio y tipo; vistas guardadas. «Descargar esta vista» aplica los filtros y limita archivos y personas a lo exportado. |
| Espacios inactivos | Vistas de activos, inactivos y todos; desactivación y reactivación desde administración. Los expedientes permanecen conservados. |
| Ficha técnica | Edición de salas, cargas, horarios, potencia, restricciones, altura, conectividad, escenario, aparcamiento, planos y contactos, con fecha de revisión. Cada espacio edita únicamente su ficha. |
| Organizaciones | Agrupación de espacios y asignación de varios espacios a una persona, manteniendo la separación de permisos del servidor. |
| Calendario y recursos | Inventario de equipo, personal y vehículos; sala, horarios, montaje y desmontaje por evento. Comprobación de coincidencias antes de confirmar o modificar la planificación de un confirmado. Solo Marquee puede justificar una excepción y queda registrada. |
| Comunicación | Borrador de mensaje en el servidor, búsqueda dentro de la conversación, adjuntos, contadores de mensajes no leídos y navegación de conversaciones adaptada a móvil. Se conserva la corrección del botón de envío. |
| Importación de la demo | Análisis previo de una copia completa JSON, comprobación de huella, detección de duplicados y copia de seguridad antes de importar. No sustituye los datos actuales ni activa usuarios de la demo. Rechaza copias con documentos ausentes. |
| Experiencia y mantenimiento | Estado de conexión y guardado, elección explícita de fecha, etiquetas y foco de formularios, navegación por teclado en modales y acciones visibles en móvil. Separación de almacenamiento, flujos, recuperación, seguridad, correo, importación y visor. |

## Comprobaciones

- El original mantiene 812095 bytes y SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.
- Las 12 pruebas automáticas pasan, incluyendo los tres arranques originales, permisos y aislamiento, archivos, archivo/reapertura, reinicio y restauración.
- Pruebas añadidas de borradores y concurrencia, reintentos, múltiples espacios, clientes y fusiones, exportaciones filtradas, decisiones y versiones de presupuesto, importes, conflictos de agenda, borradores de mensajes, segundo factor, recuperación de contraseña, correo con proveedor simulado, cifrado, retención, proxy de confianza, importación y visor.
- Pruebas en navegador de recuperación de borrador tras recargar, envío del formulario de tres pasos, ficha de cliente, recurso, publicación de un presupuesto de prueba con importe y lectura visual de su PDF.
- Comprobación de conflicto en navegador: una segunda persona modifica el expediente de muestra; la primera ve ambos textos y elige cuál conservar.
- En móvil de 390 × 844 se verificó visualmente el botón completo de envío, el adjunto y la navegación de conversaciones. Se envió y se confirmó un mensaje de prueba. No hubo errores registrados en esos recorridos.
- La instalación de dependencias no informó de vulnerabilidades conocidas en el análisis de npm realizado.
- No se han enviado correos a destinatarios reales. La prueba del proveedor utiliza un receptor simulado.

Estas comprobaciones no equivalen a una auditoría externa de seguridad ni a una prueba en dispositivos físicos con teclado móvil o lector de pantalla. La recuperación externa en Railway debe comprobarse una vez exista el almacenamiento real.

## Configuración externa pendiente

1. **Límite de gasto para almacenamiento y copias.** Se ha revisado el proyecto principal y preparado la elección del servicio; no se ha creado el volumen ni el depósito. El presupuesto solicitado al usuario sigue pendiente de respuesta.
2. **Correo de Marquee.** Falta confirmar el proveedor y configurar su acceso y el dominio remitente. La integración preparada con Resend puede sustituirse o adaptarse al proveedor elegido; no debe activarse con credenciales de prueba.
3. **Producción y dominio único.** Una vez completados los dos puntos anteriores, crear el almacenamiento persistente del servicio principal, configurar secretos del servidor, activar copias externas y de Railway, probar recuperación, crear el administrador protegido en la base de producción y publicar. El segundo dominio debe redirigir al principal. No se debe copiar la base de muestras.
4. **Datos anteriores.** La herramienta de importación está lista. La importación efectiva depende de las copias que se exporten de los navegadores donde se usaba la demo; no se han inventado ni sustituido esos datos.

Para el arranque previsto se ha preparado un único servicio con SQLite y volumen persistente, opción que la auditoría contemplaba para una prueba inicial. La migración a una base de datos gestionada y un repositorio separado para todos los documentos continúa siendo una ampliación de infraestructura para crecimiento; no se ha ejecutado ni contratado. WhatsApp, firma avanzada, facturación y aplicaciones móviles nativas figuraban expresamente como fases posteriores, no como elementos de esta entrega.

## Fuentes de configuración

Tarifas y límites contrastados con la documentación de [precios de Railway](https://docs.railway.com/pricing/plans), [almacenamiento de objetos](https://docs.railway.com/storage-buckets), [copias de volúmenes](https://docs.railway.com/volumes/backups) y [cabeceras del proxy](https://docs.railway.com/networking/public-networking/specs-and-limits). La integración de correo utiliza las [claves de idempotencia de Resend](https://resend.com/docs/dashboard/emails/idempotency-keys). Las tarifas pueden cambiar y la facturación depende del uso real.
