'use strict';
const {listTodos} = require('./todo.js');
function scheduled({completed}={}) {
  return listTodos({completed}).filter(t=>t.startDate||t.dueDate)
    .map(t=>({...t,eventDate:t.startDate||t.dueDate}))
    .sort((a,b)=>a.eventDate.localeCompare(b.eventDate)||a.id.localeCompare(b.id));
}
function monthEvents(year,month,options={}) {
  if (!Number.isInteger(year)||year<1970||year>2100||
      !Number.isInteger(month)||month<1||month>12) throw Error('Invalid month');
  const prefix = year+'-'+String(month).padStart(2,'0');
  return scheduled(options).filter(t=>t.eventDate.startsWith(prefix));
}
function weekEvents(monday,options={}) {
  if (typeof monday!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(monday))
    throw Error('Invalid week start');
  const d = new Date(monday+'T00:00:00Z');
  if (Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==monday||
      d.getUTCDay()!==1) throw Error('Week must start on Monday');
  const end = new Date(d.getTime()+7*86400000).toISOString().slice(0,10);
  return scheduled(options).filter(t=>t.eventDate>=monday&&t.eventDate<end);
}
module.exports = {monthEvents,weekEvents};
