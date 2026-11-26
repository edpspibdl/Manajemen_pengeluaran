import { addDays, diffDays, toDateString } from '../utils/date.js';
import { formatIDR } from '../utils/currency.js';
import { getUserProfile } from '../repositories/userRepo.js';
import { listFoodItems, listFoodPreferences, listMealPlans, upsertMealPlanSlot } from '../repositories/foodRepo.js';

const EQUIPMENT_RANK = {
  none: ['none', 'kettle', 'rice_cooker', 'stove', 'fridge'],
  kettle: ['kettle', 'rice_cooker', 'stove'],
  rice_cooker: ['rice_cooker', 'stove'],
  stove: ['stove'],
  fridge: ['fridge']
};

const MEAL_LABELS = {
  breakfast: 'Sarapan',
  lunch: 'Makan Siang',
  dinner: 'Makan Malam',
  snack: 'Camilan'
};

function isEquipmentCompatible(requiredEq, userEquipmentList) {
  if (!requiredEq || requiredEq === 'none') return true;
  const userSet = new Set(userEquipmentList || ['none']);
  const allowed = EQUIPMENT_RANK[requiredEq] || [requiredEq];
  return allowed.some((eq) => userSet.has(eq));
}

function matchesPreferences(food, preferences) {
  const tags = new Set(food.tags || []);
  const nameLower = (food.name || '').toLowerCase();
  const ingLower = (food.ingredients || []).join(' ').toLowerCase();

  for (const pref of preferences) {
    const val = (pref.preference_value || '').toLowerCase();
    if (pref.preference_type === 'allergen') {
      if (val === 'seafood' && tags.has('seafood')) return false;
      if (val && (tags.has(val) || nameLower.includes(val) || ingLower.includes(val))) return false;
    }
    if (pref.preference_type === 'diet') {
      if (val === 'vegetarian' && !tags.has('vegetarian') && !tags.has('vegetarian_optional')) return false;
      if (val === 'no_spicy' && tags.has('spicy')) return false;
      if (val === 'halal' && tags.has('non_halal')) return false;
    }
    if (pref.preference_type === 'dislike') {
      if (val && (nameLower.includes(val) || ingLower.includes(val) || tags.has(val))) return false;
    }
  }
  return true;
}

/**
 * Recommend ranked food items for a meal slot respecting budget, equipment, preferences,
 * anti-monotony cooldown, and nutritional balance.
 */
export async function recommendForSlot(
  db,
  { mealDate = toDateString(), mealType = 'lunch', slotBudget, healthStatus = 'Aman', excludeFoodIds = [], isTreatSlot = false }
) {
  const user = await getUserProfile(db);
  let userEquipment = ['none'];
  try {
    userEquipment = JSON.parse(user?.cooking_equipment || '["none"]');
  } catch {
    userEquipment = ['none'];
  }

  const allFoods = await listFoodItems(db);
  const preferences = await listFoodPreferences(db);
  const favoriteTags = new Set(
    preferences.filter((p) => p.preference_type === 'favorite_tag').map((p) => p.preference_value.toLowerCase())
  );

  const recentStart = addDays(mealDate, -3);
  const recentPlans = await listMealPlans(db, { startDate: recentStart, endDate: mealDate });
  const recentUseMap = new Map();
  for (const plan of recentPlans) {
    if (plan.status === 'skipped') continue;
    const daysAgo = Math.max(0, diffDays(plan.meal_date, mealDate));
    const prev = recentUseMap.get(plan.food_item_id);
    if (prev === undefined || daysAgo < prev) {
      recentUseMap.set(plan.food_item_id, daysAgo);
    }
  }

  const excludedSet = new Set(excludeFoodIds);

  // Filter by slot, equipment, preferences
  const eligible = allFoods.filter((food) => {
    if (excludedSet.has(food.id)) return false;
    if (!food.suitable_meal_types.includes(mealType)) return false;
    if (!isEquipmentCompatible(food.required_equipment, userEquipment)) return false;
    if (!matchesPreferences(food, preferences)) return false;
    return true;
  });

  const capBudget = Math.max(0, Math.round(Number(slotBudget) || 0));
  let withinBudget = eligible.filter((f) => f.estimated_price <= capBudget);
  let overBudgetMode = false;

  if (withinBudget.length === 0 && eligible.length > 0) {
    // Fallback strictly to the cheapest compatible option flagged with warning
    const sortedCheap = [...eligible].sort((a, b) => a.estimated_price - b.estimated_price);
    withinBudget = sortedCheap.slice(0, 3);
    overBudgetMode = true;
  }

  const isTightBudget = healthStatus === 'Kritis' || healthStatus === 'Defisit' || capBudget <= 11000;

  const scored = withinBudget.map((food) => {
    let score = 50;

    // 1. Price fit & Calorie-per-Rupiah boost when budget is tight (prevent weight loss!)
    const cal = Number(food.calories) || 350;
    const calPer1000 = cal / Math.max(1, food.estimated_price / 1000);
    if (isTreatSlot) {
      // On Makan Enak days, prioritize higher-satisfaction/protein dishes within treat budget
      if (food.food_category === 'hemat' || food.food_category === 'normal' || food.food_category === 'fleksibel') {
        score += 22;
      }
      if (food.has_protein) score += 16;
    } else if (isTightBudget) {
      score += Math.max(0, 22 - Math.round(food.estimated_price / 1000));
      score += Math.min(30, Math.round(calPer1000 * 0.45));
    } else if (capBudget > 0) {
      const ratio = food.estimated_price / capBudget;
      if (ratio >= 0.45 && ratio <= 0.95) score += 20;
      else if (ratio < 0.45) score += 8;
    }

    // 2. Nutrition & weight-maintenance guardrail
    if (food.has_protein && food.has_vegetable) score += 26;
    else if (food.has_protein) score += 15;
    else if (food.has_vegetable) score += 8;
    if (cal >= 500) score += 12;

    // 3. Anti-monotony cooldown
    const daysAgoUsed = recentUseMap.get(food.id);
    if (daysAgoUsed === 0) score -= 90;
    else if (daysAgoUsed === 1) score -= 70;
    else if (daysAgoUsed === 2) score -= 45;
    else if (daysAgoUsed === 3) score -= 20;
    else score += 12;

    // 4. Favorites & tags
    if (food.is_favorite) score += 15;
    if ((food.tags || []).some((t) => favoriteTags.has(t.toLowerCase()))) score += 10;

    // Build contextual explanation
    const reasons = [];
    if (overBudgetMode) {
      reasons.push(`Opsi termurah tersedia (melebihi jatah ${formatIDR(capBudget)})`);
    } else if (isTreatSlot) {
      reasons.push(`Cocok untuk Makan Enak (${formatIDR(food.estimated_price)} <= ${formatIDR(capBudget)})`);
    } else {
      reasons.push(`Masuk target (${formatIDR(food.estimated_price)} <= ${formatIDR(capBudget)})`);
    }
    if (cal >= 500) reasons.push(`Padat energi ${cal} kkal (jaga BB)`);
    if (food.has_protein && food.has_vegetable) reasons.push('Gizi seimbang protein & sayur');
    else if (food.has_protein) reasons.push('Tinggi protein');
    if (food.preparation_type === 'masak') reasons.push('Masak hemat di kos');
    if (daysAgoUsed === undefined) reasons.push('Menu variatif');

    return {
      ...food,
      score,
      overBudget: overBudgetMode || food.estimated_price > capBudget,
      reason: reasons.join(' • ')
    };
  });

  scored.sort((a, b) => b.score - a.score || a.estimated_price - b.estimated_price);
  return scored;
}

