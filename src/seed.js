/**
 * seed.js — ใส่ข้อมูลตั้งต้นลงฐานข้อมูล
 * รันตรง ๆ ด้วย:  npm run seed   (ล้างข้อมูลเดิมแล้วใส่ใหม่)
 * หรือถูกเรียกจาก server อัตโนมัติเมื่อฐานข้อมูลว่าง (ensureSeeded)
 */
const bcrypt = require('bcryptjs');
const { db, init } = require('./db');

const FROM = 'กรุงเทพฯ (หัวลำโพง)';
const TO = 'เชียงใหม่';

const TRAINS = [
  { number: 9,  tag: 'ด่วนพิเศษ', dep: '18:10', arr: '07:15', dur: '13 ชม. 05 นาที',
    classes: [
      { name: 'ชั้น 1', price: 1250, seats: 16 },
      { name: 'ชั้น 2 (นั่งนอน)', price: 850, seats: 42 },
      { name: 'ชั้น 2', price: 250, seats: 60 },
    ]},
  { number: 13, tag: 'ด่วน', dep: '20:05', arr: '08:40', dur: '12 ชม. 35 นาที',
    classes: [
      { name: 'ชั้น 1', price: 1150, seats: 10 },
      { name: 'ชั้น 2 (นั่งนอน)', price: 750, seats: 38 },
      { name: 'ชั้น 2', price: 750, seats: 55 },
    ]},
  { number: 51, tag: 'ธรรมดา', dep: '07:30', arr: '19:40', dur: '12 ชม. 10 นาที',
    classes: [ { name: 'ชั้น 3', price: 600, seats: 80 } ]},
  { number: 67, tag: 'ธรรมดา', dep: '15:40', arr: '03:50', dur: '12 ชม. 10 นาที',
    classes: [ { name: 'ชั้น 3', price: 600, seats: 80 } ]},
];

// ใส่ข้อมูลตั้งต้นทั้งหมด (ล้างของเดิมก่อน)
function seed() {
  init();
  db.exec(`
    DELETE FROM booking_seats;
    DELETE FROM bookings;
    DELETE FROM train_classes;
    DELETE FROM trains;
    DELETE FROM users;
    DELETE FROM sqlite_sequence;
  `);

  db.prepare(`INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'admin')`)
    .run('ผู้ดูแลระบบ', 'admin@trainbook.com', '0800000000', bcrypt.hashSync('admin123', 10));

  db.prepare(`INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'user')`)
    .run('สมชาย ใจดี', 'user@example.com', '0812345678', bcrypt.hashSync('user123', 10));

  const insTrain = db.prepare(
    `INSERT INTO trains (train_number, tag, from_city, to_city, dep_time, arr_time, duration)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const insClass = db.prepare(
    `INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`
  );
  for (const t of TRAINS) {
    const res = insTrain.run(t.number, t.tag, FROM, TO, t.dep, t.arr, t.dur);
    for (const c of t.classes) insClass.run(res.lastInsertRowid, c.name, c.price, c.seats);
  }
}

// seed เฉพาะเมื่อยังไม่มีข้อมูล (ใช้ตอน server เริ่มทำงาน — ปลอดภัยต่อ hosting ที่ไฟล์รีเซ็ต)
function ensureSeeded() {
  init();
  const n = db.prepare(`SELECT COUNT(*) AS c FROM trains`).get().c;
  if (n === 0) { seed(); console.log('🌱 ฐานข้อมูลว่าง — ใส่ข้อมูลตั้งต้นอัตโนมัติแล้ว'); }
}

module.exports = { seed, ensureSeeded };

// ถ้ารันไฟล์นี้ตรง ๆ (npm run seed) → ล้างและ seed ใหม่ทั้งหมด
if (require.main === module) {
  seed();
  console.log('✅ Seed สำเร็จ');
  console.log('   • ผู้ดูแลระบบ : admin@trainbook.com / admin123');
  console.log('   • ผู้ใช้ตัวอย่าง: user@example.com / user123');
  console.log(`   • ขบวนรถ ${TRAINS.length} ขบวน พร้อมชั้นโดยสาร`);
}
