import { pool } from './pool.js';

export async function query(text, params) {
  return pool.query(text, params);
}

export async function oneOrNone(text, params) {
  const result = await query(text, params);
  return result.rows[0] || null;
}
