import { generateUUID } from '../utils/uuid.js';
import { toIsoUtc } from '../utils/date.js';

export async function listCategories(db, type = null) {
  if (type) {
    return db.query(
      'SELECT * FROM categories WHERE deleted_at IS NULL AND type = ? ORDER BY is_default DESC, name ASC',
      [type]
    );
  }
  return db.query('SELECT * FROM categories WHERE deleted_at IS NULL ORDER BY type ASC, is_default DESC, name ASC');
}

export async function getCategoryById(db, id) {
  return db.queryOne('SELECT * FROM categories WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function createCategory(db, { name, type = 'expense', icon = 'tag', color = '#0F7B5B' }) {
  const id = generateUUID();
  const now = toIsoUtc();
  await db.run(
    `INSERT INTO categories (id, name, type, icon, color, is_default, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, NULL)`,
    [id, name.trim(), type, icon, color, now, now]
  );
  return getCategoryById(db, id);
}

export async function updateCategory(db, id, { name, icon, color }) {
  await db.run(
    `UPDATE categories SET
      name = COALESCE(?, name),
      icon = COALESCE(?, icon),
      color = COALESCE(?, color),
      updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [name ? name.trim() : null, icon ?? null, color ?? null, toIsoUtc(), id]
  );
  return getCategoryById(db, id);
}

export async function softDeleteCategory(db, id) {
  const cat = await getCategoryById(db, id);
  if (!cat) throw new Error('Kategori tidak ditemukan.');
  if (cat.is_default === 1) {
    throw new Error('Kategori bawaan sistem tidak dapat dihapus.');
  }
  const now = toIsoUtc();
  await db.run('UPDATE categories SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}
