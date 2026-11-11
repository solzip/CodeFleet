'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createTodo,updateTodo,removeTodo,resetTodos} = require('../src/todo.js');
const {monthEvents,weekEvents} = require('../src/calendar.js');
test('month and week use the same task identity',()=>{
  resetTodos();
  const item=createTodo({title:'Ship',startDate:'2026-11-09',dueDate:'2026-11-12'});
  assert.equal(monthEvents(2026,11)[0].id,item.id);
  assert.equal(weekEvents('2026-11-09')[0].id,item.id);
});
test('rescheduling updates month and week projections',()=>{
  resetTodos();
  const item=createTodo({title:'Move',startDate:'2026-11-09'});
  updateTodo(item.id,{startDate:'2026-12-07'});
  assert.equal(monthEvents(2026,11).length,0);
  assert.equal(monthEvents(2026,12)[0].id,item.id);
  assert.equal(weekEvents('2026-12-07').length,1);
});
test('completion filter is shared and deletion disappears from calendar',()=>{
  resetTodos();
  const item=createTodo({title:'Finish',dueDate:'2026-11-10'});
  updateTodo(item.id,{completed:true});
  assert.equal(monthEvents(2026,11,{completed:false}).length,0);
  assert.equal(monthEvents(2026,11,{completed:true}).length,1);
  removeTodo(item.id);
  assert.equal(weekEvents('2026-11-09').length,0);
});
test('undated tasks stay in list but not calendar',()=>{
  resetTodos();
  createTodo({title:'Someday'});
  assert.deepEqual(monthEvents(2026,11),[]);
  assert.deepEqual(weekEvents('2026-11-09'),[]);
});
test('rejects invalid months and non-Monday week anchors',()=>{
  assert.throws(()=>monthEvents(2026,13),/Invalid month/);
  assert.throws(()=>weekEvents('2026-11-11'),/Monday/);
});
