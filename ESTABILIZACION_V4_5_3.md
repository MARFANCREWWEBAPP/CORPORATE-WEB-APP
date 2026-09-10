# V4.5.3 — borradores, reintentos y chat en móvil

Entrega del 10 de septiembre de 2026. La aplicación pública continúa en modo demo. Se conserva la V4 aprobada, la marca Marquee · B2BE, los datos y los respaldos existentes.

## Correcciones

Al escribir en una conversación y cambiar rápidamente a otra, el temporizador compartido podía cancelar el guardado de la primera. Ahora cada conversación conserva su texto y temporizador por separado. El estado indica si el borrador está pendiente, guardándose o confirmado. Los cambios entrantes no reemplazan ediciones pendientes ni hacen retroceder una revisión ya confirmada.

Una respuesta de red puede perderse después de que el servidor haya guardado la operación. El cliente conserva el contenido y la clave del intento exacto para confirmarlo antes de guardar cambios posteriores. En mensajes aparece «Comprobar envío» y el texto permanece bloqueado hasta resolver ese envío; no se envían mensajes automáticamente al recuperar la conexión. En peticiones, «Comprobar guardado» recupera el borrador existente y después actualiza la versión más reciente, sin crear otra petición.

Si otra pestaña modifica el borrador del mismo mensaje, se muestran ambas versiones y se exige elegir cuál guardar. Al enviar, se comprueba la revisión y el contenido del borrador. El servidor mantiene una revisión vacía después del envío para rechazar guardados antiguos que podrían hacer reaparecer el mensaje. Una operación que envía otro contenido no elimina un borrador distinto.

El cierre de sesión espera a los guardados pendientes y avisa si queda un envío sin confirmar. Una respuesta de una cuenta anterior no se aplica a una cuenta diferente. La limpieza explícita de la demo también vacía los borradores que esa sesión mantiene en memoria.

El chat tiene zonas separadas para el historial y el formulario. Su altura se adapta al escritorio; en móviles compactos ocupa el área disponible con un botón para volver a las conversaciones. El cuadro y los botones no quedan debajo de la navegación. Las actualizaciones conservan la posición de lectura y los envíos propios llevan al último mensaje.

## Validación

- **52 pruebas automáticas aprobadas**: incluyen aislamiento entre espacios, copias y restauración, archivos, PostgreSQL, conflictos, reintentos, buffers independientes, respuesta perdida, cambio de cuenta y peticiones editadas durante el guardado.
- Ensayo de navegador con datos sintéticos en un servidor local separado: cambio rápido A/B conserva ambos borradores; pérdida de conexión conserva el texto y permite reintentar.
- Se interrumpió la respuesta después de guardar un mensaje. Antes y después de «Comprobar envío» existía exactamente un mensaje con el mismo identificador.
- Se interrumpió la respuesta de creación de un borrador y se modificó su nombre. Tras reintentar existía un único borrador, con el mismo identificador, la segunda versión y revisión 2.
- Dos pestañas con versiones distintas produjeron un conflicto visible; se compararon ambas y se guardó expresamente la versión local.
- Revisión visual y de dimensiones a 1366 × 768, 390 × 844, 390 × 440 y 320 × 568. Se corrigió también el solapamiento con la barra inferior del móvil compacto. El botón de envío quedó completo, sin desplazamiento horizontal.
- La comprobación de integración y sintaxis conserva el original de 812.095 bytes y SHA-256 `e7b2f81b2a26010b8c96d3450349f5b4caa2b7430e2732be93ca8cf4c1e93472`.

Los cortes de conexión y mensajes de ensayo se realizaron exclusivamente en el servidor aislado. La validación pública comprueba los tres perfiles, identificadores de eventos, huellas de archivos, recursos de la interfaz y estado de las copias sin crear eventos de prueba.

## Límites y operación

El texto aún no confirmado se conserva en la memoria de la pestaña, no en almacenamiento permanente del navegador. No se debe cerrar o recargar esa pestaña hasta confirmar el guardado; el navegador recibe un aviso de salida pendiente. Un cierre forzado, fallo del navegador o apagado puede perder ese texto. Los borradores confirmados se recuperan desde el servidor. Esta entrega no convierte la aplicación en una aplicación completamente utilizable sin conexión.

La adaptación al teclado utiliza el área visible del navegador. [VisualViewport](https://developer.mozilla.org/en-US/docs/Web/API/VisualViewport) permite detectar su reducción; falta el ensayo con teclados reales de iPhone y Android. Las dimensiones simuladas no sustituyen ese piloto.

El acceso privado definitivo, el correo real, la carga con un volumen representativo y el piloto con los tres perfiles siguen pendientes. La copia adicional en iCloud necesita identificar la carpeta privada, conceder acceso y comprobar su sincronización y recuperación. No se ha configurado ese destino y no necesita ser público. Las copias cifradas existentes continúan en su almacén actual.

La actualización no elimina expedientes, cuentas, archivos, copias ni revisiones de producción. No introduce una migración de base de datos ni cambia las credenciales o integraciones externas. Para revertir se conserva la entrega V4.5.2; se recomienda mantener V4.5.3 por la protección de borradores y reintentos.
