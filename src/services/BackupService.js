import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { CURRENT_SCHEMA_VERSION } from '../db/migrations.js';
import { toIsoUtc } from '../utils/date.js';

const BACKUP_TABLES = [
  'settings',
  'users',
  'financial_periods',
  'wallets',
  'categories',
  'recurring_expenses',
  'transactions',
  'budgets',
  'planned_expenses',
  'savings_goals',
  'food_items',
  'meal_plans',
  'food_preferences'
];

function computeSimpleChecksum(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Serialize full SQLite user & master tables into a versioned, checksummed JSON backup.
 * @param {import('../db/database.js').DatabaseAdapter} db
 */
export async function exportBackupJson(db) {
  const data = {};
  for (const table of BACKUP_TABLES) {
    data[table] = await db.query(`SELECT * FROM ${table}`);
  }
  const serializedData = JSON.stringify(data);
  const backup = {
    app: 'KosMate',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: toIsoUtc(),
    checksum: computeSimpleChecksum(serializedData),
    data
  };
  return JSON.stringify(backup, null, 2);
}

/**
 * Validate and atomically restore a KosMate JSON backup.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} jsonText
 */
export async function restoreBackupJson(db, jsonText) {
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error('File backup bukan format JSON yang valid.');
  }

  if (!parsed || parsed.app !== 'KosMate' || !parsed.data || typeof parsed.data !== 'object') {
    throw new Error('File ini bukan backup KosMate yang sah.');
  }
  if (!parsed.schemaVersion || parsed.schemaVersion > CURRENT_SCHEMA_VERSION) {
    throw new Error(`Versi skema backup (${parsed.schemaVersion}) lebih baru dari aplikasi ini.`);
  }
  if (parsed.checksum) {
    const expected = computeSimpleChecksum(JSON.stringify(parsed.data));
    if (expected !== parsed.checksum) {
      throw new Error('Checksum backup tidak cocok — file mungkin korup atau telah dimodifikasi.');
    }
  }

  await db.resetAllData(async () => {
    for (const table of BACKUP_TABLES) {
      const rows = Array.isArray(parsed.data[table]) ? parsed.data[table] : [];
      if (rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;

      for (const row of rows) {
        const values = columns.map((col) => (row[col] === undefined ? null : row[col]));
        await db.run(sql, values);
      }
    }
  });
}

/**
 * Save/share an exported text file across Native Android (Filesystem + Share) and Web Browser.
 */
export async function exportTextFile(filename, content, mimeType = 'application/json') {
  if (typeof Capacitor?.isNativePlatform === 'function' && Capacitor.isNativePlatform()) {
    const result = await Filesystem.writeFile({
      path: filename,
      data: content,
      directory: Directory.Cache,
      encoding: Encoding.UTF8
    });
    await Share.share({
      title: filename,
      text: `Export data ${filename} dari KosMate`,
      url: result.uri
    });
    return true;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