/**
 * Generate a daily or multi-day (weekly) meal plan respecting daily food budget.
 */
export async function generateMealPlanRange(
  db,
  { startDate = toDateString(), days = 1, budgetSummary }
) {
  const createdIds = [];
  const dailyFoodBudget = Math.max(0, Number(budgetSummary?.dailyFoodBudget) || 30000);
  const slotRatios = { breakfast: 0.2, lunch: 0.4, dinner: 0.35, snack: 0.05 };

  const treatMealsPerWeek = Math.max(0, Math.min(7, Number(budgetSummary?.treatMealsPerWeek ?? 3)));
  const treatSlotsEvery = treatMealsPerWeek > 0 ? Math.max(1, Math.floor(7 / treatMealsPerWeek)) : 99;

  for (let d = 0; d < days; d += 1) {
    const mealDate = addDays(startDate, d);
    const isTreatDay =
      (d === 0 && Boolean(budgetSummary?.isTodayTreatDay)) ||
      (treatMealsPerWeek > 0 && d > 0 && d % treatSlotsEvery === 0);
    const dayTarget = isTreatDay
      ? Number(budgetSummary?.treatDayFoodTarget || dailyFoodBudget)
      : Number(budgetSummary?.regularDayFoodTarget || dailyFoodBudget);

    const existingForDate = await listMealPlans(db, { startDate: mealDate, endDate: mealDate });
    const usedTodayIds = existingForDate.map((m) => m.food_item_id);
    const existingSlots = new Map(existingForDate.map((m) => [m.meal_type, m]));

    let spentOrPlannedToday = existingForDate
      .filter((m) => m.status !== 'skipped')
      .reduce((acc, m) => acc + (m.actual_cost ?? m.estimated_cost ?? 0), 0);

    const slotsToFill = ['breakfast', 'lunch', 'dinner'];
    if (dayTarget >= 35000) {
      slotsToFill.push('snack');
    }

    for (const slot of slotsToFill) {
      const existing = existingSlots.get(slot);
      if (existing && existing.status === 'consumed') continue;

      const remainingTodayForFood = Math.max(0, dayTarget - spentOrPlannedToday);
      const targetSlotBudget = Math.min(
        remainingTodayForFood || Math.floor(dayTarget * slotRatios[slot]),
        Math.floor(dayTarget * slotRatios[slot]) + 2000
      );

      const candidates = await recommendForSlot(db, {
        mealDate,
        mealType: slot,
        slotBudget: targetSlotBudget,
        healthStatus: budgetSummary?.healthStatus || 'Aman',
        excludeFoodIds: usedTodayIds,
        isTreatSlot: isTreatDay && (slot === 'lunch' || slot === 'dinner')
      });

      if (candidates.length > 0) {
        const picked = candidates[0];
        const planId = await upsertMealPlanSlot(db, {
          mealDate,
          mealType: slot,
          foodItemId: picked.id,
          estimatedCost: picked.estimated_price
        });
        createdIds.push(planId);
        usedTodayIds.push(picked.id);
        spentOrPlannedToday += picked.estimated_price;
      }
    }
  }

  return createdIds;
}
