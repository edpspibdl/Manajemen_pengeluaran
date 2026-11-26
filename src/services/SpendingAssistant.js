import { addDays, diffDays, toDateString } from '../utils/date.js';
import { formatIDR } from '../utils/currency.js';

/**
 * Generate deterministic, transaction-backed spending alerts and projections.
 * All projections carry the explicit "Estimasi" label (Rule #11).
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {Awaited<ReturnType<import('./BudgetEngine.js').calculateBudgetSummary>>} summary
 * @param {string} [todayStr]
 */
export async function generateSpendingAlerts(db, summary, todayStr = toDateString()) {
  const alerts = [];
  if (!summary.period) return alerts;

  // 1. Deficit / Critical alerts
  if (summary.healthStatus === 'Defisit') {
    alerts.push({
      id: 'alert-deficit',
      severity: 'danger',
      title: 'Mode Penyelamatan: Dana Aman Defisit',
      message: `Dana operasional masih kurang ${formatIDR(Math.abs(summary.safeToSpend))} untuk menutup tagihan rutin dan target cadangan. Hentikan pengeluaran hiburan sementara atau sesuaikan target tabungan.`,
      actionTab: 'keuangan'
    });
  } else if (summary.healthStatus === 'Kritis') {
    alerts.push({
      id: 'alert-kritis',
      severity: 'danger',
      title: 'Budget Harian Kondisi Kritis',
      message: `Jatah makan harian saat ini hanya ${formatIDR(summary.dailyFoodBudget)}. Gunakan rekomendasi menu Super Hemat untuk bertahan ${summary.remainingDays} hari lagi.`,
      actionTab: 'makanan'
    });
  }

  // 2. Today daily overbudget
  if (summary.remainingDailyToday < 0) {
    const over = Math.abs(summary.remainingDailyToday);
    const nextDays = Math.max(1, summary.remainingDays - 1);
    const projectedNextDaily = Math.max(0, Math.floor(summary.safeToSpend / nextDays));
    alerts.push({
      id: 'alert-daily-over',
      severity: 'warning',
      title: 'Pengeluaran Hari Ini Melebihi Batas',
      message: `Sudah melebihi budget harian sebesar ${formatIDR(over)}. Estimasi budget harian mulai besok disesuaikan menjadi ${formatIDR(projectedNextDaily)}/hari.`,
      actionTab: 'keuangan'
    });
  }

  // 3. Today food budget overbudget & Fixed Monthly Food Pool alerts
  if (summary.foodPoolExceedsSafeCash) {
    alerts.push({
      id: 'alert-food-pool-cash',
      severity: 'danger',
      title: 'Dana Bebas Kurang dari Sisa Budget Makan',
      message: `Dana aman tersedia (${formatIDR(Math.max(0, summary.safeToSpend))}) lebih kecil daripada sisa target makan (${formatIDR(summary.remainingFoodPool)}). Kurangi pengeluaran lain atau sesuaikan target makan.`,
      actionTab: 'makanan'
    });
  }

  if (summary.foodBudgetMode === 'fixed' && summary.monthlyFoodBudget > 0) {
    if (summary.remainingFoodPool < 0) {
      alerts.push({
        id: 'alert-food-pool-over',
        severity: 'danger',
        title: 'Target Budget Makan Periode Terlampaui',
        message: `Belanja makanmu sudah mencapai ${formatIDR(summary.periodFoodSpent)} dari target ${formatIDR(summary.monthlyFoodBudget)} (lebih ${formatIDR(Math.abs(summary.remainingFoodPool))}).`,
        actionTab: 'makanan'
      });
    } else if (summary.calorieFeasibility?.tone === 'danger' || summary.calorieFeasibility?.tone === 'waspada') {
      alerts.push({
        id: 'alert-calorie-guard',
        severity: summary.calorieFeasibility.tone,
        title: `Strategi Jaga Berat Badan (${summary.calorieFeasibility.status})`,
        message: summary.calorieFeasibility.note,
        actionTab: 'makanan'
      });
    }
  }

  if (summary.remainingFoodToday < 0) {
    alerts.push({
      id: 'alert-food-over',
      severity: 'warning',
      title: 'Pengeluaran Makan Hari Ini Melebihi Target',
      message: `Sudah terpakai ${formatIDR(summary.todayOperationalFoodExpense)} dari jatah hari ini ${formatIDR(summary.dailyFoodBudget)}. Target harian mulai besok otomatis disesuaikan ke ${formatIDR(summary.nextDayFlatFoodTarget)}/hari agar budget tetap cukup.`,
      actionTab: 'makanan'
    });
  }

  // 4. Upcoming & overdue recurring bills
  const unpaidBills = await db.query(
    `SELECT * FROM recurring_expenses
     WHERE is_active = 1 AND deleted_at IS NULL
       AND (last_paid_period_id IS NULL OR last_paid_period_id != ?)
     ORDER BY next_due_date ASC`,
    [summary.period.id]
  );

  for (const bill of unpaidBills) {
    const daysLeft = diffDays(todayStr, bill.next_due_date);
    if (daysLeft < 0) {
      alerts.push({
        id: `alert-bill-${bill.id}`,
        severity: 'danger',
        title: `Tagihan Terlambat: ${bill.name}`,
        message: `${bill.name} (${formatIDR(bill.amount)}) melewati jatuh tempo ${Math.abs(daysLeft)} hari dan belum ditandai lunas.`,
        actionTab: 'keuangan',
        recurringId: bill.id
      });
    } else if (daysLeft <= 3) {
      alerts.push({
        id: `alert-bill-${bill.id}`,
        severity: daysLeft === 0 ? 'danger' : 'warning',
        title: `Tagihan Segera Jatuh Tempo: ${bill.name}`,
        message:
          daysLeft === 0
            ? `${bill.name} (${formatIDR(bill.amount)}) jatuh tempo hari ini.`
            : `${bill.name} (${formatIDR(bill.amount)}) jatuh tempo ${daysLeft} hari lagi dan belum dibayar.`,
        actionTab: 'keuangan',
        recurringId: bill.id
      });
    }
  }

  // 5. Weekly category spike (>= 25% increase and >= Rp 20.000 delta)
  const sevenDaysAgo = addDays(todayStr, -6);
  const prevWeekStart = addDays(todayStr, -13);
  const prevWeekEnd = addDays(todayStr, -7);

  const spikeRows = await db.query(
    `SELECT c.id, c.name,
            COALESCE(SUM(CASE WHEN substr(t.transaction_date, 1, 10) >= ? AND substr(t.transaction_date, 1, 10) <= ? THEN t.amount ELSE 0 END), 0) AS this_week,
            COALESCE(SUM(CASE WHEN substr(t.transaction_date, 1, 10) >= ? AND substr(t.transaction_date, 1, 10) <= ? THEN t.amount ELSE 0 END), 0) AS prev_week
     FROM categories c
     JOIN transactions t ON t.category_id = c.id
     WHERE t.deleted_at IS NULL AND t.type = 'expense' AND t.recurring_expense_id IS NULL
     GROUP BY c.id, c.name`,
    [sevenDaysAgo, todayStr, prevWeekStart, prevWeekEnd]
  );

  for (const row of spikeRows) {
    if (row.prev_week > 0 && row.this_week - row.prev_week >= 20000) {
      const pctIncrease = Math.round(((row.this_week - row.prev_week) / row.prev_week) * 100);
      if (pctIncrease >= 25) {
        alerts.push({
          id: `alert-spike-${row.id}`,
          severity: 'warning',
          title: `Lonjakan Pengeluaran: ${row.name}`,
          message: `Pengeluaran ${row.name} 7 hari terakhir (${formatIDR(row.this_week)}) naik ${pctIncrease}% dibanding minggu sebelumnya.`,
          actionTab: 'analisis'
        });
      }
    }
  }

  // 6. Category budget warnings (>= 85% used)
  const budgetRows = await db.query(
    `SELECT b.id, b.amount, c.name,
            COALESCE((
              SELECT SUM(t.amount) FROM transactions t
              WHERE t.deleted_at IS NULL AND t.type = 'expense'
                AND t.category_id = b.category_id
                AND substr(t.transaction_date, 1, 10) >= b.start_date
                AND substr(t.transaction_date, 1, 10) <= b.end_date
            ), 0) AS spent
     FROM budgets b
     JOIN categories c ON c.id = b.category_id
     WHERE b.deleted_at IS NULL AND b.period_id = ? AND b.amount > 0`,
    [summary.period.id]
  );

  for (const b of budgetRows) {
    const pct = Math.round((b.spent / b.amount) * 100);
    if (pct >= 100) {
      alerts.push({
        id: `alert-bgt-${b.id}`,
        severity: 'danger',
        title: `Anggaran ${b.name} Terlampaui`,
        message: `Sudah terpakai ${formatIDR(b.spent)} dari batas ${formatIDR(b.amount)} (${pct}%).`,
        actionTab: 'keuangan'
      });
    } else if (pct >= 85) {
      alerts.push({
        id: `alert-bgt-${b.id}`,
        severity: 'warning',
        title: `Anggaran ${b.name} Hampir Habis`,
        message: `Sudah terpakai ${pct}% (${formatIDR(b.spent)} dari ${formatIDR(b.amount)}).`,
        actionTab: 'keuangan'
      });
    }
  }

  // 7. Runway prediction (always explicitly labeled "Estimasi", Rule #11)
  const avgRow = await db.queryOne(
    `SELECT COALESCE(SUM(t.amount), 0) AS total
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN planned_expenses pe ON pe.transaction_id = t.id AND pe.deleted_at IS NULL
     WHERE t.deleted_at IS NULL
       AND t.type = 'expense'
       AND t.recurring_expense_id IS NULL
       AND pe.id IS NULL
       AND w.include_in_daily_budget = 1
       AND substr(t.transaction_date, 1, 10) >= ?
       AND substr(t.transaction_date, 1, 10) <= ?`,
    [sevenDaysAgo, todayStr]
  );

  const avgDaily7 = Math.round((Number(avgRow?.total) || 0) / 7);
  if (avgDaily7 > 0 && summary.safeToSpend > 0 && avgDaily7 > summary.baseDailyBudgetToday) {
    const estimatedRunwayDays = Math.max(1, Math.floor(summary.safeToSpend / avgDaily7));
    if (estimatedRunwayDays < summary.remainingDays) {
      alerts.push({
        id: 'alert-runway',
        severity: 'warning',
        title: 'Prediksi Ketahanan Dana (Estimasi)',
        message: `Dengan rata-rata belanja ${formatIDR(avgDaily7)}/hari, dana aman diperkirakan bertahan ${estimatedRunwayDays} hari (Estimasi), padahal sisa periode masih ${summary.remainingDays} hari.`,
        actionTab: 'analisis'
      });
    }
  }

  // 8. Healthy reassurance if no alerts triggered
  if (alerts.length === 0) {
    alerts.push({
      id: 'alert-healthy',
      severity: 'info',
      title: 'Budget Hari Ini Masih Aman',
      message: `Kamu masih punya ruang belanja ${formatIDR(Math.max(0, summary.remainingDailyToday))} hari ini dengan kewajiban rutin aman terjaga.`,
      actionTab: 'home'
    });
  }

  return alerts;
}
