'use strict';
const STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
const PRIORITIES = ['low', 'medium', 'high'];
function cleanText(value, maxLen) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  return v.length > 0 && v.length <= maxLen ? v : null;
}
function cleanDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const dt = new Date(value + 'T00:00:00Z');
  return Number.isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== value ? undefined : value;
}
function validateTask(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: 'Dữ liệu không hợp lệ.' };
  const title = cleanText(body.title, 160);
  const description = typeof body.description === 'string' && body.description.length <= 1500 ? body.description.trim() : null;
  const dueDate = cleanDate(body.due_date);
  if (!title) return { error: 'Tên công việc bắt buộc và tối đa 160 ký tự.' };
  if (description === null) return { error: 'Mô tả tối đa 1500 ký tự.' };
  if (dueDate === undefined) return { error: 'Hạn chót phải có định dạng YYYY-MM-DD và là ngày hợp lệ.' };
  if (!STATUSES.includes(body.status)) return { error: 'Trạng thái không hợp lệ.' };
  if (!PRIORITIES.includes(body.priority)) return { error: 'Mức ưu tiên không hợp lệ.' };
  let assignedTo = null;
  if (body.assigned_to !== '' && body.assigned_to !== undefined && body.assigned_to !== null) {
    const num = Number(body.assigned_to);
    if (!Number.isSafeInteger(num) || num < 1) return { error: 'Người thực hiện không hợp lệ.' };
    assignedTo = num;
  }
  return { value: { title, description, due_date: dueDate, status: body.status, priority: body.priority, assigned_to: assignedTo } };
}
module.exports = { STATUSES, PRIORITIES, cleanDate, validateTask };
