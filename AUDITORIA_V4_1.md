# Auditoría de Marquee Flow

Fecha: 8 de septiembre de 2026.

**Conclusión:** la V4 original está restaurada y publicada. La ampliación ya permite probar cuentas de espacios de eventos, peticiones compartidas, archivo y estadísticas, conservando la interfaz aprobada. Recomiendo resolver almacenamiento, copias externas y los puntos de fiabilidad indicados abajo antes de incorporar clientes reales.

La ampliación está en la versión de trabajo, disponible en **http://localhost:3210/** en este ordenador. Todavía no se ha publicado en Railway. Los eventos de esta vista previa están identificados como muestras.

## 1. Qué está preparado y comprobado

| Área | Resultado de la revisión |
|---|---|
| Diseño original | El HTML de referencia permanece intacto: 812095 bytes y el mismo SHA-256 aprobado. La ampliación reutiliza sus pantallas, estilos y logotipos. |
| Espacios de eventos | Se ha cambiado la terminología de la interfaz. Administración puede crear un espacio y su primera cuenta en un único formulario. |
| Usuarios | Altas desde administración, más de una persona por espacio, edición y desactivación. Las cuentas nuevas usan una contraseña temporal que deben cambiar al entrar. |
| Separación de información | Cada espacio recibe del servidor únicamente sus eventos, documentos compartidos y notificaciones. Las notas y documentos internos se excluyen antes de enviarse al navegador. |
| Peticiones | Las solicitudes enviadas se guardan en el servidor y aparecen al equipo de Marquee. El estado, prioridad, mensajes y documentos se gestionan mediante operaciones autenticadas. |
| Archivo | «Eventos cancelados» incluye cancelados y no aceptados; «Eventos realizados» conserva los finalizados. El expediente sigue accesible para su propio espacio. Administración puede reabrirlo. |
| Conservación | Archivar y desactivar cuentas no borran eventos, documentos ni mensajes. Las pruebas conservan los datos tras reiniciar y recuperan un evento con su PDF desde una copia. |
| Estadísticas | Peticiones, peticiones presupuestadas, aceptadas, porcentaje de aceptación y clientes recurrentes. Filtros por fecha y, para Marquee, por espacio. Las versiones de un presupuesto no se cuentan como eventos distintos. |
| Chat | Corregidos el reparto de altura en escritorio y el solapamiento del menú inferior en móvil. Envío real comprobado con datos de prueba. |
| Administrador protegido | `info@marquee.es` está creado en la versión de trabajo con la contraseña facilitada, almacenada como hash. No se puede eliminar, desactivar, cambiar de email, quitarle el rol o restablecer su contraseña desde otra cuenta dentro de la aplicación. |

La cuenta protegida y la base de datos de la vista previa no se incluyen en GitHub. La contraseña no se incorpora a código, documentos ni informes. La protección se aplica dentro de la aplicación; no impide que el propietario de la infraestructura gestione directamente el servidor o su almacenamiento.

## 2. Qué resolver antes de abrirlo a clientes

