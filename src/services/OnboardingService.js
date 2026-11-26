import { computeInitialDueDate, computePeriodBounds, toDateString } from '../utils/date.js';
import { upsertUserProfile } from '../repositories/userRepo.js';
import { createPeriod } from '../repositories/periodRepo.js';
import { createWallet } from '../repositories/walletRepo.js';
import { createRecurringExpense, createSavingsGoal } from '../repositories/financeExtrasRepo.js';
import { replaceFoodPreferences } from '../repositories/foodRepo.js';

/**
 * Complete first-run onboarding wizard atomically.
 * Creates real initial wallets & active financial period with zero dummy transactions.
 * @param {import('../db/database.js').DatabaseAdapter} db
 * @param {Record<string, any>} payload
 * @param {string} [todayStr]
 */
export async function completeOnboarding(db, payload, todayStr = toDateString()) {
  if (!payload.name || !payload.name.trim()) {
    throw new Error('Nama panggilan wajib diisi.');
  }

  const walletsInput = Array.isArray(payload.wallets) ? payload.wallets : [];
  if (walletsInput.length === 0) {
    throw new Error('Tambahkan minimal satu dompet operasional.');
  }

  const budgetPeriod = payload.budgetPeriod || 'monthly';
  const incomeDay = Number(payload.incomeDay) || 1;
  const monthlyIncome = Math.round(Number(payload.monthlyIncome) || 0);
  const reserveTargetAmount = Math.round(Number(payload.reserveTargetAmount) || 0);
  const monthlyFoodBudget = Math.round(Number(payload.monthlyFoodBudget) || 0);
  const foodBudgetMode = payload.foodBudgetMode || (monthlyFoodBudget > 0 ? 'fixed' : 'ratio');
  const foodBudgetRatio = Number(payload.foodBudgetRatio ?? 0.6);
  const treatMealsPerWeek = Math.max(0, Math.min(7, Number(payload.treatMealsPerWeek ?? 3)));
  const minDailyCalories = Math.max(1200, Math.round(Number(payload.minDailyCalories ?? 1900)));

  return db.transaction(async () => {
    const user = await upsertUserProfile(db, {
      name: payload.name.trim(),
      monthly_income: monthlyIncome,
      income_day: incomeDay,
      budget_period: budgetPeriod,
      food_budget_ratio: foodBudgetRatio,
      food_budget_mode: foodBudgetMode,
      monthly_food_budget: monthlyFoodBudget,
      treat_meals_per_week: treatMealsPerWeek,
      min_daily_calories: minDailyCalories,
      reserve_target_amount: reserveTargetAmount,
      cooking_equipment: payload.cookingEquipment || ['none'],
      onboarding_completed: 1
    });

    let openingOperationalBalance = 0;
    let firstSavingsWalletId = null;

    for (const w of walletsInput) {
      if (!w.name || !w.name.trim()) continue;
      const created = await createWallet(db, {
        name: w.name,
        walletType: w.walletType || 'cash',
        balance: Math.round(Number(w.balance) || 0)
      });
      if (created.include_in_daily_budget === 1) {
        openingOperationalBalance += created.balance;
      } else if (!firstSavingsWalletId) {
        firstSavingsWalletId = created.id;
      }
    }

    const { startDate, endDate } = computePeriodBounds(todayStr, budgetPeriod, incomeDay);
    await createPeriod(db, {
      startDate,
      endDate,
      openingOperationalBalance,
      expectedIncome: monthlyIncome,
      reserveTarget: reserveTargetAmount,
      foodBudgetTarget: monthlyFoodBudget
    });

    // Optional recurring bills entered during onboarding
    const bills = Array.isArray(payload.recurringBills) ? payload.recurringBills : [];
    for (const bill of bills) {
      if (!bill.name?.trim() || Number(bill.amount) <= 0) continue;
      await createRecurringExpense(db, {
        name: bill.name,
        amount: bill.amount,
        categoryId: bill.categoryId || 'cat-exp-kos',
        dueDay: Number(bill.dueDay) || 1,
        frequency: bill.frequency || 'monthly',
        nextDueDate: computeInitialDueDate(todayStr, Number(bill.dueDay) || 1, bill.frequency || 'monthly')
      });
    }

    // Create initial savings goal if target > 0
    if (reserveTargetAmount > 0 || (payload.savingsGoalTarget && Number(payload.savingsGoalTarget) > 0)) {
      await createSavingsGoal(db, {
        name: payload.savingsGoalName || 'Tabungan & Dana Darurat',
        walletId: firstSavingsWalletId,
        targetAmount: Math.round(Number(payload.savingsGoalTarget) || reserveTargetAmount * 3 || 1000000),
        monthlyAllocation: reserveTargetAmount,
        isEmergency: true
      });
    }

    if (Array.isArray(payload.foodPreferences)) {
      await replaceFoodPreferences(db, payload.foodPreferences);
    }

    return user;
  });
}
