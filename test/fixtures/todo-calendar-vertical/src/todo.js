'use strict';
const records = new Map();
let sequence = 0;
function date(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      Number.isNaN(Date.parse(value + 'T00:00:00Z')) ||
      new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value)
    throw Error('Invalid ISO date');
  return value;
}
function requireTitle(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 120)
    throw Error('Title must be 1..120 characters');
  return value.trim();
}
function createTodo({title,startDate,dueDate}={}) {
  const start = date(startDate), due = date(dueDate);
  if (start && due && due < start) throw Error('Due date precedes start');
  const item = {id:'todo-'+(++sequence),title:requireTitle(title),
    startDate:start,dueDate:due,completed:false};
  records.set(item.id,item);
  return {...item};
}
function updateTodo(id,patch={}) {
  const old = records.get(id);
  if (!old) throw Error('Unknown todo');
  const next = {...old};
  if (Object.hasOwn(patch,'title')) next.title = requireTitle(patch.title);
  if (Object.hasOwn(patch,'startDate')) next.startDate = date(patch.startDate);
  if (Object.hasOwn(patch,'dueDate')) next.dueDate = date(patch.dueDate);
  if (next.startDate && next.dueDate && next.dueDate < next.startDate)
    throw Error('Due date precedes start');
  if (Object.hasOwn(patch,'completed')) {
    if (typeof patch.completed !== 'boolean') throw Error('Invalid completion');
    next.completed = patch.completed;
  }
  records.set(id,next);
  return {...next};
}
function completeTodo(id) { return updateTodo(id,{completed:true}); }
function removeTodo(id) { return records.delete(id); }
function listTodos({completed}={}) {
  return [...records.values()].filter(t=>completed===undefined||t.completed===completed)
    .map(t=>({...t}));
}
function resetTodos() { records.clear(); sequence=0; }
module.exports = {createTodo,updateTodo,completeTodo,removeTodo,listTodos,resetTodos};
