/**
 * db.js — การเชื่อมต่อฐานข้อมูล (libSQL / Turso)
 *
 * - ถ้ามี environment variable TURSO_DATABASE_URL → เชื่อมต่อฐานข้อมูลบน Turso (cloud, ข้อมูลถาวร)
 * - ถ้าไม่มี → ใช้ไฟล์ SQLite ภายในเครื่อง (สำหรับพัฒนา/ทดสอบ)
 *
 * ทุกฟังก์ชันเป็นแบบ async (คืน Promise) เพราะ Turso ทำงานผ่านเครือข่าย
 */
const { createClient } = require('@libsql/client');
const path = require('path');

const useTurso = !!process.env.TURSO_DATABASE_URL;
const db = createClient(
  useTurso
    ? { url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN }
    : { url: 'file:' + path.join(__dirname, 'database.sqlite') }
);

/* ---------- ตัวช่วยเรียกคิวรี (คืน Promise) ---------- */
// คืนแถวเดียว (หรือ undefined)
async function get(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows[0];
}
// คืนทุกแถว
async function all(sql, args = []) {
  const r = await db.execute({ sql, args });
  return r.rows;
}
// สั่งเขียน (INSERT/UPDATE/DELETE) — คืน lastInsertRowid เป็น Number
async function run(sql, args = []) {
  const r = await db.execute({ sql, args });
  return {
    lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : null,
    rowsAffected: r.rowsAffected,
  };
}

/* ---------- สร้างตารางทั้งหมด (5 ตาราง) ---------- */
async function initDb() {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    NOT NULL UNIQUE,
      phone         TEXT,
      password      TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'user',
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS trains (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      train_number  INTEGER NOT NULL,
      tag           TEXT    NOT NULL,
      from_city     TEXT    NOT NULL,
      to_city       TEXT    NOT NULL,
      dep_time      TEXT    NOT NULL,
      arr_time      TEXT    NOT NULL,
      duration      TEXT,
      active        INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS train_classes (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      train_id      INTEGER NOT NULL,
      class_name    TEXT    NOT NULL,
      price         INTEGER NOT NULL,
      total_seats   INTEGER NOT NULL DEFAULT 40
    );
    CREATE TABLE IF NOT EXISTS bookings (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code   TEXT    NOT NULL UNIQUE,
      user_id        INTEGER,
      train_id       INTEGER NOT NULL,
      class_id       INTEGER NOT NULL,
      travel_date    TEXT    NOT NULL,
      pax            INTEGER NOT NULL,
      total_price    INTEGER NOT NULL,
      status         TEXT    NOT NULL DEFAULT 'paid',
      payment_method TEXT,
      created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE IF NOT EXISTS booking_seats (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_id  INTEGER NOT NULL,
      seat_code   TEXT    NOT NULL
    );
  `);
}

module.exports = { db, get, all, run, initDb, useTurso };
