/**
 * server.js — Backend หลัก (Express + SQLite)
 * รันด้วย:  npm start   แล้วเปิด http://localhost:3000
 */
const express = require('express');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, init } = require('./db');
const { ensureSeeded } = require('./seed');

init();
ensureSeeded();   // ถ้าฐานข้อมูลว่าง (เช่นบน hosting ที่ไฟล์รีเซ็ต) จะใส่ข้อมูลตั้งต้นให้อัตโนมัติ

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'trainbook-dev-secret-change-me';

app.use(express.json());
// เสิร์ฟไฟล์ frontend จากโฟลเดอร์ public (origin เดียวกัน จึงไม่ต้องใช้ CORS)
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

// อ่าน token จาก header → แนบ req.user (ถ้ามี)
function authOptional(req, _res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (token) {
    try { req.user = jwt.verify(token, JWT_SECRET); } catch { /* token ไม่ถูกต้อง = ถือเป็น guest */ }
  }
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
app.use(authOptional);

// รวมข้อมูลขบวน + ชั้นโดยสาร ให้อยู่รูปแบบเดียวกับที่ frontend ใช้
function trainWithClasses(train) {
  const classes = db.prepare(
    `SELECT id, class_name AS name, price, total_seats AS seats FROM train_classes WHERE train_id = ? ORDER BY id`
  ).all(train.id);
  return { ...train, classes };
}

/* ============================ Auth ============================ */
app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'กรอกชื่อ อีเมล และรหัสผ่านให้ครบ' });
  if (String(password).length < 6) return res.status(400).json({ error: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' });

  const mail = String(email).trim().toLowerCase();
  const exists = db.prepare(`SELECT id FROM users WHERE email = ?`).get(mail);
  if (exists) return res.status(409).json({ error: 'อีเมลนี้ถูกใช้สมัครแล้ว' });

  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare(
    `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'user')`
  ).run(String(name).trim(), mail, String(phone || '').trim(), hash);

  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(info.lastInsertRowid);
  res.status(201).json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'กรอกอีเมลและรหัสผ่าน' });

  const mail = String(email).trim().toLowerCase();
  const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(mail);
  if (!user || !bcrypt.compareSync(String(password), user.password)) {
    return res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
  }
  res.json({ token: sign(user), user: publicUser(user) });
});

app.get('/api/auth/me', authRequired, (req, res) => {
  const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(req.user.id);
  if (!user) return res.status(404).json({ error: 'ไม่พบผู้ใช้' });
  res.json({ user: publicUser(user) });
});

/* ============================ Trains (อ่านสาธารณะ) ============================ */
app.get('/api/trains', (_req, res) => {
  const trains = db.prepare(`SELECT * FROM trains WHERE active = 1 ORDER BY dep_time`).all();
  res.json(trains.map(trainWithClasses));
});

app.get('/api/trains/:id', (req, res) => {
  const train = db.prepare(`SELECT * FROM trains WHERE id = ?`).get(req.params.id);
  if (!train) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  res.json(trainWithClasses(train));
});

// ที่นั่งที่ถูกจองแล้ว ของขบวน+ชั้น+วันเดินทางที่ระบุ (สำหรับล็อกที่นั่ง)
app.get('/api/trains/:trainId/classes/:classId/taken-seats', (req, res) => {
  const { trainId, classId } = req.params;
  const date = req.query.date || '';
  const rows = db.prepare(
    `SELECT bs.seat_code AS code
       FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE b.train_id = ? AND b.class_id = ? AND b.travel_date = ? AND b.status != 'cancelled'`
  ).all(trainId, classId, date);
  res.json(rows.map(r => r.code));
});

