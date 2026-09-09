# Demo persistente y copias verificadas · V4.5.1

La demo conserva su base SQLite, los archivos y las copias locales en el volumen `b2be-demo-data`, montado en `/app/.demo-data`. El arranque utiliza esa misma carpeta. Una configuración Railway que apunte a una carpeta distinta se rechaza antes de abrir o crear datos.

La migración del 10 de septiembre de 2026 preservó exactamente 7 eventos, 3 cuentas y 5 archivos. Se bloquearon temporalmente las escrituras mientras se obtenía la copia final. Se verificaron la integridad SQLite, las huellas de todos los archivos y el contenido de negocio antes y después del despliegue. Los identificadores, el histórico, las claves y las cuatro copias existentes se conservaron. El servicio auxiliar empleado para cargar el volumen se eliminó después de desconectarlo.

Huella de la copia previa al cambio: `61d28a4405730ab3c29f7a7f48a9d9edf97f934ea0af5fc5d23fae6734135542`.

## Copias fuera del servicio

El almacén privado `b2be-demo-backups` conserva las copias cifradas. Está separado del volumen de la aplicación, aunque ambos pertenecen a Railway. La cuenta conserva su plan Hobby; el panel de Railway exige Pro para sus instantáneas nativas y no se ha cambiado de plan.

La aplicación comprueba las copias cada hora y al arrancar. Si no hubo cambios, reutiliza una copia reciente; crea al menos un nuevo punto diario mientras permanece en funcionamiento. Cada copia se cifra con AES-256-GCM, se sube, se descarga de nuevo y se contrasta tanto su huella cifrada como el contenido descifrado. Solo entonces aparece como verificada. Los fallos se muestran en los ajustes y generan avisos de conservación de datos.

La retención local conserva 31 puntos diarios, 12 mensuales, al menos 5 copias recientes y las manuales. Las copias externas no se borran automáticamente. El almacenamiento se factura por uso según Railway.

## Configuración separada de la demo

Las copias externas requieren `DEMO_EXTERNAL_BACKUPS=1` y valores propios para:

- `DEMO_BACKUP_S3_ENDPOINT`
- `DEMO_BACKUP_S3_BUCKET`
- `DEMO_BACKUP_S3_ACCESS_KEY`
- `DEMO_BACKUP_S3_SECRET_KEY`
- `DEMO_BACKUP_ENCRYPTION_KEY` (32 bytes aleatorios, codificados en base64)
- `DEMO_BACKUP_S3_REGION` (opcional)
- `DEMO_BACKUP_S3_URL_STYLE` (`virtual-host` para los nuevos almacenes de Railway; por defecto, estilo de ruta)
- `DEMO_BACKUP_S3_SESSION_TOKEN` (solo si el proveedor lo requiere)

Estas variables se guardan en Railway, nunca en GitHub. La demo sigue ignorando las conexiones privadas a PostgreSQL, el correo real y las credenciales genéricas de copias. La activación incompleta falla explícitamente. Sin activación, mantiene el comportamiento anterior sin transferencias externas.

## Recuperación

En Ajustes de administración, «Conservación de datos y recuperación» permite comprobar el estado y ensayar la recuperación externa. El ensayo descarga, descifra y restaura una copia en una carpeta aislada; compara eventos, usuarios, documentos, logotipos y órdenes, y elimina las sesiones de la copia restaurada. No reemplaza la base activa ni modifica los eventos. El resultado queda registrado.

Una recuperación completa necesita la copia, su manifiesto, la clave de cifrado y la clave de seguridad de la aplicación. Se conserva una copia local protegida de estos materiales fuera del repositorio. Conviene custodiarla en un lugar independiente de la cuenta Railway.

La demo sigue siendo una demostración con credenciales públicas. Esta configuración protege su continuidad; no convierte la demo en un entorno privado de producción ni activa PostgreSQL. Las copias automáticas del almacén siguen dentro del mismo proveedor; la copia descargada al equipo aporta un punto adicional fuera de Railway.

## Validación

Se comprueban los tres roles y el aislamiento por espacio, los archivos originales, la persistencia tras despliegue, las copias cifradas y su recuperación. Las pruebas también verifican el rechazo de credenciales incompletas, volúmenes mal configurados y copias alteradas. El HTML V4 original y la identidad visual aprobada permanecen intactos.
