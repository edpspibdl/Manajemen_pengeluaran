import { generateUUID } from '../utils/uuid.js';
import { rewindDueDate, toDateTimeString, toIsoUtc } from '../utils/date.js';

/**
 * Apply or reverse a transaction's balance effect on wallets.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {{ type: string, wallet_id: string, to_wallet_id?: string | null, amount: number }} tx
 * @param {1 | -1} direction 1 = apply, -1 = reverse
 */
async function applyWalletDelta(db, tx, direction) {
  const amt = Math.round(Number(tx.amount)) * direction;
  const now = toIsoUtc();

  if (tx.type === 'income') {
    await db.run('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?', [amt, now, tx.wallet_id]);
  } else if (tx.type === 'expense') {
    await db.run('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?', [amt, now, tx.wallet_id]);
  } else if (tx.type === 'transfer') {
    if (!tx.to_wallet_id) throw new Error('Dompet tujuan wajib dipilih untuk transfer.');
    await db.run('UPDATE wallets SET balance = balance - ?, updated_at = ? WHERE id = ?', [amt, now, tx.wallet_id]);
    await db.run('UPDATE wallets SET balance = balance + ?, updated_at = ? WHERE id = ?', [amt, now, tx.to_wallet_id]);
  }
}

function validateTransactionPayload(data) {
  const amount = Math.round(Number(data.amount) || 0);
  if (amount <= 0) throw new Error('Nominal transaksi harus lebih dari 0.');
  if (!data.walletId) throw new Error('Dompet sumber wajib dipilih.');
  if (!['income', 'expense', 'transfer'].includes(data.type)) {
    throw new Error('Jenis transaksi tidak valid.');
  }
  if (data.type === 'transfer') {
    if (!data.toWalletId) throw new Error('Dompet tujuan transfer wajib dipilih.');
    if (data.toWalletId === data.walletId) throw new Error('Dompet asal dan tujuan tidak boleh sama.');
  } else if (!data.categoryId) {
    throw new Error('Kategori wajib dipilih.');
  }
  return amount;
}

