'use strict';

const FIELDS = ['venueId','eventDate','estimatedStartTime','estimatedEndTime','room','setupMinutes','dismantleMinutes','resourceIds'];
const schedule = event => Object.fromEntries(FIELDS.map(key => [key, key === 'resourceIds' ? [...(event[key] || [])].sort() : event[key] ?? (key.endsWith('Minutes') ? 0 : '')]));
const status = (hold, at = Date.now()) => hold.status === 'ACTIVE' && Date.parse(hold.expiresAt) <= at ? 'EXPIRED' : hold.status;
const active = (event, at = Date.now()) => (event.reservations || []).find(hold => status(hold, at) === 'ACTIVE');

module.exports = {schedule, status, active};