/* ============================ Bookings ============================ */
// สร้างการจอง (ต้องเข้าสู่ระบบ) — สถานะเริ่มต้น 'paid'
app.post('/api/bookings', authRequired, (req, res) => {
  const { trainId, classId, travelDate, seats, paymentMethod } = req.body || {};
  if (!trainId || !classId || !travelDate || !Array.isArray(seats) || seats.length === 0) {
    return res.status(400).json({ error: 'ข้อมูลการจองไม่ครบ' });
  }

  const train = db.prepare(`SELECT * FROM trains WHERE id = ?`).get(trainId);
  const cls = db.prepare(`SELECT * FROM train_classes WHERE id = ? AND train_id = ?`).get(classId, trainId);
  if (!train || !cls) return res.status(404).json({ error: 'ไม่พบขบวนรถหรือชั้นโดยสาร' });

  // ตรวจว่าที่นั่งยังว่างอยู่จริง (กันจองซ้ำ)
  const taken = db.prepare(
    `SELECT bs.seat_code AS code FROM booking_seats bs
       JOIN bookings b ON b.id = bs.booking_id
      WHERE b.train_id = ? AND b.class_id = ? AND b.travel_date = ? AND b.status != 'cancelled'`
  ).all(trainId, classId, travelDate).map(r => r.code);
  const clash = seats.filter(s => taken.includes(s));
  if (clash.length) return res.status(409).json({ error: 'ที่นั่ง ' + clash.join(', ') + ' ถูกจองไปแล้ว' });

  const total = cls.price * seats.length;
  const code = randomBookingCode();

  // เขียนแบบ transaction: booking + ที่นั่งทั้งหมด ต้องสำเร็จพร้อมกัน
  const tx = db.prepare('BEGIN'); tx.run();
  try {
    const info = db.prepare(
      `INSERT INTO bookings (booking_code, user_id, train_id, class_id, travel_date, pax, total_price, status, payment_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'paid', ?)`
    ).run(code, req.user.id, trainId, classId, travelDate, seats.length, total, String(paymentMethod || 'card'));
    const bookingId = info.lastInsertRowid;
    const insSeat = db.prepare(`INSERT INTO booking_seats (booking_id, seat_code) VALUES (?, ?)`);
    for (const s of seats) insSeat.run(bookingId, s);
    db.prepare('COMMIT').run();
    res.status(201).json(getBooking(bookingId));
  } catch (e) {
    db.prepare('ROLLBACK').run();
    res.status(500).json({ error: 'บันทึกการจองไม่สำเร็จ' });
  }
});

// ดึงข้อมูลการจองหนึ่งรายการ (พร้อมรายละเอียดขบวน/ชั้น/ที่นั่ง)
function getBooking(id) {
  const b = db.prepare(
    `SELECT b.*, t.train_number, t.tag, t.from_city, t.to_city, t.dep_time, t.arr_time,
            c.class_name
       FROM bookings b
       JOIN trains t ON t.id = b.train_id
       JOIN train_classes c ON c.id = b.class_id
      WHERE b.id = ?`
  ).get(id);
  if (!b) return null;
  b.seats = db.prepare(`SELECT seat_code FROM booking_seats WHERE booking_id = ? ORDER BY seat_code`)
    .all(id).map(r => r.seat_code);
  return b;
}

// การจองของผู้ใช้ที่ล็อกอินอยู่
app.get('/api/bookings', authRequired, (req, res) => {
  const rows = db.prepare(`SELECT id FROM bookings WHERE user_id = ? ORDER BY created_at DESC, id DESC`).all(req.user.id);
  res.json(rows.map(r => getBooking(r.id)));
});

