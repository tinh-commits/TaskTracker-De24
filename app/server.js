'use strict';
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const prom = require('prom-client');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateTask, STATUSES } = require('./validators');

const required = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME', 'JWT_SECRET',
  'BOOTSTRAP_ADMIN_PASSWORD', 'BOOTSTRAP_MEMBER_PASSWORD'];
for (const key of required) {
  if (!process.env[key] || /^REPLACE_/.test(process.env[key])) {
    console.error(`Missing required environment variable: ${key}`);
    process.exit(1);
  }
}
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'], connectSrc: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], upgradeInsecureRequests: null
    }
  }
}));
app.use(cookieParser());
app.use(express.json({ limit: '32kb' }));
const pool = new Pool({
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME, max: 10, connectionTimeoutMillis: 5000
});
const register = new prom.Registry();
prom.collectDefaultMetrics({ register, prefix: 'tasktracker_' });
const reqCounter = new prom.Counter({ name: 'tasktracker_http_requests_total', help: 'HTTP requests by route and status', labelNames: ['method','route','status'], registers: [register] });
const reqDuration = new prom.Histogram({ name: 'tasktracker_http_request_duration_seconds', help: 'HTTP request duration by route', labelNames: ['method','route'], buckets: [0.01,0.03,0.1,0.3,1,3], registers: [register] });
const logStream = fs.createWriteStream('/srv/logs/application.log', { flags: 'a', mode: 0o644 });
logStream.on('error', (err) => console.error('Log file failure:', err.message));
function log(level, event, info={}) {
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, component: 'tasktracker-app', event, ...info });
  process.stdout.write(line + '\n');
  logStream.write(line + '\n');
}
app.use((req, res, next) => {
  const rid = crypto.randomUUID();
  req.requestId = rid;
  res.setHeader('X-Request-ID', rid);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/metrics' || req.path === '/health') return;
    const route = req.route?.path || (req.path.startsWith('/api/') ? '/api/other' : '/static');
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    reqCounter.inc({ method: req.method, route, status: String(res.statusCode) });
    reqDuration.observe({ method: req.method, route }, ms / 1000);
    log(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      request_id: rid, method: req.method, route, status: res.statusCode, duration_ms: Math.round(ms)
    });
  });
  next();
});
app.get('/health', async (req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch (err) { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});
app.get('/metrics', async (req, res) => {
  res.type(register.contentType).send(await register.metrics());
});
const isValidUser = (v) => typeof v === 'string' && /^[a-zA-Z0-9_.-]{3,40}$/.test(v);
const attempts = new Map();
app.post('/api/login', async (req, res, next) => {
  try {
    const username = req.body?.username;
    const password = req.body?.password;
    if (!isValidUser(username) || typeof password !== 'string' || password.length > 256) {
      return res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu không hợp lệ.' });
    }
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const a = attempts.get(ip) || { count: 0, until: now + 15*60*1000 };
    if (now > a.until) { a.count = 0; a.until = now + 15*60*1000; }
    if (a.count >= 12) return res.status(429).json({ error: 'Đăng nhập nhiều lần thất bại. Vui lòng thử lại sau.' });
    const q = await pool.query('SELECT id, username, full_name, role, password_hash FROM users WHERE username=$1 AND active=true', [username]);
    const u = q.rows[0];
    const verified = u ? await bcrypt.compare(password, u.password_hash) : false;
    if (!verified) {
      a.count++; attempts.set(ip, a);
      log('warn', 'login_failed', { request_id: req.requestId });
      return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu.' });
    }
    attempts.delete(ip);
    const token = jwt.sign({ sub: u.id, role: u.role }, process.env.JWT_SECRET, { expiresIn: '8h', issuer: 'tasktracker' });
    res.cookie('tt_session', token, {
      httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true',
      path: '/', maxAge: 8 * 60 * 60 * 1000
    });
    log('info', 'login_success', { user_id: u.id, request_id: req.requestId });
    res.json({ user: { id: u.id, username: u.username, full_name: u.full_name, role: u.role } });
  } catch (err) { next(err); }
});
function auth(req, res, next) {
  const cookie = req.cookies.tt_session;
  if (!cookie) return res.status(401).json({ error: 'Vui lòng đăng nhập.' });
  try {
    const decoded = jwt.verify(cookie, process.env.JWT_SECRET, { issuer: 'tasktracker' });
    req.user = { id: Number(decoded.sub), role: decoded.role };
    return next();
  } catch { return res.status(401).json({ error: 'Phiên làm việc hết hạn. Vui lòng đăng nhập lại.' }); }
}
function csrf(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest' || !req.is('application/json')) {
    return res.status(403).json({ error: 'Yêu cầu không hợp lệ.' });
  }
  next();
}
app.use('/api', csrf);
app.post('/api/logout', auth, (req, res) => {
  res.clearCookie('tt_session', { httpOnly: true, sameSite: 'strict', secure: process.env.COOKIE_SECURE === 'true', path: '/' });
  res.json({ ok: true });
});
app.get('/api/me', auth, async (req, res, next) => {
  try {
    const q = await pool.query('SELECT id, username, full_name, role FROM users WHERE id=$1 AND active=true', [req.user.id]);
    if (!q.rows[0]) return res.status(401).json({ error: 'Người dùng không còn hoạt động.' });
    res.json({ user: q.rows[0] });
  } catch (err) { next(err); }
});
app.get('/api/users', auth, async (req, res, next) => {
  try {
    const r = await pool.query('SELECT id, username, full_name, role FROM users WHERE active=true ORDER BY id');
    res.json({ users: r.rows });
  } catch (err) { next(err); }
});
app.get('/api/tasks', auth, async (req, res, next) => {
  try {
    const params = [];
    const predicates = [];
    if (req.user.role !== 'admin') {
      params.push(req.user.id);
      predicates.push(`(t.created_by=$${params.length} OR t.assigned_to=$${params.length})`);
    }
    if (req.query.status && req.query.status !== 'all') {
      if (!STATUSES.includes(req.query.status)) return res.status(400).json({ error: 'Bộ lọc trạng thái không hợp lệ.' });
      params.push(req.query.status);
      predicates.push(`t.status=$${params.length}`);
    }
    if (req.query.q) {
      const q = String(req.query.q).trim().slice(0, 100);
      params.push('%' + q.replace(/[\\%_]/g, '\\$&') + '%');
      predicates.push(`(t.title ILIKE $${params.length} ESCAPE '\\' OR t.description ILIKE $${params.length} ESCAPE '\\')`);
    }
    const where = predicates.length ? `WHERE ${predicates.join(' AND ')}` : '';
    const rows = await pool.query(`SELECT t.id,t.title,t.description,t.status,t.priority,
      to_char(t.due_date,'YYYY-MM-DD') AS due_date,t.assigned_to,t.created_by,
      t.created_at,t.updated_at,u.full_name AS assignee_name,c.full_name AS creator_name
      FROM tasks t LEFT JOIN users u ON u.id=t.assigned_to JOIN users c ON c.id=t.created_by
      ${where} ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END,
      t.due_date ASC NULLS LAST,t.id DESC LIMIT 300`, params);
    res.json({ tasks: rows.rows });
  } catch (err) { next(err); }
});
async function userExists(id) {
  const r = await pool.query('SELECT 1 FROM users WHERE id=$1 AND active=true', [id]);
  return r.rowCount > 0;
}
app.post('/api/tasks', auth, async (req, res, next) => {
  try {
    const { value, error } = validateTask(req.body);
    if (error) return res.status(422).json({ error });
    const assignee = req.user.role === 'admin' ? (value.assigned_to || req.user.id) : req.user.id;
    if (!(await userExists(assignee))) return res.status(422).json({ error: 'Người thực hiện không tồn tại.' });
    const r = await pool.query(`INSERT INTO tasks(title,description,status,priority,due_date,assigned_to,created_by)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [value.title, value.description, value.status, value.priority, value.due_date, assignee, req.user.id]);
    log('info', 'task_created', { user_id: req.user.id, task_id: r.rows[0].id });
    res.status(201).json({ id: r.rows[0].id });
  } catch (err) { next(err); }
});
function positiveId(raw) {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}
app.patch('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID công việc không hợp lệ.' });
    const r = await pool.query('SELECT * FROM tasks WHERE id=$1', [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'Không tìm thấy công việc.' });
    const task = r.rows[0];
    const owner = task.created_by === req.user.id || req.user.role === 'admin';
    const assigned = task.assigned_to === req.user.id;
    if (!owner && !assigned) return res.status(403).json({ error: 'Bạn không có quyền sửa công việc này.' });
    if (!owner) {
      if (Object.keys(req.body || {}).sort().join(',') !== 'status' || !STATUSES.includes(req.body.status)) {
        return res.status(403).json({ error: 'Bạn chỉ được cập nhật trạng thái công việc được giao.' });
      }
      await pool.query('UPDATE tasks SET status=$1,updated_at=NOW() WHERE id=$2', [req.body.status,id]);
    } else {
      const { value, error } = validateTask(req.body);
      if (error) return res.status(422).json({ error });
      const assignee = req.user.role === 'admin' ? (value.assigned_to || req.user.id) : task.assigned_to;
      if (!(await userExists(assignee))) return res.status(422).json({ error: 'Người thực hiện không tồn tại.' });
      await pool.query(`UPDATE tasks SET title=$1,description=$2,status=$3,priority=$4,due_date=$5,
        assigned_to=$6,updated_at=NOW() WHERE id=$7`,
        [value.title,value.description,value.status,value.priority,value.due_date,assignee,id]);
    }
    log('info', 'task_updated', { user_id: req.user.id, task_id: id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.delete('/api/tasks/:id', auth, async (req, res, next) => {
  try {
    const id = positiveId(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID công việc không hợp lệ.' });
    const r = await pool.query('DELETE FROM tasks WHERE id=$1 AND (created_by=$2 OR $3=$4) RETURNING id',
      [id, req.user.id, req.user.role, 'admin']);
    if (!r.rowCount) return res.status(404).json({ error: 'Không tìm thấy công việc hoặc không có quyền xóa.' });
    log('info', 'task_deleted', { user_id: req.user.id, task_id: id });
    res.json({ ok: true });
  } catch (err) { next(err); }
});
app.use(express.static(path.join(__dirname, 'public'), { fallthrough: true }));
app.use((req, res) => res.status(404).json({ error: 'Không tìm thấy tài nguyên.' }));
app.use((err, req, res, next) => {
  log('error', 'unhandled_error', { request_id: req.requestId, error_code: err.code || 'INTERNAL' });
  res.status(500).json({ error: 'Hệ thống gặp lỗi. Vui lòng thử lại.' });
});
async function bootstrap() {
  const users = [
    [process.env.BOOTSTRAP_ADMIN_USERNAME || 'admin', 'Quản trị viên', 'admin', process.env.BOOTSTRAP_ADMIN_PASSWORD],
    [process.env.BOOTSTRAP_MEMBER_USERNAME || 'nhanvien', 'Nhân viên demo', 'member', process.env.BOOTSTRAP_MEMBER_PASSWORD]
  ];
  for (const [username, fullname, role, password] of users) {
    if (!isValidUser(username) || password.length < 12) throw Error('Bootstrap username invalid or password shorter than 12 characters');
    const hash = await bcrypt.hash(password, 12);
    await pool.query(`INSERT INTO users(username,full_name,role,password_hash)
      VALUES($1,$2,$3,$4) ON CONFLICT(username) DO NOTHING`, [username,fullname,role,hash]);
  }
  log('info', 'bootstrap_complete');
}
async function start() {
  for (let i=0;i<25;i++) {
    try { await pool.query('SELECT 1'); await bootstrap();
      app.listen(3000, '0.0.0.0', () => log('info', 'server_started', { port: 3000 }));
      return;
    } catch (err) {
      if (i === 24) throw err;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}
start().catch(err => { log('error', 'bootstrap_failed', { error_code: err.code || 'UNKNOWN' }); process.exit(1); });
process.on('SIGTERM', async () => { await pool.end(); logStream.end(); process.exit(0); });