| Prioridad | Hallazgo comprobado | Mejora propuesta y criterio para darla por terminada |
|---|---|---|
| Alta | La web pública sigue siendo la demo V4, con perfiles simulados y datos por navegador. El portal nuevo aún no está conectado a almacenamiento de producción. | Preparar un entorno persistente, activar cuentas reales y comprobar desde dos dispositivos que se comparte la misma información. No confundir la prueba local con el servicio publicado. |
| Alta | Existen dos servicios y dominios Railway independientes. Dos bases locales producirían dos sistemas distintos. | Elegir una única fuente de datos y un dominio principal. El segundo dominio debe redirigir al principal o usar la misma base de datos. |
| Alta | Las copias implementadas están en el mismo almacenamiento que la base principal. No se han configurado las copias externas de Railway para el nuevo portal. | Configurar copias externas y probar una recuperación completa en una instancia aislada, incluyendo cuentas, eventos y documentos. Definir qué pérdida máxima de cambios es aceptable y cuánto puede durar una recuperación. |
| Alta | Cada arranque y cada archivo de evento genera una copia completa. No hay retención ni alerta de capacidad todavía. | Limitar copias redundantes, conservar puntos diarios y mensuales y avisar antes de agotar el almacenamiento. La limpieza de copias nunca debe borrar expedientes archivados. |
| Alta | El servidor rechaza la primera edición concurrente desactualizada, pero el formulario no presenta una comparación entre el borrador del usuario y la versión nueva. | Añadir una revisión de conflictos que conserve ambos textos y exija elegir qué guardar; evitar que un segundo intento sobrescriba cambios ajenos sin una comparación clara. |
| Alta | La protección de acceso usa también la dirección de conexión del servidor. Detrás del proxy de Railway puede agrupar accesos legítimos de varios usuarios. | Ajustar el límite de intentos a la información fiable del proxy y probar accesos simultáneos sin bloquear al resto del equipo. |
| Media | La exportación de un archivo descarga toda su categoría; no aplica los filtros visuales de fecha o espacio. | Ofrecer «Descargar esta vista» y «Descargar todo» con cantidades claras. Incluir solo los espacios y personas necesarios en cada exportación. |
| Media | Se pueden desactivar espacios, pero la lista heredada de la V4 muestra principalmente los activos. | Incorporar filtro Activos/Inactivos y una acción clara de reactivación. Los expedientes deben seguir disponibles para administración. |

Para una prueba pequeña, un único servicio con un volumen persistente puede ser suficiente. Para el crecimiento previsto, recomiendo **base de datos gestionada y almacenamiento separado de documentos**, porque facilitarán el trabajo simultáneo, la recuperación y el aumento del volumen de archivos. No he contratado ni configurado esos servicios adicionales.

## 3. Mejoras funcionales para elegir

| Orden sugerido | Propuesta | Beneficio | Esfuerzo relativo |
|---|---|---|---|
| 1 | Guardado de borradores en el servidor | Recuperar una petición sin enviar desde otro equipo o después de cerrar la pestaña. Actualmente el borrador está en la pestaña; las peticiones se guardan al enviarlas. | Medio |
| 2 | Aceptar, rechazar o pedir cambios sobre una versión concreta del presupuesto | Registrar quién decidió, cuándo y sobre qué documento, con motivo de rechazo o cancelación. | Medio |
| 3 | Avisos por email y preferencias de notificación | Avisar de nuevas peticiones, presupuestos y respuestas sin exigir tener el portal abierto. Actualmente hay notificaciones dentro del sistema. | Medio |
| 4 | Recuperación de contraseña y segundo factor para administradores | Reducir la dependencia del equipo para recuperar el acceso y proteger las cuentas con mayores permisos. | Medio |
| 5 | Catálogo de clientes por espacio | Evitar que «Empresa X», «Empresa X S.L.» y una abreviatura cuenten como tres clientes diferentes. Ahora la agrupación utiliza el nombre escrito. | Medio |
| 6 | Importe de presupuesto, importe aceptado y motivos de pérdida | Comparar volumen económico, aceptación y oportunidades perdidas. Los gráficos actuales cuentan eventos; no calculan ingresos. | Medio |
| 7 | Búsqueda y filtros del histórico más completos | Buscar por contacto, cliente, fecha, estado, tipo de evento y documentos; guardar vistas frecuentes. | Bajo/medio |
| 8 | Mejorar el chat para uso diario | Buscar dentro de mensajes, adjuntar desde el chat, mostrar mensajes no leídos y mantener el borrador de respuesta. En móvil conviene reducir la lista de conversaciones cuando se abre una. | Medio |
| 9 | Calendario de disponibilidad y conflictos | Detectar solapes de horarios, montajes, recursos y equipo técnico antes de confirmar. El calendario actual presenta eventos, no valida recursos. | Alto |
| 10 | Ficha técnica editable del espacio | Mantener accesos, potencia, restricciones acústicas, planos y personas de contacto, con fecha de última revisión. La vista técnica existe, pero su edición completa necesita ampliación. | Medio |
| 11 | Varias personas y varios espacios por organización | Permitir grupos con varios recintos y responsables compartidos. Actualmente cada usuario de espacio queda asociado a uno. | Alto |
| 12 | Recuperar datos de la demo anterior | Importación revisable, con detección de duplicados y copia previa. Los datos de los navegadores antiguos no se migran automáticamente. | Medio |

