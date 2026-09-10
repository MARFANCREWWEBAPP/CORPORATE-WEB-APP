# V4.5.6 — correo y WhatsApp para administración

El administrador dispone de **Correo y WhatsApp** en su menú y de un acceso desde Configuración. También puede preparar un correo o WhatsApp desde el expediente del evento. Los comerciales y espacios no pueden configurar, consultar el registro ni utilizar estos canales; la restricción se comprueba en el servidor, incluidas las rutas antiguas de WhatsApp.

## Correo al cliente

El remitente inicial es **info@marquee.es**. El destinatario se completa con el correo del cliente y la copia se toma obligatoriamente de la ficha del espacio. Si falta el correo del espacio, se detiene el envío hasta completarlo. El administrador revisa asunto, texto, destinatarios y puede adjuntar el presupuesto vigente publicado. Se comprueba la huella del PDF antes de enviarlo. Si cambia el evento, el correo del espacio, la configuración o el presupuesto desde la revisión, debe abrirse de nuevo el mensaje.

Se admiten Resend e IONOS directo. La opción elegida para la activación es **Resend gratuito**, manteniendo el remitente y las respuestas en info@marquee.es. El proyecto Railway está en Hobby y bloquea SMTP; no se ha autorizado ni contratado una ampliación de Railway. IONOS directo solo resulta utilizable cuando el alojamiento permita SMTP.

En **Correo y WhatsApp**, el administrador introduce la clave de Resend después de verificar marquee.es en ese servicio. B2BE comprueba que la clave permite consultar el dominio y que este admite envío. La clave se conserva cifrada con la clave de seguridad del portal, nunca se devuelve al navegador y no se incorpora al repositorio. La configuración verificada genera una copia de recuperación.

El envío al cliente es manual, tras revisión del administrador. Conectar este canal no activa la cola histórica de avisos automáticos ni la recuperación de contraseñas por correo; estos siguen con su configuración independiente.

## WhatsApp Business

Número de Marquee: **+34 645 252 250**, confirmado por el usuario como WhatsApp Business. Antes de conectar Meta, el administrador puede preparar un mensaje y abrirlo en WhatsApp. Debe utilizar la sesión de ese número y terminar el envío allí; B2BE no puede confirmar lo enviado de esta manera.

Para enviar dentro de B2BE debe vincularse el número con el alta compatible de Meta, conservando la aplicación del teléfono. La conexión pide el identificador de cuenta Business, el identificador del número, la clave de Meta, versión, idioma y plantilla. El servidor comprueba que el número pertenece a esa cuenta y corresponde exactamente al +34 645 252 250, y que la plantilla está aprobada. Se admiten dos variables en el cuerpo: nombre del evento y próxima acción, con cabecera de texto fija y pie opcional. No se admiten botones o cabeceras variables.

El administrador revisa el destinatario, la plantilla y el permiso del contacto para recibir esa comunicación. No se ha implementado la recepción de conversaciones ni la confirmación de lectura mediante webhooks.

## Conservación y resultados inciertos

Los mensajes enviados desde B2BE quedan en un registro privado para administración, con destinatarios, copia, texto, adjunto y resultado. Las copias completas de la base conservan el registro y la configuración cifrada. Archivar eventos no elimina sus comunicaciones.

Cada intento lleva un identificador persistente. Volver a consultar el mismo intento no reenvía el mensaje. Un envío parcial o una pérdida de conexión muestra que el resultado requiere revisión. No hay reenvío automático en esos casos. “Aceptado por el proveedor” no equivale a entrega o lectura confirmadas.

## Validación

Pruebas específicas: permisos de los tres perfiles, protección de credenciales, copia obligatoria, cambios de destinatario, inyección en cabeceras, PDF vigente, aceptación parcial, incertidumbre, concurrencia, recuperación aislada y bloqueo de envíos reales en demo. Resend se prueba con dominio no verificado y verificado. WhatsApp se prueba con número ajeno, plantilla pendiente, consentimiento y repetición de un mismo intento.

Los ensayos locales utilizan proveedores simulados y direcciones de prueba. La verificación y activación de cuentas reales se documentan por separado, cuando el proveedor las confirme. La V4 original permanece intacta.

Referencias: [correo saliente de Railway](https://docs.railway.com/networking/outbound-networking), [envío con Resend](https://resend.com/docs/api-reference/emails/send-email), [dominios de Resend](https://resend.com/docs/api-reference/domains/list-domains), [IONOS SMTP](https://www.ionos.es/ayuda/index.php?id=4770), [API oficial de WhatsApp de Meta](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).
