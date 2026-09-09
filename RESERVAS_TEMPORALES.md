# Reservas temporales — 4.5.0

Administración y comercial pueden apartar la fecha, sala y recursos de una petición mientras el cliente decide. Se accede desde **Planificación → Reservas temporales** o desde el resumen del expediente. El espacio consulta exclusivamente las reservas de sus eventos.

## Uso

1. Preparar la fecha, horas de inicio y fin, sala, montaje, desmontaje y recursos desde «Horarios, sala y recursos». Si la sala está vacía, la comprobación considera todo el espacio.
2. Crear una reserva de 1 a 720 horas, indicando el motivo. Se puede comprobar la disponibilidad antes; el servidor vuelve a comprobarla dentro de la transacción al guardar.
3. Ampliar el plazo con un motivo o liberar la reserva. La ampliación añade horas al vencimiento actual, con un máximo de 30 días desde el momento de ampliación.
4. Al confirmar el evento, su reserva pasa a «Evento confirmado» y la disponibilidad queda cubierta por el evento confirmado. Al archivar el evento, la reserva activa queda liberada.
5. Consultar «Incluir histórico» para ver reservas caducadas, liberadas y confirmadas, junto a sus ampliaciones y motivos. La caducidad termina el bloqueo sin borrar el expediente, documentos ni histórico.

## Reglas y conservación

- Las reservas se vinculan a un evento; crear una petición por sí solo no bloquea la fecha.
- No se admiten eventos confirmados, archivados, fechas pasadas ni horarios incompletos. No se puede crear otra reserva activa para el mismo evento.
- Se comprueban eventos confirmados y reservas activas: sala, espacio, recursos compartidos y solapes con montaje/desmontaje, incluyendo eventos que terminan al día siguiente. Los intervalos que solo se tocan no se consideran solapados. Se conservan las reglas horarias del planificador existente.
- Una reserva activa de otro evento impide confirmar por cambio de estado, aceptación de presupuesto o aprobación de un cambio de producción. No se puede saltar ese bloqueo mediante el motivo de excepción de coincidencias.
- Para cambiar fecha, sala, horario o recursos de una petición reservada se libera primero su reserva y se vuelve a comprobar al crear otra. Cambiar el estado no permite eludir esa protección.
- Las escrituras comprueban usuario activo, perfil, revisión del evento, origen y CSRF. Los reintentos mantienen el identificador de operación. Dos peticiones concurrentes se serializan en la base.
- El servidor evalúa la caducidad al comprobar disponibilidad; no depende de que un temporizador esté funcionando. El registro conserva el estado guardado y su fecha de caducidad; la vista calcula «Caducada». La pantalla actualiza los plazos cada 30 segundos cuando no se está editando.
- Las reservas y sus horarios originales se incluyen en el expediente exportado y en la copia completa de la base. La recuperación completa conserva identificadores, fechas, ampliaciones y motivos. El importador de la demo V4 antigua sigue siendo exclusivo de ese formato histórico.
- La vista del espacio omite identificadores de recursos internos y autores de operaciones administrativas de la reserva. No recibe eventos de otros espacios ni detalles de sus conflictos.

## Verificación

35 pruebas correctas: se conservan las 30 anteriores y se añaden cinco recorridos de permisos, revisión, reintentos, concurrencia, salas, recursos compartidos, aceptación de presupuestos, horario nocturno, caducidad sin temporizador, ampliación, liberación, archivo y recuperación exacta desde copia.

Navegador: creación y comprobación de disponibilidad sin perder el motivo escrito, ampliación de 24 horas, apertura de expediente, conservación tras reinicio, liberación y consulta del histórico desde el perfil del espacio. Revisión visual en escritorio y a 390 píxeles; sin desbordamiento horizontal y con el botón de liberación completo.

El HTML V4 original, logotipo aprobado, PDF emitidos y backups existentes se conservan. No se añaden dependencias ni servicios externos. Esta función no activa almacenamiento persistente en Railway ni convierte la demo en un entorno privado. El almacenamiento definitivo y la copia externa real siguen pendientes de configuración y presupuesto.
