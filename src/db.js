/**
 * db.js — การเชื่อมต่อฐานข้อมูล (libSQL / Turso)
 *
 * - ถ้ามี TURSO_DATABASE_URL → เชื่อม Turso (cloud, ข้อมูลถาวร)
 * - ถ้าไม่มี → ใช้ไฟล์ SQLite ในเครื่อง
 * - ถ้าเชื่อม Turso ไม่สำเร็จ (เช่น token ผิด) → สลับไปใช้ local ชั่วคราว เพื่อไม่ให้เว็บล่ม
 *
 * ทุกฟังก์ชันเป็น async (คืน Promise)
 */
const { createClient } = require('@libsql/client');
const path = require('path');

const LOCAL_URL = 'file:' + path.join(__dirname, 'database.sqlite');

let mode = process.env.TURSO_DATABASE_URL ? 'turso' : 'local';
let client = makeClient();

function makeClient() {
  if (mode === 'turso') {
    return createClient({ url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  }
  return createClient({ url: LOCAL_URL });
}

/* ---------- ตัวช่วยเรียกคิวรี ---------- */
async function get(sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows[0];
}
async function all(sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows;
}
async function run(sql, args = []) {
  const r = await client.execute({ sql, args });
  return { lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null, rowsAffected: r.rowsAffected };
}
// เปิด transaction (อ้างอิง client ปัจจุบันเสมอ)
function transaction(m) { return client.transaction(m); }

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    phone TEXT, password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS trains (
    id INTEGER PRIMARY KEY AUTOINCREMENT, train_number INTEGER NOT NULL, tag TEXT NOT NULL,
    from_city TEXT NOT NULL, to_city TEXT NOT NULL, dep_time TEXT NOT NULL, arr_time TEXT NOT NULL,
    duration TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS train_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, train_id INTEGER NOT NULL, class_name TEXT NOT NULL,
    price INTEGER NOT NULL, total_seats INTEGER NOT NULL DEFAULT 40
  );
  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT, booking_code TEXT NOT NULL UNIQUE, user_id INTEGER,
    train_id INTEGER NOT NULL, class_id INTEGER NOT NULL, travel_date TEXT NOT NULL,
    pax INTEGER NOT NULL, total_price INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'paid',
    payment_method TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  );
  CREATE TABLE IF NOT EXISTS booking_seats (
    id INTEGER PRIMARY KEY AUTOINCREMENT, booking_id INTEGER NOT NULL, seat_code TEXT NOT NULL
  );
`;

async function initDb() {
  try {
    await client.executeMultiple(SCHEMA);
  } catch (e) {
    if (mode === 'turso') {
      console.error('⚠️  เชื่อมต่อ Turso ไม่สำเร็จ (' + e.message + ')');
      console.error('⚠️  สลับไปใช้ฐานข้อมูลในเครื่องชั่วคราว — ตรวจสอบ TURSO_DATABASE_URL / TURSO_AUTH_TOKEN');
      mode = 'local';
      client = makeClient();
      await client.executeMultiple(SCHEMA);
    } else {
      throw e;
    }
  }
}

function isTurso() { return mode === 'turso'; }

module.exports = { get, all, run, transaction, initDb, isTurso };
