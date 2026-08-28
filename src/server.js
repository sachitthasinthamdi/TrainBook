/**
 * server.js — Backend หลัก (Express + libSQL/Turso)
 * รันด้วย:  npm start   แล้วเปิด http://localhost:3000
 * ทุก route เป็น async เพราะฐานข้อมูล (Turso) ทำงานผ่านเครือข่าย
 */
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, get, all, run, initDb, useTurso } = require('./db');
const { ensureSeeded } = require('./seed');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'trainbook-dev-secret-change-me';

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ============================ Helpers ============================ */
function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
}
function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role };
}
function randomBookingCode() {
  return 'TRN' + Math.floor(600000 + Math.random() * 90000) + 'S' + Math.floor(10000 + Math.random() * 89999);
}

function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) { try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* guest */ } }
  next();
}
function authRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  next();
}
function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'กรุณาเข้าสู่ระบบก่อน' });
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบเท่านั้น' });
  next();
}
// ครอบ handler async ให้ error ถูกส่งต่อไปยัง error middleware
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

app.use(authOptional);

async function trainWithClasses(train) {
  const classes = await all(
    `SELECT id, class_name AS name, price, total_seats AS seats FROM train_classes WHERE train_id = ? ORDER BY id`,
    [train.id]
  );
  return { ...train, classes };
}

/* ============================ Health check ============================ */
app.get('/api/health', (_req, res) => res.json({ ok: true, db: useTurso ? 'turso' : 'local', time: new Date().toISOString() }));

/* ============================ Auth ============================ */
app.post('/api/auth/register', wrap(async (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'กรอกชื่อ อีเมล และรหัสผ่านให้ครบ' });
  if (String(password).length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });

  const mail = String(email).trim().toLowerCase();
  const exists = await get(`SELECT id FROM users WHERE email = ?`, [mail]);
  if (exists) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้สมัครแล้ว' });

  const hash = bcrypt.hashSync(String(password), 10);
  const info = await run(
    `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'user')`,
    [String(name).trim(), mail, String(phone || '').trim(), hash]
  );
  const user = await get(`SELECT * FROM users WHERE id = ?`, [info.lastInsertRowid]);
  res.status(201).json({ user: publicUser(user) });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'กรอกอีเมลและรหัสผ่าน' });

  const mail = String(email).trim().toLowerCase();
  const user = await get(`SELECT * FROM users WHERE email = ?`, [mail]);
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
}));

app.get('/api/auth/me', authRequired, wrap(async (req, res) => {
  const user = await get(`SELECT * FROM users WHERE id = ?`, [req.user.id]);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ user: publicUser(user) });
}));

/* ============================ Trains ============================ */
app.get('/api/trains', wrap(async (_req, res) => {
  const trains = await all(`SELECT * FROM trains WHERE active = 1 ORDER BY dep_time`);
  res.json(await Promise.all(trains.map(trainWithClasses)));
}));

app.get('/api/trains/:id', wrap(async (req, res) => {
  const train = await get(`SELECT * FROM trains WHERE id = ?`, [req.params.id]);
  if (!train) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  res.json(await trainWithClasses(train));
}));

app.get('/api/trains/:trainId/classes/:classId/taken-seats', wrap(async (req, res) => {
  const { trainId, classId } = req.params;
  const date = req.query.date || '';
  const rows = await all(
    `SELECT bs.seat_code AS code
       FROM booking_seats bs JOIN bookings b ON b.id = bs.booking_id
      WHERE b.train_id = ? AND b.class_id = ? AND b.travel_date = ? AND b.status != 'cancelled'`,
    [trainId, classId, date]
  );
  res.json(rows.map(r => r.code));
}));

/* ============================ Bookings ============================ */
async function getBooking(id) {
  const b = await get(
    `SELECT b.*, t.train_number, t.tag, t.from_city, t.to_city, t.dep_time, t.arr_time, c.class_name
       FROM bookings b
       JOIN trains t ON t.id = b.train_id
       JOIN train_classes c ON c.id = b.class_id
      WHERE b.id = ?`, [id]
  );
  if (!b) return null;
  const seats = await all(`SELECT seat_code FROM booking_seats WHERE booking_id = ? ORDER BY seat_code`, [id]);
  b.seats = seats.map(r => r.seat_code);
  return b;
}

