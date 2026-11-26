import { computePeriodBounds, toDateString } from '../utils/date.js';
import { getUserProfile, upsertUserProfile } from '../repositories/userRepo.js';
import { closePeriod, createPeriod, getActivePeriod, updatePeriodSettings } from '../repositories/periodRepo.js';

/**
 * Sum current balance across operational wallets (include_in_daily_budget = 1).
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @returns {Promise<number>}
 */
async function getOperationalWalletBalanceSum(db) {
  const row = await db.queryOne(
    'SELECT COALESCE(SUM(balance), 0) AS total FROM wallets WHERE deleted_at IS NULL AND include_in_daily_budget = 1'
  );
  return Number(row?.total) || 0;
}

/**
 * Ensure an active financial_period exists covering todayStr.
 * Automatically closes expired periods and creates a new period preserving all past transaction history.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {string} [todayStr]
 */
export async function ensureActivePeriod(db, todayStr = toDateString()) {
  const user = await getUserProfile(db);
  if (!user || !user.onboarding_completed) {
    return getActivePeriod(db);
  }

  let active = await getActivePeriod(db);
  if (active && todayStr >= active.start_date && todayStr <= active.end_date) {
    return active;
  }

  return db.transaction(async () => {
    active = await getActivePeriod(db);
    if (active && todayStr > active.end_date) {
      await closePeriod(db, active.id);
    } else if (active && todayStr >= active.start_date && todayStr <= active.end_date) {
      return active;
    }

    const { startDate, endDate } = computePeriodBounds(todayStr, user.budget_period, user.income_day);
    const openingOperationalBalance = await getOperationalWalletBalanceSum(db);

    return createPeriod(db, {
      startDate,
      endDate,
      openingOperationalBalance,
      expectedIncome: user.monthly_income || 0,
      reserveTarget: user.reserve_target_amount || 0,
      foodBudgetTarget: user.monthly_food_budget || 0
    });
  });
}

/**
 * Update financial cycle & food target settings without losing any historical transactions (Rule #12).
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {Record<string, any>} settings
 * @param {string} [todayStr]
 */
export async function updateFinancialCycleSettings(db, settings, todayStr = toDateString()) {
  return db.transaction(async () => {
    const updatedUser = await upsertUserProfile(db, {
      budget_period: settings.budgetPeriod,
      income_day: settings.incomeDay,
      monthly_income: settings.monthlyIncome,
      reserve_target_amount: settings.reserveTargetAmount,
      food_budget_ratio: settings.foodBudgetRatio,
      food_budget_mode: settings.foodBudgetMode,
      monthly_food_budget: settings.monthlyFoodBudget,
      treat_meals_per_week: settings.treatMealsPerWeek,
      min_daily_calories: settings.minDailyCalories,
      min_daily_protein: settings.minDailyProtein,
      min_daily_food_warning: settings.minDailyFoodWarning
    });

    const active = await getActivePeriod(db);
    const { startDate, endDate } = computePeriodBounds(
      todayStr,
      updatedUser.budget_period,
      updatedUser.income_day
    );

    if (active) {
      await updatePeriodSettings(db, active.id, {
        startDate,
        endDate,
        expectedIncome: updatedUser.monthly_income,
        reserveTarget: updatedUser.reserve_target_amount,
        foodBudgetTarget: updatedUser.monthly_food_budget
      });
    } else {
      const openingOperationalBalance = await getOperationalWalletBalanceSum(db);
      await createPeriod(db, {
        startDate,
        endDate,
        openingOperationalBalance,
        expectedIncome: updatedUser.monthly_income,
        reserveTarget: updatedUser.reserve_target_amount,
        foodBudgetTarget: updatedUser.monthly_food_budget
      });
    }

    return updatedUser;
  });
}
