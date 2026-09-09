# B2BE · Identidad de espacios y documentos (4.4.0)

Cada espacio dispone de su propia identidad para los documentos nuevos. Administración puede configurar cualquier espacio; los usuarios de espacio únicamente los que tienen asignados. El perfil comercial consulta el diseño y sigue generando presupuestos con la identidad correspondiente.

## Uso

1. Administración: **Espacios de eventos → Identidad y PDF**. Usuario de espacio: **Mi espacio de eventos → Identidad y documentos de mis espacios**.
2. Completar nombre en documentos, color, descripción breve y pie de página. Subir un logotipo PNG o JPG de hasta 1 MB, 4096 píxeles por lado y 4 megapíxeles. Se admiten PNG estáticos sin entrelazado. Los formatos animados y SVG no se aceptan.
3. Elegir fondo blanco, oscuro o corporativo si el logotipo necesita contraste.
4. Usar **Vista previa PDF** para comprobar el borrador sin guardar. **Guardar identidad** confirma la modificación para el espacio.

Los presupuestos generados y las órdenes de producción usan una plantilla A4 con cabecera de identidad, marca B2BE, tablas con cabeceras repetidas, importes, condiciones y numeración. Los colores claros conservan texto oscuro legible. Las cantidades y los impuestos siguen calculándose en céntimos. Los archivos aportados externamente no se reformatean.

## Conservación y permisos

- Los presupuestos emitidos mantienen exactamente sus bytes, versiones, aceptación y huellas. Cambiar la identidad afecta a los nuevos documentos.
- Las órdenes publicadas a partir de esta versión incluyen una copia de la identidad del espacio en su contenido firmado con SHA-256. Cambiar o retirar después el logotipo del espacio no cambia esa identidad histórica. Las órdenes anteriores que no guardaban identidad usan el nombre que consta en su propia publicación y el diseño común.
- Los logotipos se guardan en la base de datos, con tamaño, formato y SHA-256. Se incluyen en las copias de SQLite/PostgreSQL y en la exportación administrativa del archivo. El ensayo de recuperación comprueba también las huellas de los logotipos.
- La consulta de logotipos y vistas previas exige sesión y acceso al espacio. Las modificaciones exigen origen válido, protección CSRF y versión de identidad vigente para evitar sobrescrituras concurrentes.
- La marca B2BE se carga como recurso de la aplicación con validación de caché. No se sustituye la identidad legal de Marquee.
- El HTML V4 original, las ramas de respaldo y las bases privadas se conservan. No se borran eventos ni usuarios de demostración con esta actualización.

## Validación

30 pruebas automáticas: roles, aislamiento entre espacios, archivo de eventos, autenticación, concurrencia, PostgreSQL, copias y restauración, producción, presupuestos e identidad. Las pruebas nuevas cubren carga y permisos del logotipo, vista previa sin escritura, conflictos de identidad, formatos y tamaños inválidos, conservación de documentos y PDF de varias páginas con todos los conceptos y totales.

Revisión visual: formulario de escritorio, móvil de 390 px sin desbordamientos, carga real de PNG, vista previa integrada y guardado; presupuesto de una página, presupuesto de 60 conceptos en seis páginas y orden de producción en dos páginas. La fuente V4 sigue teniendo 812095 bytes y SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.

La publicación sigue siendo una demo con datos ficticios. La infraestructura privada y sus proveedores externos mantienen el estado descrito en `PRODUCCION_EVENTOS.md`; esta actualización no activa servicios de pago.
