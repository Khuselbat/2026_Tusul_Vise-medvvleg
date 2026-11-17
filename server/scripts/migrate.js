// Схемийг үүсгэнэ (БҮХ хүснэгтийг устгаад дахин үүсгэнэ — зөвхөн хөгжүүлэлт/туршилтад).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import { config } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = await fs.readFile(path.resolve(here, '../../database/schema.sql'), 'utf8');

const conn = await mysql.createConnection({ ...config.db, multipleStatements: true });
await conn.query(sql);
await conn.end();
console.log(`Схем үүслээ: ${config.db.database}`);
