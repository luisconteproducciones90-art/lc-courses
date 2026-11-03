'use strict';
// ¿Dentro del horario? schedule: {enabled, windows:[{days:[1..7 (1=lun)], start:'09:00', end:'18:00'}]}
function isOpen(schedule, tz) {
  if (!schedule || !schedule.enabled || !Array.isArray(schedule.windows) || !schedule.windows.length) return true;
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'UTC', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t)?.value;
  const day = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(get('weekday')) + 1;
  const now = `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
  return schedule.windows.some((w) => (w.days || []).includes(day) && now >= w.start && now < w.end);
}
module.exports = { isOpen };
