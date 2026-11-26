import { getShortMonthUpper, parseLocalDate, toDateString } from '../utils/date.js';

/**
 * Build last N months spending bar series matching Screen 2 ("Month to Month Spending").
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} [todayStr]
 * @param {number} [monthsCount]
 */
export async function getMonthlySpendingSeries(db, todayStr = toDateString(), monthsCount = 6) {
  const anchor = parseLocalDate(todayStr);
  const months = [];

  for (let i = monthsCount - 1; i >= 0; i -= 1) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    months.push({
      monthKey: `${y}-${m}`,
      label: getShortMonthUpper(d.getMonth())
    });
  }

  const firstMonthStart = `${months[0].monthKey}-01`;
  const rows = await db.query(
    `SELECT substr(transaction_date, 1, 7) AS ym, COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE deleted_at IS NULL AND type = 'expense' AND substr(transaction_date, 1, 10) >= ?
     GROUP BY ym`,
    [firstMonthStart]
  );

  const map = new Map(rows.map((r) => [r.ym, Number(r.total) || 0]));
  return months.map((m) => ({
    ...m,
    total: map.get(m.monthKey) || 0
  }));
}

/**
 * Category breakdown for Spending Synopsis Pie Chart (Screen 3).
 */
export async function getCategoryBreakdown(db, startDate = null, endDate = null) {
  const clauses = ["t.deleted_at IS NULL", "t.type = 'expense'"];
  const params = [];

  if (startDate) {
    clauses.push('substr(t.transaction_date, 1, 10) >= ?');
    params.push(startDate);
  }
  if (endDate) {
    clauses.push('substr(t.transaction_date, 1, 10) <= ?');
    params.push(endDate);
  }

  const rows = await db.query(
    `SELECT c.id, c.name, c.color, COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE ${clauses.join(' AND ')}
     GROUP BY c.id, c.name, c.color
     HAVING total > 0
     ORDER BY total DESC`,
    params
  );

  const grandTotal = rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0);
  return {
    grandTotal,
    items: rows.map((r) => ({
      ...r,
      total: Number(r.total) || 0,
      percentage: grandTotal > 0 ? Math.round(((Number(r.total) || 0) / grandTotal) * 100) : 0
    }))
  };
}

/**
 * Meal analytics comparing planned estimates vs actual food expenses.
 */
export async function getMealAnalytics(db, startDate, endDate) {
  const planAgg = await db.queryOne(
    `SELECT
       COUNT(*) AS total_meals,
       COALESCE(SUM(CASE WHEN status = 'consumed' THEN 1 ELSE 0 END), 0) AS consumed_count,
       COALESCE(SUM(CASE WHEN status = 'consumed' THEN estimated_cost ELSE 0 END), 0) AS estimated_consumed_total,
       COALESCE(SUM(CASE WHEN status = 'consumed' THEN COALESCE(actual_cost, 0) ELSE 0 END), 0) AS actual_consumed_total
     FROM meal_plans
     WHERE deleted_at IS NULL AND meal_date >= ? AND meal_date <= ?`,
    [startDate, endDate]
  );

  const txFoodAgg = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total_food_tx, COUNT(DISTINCT substr(transaction_date, 1, 10)) AS active_days
     FROM transactions
     WHERE deleted_at IS NULL AND type = 'expense' AND category_id = 'cat-exp-food'
       AND substr(transaction_date, 1, 10) >= ? AND substr(transaction_date, 1, 10) <= ?`,
    [startDate, endDate]
  );

  const totalFoodTx = Number(txFoodAgg?.total_food_tx) || 0;
  const activeDays = Math.max(1, Number(txFoodAgg?.active_days) || 0);

  return {
    totalMeals: Number(planAgg?.total_meals) || 0,
    consumedCount: Number(planAgg?.consumed_count) || 0,
    estimatedConsumedTotal: Number(planAgg?.estimated_consumed_total) || 0,
    actualConsumedTotal: Number(planAgg?.actual_consumed_total) || 0,
    totalFoodTransactions: totalFoodTx,
    averageDailyFoodSpend: totalFoodTx > 0 ? Math.round(totalFoodTx / activeDays) : 0
  };
}

/**
 * Generate CSV string of transactions for export.
 */
export async function exportTransactionsCsv(db, startDate = null, endDate = null) {
  const clauses = ['t.deleted_at IS NULL'];
  const params = [];
  if (startDate) {
    clauses.push('substr(t.transaction_date, 1, 10) >= ?');
    params.push(startDate);
  }
  if (endDate) {
    clauses.push('substr(t.transaction_date, 1, 10) <= ?');
    params.push(endDate);
  }

  const rows = await db.query(
    `SELECT t.transaction_date, t.type, t.amount, COALESCE(c.name, 'Transfer') AS category_name,
            w.name AS wallet_name, COALESCE(tw.name, '') AS to_wallet_name, t.description
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY t.transaction_date DESC`,
    params
  );

  const escapeCsv = (val) => `"${String(val ?? '').replace(/"/g, '""')}"`;
  const header = ['Tanggal', 'Jenis', 'Nominal (IDR)', 'Kategori', 'Dompet Asal', 'Dompet Tujuan', 'Catatan'].join(',');
  const lines = rows.map((r) =>
    [
      escapeCsv(r.transaction_date),
      escapeCsv(r.type),
      r.amount,
      escapeCsv(r.category_name),
      escapeCsv(r.wallet_name),
      escapeCsv(r.to_wallet_name),
      escapeCsv(r.description)
    ].join(',')
  );
  return [header, ...lines].join('\n');
}