app.post('/api/bookings', authRequired, wrap(async (req, res) => {
  const { trainId, classId, travelDate, seats, paymentMethod } = req.body || {};
  if (!trainId || !classId || !travelDate || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ error: 'ข้อมูลการจองไม่ครบ' });
  }
  const train = await get(`SELECT * FROM trains WHERE id = ?`, [trainId]);
  const cls = await get(`SELECT * FROM train_classes WHERE id = ? AND train_id = ?`, [classId, trainId]);
  if (!train || !cls) return res.status(404).json({ error: 'ไม่พบขบวนรถหรือชั้นโดยสาร' });

  const takenRows = await all(
    `SELECT bs.seat_code AS code FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE b.train_id = ? AND b.class_id = ? AND b.travel_date = ? AND b.status != 'cancelled'`,
    [trainId, classId, travelDate]
  );
  const taken = takenRows.map(r => r.code);
  const clash = seats.filter(s => taken.includes(s));
  if (clash.length) return res.status(409).json({ error: 'ที่นั่ง ' + clash.join(', ') + ' ถูกจองไปแล้ว' });

  const total = cls.price * seats.length;
  const code = randomBookingCode();

  // transaction: booking + ที่นั่งทั้งหมด ต้องสำเร็จพร้อมกัน
  const tx = await db.transaction('write');
  try {
    const info = await tx.execute({
      sql: `INSERT INTO bookings (booking_code, user_id, train_id, class_id, travel_date, pax, total_price, status, payment_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)`,
      args: [code, req.user.id, trainId, classId, travelDate, seats.length, total, String(paymentMethod || 'card')],
    });
    const bookingId = Number(info.lastInsertRowid);
    for (const s of seats) {
      await tx.execute({ sql: `INSERT INTO booking_seats (booking_id, seat_code) VALUES (?, ?)`, args: [bookingId, s] });
    }
    await tx.commit();
    res.status(201).json(await getBooking(bookingId));
  } catch (e) {
    await tx.rollback();
    res.status(500).json({ error: 'บันทึกการจองไม่สำเร็จ' });
  }
}));

app.get('/api/bookings', authRequired, wrap(async (req, res) => {
  const rows = await all(`SELECT id FROM bookings WHERE user_id = ? ORDER BY created_at DESC, id DESC`, [req.user.id]);
  res.json(await Promise.all(rows.map(r => getBooking(r.id))));
}));