export async function listTransactions(db, filters = {}) {
  const clauses = ['t.deleted_at IS NULL'];
  const params = [];

  if (filters.periodId) {
    clauses.push('t.period_id = ?');
    params.push(filters.periodId);
  }
  if (filters.type) {
    clauses.push('t.type = ?');
    params.push(filters.type);
  }
  if (filters.categoryId) {
    clauses.push('t.category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.walletId) {
    clauses.push('(t.wallet_id = ? OR t.to_wallet_id = ?)');
    params.push(filters.walletId, filters.walletId);
  }
  if (filters.startDate) {
    clauses.push('substr(t.transaction_date, 1, 10) >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    clauses.push('substr(t.transaction_date, 1, 10) <= ?');
    params.push(filters.endDate);
  }
  if (filters.search) {
    clauses.push('(LOWER(t.description) LIKE ? OR LOWER(COALESCE(c.name, \'\')) LIKE ?)');
    const q = `%${filters.search.toLowerCase()}%`;
    params.push(q, q);
  }

  let orderBy = 't.transaction_date DESC, t.created_at DESC';
  if (filters.sortBy === 'oldest') orderBy = 't.transaction_date ASC, t.created_at ASC';
  else if (filters.sortBy === 'highest') orderBy = 't.amount DESC, t.transaction_date DESC';
  else if (filters.sortBy === 'lowest') orderBy = 't.amount ASC, t.transaction_date DESC';

  const limitSql = filters.limit ? `LIMIT ${Number(filters.limit)}` : '';

  return db.query(
    `SELECT t.*,
            c.name AS category_name, c.icon AS category_icon, c.color AS category_color,
            w.name AS wallet_name, w.wallet_type AS wallet_type, w.include_in_daily_budget AS wallet_is_operational,
            tw.name AS to_wallet_name, tw.include_in_daily_budget AS to_wallet_is_operational
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     LEFT JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
     WHERE ${clauses.join(' AND ')}
     ORDER BY ${orderBy}
     ${limitSql}`,
    params
  );
}

export async function getTransactionById(db, id) {
  return db.queryOne('SELECT * FROM transactions WHERE id = ? AND deleted_at IS NULL', [id]);
}

/**
 * Atomically create a transaction and update wallet balance(s).
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {Record<string, any>} data
 */
export async function createTransaction(db, data) {
  const amount = validateTransactionPayload(data);
  if (!data.periodId) throw new Error('Periode keuangan aktif tidak ditemukan.');

  const id = data.id || generateUUID();
  const now = toIsoUtc();
  const txDate = data.transactionDate || toDateTimeString();

  await db.transaction(async () => {
    await db.run(
      `INSERT INTO transactions (
        id, period_id, wallet_id, to_wallet_id, category_id, recurring_expense_id,
        type, amount, transaction_date, description, is_unexpected,
        meal_slot, calories, protein, is_treat_meal,
        created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        data.periodId,
        data.walletId,
        data.type === 'transfer' ? data.toWalletId : null,
        data.type === 'transfer' ? null : data.categoryId,
        data.recurringExpenseId || null,
        data.type,
        amount,
        txDate,
        (data.description || '').trim(),
        data.isUnexpected ? 1 : 0,
        data.mealSlot || null,
        data.calories !== undefined && data.calories !== null ? Math.round(Number(data.calories)) : null,
        data.protein !== undefined && data.protein !== null ? Number(data.protein) : null,
        data.isTreatMeal ? 1 : 0,
        now,
        now
      ]
    );

    await applyWalletDelta(
      db,
      {
        type: data.type,
        wallet_id: data.walletId,
        to_wallet_id: data.toWalletId || null,
        amount
      },
      1
    );
  });

  return getTransactionById(db, id);
}

/**
 * Atomically update an existing transaction and recalculate affected wallet balances.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} id
 * @param {Record<string, any>} updates
 */
export async function updateTransaction(db, id, updates) {
  const oldTx = await getTransactionById(db, id);
  if (!oldTx) throw new Error('Transaksi tidak ditemukan.');

  const merged = {
    type: updates.type ?? oldTx.type,
    walletId: updates.walletId ?? oldTx.wallet_id,
    toWalletId: updates.toWalletId !== undefined ? updates.toWalletId : oldTx.to_wallet_id,
    categoryId: updates.categoryId !== undefined ? updates.categoryId : oldTx.category_id,
    amount: updates.amount !== undefined ? updates.amount : oldTx.amount,
    transactionDate: updates.transactionDate ?? oldTx.transaction_date,
    description: updates.description !== undefined ? updates.description : oldTx.description,
    isUnexpected: updates.isUnexpected !== undefined ? updates.isUnexpected : Boolean(oldTx.is_unexpected),
    mealSlot: updates.mealSlot !== undefined ? updates.mealSlot : oldTx.meal_slot,
    calories: updates.calories !== undefined ? updates.calories : oldTx.calories,
    protein: updates.protein !== undefined ? updates.protein : oldTx.protein,
    isTreatMeal: updates.isTreatMeal !== undefined ? updates.isTreatMeal : Boolean(oldTx.is_treat_meal)
  };
  const amount = validateTransactionPayload(merged);
  const now = toIsoUtc();

  await db.transaction(async () => {
    await applyWalletDelta(db, oldTx, -1);

    await db.run(
      `UPDATE transactions SET
        wallet_id = ?, to_wallet_id = ?, category_id = ?, type = ?,
        amount = ?, transaction_date = ?, description = ?, is_unexpected = ?,
        meal_slot = ?, calories = ?, protein = ?, is_treat_meal = ?,
        updated_at = ?
       WHERE id = ?`,
      [
        merged.walletId,
        merged.type === 'transfer' ? merged.toWalletId : null,
        merged.type === 'transfer' ? null : merged.categoryId,
        merged.type,
        amount,
        merged.transactionDate,
        (merged.description || '').trim(),
        merged.isUnexpected ? 1 : 0,
        merged.mealSlot || null,
        merged.calories !== undefined && merged.calories !== null ? Math.round(Number(merged.calories)) : null,
        merged.protein !== undefined && merged.protein !== null ? Number(merged.protein) : null,
        merged.isTreatMeal ? 1 : 0,
        now,
        id
      ]
    );

    await applyWalletDelta(
      db,
      {
        type: merged.type,
        wallet_id: merged.walletId,
        to_wallet_id: merged.toWalletId,
        amount
      },
      1
    );
  });

  return getTransactionById(db, id);
}

/**
 * Atomically soft-delete a transaction, reverse wallet balance, and clear linked bill/meal flags.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} id
 */
export async function deleteTransaction(db, id) {
  const tx = await getTransactionById(db, id);
  if (!tx) throw new Error('Transaksi tidak ditemukan.');
  const now = toIsoUtc();

  await db.transaction(async () => {
    await applyWalletDelta(db, tx, -1);
    await db.run('UPDATE transactions SET deleted_at = ?, updated_at = ? WHERE id = ?', [now, now, id]);

    if (tx.recurring_expense_id) {
      const rec = await db.queryOne(
        'SELECT * FROM recurring_expenses WHERE id = ? AND last_paid_period_id = ?',
        [tx.recurring_expense_id, tx.period_id]
      );
      if (rec) {
        const restoredDue = rewindDueDate(rec.next_due_date, rec.frequency, rec.due_day);
        await db.run(
          `UPDATE recurring_expenses SET last_paid_period_id = NULL, last_paid_at = NULL, next_due_date = ?, updated_at = ?
           WHERE id = ?`,
          [restoredDue, now, rec.id]
        );
      }
    }

    await db.run(
      `UPDATE planned_expenses SET status = 'pending', transaction_id = NULL, updated_at = ?
       WHERE transaction_id = ?`,
      [now, id]
    );

    await db.run(
      `UPDATE meal_plans SET transaction_id = NULL, actual_cost = NULL, status = 'planned', updated_at = ?
       WHERE transaction_id = ?`,
      [now, id]
    );
  });
}