Dejaría para una fase posterior WhatsApp, firma avanzada, facturación, aplicaciones móviles nativas y automatizaciones complejas. Primero conviene estabilizar solicitudes, presupuestos, comunicación y conservación.

## 4. Ajustes de experiencia y calidad

- **Estado de conexión:** mostrar cuándo se sincronizó por última vez y distinguir conexión perdida, guardado pendiente y guardado confirmado. Algunas etiquetas heredadas todavía no reflejan todas las situaciones de desconexión.
- **Fechas y validaciones:** exigir una elección clara de la fecha, explicar los campos incompletos y no depender de valores de ejemplo para una solicitud real.
- **Accesibilidad:** asociar las etiquetas de los formularios heredados a sus campos, revisar el foco en ventanas, navegación con teclado y textos pequeños. Las pantallas nuevas ya incorporan etiquetas en sus formularios principales; falta una revisión completa del conjunto.
- **Lenguaje y consistencia:** terminar de pulir concordancias, singular/plural y textos demasiado largos tras pasar de «finca» a «espacio de eventos». Ocultar identificadores técnicos donde no ayudan al usuario.
- **Envíos repetidos:** identificar cada operación para que una reconexión o un reintento no cree dos solicitudes o dos mensajes iguales.
- **Mantenimiento:** separar progresivamente componentes y lógica de la antigua demo. La integración actual preserva el original mediante puntos de inserción verificados; necesita más pruebas de interfaz antes de ampliar muchas áreas a la vez.

## 5. Evidencia y límites de esta auditoría

Se revisaron el código local y los flujos con datos de prueba. Pasaron las seis pruebas automatizadas, incluyendo la prueba integral del portal y las de los tres puntos de arranque de la V4 original. Se comprobaron, entre otras condiciones: acceso sin sesión, CSRF, origen no autorizado, cambio obligatorio de contraseña, cuentas desactivadas, restricciones de la cuenta protegida, acceso cruzado a eventos y archivos, notas internas, edición concurrente, rechazo de archivos con formato incorrecto, archivo y reapertura, reinicio del servidor y recuperación de una copia con comparación de bytes.

En navegador se comprobaron el alta del espacio y su cuenta, cambio de contraseña temporal, panel de administrador y de espacio, menús por perfil, estadísticas, archivo y envío del chat. En escritorio de 1058 × 649 el botón de envío queda dentro del panel. En móvil de 390 × 844 queda por encima de la navegación y recibe pulsaciones. No se observó desbordamiento horizontal ni errores registrados durante estos recorridos.

No se ha realizado una prueba de carga, una auditoría externa de seguridad, una revisión exhaustiva con lectores de pantalla, una prueba del teclado en dispositivos físicos ni una recuperación del futuro portal en Railway. La vista previa de documentos reales y todos los flujos secundarios requieren ampliar las pruebas de navegador antes de producción. Los resultados no equivalen a garantizar que nunca pueda producirse una pérdida de datos.

## 6. Decisión recomendada

**Primera entrega:** almacenamiento único, copias externas y recuperación probada, control de capacidad, conflictos de edición y publicación de las cuentas de espacios.

**Segunda entrega:** borradores persistentes, aceptación de presupuestos con trazabilidad y avisos por email.

**Tercera entrega:** catálogo de clientes, importes y estadísticas comerciales ampliadas, mejoras de calendario y comunicación.

La auditoría y estas propuestas no activan nuevas contrataciones ni despliegues. Las siguientes ampliaciones quedan para vuestra elección.
