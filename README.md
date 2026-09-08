# Marquee Audiovisuales — V4 Operativa

Aplicación de eventos, presupuestos y comunicación. El arranque predeterminado es una **demo compartida con datos ficticios**, acceso real al servidor y permisos por perfil. El nombre «Marquee Flow» se ha retirado de la interfaz activa.

## Probar la demo

Requiere Node.js >=22.16 (recomendado 24). Instalar y ejecutar:

```sh
npm ci
npm run check
npm test
npm start
```

Abrir http://localhost:3210. En Railway se utiliza el puerto asignado y HTTPS. Los tres accesos están disponibles en la pantalla de entrada:

| Perfil | Email |
| --- | --- |
| Administración | admin@demo.test |
| Comercial | comercial@demo.test |
| Espacio de eventos | espacio@demo.test |

Contraseña pública de demostración: `MarqueeDemo2026!`.

La demo usa su propio almacenamiento `.demo-data` y muestras. Sus cambios sobreviven a un reinicio dentro del mismo almacenamiento, pero pueden perderse al reemplazar una instancia sin volumen. **No introducir datos reales en la demo.** El correo, Odoo, WhatsApp, IA y las transferencias externas se simulan; las credenciales de servicios heredadas no activan esas conexiones. No se copia la cuenta privada de administración al acceso público.

## Producción y día del evento (4.3.0)

En Operativa aparecen **Producción** y **Día del evento**. Marquee prepara y publica órdenes con horario, responsables, documentos y versiones en PDF; el espacio confirma su revisión. Los cambios de alcance de un evento confirmado se valoran y se aprueban antes de aplicarse. La jornada registra avances, bloqueos e incidencias con fotos. Ajustes permite ensayar la recuperación de una copia sin sobrescribir la base activa.

Ver [PRODUCCION_EVENTOS.md](PRODUCCION_EVENTOS.md) para recorridos, garantías y límites. La activación de infraestructura privada sigue pendiente; el despliegue predeterminado continúa siendo una demo.

## Qué incorpora

Cuentas creadas desde administración, permisos por espacio de eventos, archivos protegidos, archivo de cancelados y realizados, histórico, estadísticas por espacio y cliente, «Pendiente de mí», petición rápida, responsables y próxima acción, chat adaptable, borradores, presupuesto vigente y visor integrado. Incluye generación de PDF, aceptación de versión con nombre y consentimiento, reglas por estado, recordatorios, resumen diario, conflictos de calendario y suscripciones de calendario de solo lectura.

El soporte PostgreSQL, las réplicas cifradas S3/R2 y los adaptadores externos están implementados y probados de forma aislada. Su activación real requiere infraestructura, cuentas y una validación con cada proveedor. La firma con certificado y la sincronización bidireccional Google/Outlook siguen pendientes.

Estado detallado, límites y criterios de uso: [DEMO_OPERATIVA.md](DEMO_OPERATIVA.md). Configuración privada: [portal/README.md](portal/README.md).

## Referencia original y recuperación

`index.html` conserva los **812095 bytes** aprobados y SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`. La aplicación adapta esa plantilla al servirla. `npm run start:original` mantiene el arranque histórico, con sus condiciones de protección HTTP. No se han eliminado las ramas ni los archivos de respaldo existentes.

Consultar [RESTORE_V4_ORIGINAL.md](RESTORE_V4_ORIGINAL.md), [AUDITORIA_V4_1.md](AUDITORIA_V4_1.md) y [IMPLEMENTACION_AUDITORIA.md](IMPLEMENTACION_AUDITORIA.md) para el registro histórico. Las descripciones de entregas anteriores no sustituyen el estado actual de esta demo.

Administración dispone de **Configuración → Borrar eventos y usuarios demo**. Muestra el alcance, exige escribir `BORRAR DEMO` y crea una copia íntegra antes de borrar. Conserva el acceso administrador y las copias anteriores. Los tres perfiles iniciales solo desaparecen cuando administración ejecuta la limpieza; el despliegue no la ejecuta automáticamente.
