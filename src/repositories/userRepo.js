import { generateUUID } from '../utils/uuid.js';
import { toIsoUtc } from '../utils/date.js';

/**
 * Retrieve the single active user profile (or null if onboarding has not started).
 * @param {import('../db/database.js').DatabaseAdapter} db
 */
export async function getUserProfile(db) {
  return db.queryOne('SELECT * FROM users LIMIT 1');
}

/**
 * Create or update user profile settings.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {Record<string, any>} data
 */
export async function upsertUserProfile(db, data) {
  const existing = await getUserProfile(db);
  const now = toIsoUtc();
  const equipmentJson = JSON.stringify(
    Array.isArray(data.cooking_equipment) ? data.cooking_equipment : ['none']
  );

  if (!existing) {
    const id = data.id || generateUUID();
    await db.run(
      `INSERT INTO users (
        id, name, currency, monthly_income, income_day, budget_period,
        food_budget_ratio, food_budget_mode, monthly_food_budget,
        treat_meals_per_week, min_daily_calories, min_daily_protein,
        min_daily_food_warning, reserve_target_amount,
        cooking_equipment, onboarding_completed, pin_hash, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name || 'Anak Kos',
        data.currency || 'IDR',
        Math.round(Number(data.monthly_income) || 0),
        Number(data.income_day) || 1,
        data.budget_period || 'monthly',
        Number(data.food_budget_ratio ?? 0.6),
        data.food_budget_mode || (Number(data.monthly_food_budget) > 0 ? 'fixed' : 'ratio'),
        Math.round(Number(data.monthly_food_budget) || 0),
        Math.max(0, Math.min(7, Number(data.treat_meals_per_week ?? 3))),
        Math.max(1200, Math.round(Number(data.min_daily_calories ?? 1900))),
        Math.max(20, Math.round(Number(data.min_daily_protein ?? 50))),
        Math.round(Number(data.min_daily_food_warning ?? 20000)),
        Math.round(Number(data.reserve_target_amount) || 0),
        equipmentJson,
        data.onboarding_completed ? 1 : 0,
        data.pin_hash ?? null,
        now,
        now
      ]
    );
    return getUserProfile(db);
  }

  await db.run(
    `UPDATE users SET
      name = COALESCE(?, name),
      monthly_income = COALESCE(?, monthly_income),
      income_day = COALESCE(?, income_day),
      budget_period = COALESCE(?, budget_period),
      food_budget_ratio = COALESCE(?, food_budget_ratio),
      food_budget_mode = COALESCE(?, food_budget_mode),
      monthly_food_budget = COALESCE(?, monthly_food_budget),
      treat_meals_per_week = COALESCE(?, treat_meals_per_week),
      min_daily_calories = COALESCE(?, min_daily_calories),
      min_daily_protein = COALESCE(?, min_daily_protein),
      min_daily_food_warning = COALESCE(?, min_daily_food_warning),
      reserve_target_amount = COALESCE(?, reserve_target_amount),
      cooking_equipment = COALESCE(?, cooking_equipment),
      onboarding_completed = COALESCE(?, onboarding_completed),
      updated_at = ?
     WHERE id = ?`,
    [
      data.name ?? null,
      data.monthly_income !== undefined ? Math.round(Number(data.monthly_income)) : null,
      data.income_day !== undefined ? Number(data.income_day) : null,
      data.budget_period ?? null,
      data.food_budget_ratio !== undefined ? Number(data.food_budget_ratio) : null,
      data.food_budget_mode ?? null,
      data.monthly_food_budget !== undefined ? Math.round(Number(data.monthly_food_budget)) : null,
      data.treat_meals_per_week !== undefined ? Math.max(0, Math.min(7, Number(data.treat_meals_per_week))) : null,
      data.min_daily_calories !== undefined ? Math.max(1200, Math.round(Number(data.min_daily_calories))) : null,
      data.min_daily_protein !== undefined ? Math.max(20, Math.round(Number(data.min_daily_protein))) : null,
      data.min_daily_food_warning !== undefined ? Math.round(Number(data.min_daily_food_warning)) : null,
      data.reserve_target_amount !== undefined ? Math.round(Number(data.reserve_target_amount)) : null,
      data.cooking_equipment !== undefined ? equipmentJson : null,
      data.onboarding_completed !== undefined ? (data.onboarding_completed ? 1 : 0) : null,
      now,
      existing.id
    ]
  );

  return getUserProfile(db);
}

/**
 * Set or clear local PIN hash.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string | null} pinHash
 */
export async function updateUserPin(db, pinHash) {
  const existing = await getUserProfile(db);
  if (!existing) return;
  await db.run('UPDATE users SET pin_hash = ?, updated_at = ? WHERE id = ?', [pinHash, toIsoUtc(), existing.id]);
}

/**
 * Read/write generic key-value setting.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} key
 * @param {string | null} [defaultValue]
 */
export async function getSetting(db, key, defaultValue = null) {
  const row = await db.queryOne('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return row ? row.setting_value : defaultValue;
}

export async function setSetting(db, key, value) {
  const now = toIsoUtc();
  const existing = await db.queryOne('SELECT id FROM settings WHERE setting_key = ?', [key]);
  if (existing) {
    await db.run('UPDATE settings SET setting_value = ?, updated_at = ? WHERE id = ?', [String(value), now, existing.id]);
  } else {
    await db.run(
      'INSERT INTO settings (id, setting_key, setting_value, updated_at) VALUES (?, ?, ?, ?)',
      [generateUUID(), key, String(value), now]
    );
  }
}
