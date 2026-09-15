# V4.5.7 — correo y WhatsApp para administración

El administrador dispone de **Correo y WhatsApp** en su menú y de un acceso desde Configuración. También puede preparar un correo o WhatsApp desde el expediente del evento. Los comerciales y espacios no pueden configurar, consultar el registro ni utilizar estos canales; la restricción se comprueba en el servidor, incluidas las rutas antiguas de WhatsApp.

## Correo al cliente

El remitente inicial es **info@marquee.es**. El destinatario se completa con el correo del cliente y la copia se toma obligatoriamente de la ficha del espacio. Si falta el correo del espacio, se detiene el envío hasta completarlo. El administrador revisa asunto, texto, destinatarios y puede adjuntar el presupuesto vigente publicado. Se comprueba la huella del PDF antes de enviarlo. Si cambia el evento, el correo del espacio, la configuración o el presupuesto desde la revisión, debe abrirse de nuevo el mensaje.

Se admiten Resend e IONOS directo. La opción elegida para la activación es **Resend gratuito**, manteniendo el remitente y las respuestas en info@marquee.es. El proyecto Railway está en Hobby y bloquea SMTP; no se ha autorizado ni contratado una ampliación de Railway. IONOS directo solo resulta utilizable cuando el alojamiento permita SMTP.

En **Correo y WhatsApp**, el administrador introduce la clave de Resend después de verificar marquee.es en ese servicio. B2BE comprueba que la clave permite consultar el dominio y que este admite envío. La clave se conserva cifrada con la clave de seguridad del portal, nunca se devuelve al navegador y no se incorpora al repositorio. La configuración verificada genera una copia de recuperación.

El envío al cliente es manual, tras revisión del administrador. Conectar este canal no activa la cola histórica de avisos automáticos ni la recuperación de contraseñas por correo; estos siguen con su configuración independiente.

## WhatsApp en la aplicación del Mac

Por petición del usuario se retira la conexión directa con Meta para mantener todas las funciones del teléfono. Desde el evento, **WhatsApp del contacto** muestra el nombre y teléfono guardados y permite revisar el mensaje. **Abrir WhatsApp en Mac** utiliza el enlace nativo de la aplicación instalada, con número internacional y texto codificado. Hay un enlace alternativo de WhatsApp si el navegador no abre la aplicación.

El administrador debe usar WhatsApp para Mac vinculado al número **+34 645 252 250**. El envío se confirma dentro de WhatsApp; B2BE no lo realiza automáticamente, no puede verificar la sesión del Mac ni registra un borrador como enviado. El móvil no se migra ni se modifica. No se conecta con Meta, no utiliza plantillas ni claves de su API. Las rutas antiguas de configuración y envío directo se retiran con una respuesta explicativa; tampoco permiten activar credenciales heredadas.

Los teléfonos españoles de nueve cifras se normalizan con +34; se admiten también prefijos internacionales + y 00. Si falta un teléfono válido, debe completarse en el evento antes de abrir WhatsApp. Los mensajes conservan acentos, saltos de línea y caracteres especiales en el enlace. En demo se bloquean los enlaces a conversaciones reales. Solo el administrador accede a la preparación del mensaje desde B2BE.

## Conservación y resultados inciertos

Los correos enviados desde B2BE quedan en un registro privado para administración, con destinatarios, copia, texto, adjunto y resultado. Las copias completas de la base conservan el registro y la configuración cifrada. Archivar eventos no elimina sus comunicaciones.

Cada intento lleva un identificador persistente. Volver a consultar el mismo intento no reenvía el mensaje. Un envío parcial o una pérdida de conexión muestra que el resultado requiere revisión. No hay reenvío automático en esos casos. “Aceptado por el proveedor” no equivale a entrega o lectura confirmadas.

## Validación

Pruebas específicas: permisos de los tres perfiles, protección de credenciales, copia obligatoria, cambios de destinatario, inyección en cabeceras, PDF vigente, aceptación parcial, incertidumbre, concurrencia, recuperación aislada y bloqueo de envíos reales en demo. Resend se prueba con dominio no verificado y verificado. WhatsApp se prueba con el contacto del evento, cambio de teléfono, números incompletos, texto con caracteres especiales, bloqueo de las rutas de Meta y ausencia de envíos o registros ficticios.

Los ensayos locales utilizan proveedores simulados y direcciones de prueba. La verificación y activación de cuentas reales se documentan por separado, cuando el proveedor las confirme. La V4 original permanece intacta.

Referencias: [correo saliente de Railway](https://docs.railway.com/networking/outbound-networking), [envío con Resend](https://resend.com/docs/api-reference/emails/send-email), [dominios de Resend](https://resend.com/docs/api-reference/domains/list-domains), [IONOS SMTP](https://www.ionos.es/ayuda/index.php?id=4770), [enlaces oficiales de WhatsApp](https://faq.whatsapp.com/5913398998672934).
