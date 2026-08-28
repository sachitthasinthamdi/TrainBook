/**
 * seed.js — ใส่ข้อมูลตั้งต้นลงฐานข้อมูล (รองรับทั้ง Turso และ local)
 * รันตรง ๆ:  npm run seed   (ล้างข้อมูลเดิมแล้วใส่ใหม่)
 * หรือถูกเรียกจาก server อัตโนมัติเมื่อฐานข้อมูลว่าง (ensureSeeded)
 */
const bcrypt = require('bcryptjs');
const { get, run, initDb } = require('./db');

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
async function seed() {
  await initDb();
  for (const t of ['booking_seats', 'bookings', 'train_classes', 'trains', 'users']) {
    await run(`DELETE FROM ${t}`);
  }
  try { await run(`DELETE FROM sqlite_sequence`); } catch { /* บางกรณีไม่มีตารางนี้ */ }

  await run(
    `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'admin')`,
    ['ผู้ดูแลระบบ', 'admin@trainbook.com', '0800000000', bcrypt.hashSync('admin123', 10)]
  );
  await run(
    `INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, 'user')`,
    ['สมชาย ใจดี', 'user@example.com', '0812345678', bcrypt.hashSync('user123', 10)]
  );

  for (const t of TRAINS) {
    const res = await run(
      `INSERT INTO trains (train_number, tag, from_city, to_city, dep_time, arr_time, duration)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [t.number, t.tag, FROM, TO, t.dep, t.arr, t.dur]
    );
    for (const c of t.classes) {
      await run(
        `INSERT INTO train_classes (train_id, class_name, price, total_seats) VALUES (?, ?, ?, ?)`,
        [res.lastInsertRowid, c.name, c.price, c.seats]
      );
    }
  }
}

// seed เฉพาะเมื่อยังไม่มีข้อมูล (ปลอดภัยต่อ hosting)
async function ensureSeeded() {
  await initDb();
  const row = await get(`SELECT COUNT(*) AS c FROM trains`);
  if (Number(row.c) === 0) { await seed(); console.log('🌱 ฐานข้อมูลว่าง — ใส่ข้อมูลตั้งต้นอัตโนมัติแล้ว'); }
}

module.exports = { seed, ensureSeeded };

// รันไฟล์นี้ตรง ๆ (npm run seed)
if (require.main === module) {
  seed().then(() => {
    console.log('✅ Seed สำเร็จ');
    console.log('   • ผู้ดูแลระบบ : admin@trainbook.com / admin123');
    console.log('   • ผู้ใช้ตัวอย่าง: user@example.com / user123');
    console.log(`   • ขบวนรถ ${TRAINS.length} ขบวน พร้อมชั้นโดยสาร`);
    process.exit(0);
  }).catch(e => { console.error('❌ Seed ล้มเหลว:', e.message); process.exit(1); });
}
