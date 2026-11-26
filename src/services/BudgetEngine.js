import { computePeriodBounds, diffDays, toDateString } from '../utils/date.js';
import { formatIDR } from '../utils/currency.js';
import { getUserProfile } from '../repositories/userRepo.js';
import { ensureActivePeriod } from './PeriodService.js';

/**
 * Compute real-time smart budget summary, dedicated food budget pool targets
 * (Regular Day vs Treat Day 3x/week), and calorie sufficiency metrics.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} [todayStr]
 * @param {{ isTodayTreatDay?: boolean }} [options]
 */
export async function calculateBudgetSummary(db, todayStr = toDateString(), options = {}) {
  const user = await getUserProfile(db);
  const period = await ensureActivePeriod(db, todayStr);

  const walletAgg = await db.queryOne(
    `SELECT
       COALESCE(SUM(CASE WHEN include_in_daily_budget = 1 THEN balance ELSE 0 END), 0) AS operational_cash,
       COALESCE(SUM(CASE WHEN include_in_daily_budget = 0 THEN balance ELSE 0 END), 0) AS locked_savings
     FROM wallets
     WHERE deleted_at IS NULL`
  );

  const availableOperationalCash = Number(walletAgg?.operational_cash) || 0;
  const lockedSavingsBalance = Number(walletAgg?.locked_savings) || 0;

  if (!period) {
    return {
      period: null,
      todayStr,
      remainingDays: 1,
      totalDays: 30,
      availableOperationalCash,
      lockedSavingsBalance,
      unpaidRecurringTotal: 0,
      unpaidPlannedTotal: 0,
      unpaidObligations: 0,
      reserveTarget: 0,
      netTransferredToSavings: 0,
      remainingReserveAllocation: 0,
      safeToSpend: availableOperationalCash,
      nonFoodSafeToSpend: availableOperationalCash,
      foodPoolExceedsSafeCash: false,
      baseDailyBudgetToday: availableOperationalCash,
      remainingDailyToday: availableOperationalCash,
      foodBudgetMode: 'fixed',
      monthlyFoodBudget: 0,
      periodFoodSpent: 0,
      remainingFoodPool: 0,
      flatDailyFoodTarget: 0,
      regularDayFoodTarget: 0,
      treatDayFoodTarget: 0,
      nextDayFlatFoodTarget: 0,
      treatMealsPerWeek: 3,
      treatMealsUsedThisWeek: 0,
      treatMealsRemainingThisWeek: 3,
      isTodayTreatDay: false,
      dailyFoodBudget: 0,
      remainingFoodToday: 0,
      slotBudgets: { breakfast: 0, lunch: 0, dinner: 0, snack: 0 },
      minDailyCalories: 1900,
      minDailyProtein: 50,
      todayCalories: 0,
      todayProtein: 0,
      caloriesRemainingToday: 1900,
      calorieFeasibility: {
        status: 'Belum Diatur',
        tone: 'info',
        note: 'Selesaikan onboarding untuk menghitung target makan dan kalori harian.'
      },
      periodIncome: 0,
      periodExpense: 0,
      periodVariableExpense: 0,
      todayOperationalExpense: 0,
      todayTotalExpense: 0,
      todayFoodExpense: 0,
      healthStatus: 'Aman',
      healthReason: 'Selesaikan onboarding untuk mulai memantau budget.'
    };
  }

  const remainingDays = Math.max(1, diffDays(todayStr, period.end_date) + 1);
  const totalDays = Math.max(1, diffDays(period.start_date, period.end_date) + 1);

  const unpaidRecRow = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM recurring_expenses
     WHERE is_active = 1
       AND deleted_at IS NULL
       AND next_due_date <= ?
       AND (last_paid_period_id IS NULL OR last_paid_period_id != ?)`,
    [period.end_date, period.id]
  );

  const unpaidPlanRow = await db.queryOne(
    `SELECT COALESCE(SUM(amount), 0) AS total
     FROM planned_expenses
     WHERE period_id = ?
       AND status = 'pending'
       AND deleted_at IS NULL`,
    [period.id]
  );

  const unpaidRecurringTotal = Number(unpaidRecRow?.total) || 0;
  const unpaidPlannedTotal = Number(unpaidPlanRow?.total) || 0;
  const unpaidObligations = unpaidRecurringTotal + unpaidPlannedTotal;

  const { startDate: weekStart, endDate: weekEnd } = computePeriodBounds(todayStr, 'weekly', 1);

  const txAgg = await db.queryOne(
    `SELECT
       COALESCE(SUM(CASE WHEN t.type = 'income' AND t.period_id = ? THEN t.amount ELSE 0 END), 0) AS period_income,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.period_id = ? THEN t.amount ELSE 0 END), 0) AS period_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.period_id = ? AND t.recurring_expense_id IS NULL AND pe.id IS NULL THEN t.amount ELSE 0 END), 0) AS period_variable_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? AND w.include_in_daily_budget = 1 AND t.recurring_expense_id IS NULL AND pe.id IS NULL THEN t.amount ELSE 0 END), 0) AS today_op_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? THEN t.amount ELSE 0 END), 0) AS today_total_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? AND t.category_id = 'cat-exp-food' AND w.include_in_daily_budget = 1 AND t.recurring_expense_id IS NULL AND pe.id IS NULL THEN t.amount ELSE 0 END), 0) AS today_op_food_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? AND t.category_id = 'cat-exp-food' THEN t.amount ELSE 0 END), 0) AS today_total_food_expense,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.period_id = ? AND substr(t.transaction_date, 1, 10) < ? AND t.category_id = 'cat-exp-food' THEN t.amount ELSE 0 END), 0) AS period_food_before_today,
       COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.period_id = ? AND w.include_in_daily_budget = 1 AND tw.include_in_daily_budget = 0 THEN t.amount ELSE 0 END), 0) AS transfer_to_savings,
       COALESCE(SUM(CASE WHEN t.type = 'transfer' AND t.period_id = ? AND w.include_in_daily_budget = 0 AND tw.include_in_daily_budget = 1 THEN t.amount ELSE 0 END), 0) AS transfer_from_savings,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.is_treat_meal = 1 AND substr(t.transaction_date, 1, 10) >= ? AND substr(t.transaction_date, 1, 10) < ? THEN 1 ELSE 0 END), 0) AS treat_before_today_week,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND t.is_treat_meal = 1 AND substr(t.transaction_date, 1, 10) = ? THEN 1 ELSE 0 END), 0) AS treat_today,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? AND t.category_id = 'cat-exp-food' THEN COALESCE(t.calories, 0) ELSE 0 END), 0) AS tx_calories_today,
       COALESCE(SUM(CASE WHEN t.type = 'expense' AND substr(t.transaction_date, 1, 10) = ? AND t.category_id = 'cat-exp-food' THEN COALESCE(t.protein, 0) ELSE 0 END), 0) AS tx_protein_today
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
     LEFT JOIN planned_expenses pe ON pe.transaction_id = t.id AND pe.deleted_at IS NULL
     WHERE t.deleted_at IS NULL`,
    [
      period.id,
      period.id,
      period.id,
      todayStr,
      todayStr,
      todayStr,
      todayStr,
      period.id,
      todayStr,
      period.id,
      period.id,
      weekStart,
      todayStr,
      todayStr,
      todayStr,
      todayStr
    ]
  );

  // Also include consumed meal plans with NO linked transaction (stock/free meals) in today's calories
  const freeMealAgg = await db.queryOne(
    `SELECT
       COALESCE(SUM(COALESCE(f.calories, 0)), 0) AS free_cal,
       COALESCE(SUM(COALESCE(f.protein, 0)), 0) AS free_prot
     FROM meal_plans mp
     JOIN food_items f ON f.id = mp.food_item_id
     WHERE mp.deleted_at IS NULL
       AND mp.meal_date = ?
       AND mp.status = 'consumed'
       AND mp.transaction_id IS NULL`,
    [todayStr]
  );

  const periodIncome = Number(txAgg?.period_income) || 0;
  const periodExpense = Number(txAgg?.period_expense) || 0;
  const periodVariableExpense = Number(txAgg?.period_variable_expense) || 0;
  const todayOperationalExpense = Number(txAgg?.today_op_expense) || 0;
  const todayTotalExpense = Number(txAgg?.today_total_expense) || 0;
  const todayOperationalFoodExpense = Number(txAgg?.today_op_food_expense) || 0;
  const todayFoodExpense = Number(txAgg?.today_total_food_expense) || 0;
  const periodFoodBeforeToday = Number(txAgg?.period_food_before_today) || 0;

  const netTransferredToSavings = Math.max(
    0,
    (Number(txAgg?.transfer_to_savings) || 0) - (Number(txAgg?.transfer_from_savings) || 0)
  );
  const reserveTarget = Number(period.reserve_target) || 0;
  const remainingReserveAllocation = Math.max(0, reserveTarget - netTransferredToSavings);

  const safeToSpend = availableOperationalCash - unpaidObligations - remainingReserveAllocation;
  const safeBeforeTodayExpense = safeToSpend + todayOperationalExpense;
  const baseDailyBudgetToday = Math.max(0, Math.floor(safeBeforeTodayExpense / remainingDays));
  const remainingDailyToday = baseDailyBudgetToday - todayOperationalExpense;

  // ==================== FOOD POOL & TREAT SPLIT ====================
  const monthlyFoodBudget =
    user?.food_budget_mode === 'fixed'
      ? Number(user?.monthly_food_budget || period.food_budget_target || 0)
      : Number(period.food_budget_target || user?.monthly_food_budget || 0);
  const useFixedFoodPool = (user?.food_budget_mode === 'fixed' || monthlyFoodBudget > 0) && monthlyFoodBudget > 0;
  const foodBudgetMode = useFixedFoodPool ? 'fixed' : 'ratio';

  const treatMealsPerWeek = Math.max(0, Math.min(7, Number(user?.treat_meals_per_week ?? 3)));
  const treatBeforeTodayWeek = Number(txAgg?.treat_before_today_week) || 0;
  const treatTodayCount = Number(txAgg?.treat_today) || 0;
  const treatMealsUsedThisWeek = treatBeforeTodayWeek + treatTodayCount;
  const treatMealsRemainingThisWeek = Math.max(0, treatMealsPerWeek - treatMealsUsedThisWeek);
  const isTodayTreatDay = Boolean(options.isTodayTreatDay) || treatTodayCount > 0;

  const periodFoodSpent = periodFoodBeforeToday + todayFoodExpense;
  const remainingFoodPoolStartOfToday = useFixedFoodPool
    ? monthlyFoodBudget - periodFoodBeforeToday
    : Math.max(0, safeBeforeTodayExpense) * Number(user?.food_budget_ratio ?? 0.6);
  const remainingFoodPool = useFixedFoodPool
    ? monthlyFoodBudget - periodFoodSpent
    : Math.max(0, safeToSpend) * Number(user?.food_budget_ratio ?? 0.6);

  const daysLeftInWeek = Math.max(1, Math.min(remainingDays, diffDays(todayStr, weekEnd) + 1));
  const laterDays = Math.max(0, remainingDays - daysLeftInWeek);
  const treatLeftFromTodayWeek = Math.max(0, treatMealsPerWeek - treatBeforeTodayWeek);
  const remainingTreatDaysInPeriod =
    treatMealsPerWeek > 0
      ? Math.min(remainingDays, treatLeftFromTodayWeek + Math.round(laterDays * (treatMealsPerWeek / 7)))
      : 0;
  const remainingRegularDaysInPeriod = Math.max(0, remainingDays - remainingTreatDaysInPeriod);
  const treatFactor = 1.65;

  let flatDailyFoodTarget = 0;
  let regularDayFoodTarget = 0;
  let treatDayFoodTarget = 0;
  let dailyFoodBudget = 0;
  let nextDayFlatFoodTarget = 0;

  if (useFixedFoodPool) {
    const poolStartSafe = Math.max(0, remainingFoodPoolStartOfToday);
    flatDailyFoodTarget = Math.floor(poolStartSafe / remainingDays);
    const totalWeight = remainingRegularDaysInPeriod * 1.0 + remainingTreatDaysInPeriod * treatFactor;
    regularDayFoodTarget = totalWeight > 0 ? Math.floor(poolStartSafe / totalWeight) : flatDailyFoodTarget;
    treatDayFoodTarget =
      remainingTreatDaysInPeriod > 0
        ? Math.min(poolStartSafe, Math.floor(regularDayFoodTarget * treatFactor))
        : regularDayFoodTarget;

    dailyFoodBudget = isTodayTreatDay ? treatDayFoodTarget : regularDayFoodTarget;
    nextDayFlatFoodTarget =
      remainingDays > 1
        ? Math.max(0, Math.floor(Math.max(0, remainingFoodPool) / (remainingDays - 1)))
        : Math.max(0, remainingFoodPool);
  } else {
    const foodRatio = Number(user?.food_budget_ratio ?? 0.6);
    const ratioBasedFoodBudget = Math.floor(baseDailyBudgetToday * foodRatio);
    const foodCategoryBudgetRow = await db.queryOne(
      `SELECT amount FROM budgets
       WHERE deleted_at IS NULL AND period_id = ? AND category_id = 'cat-exp-food'
       LIMIT 1`,
      [period.id]
    );
    dailyFoodBudget = ratioBasedFoodBudget;
    if (foodCategoryBudgetRow) {
      const categoryRemainingBeforeToday = Number(foodCategoryBudgetRow.amount) - periodFoodBeforeToday;
      const categoryDailyCap = Math.max(0, Math.floor(categoryRemainingBeforeToday / remainingDays));
      dailyFoodBudget = Math.min(ratioBasedFoodBudget, categoryDailyCap);
    }
    flatDailyFoodTarget = dailyFoodBudget;
    regularDayFoodTarget = dailyFoodBudget;
    treatDayFoodTarget = Math.min(Math.max(0, safeBeforeTodayExpense), Math.floor(dailyFoodBudget * 1.45));
    nextDayFlatFoodTarget = dailyFoodBudget;
  }

  const remainingFoodToday = dailyFoodBudget - todayOperationalFoodExpense;
  const nonFoodSafeToSpend = useFixedFoodPool
    ? safeToSpend - Math.max(0, remainingFoodPool)
    : safeToSpend;
  const foodPoolExceedsSafeCash = useFixedFoodPool && remainingFoodPool > safeToSpend;

  // Slot allocation
  const breakfast = Math.floor(dailyFoodBudget * 0.2);
  const lunch = Math.floor(dailyFoodBudget * 0.4);
  const dinner = Math.floor(dailyFoodBudget * 0.35);
  const snack = Math.max(0, dailyFoodBudget - breakfast - lunch - dinner);

  // ==================== CALORIE & WEIGHT GUARDRAIL ====================
  const minDailyCalories = Math.max(1200, Number(user?.min_daily_calories ?? 1900));
  const minDailyProtein = Math.max(20, Number(user?.min_daily_protein ?? 50));
  const todayCalories = (Number(txAgg?.tx_calories_today) || 0) + (Number(freeMealAgg?.free_cal) || 0);
  const todayProtein = (Number(txAgg?.tx_protein_today) || 0) + (Number(freeMealAgg?.free_prot) || 0);
  const caloriesRemainingToday = Math.max(0, minDailyCalories - todayCalories);

  let calorieFeasibility;
  if (flatDailyFoodTarget >= 25000) {
    calorieFeasibility = {
      status: 'Nyaman',
      tone: 'aman',
      note: `Dengan jatah rata-rata ${formatIDR(flatDailyFoodTarget)}/hari, kebutuhan >= ${minDailyCalories} kkal/hari mudah dipenuhi (masak maupun beli).`
    };
  } else if (flatDailyFoodTarget >= 15000) {
    calorieFeasibility = {
      status: 'Cukup (Kombinasi Masak)',
      tone: 'aman',
      note: `Jatah ${formatIDR(flatDailyFoodTarget)}/hari aman menjaga berat badan bila rutin kombinasi masak nasi + lauk protein.`
    };
  } else if (flatDailyFoodTarget >= 8500) {
    calorieFeasibility = {
      status: 'Ketat — Wajib Masak Sendiri',
      tone: 'waspada',
      note: `Rata-rata ${formatIDR(flatDailyFoodTarget)}/hari sangat ketat untuk ${minDailyCalories} kkal/hari. Masak nasi di rice cooker & pilih bahan padat kalori-protein (telur, tempe, tahu, kacang, oatmeal) agar BB tidak turun.`
    };
  } else {
    calorieFeasibility = {
      status: 'Risiko Defisit Kalori',
      tone: 'danger',
      note: `Budget rata-rata ${formatIDR(flatDailyFoodTarget)}/hari berisiko membuat asupan di bawah ${minDailyCalories} kkal/hari (BB bisa turun). Pertimbangkan stok beras/lauk mentah atau naikkan budget makan.`
    };
  }

  // ==================== FINANCIAL HEALTH STATUS ====================
  const minHealthyMeal = Number(user?.min_daily_food_warning ?? 20000);
  let healthStatus = 'Aman';
  let healthReason = 'Dana aman terjaga dan kewajiban rutin sudah diperhitungkan.';

  if (safeToSpend <= 0) {
    healthStatus = 'Defisit';
    healthReason =
      'Saldo operasional belum cukup menutup seluruh tagihan belum dibayar & target cadangan.';
  } else if (useFixedFoodPool && remainingFoodPool < 0) {
    healthStatus = 'Waspada';
    healthReason = `Pengeluaran makan bulan ini (${formatIDR(periodFoodSpent)}) melewati target ${formatIDR(monthlyFoodBudget)}.`;
  } else if (foodPoolExceedsSafeCash) {
    healthStatus = 'Waspada';
    healthReason = `Dana aman tersisa (${formatIDR(safeToSpend)}) lebih kecil dari sisa target makan bulanan (${formatIDR(remainingFoodPool)}).`;
  } else if (!useFixedFoodPool && dailyFoodBudget < 10000) {
    healthStatus = 'Kritis';
    healthReason =
      'Budget makan harian sangat tipis (< Rp 10.000). Prioritaskan masak sendiri padat kalori-protein.';
  } else if (remainingDailyToday < 0) {
    healthStatus = 'Waspada';
    healthReason =
      'Pengeluaran hari ini melampaui batas harian; jatah harian esok otomatis dikurangi.';
  } else if (dailyFoodBudget < minHealthyMeal && !useFixedFoodPool) {
    healthStatus = 'Waspada';
    healthReason =
      'Budget makan harian di bawah ambang nyaman. Prioritaskan menu Hemat agar cukup sampai akhir periode.';
  }

  return {
    period,
    todayStr,
    remainingDays,
    totalDays,
    availableOperationalCash,
    lockedSavingsBalance,
    unpaidRecurringTotal,
    unpaidPlannedTotal,
    unpaidObligations,
    reserveTarget,
    netTransferredToSavings,
    remainingReserveAllocation,
    safeToSpend,
    nonFoodSafeToSpend,
    foodPoolExceedsSafeCash,
    safeBeforeTodayExpense,
    baseDailyBudgetToday,
    remainingDailyToday,
    foodBudgetMode,
    monthlyFoodBudget,
    periodFoodSpent,
    remainingFoodPoolStartOfToday,
    remainingFoodPool,
    flatDailyFoodTarget,
    regularDayFoodTarget,
    treatDayFoodTarget,
    nextDayFlatFoodTarget,
    treatMealsPerWeek,
    treatMealsUsedThisWeek,
    treatMealsRemainingThisWeek,
    isTodayTreatDay,
    dailyFoodBudget,
    remainingFoodToday,
    slotBudgets: { breakfast, lunch, dinner, snack },
    minDailyCalories,
    minDailyProtein,
    todayCalories,
    todayProtein,
    caloriesRemainingToday,
    calorieFeasibility,
    periodIncome,
    periodExpense,
    periodVariableExpense,
    todayOperationalExpense,
    todayTotalExpense,
    todayFoodExpense,
    todayOperationalFoodExpense,
    healthStatus,
    healthReason
  };
}