app.get('/api/bookings/:id', authRequired, wrap(async (req, res) => {
  const b = await getBooking(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  if (b.user_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการจองนี้' });
  res.json(b);
}));

// ลบการจอง — เฉพาะผู้ดูแลระบบ
app.delete('/api/bookings/:id', adminRequired, wrap(async (req, res) => {
  const b = await get(`SELECT id FROM bookings WHERE id = ?`, [req.params.id]);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  await run(`DELETE FROM booking_seats WHERE booking_id = ?`, [req.params.id]);
  await run(`DELETE FROM bookings WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

/* ============================ Admin ============================ */
app.get('/api/admin/bookings', adminRequired, wrap(async (_req, res) => {
  const rows = await all(`SELECT id, user_id FROM bookings ORDER BY created_at DESC, id DESC`);
  const list = [];
  for (const r of rows) {
    const b = await getBooking(r.id);
    const u = r.user_id ? await get(`SELECT name, email FROM users WHERE id = ?`, [r.user_id]) : null;
    b.user_name = u ? u.name : 'guest';
    b.user_email = u ? u.email : '-';
    list.push(b);
  }
  res.json(list);
}));

app.patch('/api/admin/bookings/:id/status', adminRequired, wrap(async (req, res) => {
  const { status } = req.body || {};
  if (!['paid', 'pending', 'cancelled'].includes(status))
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  const b = await get(`SELECT id FROM bookings WHERE id = ?`, [req.params.id]);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  await run(`UPDATE bookings SET status = ? WHERE id = ?`, [status, req.params.id]);
  res.json(await getBooking(req.params.id));
}));

app.get('/api/admin/users', adminRequired, wrap(async (_req, res) => {
  const users = await all(`SELECT id, name, email, phone, role, created_at FROM users ORDER BY id`);
  res.json(users);
}));

app.get('/api/admin/trains', adminRequired, wrap(async (_req, res) => {
  const trains = await all(`SELECT * FROM trains ORDER BY id`);
  res.json(await Promise.all(trains.map(trainWithClasses)));
}));

app.post('/api/admin/trains', adminRequired, wrap(async (req, res) => {
  const { train_number, tag, from_city, to_city, dep_time, arr_time, duration, classes } = req.body || {};
  if (!train_number || !tag || !from_city || !to_city || !dep_time || !arr_time)
    return res.status(400).json({ error: 'กรอกข้อมูลขบวนรถให้ครบ' });

  const info = await run(
    `INSERT INTO trains (train_number, tag, from_city, to_city, dep_time, arr_time, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [train_number, tag, from_city, to_city, dep_time, arr_time, duration || '']
  );
  const trainId = info.lastInsertRowid;
  if (Array.isArray(classes)) {
    for (const c of classes) if (c.name && c.price)
      await run(`INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`,
        [trainId, c.name, c.price, c.seats || 40]);
  }
  res.status(201).json(await trainWithClasses(await get(`SELECT * FROM trains WHERE id = ?`, [trainId])));
}));

app.put('/api/admin/trains/:id', adminRequired, wrap(async (req, res) => {
  const t = await get(`SELECT * FROM trains WHERE id = ?`, [req.params.id]);
  if (!t) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  const { train_number, tag, from_city, to_city, dep_time, arr_time, duration, active, classes } = req.body || {};

  await run(
    `UPDATE trains SET train_number=?, tag=?, from_city=?, to_city=?, dep_time=?, arr_time=?, duration=?, active=? WHERE id=?`,
    [
      train_number ?? t.train_number, tag ?? t.tag, from_city ?? t.from_city, to_city ?? t.to_city,
      dep_time ?? t.dep_time, arr_time ?? t.arr_time, duration ?? t.duration,
      active === undefined ? t.active : (active ? 1 : 0), req.params.id
    ]
  );
  if (Array.isArray(classes)) {
    await run(`DELETE FROM train_classes WHERE train_id = ?`, [req.params.id]);
    for (const c of classes) if (c.name && c.price)
      await run(`INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`,
        [req.params.id, c.name, c.price, c.seats || 40]);
  }
  res.json(await trainWithClasses(await get(`SELECT * FROM trains WHERE id = ?`, [req.params.id])));
}));

app.delete('/api/admin/trains/:id', adminRequired, wrap(async (req, res) => {
  const t = await get(`SELECT id FROM trains WHERE id = ?`, [req.params.id]);
  if (!t) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  const id = req.params.id;
  // ลบข้อมูลที่เกี่ยวข้องแบบ cascade (ทำเองเพื่อความเข้ากันได้กับ Turso)
  await run(`DELETE FROM booking_seats WHERE booking_id IN (SELECT id FROM bookings WHERE train_id = ?)`, [id]);
  await run(`DELETE FROM bookings WHERE train_id = ?`, [id]);
  await run(`DELETE FROM train_classes WHERE train_id = ?`, [id]);
  await run(`DELETE FROM trains WHERE id = ?`, [id]);
  res.json({ ok: true });
}));

app.get('/api/admin/summary', adminRequired, wrap(async (_req, res) => {
  const users = (await get(`SELECT COUNT(*) n FROM users WHERE role='user'`)).n;
  const trains = (await get(`SELECT COUNT(*) n FROM trains`)).n;
  const bookings = (await get(`SELECT COUNT(*) n FROM bookings`)).n;
  const revenue = (await get(`SELECT COALESCE(SUM(total_price),0) s FROM bookings WHERE status='paid'`)).s;
  res.json({ users: Number(users), trains: Number(trains), bookings: Number(bookings), revenue: Number(revenue) });
}));

/* ============================ Error handler ============================ */
app.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ' });
});

/* ============================ Start ============================ */
(async () => {
  await initDb();
  await ensureSeeded();
  app.listen(PORT, () => {
    console.log(`🚆 TrainBook backend ทำงานที่ http://localhost:${PORT}  (ฐานข้อมูล: ${useTurso ? 'Turso' : 'local file'})`);
  });
})().catch(e => { console.error('เริ่มเซิร์ฟเวอร์ไม่สำเร็จ:', e); process.exit(1); });
