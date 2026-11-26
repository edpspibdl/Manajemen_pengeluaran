import { generateUUID } from '../utils/uuid.js';
import { toIsoUtc } from '../utils/date.js';

export const WALLET_TYPES = {
  cash: { label: 'Tunai', includeInDailyBudget: 1, icon: 'cash' },
  bank: { label: 'Rekening Bank', includeInDailyBudget: 1, icon: 'bank' },
  ewallet: { label: 'E-Wallet', includeInDailyBudget: 1, icon: 'phone' },
  savings: { label: 'Tabungan', includeInDailyBudget: 0, icon: 'piggy' },
  emergency: { label: 'Dana Darurat', includeInDailyBudget: 0, icon: 'shield' }
};

export async function listWallets(db, { onlyActive = true } = {}) {
  const filter = onlyActive ? 'AND is_active = 1' : '';
  return db.query(
    `SELECT * FROM wallets WHERE deleted_at IS NULL ${filter} ORDER BY include_in_daily_budget DESC, created_at ASC`
  );
}

export async function getWalletById(db, id) {
  return db.queryOne('SELECT * FROM wallets WHERE id = ? AND deleted_at IS NULL', [id]);
}

export async function createWallet(db, { name, walletType = 'cash', balance = 0, includeInDailyBudget, icon }) {
  const meta = WALLET_TYPES[walletType] || WALLET_TYPES.cash;
  const id = generateUUID();
  const now = toIsoUtc();
  const includeFlag =
    includeInDailyBudget !== undefined ? (includeInDailyBudget ? 1 : 0) : meta.includeInDailyBudget;

  await db.run(
    `INSERT INTO wallets (
      id, name, wallet_type, balance, include_in_daily_budget,
      icon, is_active, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, NULL)`,
    [
      id,
      name.trim(),
      walletType,
      Math.round(Number(balance) || 0),
      includeFlag,
      icon || meta.icon,
      now,
      now
    ]
  );
  return getWalletById(db, id);
}

export async function updateWallet(db, id, { name, walletType, includeInDailyBudget, icon }) {
  const existing = await getWalletById(db, id);
  if (!existing) throw new Error('Dompet tidak ditemukan.');

  const resolvedType = walletType || existing.wallet_type;
  const meta = WALLET_TYPES[resolvedType] || WALLET_TYPES.cash;
  const includeFlag =
    includeInDailyBudget !== undefined
      ? (includeInDailyBudget ? 1 : 0)
      : (walletType ? meta.includeInDailyBudget : existing.include_in_daily_budget);

  await db.run(
    `UPDATE wallets SET
      name = COALESCE(?, name),
      wallet_type = ?,
      include_in_daily_budget = ?,
      icon = COALESCE(?, icon),
      updated_at = ?
     WHERE id = ?`,
    [name ? name.trim() : null, resolvedType, includeFlag, icon ?? null, toIsoUtc(), id]
  );
  return getWalletById(db, id);
}

export async function softDeleteWallet(db, id) {
  const existing = await getWalletById(db, id);
  if (!existing) throw new Error('Dompet tidak ditemukan.');

  const txUsage = await db.queryOne(
    'SELECT COUNT(*) AS cnt FROM transactions WHERE deleted_at IS NULL AND (wallet_id = ? OR to_wallet_id = ?)',
    [id, id]
  );
  if (txUsage && txUsage.cnt > 0) {
    throw new Error('Dompet masih memiliki riwayat transaksi. Transfer saldo keluar dulu atau nonaktifkan dompet.');
  }

  const now = toIsoUtc();
  await db.run('UPDATE wallets SET deleted_at = ?, is_active = 0, updated_at = ? WHERE id = ?', [now, now, id]);
}