app.get('/api/bookings/:id', authRequired, (req, res) => {
  const b = getBooking(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  if (b.user_id !== req.user.id && req.user.role !== 'admin')
    return res.status(403).json({ error: 'ไม่มีสิทธิ์เข้าถึงการจองนี้' });
  res.json(b);
});

// ลบการจอง — เฉพาะผู้ดูแลระบบเท่านั้น (ผู้ใช้ทั่วไปลบตั๋วเองไม่ได้ตามหลักการ)
app.delete('/api/bookings/:id', adminRequired, (req, res) => {
  const b = db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  db.prepare(`DELETE FROM bookings WHERE id = ?`).run(req.params.id); // booking_seats ลบตาม (CASCADE)
  res.json({ ok: true });
});

/* ============================ Admin ============================ */
// การจองทั้งหมด (ทุกผู้ใช้)
app.get('/api/admin/bookings', adminRequired, (_req, res) => {
  const rows = db.prepare(`SELECT id FROM bookings ORDER BY created_at DESC, id DESC`).all();
  const list = rows.map(r => {
    const b = getBooking(r.id);
    const u = b.user_id ? db.prepare(`SELECT name, email FROM users WHERE id = ?`).get(b.user_id) : null;
    b.user_name = u ? u.name : 'guest';
    b.user_email = u ? u.email : '-';
    return b;
  });
  res.json(list);
});

// เปลี่ยนสถานะการจอง (เช่น ยกเลิก)
app.patch('/api/admin/bookings/:id/status', adminRequired, (req, res) => {
  const { status } = req.body || {};
  if (!['paid', 'pending', 'cancelled'].includes(status))
    return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
  const b = db.prepare(`SELECT id FROM bookings WHERE id = ?`).get(req.params.id);
  if (!b) return res.status(404).json({ error: 'ไม่พบการจอง' });
  db.prepare(`UPDATE bookings SET status = ? WHERE id = ?`).run(status, req.params.id);
  res.json(getBooking(req.params.id));
});

// รายชื่อสมาชิกทั้งหมด
app.get('/api/admin/users', adminRequired, (_req, res) => {
  const users = db.prepare(`SELECT id, name, email, phone, role, created_at FROM users ORDER BY id`).all();
  res.json(users);
});

// จัดการขบวนรถ (CRUD)
app.get('/api/admin/trains', adminRequired, (_req, res) => {
  const trains = db.prepare(`SELECT * FROM trains ORDER BY id`).all();
  res.json(trains.map(trainWithClasses));
});

app.post('/api/admin/trains', adminRequired, (req, res) => {
  const { train_number, tag, from_city, to_city, dep_time, arr_time, duration, classes } = req.body || {};
  if (!train_number || !tag || !from_city || !to_city || !dep_time || !arr_time)
    return res.status(400).json({ error: 'กรอกข้อมูลขบวนรถให้ครบ' });

  const info = db.prepare(
    `INSERT INTO trains (train_number, tag, from_city, to_city, dep_time, arr_time, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(train_number, tag, from_city, to_city, dep_time, arr_time, duration || '');
  const trainId = info.lastInsertRowid;

  if (Array.isArray(classes)) {
    const ins = db.prepare(`INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`);
    for (const c of classes) if (c.name && c.price) ins.run(trainId, c.name, c.price, c.seats || 40);
  }
  res.status(201).json(trainWithClasses(db.prepare(`SELECT * FROM trains WHERE id = ?`).get(trainId)));
});

app.put('/api/admin/trains/:id', adminRequired, (req, res) => {
  const t = db.prepare(`SELECT * FROM trains WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  const { train_number, tag, from_city, to_city, dep_time, arr_time, duration, active, classes } = req.body || {};

  db.prepare(
    `UPDATE trains SET train_number=?, tag=?, from_city=?, to_city=?, dep_time=?, arr_time=?, duration=?, active=? WHERE id=?`
  ).run(
    train_number ?? t.train_number, tag ?? t.tag, from_city ?? t.from_city, to_city ?? t.to_city,
    dep_time ?? t.dep_time, arr_time ?? t.arr_time, duration ?? t.duration,
    active === undefined ? t.active : (active ? 1 : 0), req.params.id
  );

  // ถ้าส่ง classes มาด้วย → แทนที่ทั้งหมด
  if (Array.isArray(classes)) {
    db.prepare(`DELETE FROM train_classes WHERE train_id = ?`).run(req.params.id);
    const ins = db.prepare(`INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`);
    for (const c of classes) if (c.name && c.price) ins.run(req.params.id, c.name, c.price, c.seats || 40);
  }
  res.json(trainWithClasses(db.prepare(`SELECT * FROM trains WHERE id = ?`).get(req.params.id)));
});

app.delete('/api/admin/trains/:id', adminRequired, (req, res) => {
  const t = db.prepare(`SELECT id FROM trains WHERE id = ?`).get(req.params.id);
  if (!t) return res.status(404).json({ error: 'ไม่พบขบวนรถ' });
  db.prepare(`DELETE FROM trains WHERE id = ?`).run(req.params.id);
  res.json({ ok: true });
});

// สรุปภาพรวมสำหรับแดชบอร์ดแอดมิน
app.get('/api/admin/summary', adminRequired, (_req, res) => {
  const users = db.prepare(`SELECT COUNT(*) n FROM users WHERE role='user'`).get().n;
  const trains = db.prepare(`SELECT COUNT(*) n FROM trains`).get().n;
  const bookings = db.prepare(`SELECT COUNT(*) n FROM bookings`).get().n;
  const revenue = db.prepare(`SELECT COALESCE(SUM(total_price),0) s FROM bookings WHERE status='paid'`).get().s;
  res.json({ users, trains, bookings, revenue });
});

/* ============================ Start ============================ */
app.listen(PORT, () => {
  console.log(`🚆 TrainBook backend ทำงานที่ http://localhost:${PORT}`);
});
