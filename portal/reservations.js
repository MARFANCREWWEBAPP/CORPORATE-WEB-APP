'use strict';

const {id, now, text, fail, ops, CLOSED} = require('./store');
const {scheduleConflicts} = require('./workflow-store');
const {schedule, status, active} = require('./reservation-state');

function revision(data) {
  if (!Number.isInteger(data.revision)) fail(400, 'Falta la versión del evento.');
}
function hours(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 720) fail(400, 'El plazo debe estar entre 1 y 720 horas.');
  return n;
}
function available(state, event) {
  const conflicts = scheduleConflicts(state, event);
  if (conflicts.length) throw Object.assign(new Error('La fecha, sala o los recursos coinciden con otra reserva o evento confirmado. Revisa la disponibilidad.'), {status:409, details:{kind:'reservation', conflicts}});
}
function install(Store) {
  if (Store.prototype.reservationsInstalled) return;
  Store.prototype.reservationsInstalled = true;

  const transaction = Store.prototype.transaction;
  Store.prototype.transaction = function(actor, action, fn) {
    return transaction.call(this, actor, action, state => {
      const at = Date.now();
      const previous = new Map(state.events.map(event => [event.id, {hold:active(event, at)?.id, schedule:JSON.stringify(schedule(event))}]));
      const result = fn(state);
      for (const event of state.events) {
        const before = previous.get(event.id);
        const hold = before?.hold && event.reservations?.find(item => item.id === before.hold);
        if (!hold || hold.status !== 'ACTIVE') continue;
        if (!CLOSED.includes(event.status) && before.schedule !== JSON.stringify(schedule(event))) {
          throw Object.assign(new Error('Este evento tiene una reserva temporal activa. Libérala antes de cambiar su fecha, sala, horario o recursos.'), {status:409, details:{kind:'reservation'}});
        }
        if (CLOSED.includes(event.status) || event.status === 'CONFIRMED') {
          hold.status = event.status === 'CONFIRMED' ? 'CONFIRMED' : 'RELEASED';
          hold.closedAt = now();
          hold.closedById = actor?.id || null;
          hold.closeReason = event.status === 'CONFIRMED' ? 'El evento se ha confirmado.' : 'El evento se ha archivado.';
        }
      }
      return result;
    });
  };
  const view = Store.prototype.view;
  Store.prototype.view = function(user) {
    const state = view.call(this, user);
    for (const event of state.events) {
      event.reservations = (event.reservations || []).map(hold => {
        hold.effectiveStatus = status(hold);
        if (!ops(user)) {
          delete hold.schedule.resourceIds;
          delete hold.createdById;
          delete hold.closedById;
          hold.extensions = (hold.extensions || []).map(({at, previousExpiry, expiresAt, reason}) => ({at, previousExpiry, expiresAt, reason}));
        }
        return hold;
      });
    }
    return state;
  };
  Store.prototype.reserveEvent = function(user, eventId, data) {
    if (!ops(user)) fail(403, 'Administración y comercial gestionan las reservas temporales.');
    revision(data);
    return this.transaction(user, 'RESERVATION_CREATED', state => {
      const event = this.event(state, user, eventId, data.revision);
      this.venue(state, event.venueId);
      if (CLOSED.includes(event.status) || event.status === 'CONFIRMED') fail(409, 'Solo se reservan temporalmente eventos abiertos pendientes de confirmar.');
      if (!event.estimatedStartTime || !event.estimatedEndTime) fail(400, 'Completa las horas de inicio y fin en la planificación antes de reservar.');
      const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Europe/Madrid', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date());
      if (event.eventDate < today) fail(400, 'No se puede reservar una fecha pasada.');
      if (active(event)) fail(409, 'Este evento ya tiene una reserva activa. Puedes ampliarla o liberarla.');
      for (const resourceId of event.resourceIds || []) if (!state.resources.some(resource => resource.id === resourceId && resource.active)) fail(409, 'Hay recursos inactivos. Revisa la planificación antes de reservar.');
      available(state, event);
      const hold = {id:id(), status:'ACTIVE', createdAt:now(), createdById:user.id, expiresAt:new Date(Date.now() + hours(data.durationHours) * 3600000).toISOString(), reason:text(data.reason, 2000, true), schedule:schedule(event), extensions:[]};
      (event.reservations ||= []).push(hold);
      this.history(event, user, 'Reserva temporal creada hasta ' + hold.expiresAt + '. ' + hold.reason, 'RESERVATION_CREATED');
      this.notify(state, event, user, 'Fecha reservada temporalmente', event.eventName);
      return hold;
    });
  };
  Store.prototype.changeReservation = function(user, eventId, holdId, data) {
    if (!ops(user)) fail(403, 'Administración y comercial gestionan las reservas temporales.');
    revision(data);
    return this.transaction(user, 'RESERVATION_UPDATED', state => {
      const event = this.event(state, user, eventId, data.revision);
      if (CLOSED.includes(event.status) || event.status === 'CONFIRMED') fail(409, 'La reserva de este evento ya está cerrada.');
      const hold = (event.reservations || []).find(item => item.id === holdId);
      if (!hold) fail(404, 'Reserva no encontrada.');
      if (status(hold) !== 'ACTIVE') fail(409, 'La reserva ya ha terminado. Crea una nueva para volver a comprobar la disponibilidad.');
      const reason = text(data.reason, 2000, true);
      if (data.action === 'RELEASE') {
        hold.status = 'RELEASED'; hold.closedAt = now(); hold.closedById = user.id; hold.closeReason = reason;
        this.history(event, user, 'Reserva temporal liberada. ' + reason, 'RESERVATION_RELEASED');
      } else if (data.action === 'EXTEND') {
        this.venue(state, event.venueId);
        available(state, event);
        const expiresAt = new Date(Date.parse(hold.expiresAt) + hours(data.durationHours) * 3600000).toISOString();
        if (Date.parse(expiresAt) > Date.now() + 720 * 3600000) fail(400, 'La reserva no puede quedar a más de 30 días desde hoy.');
        hold.extensions.push({at:now(), actorId:user.id, previousExpiry:hold.expiresAt, expiresAt, reason});
        hold.expiresAt = expiresAt;
        this.history(event, user, 'Reserva temporal ampliada hasta ' + expiresAt + '. ' + reason, 'RESERVATION_EXTENDED');
      } else fail(400, 'Selecciona ampliar o liberar la reserva.');
      this.notify(state, event, user, data.action === 'RELEASE' ? 'Reserva temporal liberada' : 'Reserva temporal ampliada', event.eventName);
      return hold;
    });
  };
}

module.exports = {install};
