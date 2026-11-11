'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createTodo,updateTodo,completeTodo,removeTodo,listTodos,resetTodos} = require('../src/todo.js');
test('creates scheduled and unscheduled todos with stable IDs',()=>{
  resetTodos();
  const a=createTodo({title:'Ship release',startDate:'2026-11-09',dueDate:'2026-11-12'});
  const b=createTodo({title:'Inbox zero'});
  assert.equal(a.id,'todo-1');assert.equal(b.id,'todo-2');
  assert.equal(a.completed,false);assert.equal(b.startDate,null);
  assert.equal(listTodos().length,2);
});
test('updates one todo without changing identity',()=>{
  resetTodos();
  const a=createTodo({title:'Draft',startDate:'2026-11-09'});
  const b=updateTodo(a.id,{title:'Review',startDate:'2026-11-10',dueDate:'2026-11-13'});
  assert.equal(b.id,a.id);assert.equal(b.title,'Review');
  assert.equal(listTodos()[0].dueDate,'2026-11-13');
});
test('completes, filters and deletes the same todo',()=>{
  resetTodos();
  const a=createTodo({title:'Fix bug'});
  completeTodo(a.id);
  assert.equal(listTodos({completed:true}).length,1);
  assert.equal(listTodos({completed:false}).length,0);
  assert.equal(removeTodo(a.id),true);
  assert.equal(listTodos().length,0);
});
test('rejects invalid titles, dates and reversed schedules',()=>{
  resetTodos();
  assert.throws(()=>createTodo({title:'   '}),/Title/);
  assert.throws(()=>createTodo({title:'Bad',startDate:'2026-02-30'}),/Invalid ISO date/);
  assert.throws(()=>createTodo({title:'Bad',startDate:'2026-11-11',dueDate:'2026-11-10'}),/Due date precedes/);
});
test('returns copies that cannot mutate persisted todos',()=>{
  resetTodos();const item=createTodo({title:'Original'});
  item.title='Corrupted';
  const returned=listTodos();returned[0].title='Corrupted again';
  assert.equal(listTodos()[0].title,'Original');
});
