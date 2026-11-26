import { generateUUID } from '../utils/uuid.js';
import { toIsoUtc } from '../utils/date.js';

export async function getActivePeriod(db) {
  return db.queryOne(
    `SELECT * FROM financial_periods WHERE status = 'active' ORDER BY start_date DESC LIMIT 1`
  );
}

export async function listPeriods(db) {
  return db.query('SELECT * FROM financial_periods ORDER BY start_date DESC');
}

export async function createPeriod(db, { startDate, endDate, openingOperationalBalance = 0, expectedIncome = 0, reserveTarget = 0, foodBudgetTarget = 0 }) {
  const now = toIsoUtc();
  const id = generateUUID();
  await db.run(
    `INSERT INTO financial_periods (
      id, start_date, end_date, opening_operational_balance,
      expected_income, reserve_target, food_budget_target, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    [
      id,
      startDate,
      endDate,
      Math.round(Number(openingOperationalBalance) || 0),
      Math.round(Number(expectedIncome) || 0),
      Math.round(Number(reserveTarget) || 0),
      Math.round(Number(foodBudgetTarget) || 0),
      now,
      now
    ]
  );
  return db.queryOne('SELECT * FROM financial_periods WHERE id = ?', [id]);
}

export async function updatePeriodSettings(db, periodId, { startDate, endDate, expectedIncome, reserveTarget, foodBudgetTarget }) {
  const now = toIsoUtc();
  await db.run(
    `UPDATE financial_periods SET
      start_date = COALESCE(?, start_date),
      end_date = COALESCE(?, end_date),
      expected_income = COALESCE(?, expected_income),
      reserve_target = COALESCE(?, reserve_target),
      food_budget_target = COALESCE(?, food_budget_target),
      updated_at = ?
     WHERE id = ?`,
    [
      startDate ?? null,
      endDate ?? null,
      expectedIncome !== undefined ? Math.round(Number(expectedIncome)) : null,
      reserveTarget !== undefined ? Math.round(Number(reserveTarget)) : null,
      foodBudgetTarget !== undefined ? Math.round(Number(foodBudgetTarget)) : null,
      now,
      periodId
    ]
  );
  return db.queryOne('SELECT * FROM financial_periods WHERE id = ?', [periodId]);
}

export async function closePeriod(db, periodId) {
  await db.run(
    `UPDATE financial_periods SET status = 'closed', updated_at = ? WHERE id = ?`,
    [toIsoUtc(), periodId]
  );
}
