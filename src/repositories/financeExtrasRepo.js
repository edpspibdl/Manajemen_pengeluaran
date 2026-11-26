import { generateUUID } from '../utils/uuid.js';
import { advanceDueDate, computeInitialDueDate, toDateString, toDateTimeString, toIsoUtc } from '../utils/date.js';
import { createTransaction } from './transactionRepo.js';

// ==================== BUDGETS ====================

export async function listBudgets(db, periodId = null) {
  const periodClause = periodId ? 'AND b.period_id = ?' : '';
  const params = periodId ? [periodId] : [];

  return db.query(
    `SELECT b.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            COALESCE((
              SELECT SUM(t.amount) FROM transactions t
              WHERE t.deleted_at IS NULL
                AND t.type = 'expense'
                AND t.category_id = b.category_id
                AND substr(t.transaction_date, 1, 10) >= b.start_date
                AND substr(t.transaction_date, 1, 10) <= b.end_date
            ), 0) AS spent_amount
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.deleted_at IS NULL ${periodClause}
     ORDER BY c.name ASC`,
    params
  );
}

export async function upsertBudget(db, { periodId, categoryId, amount, periodType = 'monthly', startDate, endDate }) {
  const amt = Math.round(Number(amount) || 0);
  if (amt < 0) throw new Error('Nominal budget tidak boleh negatif.');
  const now = toIsoUtc();

  const existing = await db.queryOne(
    'SELECT * FROM budgets WHERE deleted_at IS NULL AND period_id = ? AND category_id = ?',
    [periodId, categoryId]
  );

  if (existing) {
    await db.run(
      'UPDATE budgets SET amount = ?, start_date = ?, end_date = ?, updated_at = ? WHERE id = ?',
      [amt, startDate, endDate, now, existing.id]
    );
    return db.queryOne('SELECT * FROM budgets WHERE id = ?', [existing.id]);
  }

  const id = generateUUID();
  await db.run(
    `INSERT INTO budgets (
      id, period_id, category_id, amount, period_type, start_date, end_date,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [id, periodId, categoryId, amt, periodType, startDate, endDate, now, now]
  );
  return db.queryOne('SELECT * FROM budgets WHERE id = ?', [id]);
}

export async function deleteBudget(db, id) {
  const now = toIsoUtc();
  await db.run('UPDATE budgets SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}

// ==================== RECURRING EXPENSES ====================

export async function listRecurringExpenses(db, { onlyActive = true } = {}) {
  const activeFilter = onlyActive ? 'AND r.is_active = 1' : '';
  return db.query(
    `SELECT r.*, c.name AS category_name, c.icon AS category_icon, c.color AS category_color
     FROM recurring_expenses r
     LEFT JOIN categories c ON c.id = r.category_id
     WHERE r.deleted_at IS NULL ${activeFilter}
     ORDER BY r.next_due_date ASC`
  );
}

export async function createRecurringExpense(db, data) {
  const amt = Math.round(Number(data.amount) || 0);
  if (amt <= 0) throw new Error('Nominal tagihan harus lebih dari 0.');
  const id = generateUUID();
  const now = toIsoUtc();
  const frequency = data.frequency || 'monthly';
  const dueDay = Number(data.dueDay) || 1;
  const nextDue = data.nextDueDate || computeInitialDueDate(toDateString(), dueDay, frequency);

  await db.run(
    `INSERT INTO recurring_expenses (
      id, name, amount, category_id, default_wallet_id, due_day, frequency,
      next_due_date, last_paid_period_id, last_paid_at, is_active,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 1, ?, ?, NULL)`,
    [
      id,
      data.name.trim(),
      amt,
      data.categoryId || 'cat-exp-kos',
      data.defaultWalletId || null,
      dueDay,
      frequency,
      nextDue,
      now,
      now
    ]
  );
  return db.queryOne('SELECT * FROM recurring_expenses WHERE id = ?', [id]);
}

export async function updateRecurringExpense(db, id, updates) {
  const now = toIsoUtc();
  await db.run(
    `UPDATE recurring_expenses SET
      name = COALESCE(?, name),
      amount = COALESCE(?, amount),
      category_id = COALESCE(?, category_id),
      due_day = COALESCE(?, due_day),
      frequency = COALESCE(?, frequency),
      next_due_date = COALESCE(?, next_due_date),
      is_active = COALESCE(?, is_active),
      updated_at = ?
     WHERE id = ? AND deleted_at IS NULL`,
    [
      updates.name ? updates.name.trim() : null,
      updates.amount !== undefined ? Math.round(Number(updates.amount)) : null,
      updates.categoryId ?? null,
      updates.dueDay !== undefined ? Number(updates.dueDay) : null,
      updates.frequency ?? null,
      updates.nextDueDate ?? null,
      updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : null,
      now,
      id
    ]
  );
}

export async function deleteRecurringExpense(db, id) {
  const now = toIsoUtc();
  await db.run('UPDATE recurring_expenses SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?', [now, now, id]);
}

/**
 * Atomically pay a recurring bill once per period (anti-duplication Rule #4).
 */
export async function payRecurringExpense(db, { recurringId, walletId, periodId, actualAmount, paidDate }) {
  const rec = await db.queryOne('SELECT * FROM recurring_expenses WHERE id = ? AND deleted_at IS NULL', [recurringId]);
  if (!rec) throw new Error('Tagihan rutin tidak ditemukan.');
  if (rec.last_paid_period_id === periodId) {
    throw new Error(`Tagihan "${rec.name}" sudah dibayar pada periode aktif.`);
  }

  const amount = Math.round(Number(actualAmount ?? rec.amount));
  if (amount <= 0) throw new Error('Nominal pembayaran tidak valid.');
  const now = toIsoUtc();

  return db.transaction(async () => {
    const tx = await createTransaction(db, {
      periodId,
      walletId,
      categoryId: rec.category_id,
      recurringExpenseId: rec.id,
      type: 'expense',
      amount,
      transactionDate: paidDate || toDateTimeString(),
      description: `Bayar tagihan: ${rec.name}`,
      isUnexpected: false
    });

    const nextDue = advanceDueDate(rec.next_due_date, rec.frequency, rec.due_day);
    await db.run(
      `UPDATE recurring_expenses SET
        last_paid_period_id = ?,
        last_paid_at = ?,
        next_due_date = ?,
        updated_at = ?
       WHERE id = ?`,
      [periodId, now, nextDue, now, rec.id]
    );
    return tx;
  });
}

// ==================== PLANNED EXPENSES ====================

export async function listPlannedExpenses(db, periodId = null) {
  const clause = periodId ? 'AND p.period_id = ?' : '';
  const params = periodId ? [periodId] : [];
  return db.query(
    `SELECT p.*, c.name AS category_name, c.icon AS category_icon
     FROM planned_expenses p
     LEFT JOIN categories c ON c.id = p.category_id
     WHERE p.deleted_at IS NULL ${clause}
     ORDER BY p.status ASC, p.planned_date ASC`,
    params
  );
}

export async function createPlannedExpense(db, { periodId, name, amount, categoryId, plannedDate }) {
  const amt = Math.round(Number(amount) || 0);
  if (amt <= 0) throw new Error('Nominal rencana pengeluaran harus lebih dari 0.');
  const id = generateUUID();
  const now = toIsoUtc();
  await db.run(
    `INSERT INTO planned_expenses (
      id, period_id, name, amount, category_id, planned_date, status, transaction_id,
      created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'pending', NULL, ?, ?, NULL)`,
    [id, periodId, name.trim(), amt, categoryId || 'cat-exp-other', plannedDate || toDateString(), now, now]
  );
  return db.queryOne('SELECT * FROM planned_expenses WHERE id = ?', [id]);
}

export async function payPlannedExpense(db, { plannedId, walletId, periodId, actualAmount }) {
  const item = await db.queryOne('SELECT * FROM planned_expenses WHERE id = ? AND deleted_at IS NULL', [plannedId]);
  if (!item) throw new Error('Pengeluaran terencana tidak ditemukan.');
  if (item.status === 'paid') throw new Error('Pengeluaran terencana ini sudah dibayar.');

  const amount = Math.round(Number(actualAmount ?? item.amount));
  const now = toIsoUtc();

  return db.transaction(async () => {
    const tx = await createTransaction(db, {
      periodId,
      walletId,
      categoryId: item.category_id,
      type: 'expense',
      amount,
      description: `Terencana: ${item.name}`,
      isUnexpected: false
    });

    await db.run(
      `UPDATE planned_expenses SET status = 'paid', transaction_id = ?, updated_at = ? WHERE id = ?`,
      [tx.id, now, item.id]
    );
    return tx;
  });
}

export async function deletePlannedExpense(db, id) {
  const now = toIsoUtc();
  await db.run('UPDATE planned_expenses SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}

// ==================== SAVINGS GOALS ====================

export async function listSavingsGoals(db) {
  const rows = await db.query(
    `SELECT s.*, w.name AS wallet_name, w.balance AS linked_wallet_balance
     FROM savings_goals s
     LEFT JOIN wallets w ON w.id = s.wallet_id AND w.deleted_at IS NULL
     WHERE s.deleted_at IS NULL
     ORDER BY s.is_emergency DESC, s.created_at ASC`
  );
  return rows.map((row) => {
    const effectiveCurrent = row.wallet_id ? Math.max(row.current_amount || 0, row.linked_wallet_balance || 0) : (row.current_amount || 0);
    const achieved = effectiveCurrent >= row.target_amount;
    return {
      ...row,
      effective_current_amount: effectiveCurrent,
      is_achieved: achieved,
      progress_pct: Math.min(100, Math.round((effectiveCurrent / Math.max(1, row.target_amount)) * 100))
    };
  });
}

export async function createSavingsGoal(db, { name, walletId = null, targetAmount, currentAmount = 0, monthlyAllocation = 0, targetDate = null, isEmergency = false }) {
  const target = Math.round(Number(targetAmount) || 0);
  if (target <= 0) throw new Error('Target tabungan harus lebih dari 0.');
  const id = generateUUID();
  const now = toIsoUtc();

  await db.run(
    `INSERT INTO savings_goals (
      id, name, wallet_id, target_amount, current_amount, monthly_allocation,
      target_date, is_emergency, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      id,
      name.trim(),
      walletId,
      target,
      Math.round(Number(currentAmount) || 0),
      Math.round(Number(monthlyAllocation) || 0),
      targetDate,
      isEmergency ? 1 : 0,
      now,
      now
    ]
  );
  return db.queryOne('SELECT * FROM savings_goals WHERE id = ?', [id]);
}

export async function deleteSavingsGoal(db, id) {
  const now = toIsoUtc();
  await db.run('UPDATE savings_goals SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);
}
