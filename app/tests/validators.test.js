'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { cleanDate, validateTask } = require('../validators');
const sample = { title: ' Thiết kế API ', description: '', status: 'todo', priority: 'medium', due_date: '2026-12-01', assigned_to: 1 };
test('valid task is normalized', () => {
  const res = validateTask(sample);
  assert.equal(res.value.title, 'Thiết kế API');
  assert.equal(res.value.assigned_to, 1);
});
test('reject invalid calendar date', () => assert.equal(cleanDate('2026-02-30'), undefined));
test('reject SQL or arbitrary statuses', () => assert.ok(validateTask({ ...sample, status: 'done;DROP TABLE tasks' }).error));
test('reject missing title', () => assert.ok(validateTask({ ...sample, title: ' ' }).error));
test('optional due date is null', () => assert.equal(validateTask({ ...sample, due_date: '' }).value.due_date, null));
test('reject negative assignee', () => assert.ok(validateTask({ ...sample, assigned_to: -4 }).error));
