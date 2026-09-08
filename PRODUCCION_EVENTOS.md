# Producción y ejecución de eventos — 4.3.0

Esta entrega desarrolla la siguiente versión propuesta: orden de producción, cambios con aprobación, modo día del evento y comprobación de continuidad. Conserva el diseño y los bytes de la V4 original, los accesos demo y el botón de limpieza. La infraestructura privada todavía requiere elegir y configurar los recursos persistentes; la demo no se convierte en producción al borrar sus muestras.

## Recorrido de uso

1. Administración o comercial abre **Operativa → Producción**, selecciona un evento confirmado y prepara su orden. También se accede desde **Resumen del evento → Orden y cambios**.
2. El borrador guarda instrucciones, material, equipo técnico, contactos, planos/documentos compartidos, personas que deben revisar y hasta 50 actividades con fecha, hora y responsable. Permite preparar montaje el día anterior y desmontaje el siguiente. La ficha técnica existente se incorpora al publicar.
3. Al publicar deben estar completas las horas y seleccionadas al menos una persona de Marquee y una del espacio. Cada publicación conserva una copia inmutable con SHA-256, presupuesto aceptado, último presupuesto compartido, cambios aprobados y referencias documentales. Puede consultarse en el portal y como PDF. El espacio ve las versiones publicadas; el borrador es interno.
4. Cada persona confirma que ha revisado la versión vigente. La confirmación queda vinculada a la versión y su huella; una nueva publicación requiere nueva revisión. Las anteriores conservan sus confirmaciones.
5. En **Cambios y extras**, el espacio solicita una modificación o Marquee envía una propuesta ya valorada. Marquee especifica el suplemento final con impuestos incluidos (también puede ser cero o un abono) y su alcance. La aprobación final requiere una cuenta del espacio, nombre y consentimiento. El importe del servidor prevalece sobre cualquier importe manipulado en la petición.
6. Solo la aprobación aplica los valores propuestos. Aforo, fecha, horas, sala, montaje/desmontaje y necesidades técnicas tienen campos estructurados; también se puede describir un extra sin cambiar esos campos. Una propuesta desactualizada se retira y se vuelve a preparar. Rechazos y retiradas se conservan. No se modifica el PDF ni la aceptación del presupuesto original.
7. **Día del evento** muestra el horario publicado y permite actualizar pasos como pendientes, en curso, realizados o bloqueados. Un bloqueo exige explicación. Marquee puede actualizar todos; el espacio, los asignados a su cuenta. Una nueva orden inicia un seguimiento propio y conserva el anterior.
8. Las incidencias tienen prioridad, responsable, detalle y fotografías compartidas del evento. Su resolución exige explicación y mantiene histórico. La persona responsable, quien la creó y Marquee pueden actualizarla.
9. Al cancelar o realizar el evento, órdenes, cambios, seguimiento, incidencias, fotografías y confirmaciones quedan consultables. Estos nuevos módulos rechazan modificaciones del expediente archivado.

## Integridad y permisos

- Los cambios directos de alcance de un evento confirmado se rechazan dentro de la transacción, también fuera de HTTP. La planificación interna de recursos y horarios operativos mantiene sus permisos anteriores y exige actualizar la orden si cambia.
- Publicar, decidir, registrar incidencias y actualizar pasos requieren la revisión actual del evento. Las propuestas se vinculan además al contenido que se valoró. Dos aprobaciones que compiten no sobrescriben sus cambios.
- Se comprueban conflictos de disponibilidad antes de aplicar cambios. Una aprobación del espacio no permite saltarse un conflicto; Marquee debe resolverlo.
- Las rutas de evento y los reintentos de operaciones vuelven a verificar los permisos actuales, incluso si la respuesta estaba en la caché de idempotencia.
- Las fotos y planos deben pertenecer al mismo evento y ser compartidos. Los PDF requieren sesión y acceso al evento; no se generan enlaces públicos.
- Los datos técnicos y el contenido de una orden se conservan como estaban al publicar. Si cambia el alcance, el presupuesto de referencia o la ficha técnica, la interfaz indica que hace falta una nueva publicación. No permite confirmar ni ejecutar una orden desactualizada.
- Las notificaciones nuevas son avisos dentro del portal. Esta entrega no envía mensajes a terceros ni activa proveedores externos.

## Continuidad y recuperación

En **Administración → Configuración → Conservación de datos y recuperación** se consultan las comprobaciones y se ensaya una recuperación local. En un entorno privado con copias externas configuradas también puede ensayarse su recuperación.

El ensayo crea una carpeta temporal propia, contrasta SHA-256 e integridad SQLite, comprueba todos los archivos referenciados y las huellas de las órdenes, recupera la copia y compara los datos de negocio y cada archivo. Las sesiones recuperadas quedan anuladas. La base activa y las copias de origen no se sobrescriben. Solo se retira la carpeta temporal creada por el ensayo; se guarda un informe sin contenido privado del expediente. El informe global está restringido a administración.

La subida de una copia externa exige ahora descargarla, contrastar su huella y descifrarla correctamente antes de marcarla verificada. Los ensayos con transporte de prueba comprueban tanto éxito como corrupción del objeto. No se ha realizado todavía un ensayo contra un proveedor de almacenamiento real.

El panel comprueba separación de demo, PostgreSQL, volumen Railway, HTTPS/clave de seguridad, copia local reciente, copia externa leída en las últimas 48 horas, ensayo externo en los últimos 30 días y capacidad disponible. Es una comprobación de infraestructura, no una certificación de servicio o un ensayo de carga.

## Validación

- 26 pruebas automatizadas: se mantienen las 21 anteriores y se añaden cinco recorridos completos de producción, aprobación, concurrencia, permisos, PDF, incidencias, archivo y recuperación local/externa simulada.
- Sintaxis y hash original comprobados. No se añade ninguna dependencia.
- Navegador: preparación y publicación V1, propuesta de ampliación 120 → 180 asistentes por 350,50 € con impuestos, aprobación desde el perfil espacio, publicación V2 desde comercial y actualización de montaje.
- Pantalla móvil de 390 px: aprobación legible y botón completo, sin desbordamiento horizontal. PDF de muestra revisado visualmente.

## Límites y siguientes fases

La autorización de gasto y las cuentas de almacenamiento privado siguen pendientes. PostgreSQL y los adaptadores externos conservan los límites descritos en DEMO_OPERATIVA.md. Las credenciales privadas y los datos de trabajo anteriores no se incorporan a la demo ni al repositorio.

Esta fase mantiene los tres perfiles existentes. El alta de técnicos/proveedores con permisos específicos, bloqueos de reservas con caducidad, contabilidad de costes reales/márgenes, paquetes reutilizables, rediseño completo de la entrada por perfil y nuevas estadísticas comerciales quedan para las siguientes fases del plan. Tampoco incluye funcionamiento sin conexión, firma certificada o sincronización bidireccional de calendarios. El modo día del evento requiere conexión para guardar; los fallos de conexión se muestran y las operaciones pueden reintentarse sin duplicar cambios.
