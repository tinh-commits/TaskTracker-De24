'use strict';
const $ = id => document.getElementById(id);
const statusNames = { todo: 'Cần làm', in_progress: 'Đang thực hiện', blocked: 'Tạm dừng', done: 'Hoàn thành' };
const priorityNames = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
let currentUser = null;
let users = [];
let allTasks = [];
let summaryTasks = [];
const h = text => String(text ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(url, options = {}) {
  const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest', ...(options.headers || {}) }, ...options });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
function setMessage(message, bad = false) {
  $('alert').hidden = !message;
  $('alert').textContent = message;
  $('alert').classList.toggle('error', bad);
  if (message) window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showAuth(authenticated) {
  $('loginPage').hidden = authenticated;
  $('dashboard').hidden = !authenticated;
}
async function initialize() {
  $('todayLabel').textContent = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: 'long', year: 'numeric' }).format(new Date());
  try {
    const result = await api('/api/me');
    currentUser = result.user;
    showAuth(true);
    $('sidebarName').textContent = currentUser.full_name;
    $('sidebarRole').textContent = currentUser.role === 'admin' ? 'Quản trị viên' : 'Thành viên';
    $('avatar').textContent = currentUser.full_name.slice(0, 1).toUpperCase();
    await loadUsers();
    await loadTasks();
  } catch {
    showAuth(false);
  }
}
async function loadUsers() {
  const data = await api('/api/users');
  users = data.users;
  const select = $('taskAssignee');
  select.replaceChildren();
  for (const user of users) {
    const opt = document.createElement('option');
    opt.value = String(user.id);
    opt.textContent = `${user.full_name} (${user.username})`;
    select.appendChild(opt);
  }
  select.disabled = currentUser.role !== 'admin';
}
async function loadTasks() {
  try {
    const args = new URLSearchParams();
    const q = $('searchInput').value.trim();
    const status = $('statusFilter').value;
    if (q) args.set('q', q);
    if (status !== 'all') args.set('status', status);
    const { tasks: summary } = await api('/api/tasks');
    summaryTasks = summary;
    if (args.toString()) {
      const { tasks } = await api('/api/tasks?' + args.toString());
      allTasks = tasks;
    } else {
      allTasks = summary;
    }
    renderTasks();
  } catch (err) { setMessage(err.message, true); }
}
function renderTasks() {
  const list = $('taskList');
  list.replaceChildren();
  $('taskCount').textContent = `${allTasks.length} công việc`;
  $('emptyState').hidden = allTasks.length !== 0;
  const now = new Date();
  const today = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  $('statAll').textContent = summaryTasks.length;
  $('statProgress').textContent = summaryTasks.filter(t => t.status === 'in_progress').length;
  $('statDone').textContent = summaryTasks.filter(t => t.status === 'done').length;
  $('statOverdue').textContent = summaryTasks.filter(t => t.due_date && t.due_date < today && t.status !== 'done').length;
  for (const task of allTasks) {
    const item = document.createElement('article');
    item.className = 'task-item';
    const overdue = task.due_date && task.due_date < today && task.status !== 'done';
    const isOwner = task.created_by === currentUser.id || currentUser.role === 'admin';
    const mayEdit = isOwner || task.assigned_to === currentUser.id;
    item.innerHTML = `<div class="task-main"><h3 class="task-title">${h(task.title)}</h3><p class="task-desc">${h(task.description || 'Chưa có mô tả')}</p><div class="task-meta"><span class="pill ${h(task.status)}">${h(statusNames[task.status])}</span><span class="priority-${h(task.priority)}">● ${h(priorityNames[task.priority])}</span><span>◷ ${h(task.due_date || 'Chưa có hạn')}</span>${overdue ? '<span class="overdue">⚠ Quá hạn</span>':''}<span>↗ ${h(task.assignee_name || 'Chưa giao')}</span></div></div><div class="task-actions">${mayEdit ? `<button class="tiny-btn" data-action="edit" data-id="${task.id}">Sửa</button>`:''}${isOwner ? `<button class="tiny-btn delete" data-action="delete" data-id="${task.id}">Xóa</button>`:''}</div>`;
    list.appendChild(item);
  }
}
function showTaskModal(task = null) {
  $('taskForm').reset();
  $('modalError').textContent = '';
  $('taskId').value = task?.id ?? '';
  $('modalTitle').textContent = task ? 'Cập nhật công việc' : 'Tạo công việc mới';
  $('taskTitle').value = task?.title ?? '';
  $('taskDescription').value = task?.description ?? '';
  $('taskStatus').value = task?.status ?? 'todo';
  $('taskPriority').value = task?.priority ?? 'medium';
  $('taskDue').value = task?.due_date ?? '';
  $('taskAssignee').value = String(task?.assigned_to ?? currentUser.id);
  const onlyStatus = task && currentUser.role !== 'admin' && task.created_by !== currentUser.id;
  for (const id of ['taskTitle','taskDescription','taskPriority','taskDue']) $(id).disabled = Boolean(onlyStatus);
  $('taskAssignee').disabled = currentUser.role !== 'admin' || Boolean(onlyStatus);
  $('taskModal').showModal();
}
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = $('loginForm').querySelector('button[type=submit]');
  btn.disabled = true;
  $('loginError').textContent = '';
  try {
    const form = new FormData(e.target);
    await api('/api/login', { method:'POST', body:JSON.stringify({username:form.get('username'),password:form.get('password')}) });
    await initialize();
  } catch (err) { $('loginError').textContent = err.message; }
  finally { btn.disabled = false; }
});
$('logoutBtn').addEventListener('click', async () => {
  try { await api('/api/logout', { method:'POST',body:'{}' }); }
  catch (e) { /* Clear local view even if the session already expired. */ }
  currentUser = null;
  $('loginForm').reset();
  showAuth(false);
});
$('addBtn').addEventListener('click', () => showTaskModal());
$('closeModal').addEventListener('click', () => $('taskModal').close());
$('cancelModal').addEventListener('click', () => $('taskModal').close());
$('refreshBtn').addEventListener('click', loadTasks);
$('statusFilter').addEventListener('change', loadTasks);
let queryDebounce;
$('searchInput').addEventListener('input', () => { clearTimeout(queryDebounce); queryDebounce = setTimeout(loadTasks, 250); });
$('taskList').addEventListener('click', async e => {
  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const task = allTasks.find(t => String(t.id) === btn.dataset.id);
  if (!task) return;
  if (btn.dataset.action === 'edit') return showTaskModal(task);
  if (!window.confirm(`Bạn muốn xóa công việc "${task.title}"?`)) return;
  try { await api(`/api/tasks/${task.id}`, { method:'DELETE',body:'{}' }); setMessage('Đã xóa công việc.'); await loadTasks(); }
  catch (err) { setMessage(err.message, true); }
});
$('taskForm').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('taskId').value;
  const before = allTasks.find(t => String(t.id) === id);
  const onlyStatus = before && currentUser.role !== 'admin' && before.created_by !== currentUser.id;
  const data = onlyStatus ? { status:$('taskStatus').value } : {
    title:$('taskTitle').value, description:$('taskDescription').value,
    status:$('taskStatus').value, priority:$('taskPriority').value,
    due_date:$('taskDue').value || null, assigned_to:Number($('taskAssignee').value)
  };
  $('saveTaskBtn').disabled = true;
  $('modalError').textContent = '';
  try {
    await api(id ? `/api/tasks/${id}` : '/api/tasks', { method:id ? 'PATCH':'POST', body:JSON.stringify(data) });
    $('taskModal').close();
    setMessage(id ? 'Cập nhật công việc thành công.' : 'Tạo công việc thành công.');
    await loadTasks();
  } catch (err) { $('modalError').textContent = err.message; }
  finally { $('saveTaskBtn').disabled = false; }
});
initialize();
