import { generateUUID } from '../utils/uuid.js';
import { toIsoUtc } from '../utils/date.js';
import { createTransaction } from './transactionRepo.js';

function parseFoodRow(row) {
  if (!row) return null;
  return {
    ...row,
    suitable_meal_types: safeParseJsonArray(row.suitable_meal_types),
    ingredients: safeParseJsonArray(row.ingredients),
    tags: safeParseJsonArray(row.tags)
  };
}

function safeParseJsonArray(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function listFoodItems(db) {
  const rows = await db.query(
    `SELECT * FROM food_items WHERE deleted_at IS NULL ORDER BY is_favorite DESC, estimated_price ASC, name ASC`
  );
  return rows.map(parseFoodRow);
}

export async function getFoodItemById(db, id) {
  const row = await db.queryOne('SELECT * FROM food_items WHERE id = ? AND deleted_at IS NULL', [id]);
  return parseFoodRow(row);
}

export async function updateFoodPrice(db, id, newPrice) {
  const price = Math.max(0, Math.round(Number(newPrice) || 0));
  await db.run(
    'UPDATE food_items SET estimated_price = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [price, toIsoUtc(), id]
  );
  return getFoodItemById(db, id);
}

export async function resetFoodPrice(db, id) {
  await db.run(
    'UPDATE food_items SET estimated_price = default_price, updated_at = ? WHERE id = ? AND deleted_at IS NULL',
    [toIsoUtc(), id]
  );
  return getFoodItemById(db, id);
}

export async function toggleFoodFavorite(db, id) {
  const item = await getFoodItemById(db, id);
  if (!item) throw new Error('Menu tidak ditemukan.');
  const nextVal = item.is_favorite ? 0 : 1;
  await db.run('UPDATE food_items SET is_favorite = ?, updated_at = ? WHERE id = ?', [nextVal, toIsoUtc(), id]);
  return getFoodItemById(db, id);
}

export async function createCustomFoodItem(db, data) {
  const price = Math.max(0, Math.round(Number(data.estimatedPrice) || 0));
  const category =
    price <= 10000
      ? 'super_hemat'
      : price <= 16000
        ? 'hemat'
        : price <= 25000
          ? 'normal'
          : 'fleksibel';
  const id = generateUUID();
  const now = toIsoUtc();

  await db.run(
    `INSERT INTO food_items (
      id, name, default_price, estimated_price, calories, protein,
      food_category, preparation_type, required_equipment, suitable_meal_types,
      ingredients, instructions, tags, has_protein, has_vegetable,
      is_favorite, is_custom, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, NULL)`,
    [
      id,
      data.name.trim(),
      price,
      price,
      data.calories ? Math.round(Number(data.calories)) : null,
      data.protein ? Number(data.protein) : null,
      data.foodCategory || category,
      data.preparationType || 'beli',
      data.requiredEquipment || 'none',
      JSON.stringify(data.suitableMealTypes || ['lunch', 'dinner']),
      JSON.stringify(data.ingredients || []),
      data.instructions || '',
      JSON.stringify(data.tags || ['halal']),
      data.hasProtein ? 1 : 0,
      data.hasVegetable ? 1 : 0,
      now,
      now
    ]
  );
  return getFoodItemById(db, id);
}

// ==================== MEAL PLANS ====================

export async function listMealPlans(db, { startDate, endDate }) {
  const rows = await db.query(
    `SELECT mp.*, f.name AS food_name, f.estimated_price AS current_food_price,
            f.calories, f.protein, f.food_category, f.preparation_type, f.required_equipment,
            f.ingredients, f.instructions, f.is_favorite, f.has_protein, f.has_vegetable
     FROM meal_plans mp
     JOIN food_items f ON f.id = mp.food_item_id
     WHERE mp.deleted_at IS NULL
       AND mp.meal_date >= ?
       AND mp.meal_date <= ?
     ORDER BY mp.meal_date ASC,
              CASE mp.meal_type
                WHEN 'breakfast' THEN 1
                WHEN 'lunch' THEN 2
                WHEN 'dinner' THEN 3
                ELSE 4
              END ASC`,
    [startDate, endDate]
  );

  return rows.map((r) => ({
    ...r,
    ingredients: safeParseJsonArray(r.ingredients)
  }));
}

export async function upsertMealPlanSlot(db, { mealDate, mealType, foodItemId, estimatedCost }) {
  const now = toIsoUtc();
  const existing = await db.queryOne(
    `SELECT * FROM meal_plans WHERE meal_date = ? AND meal_type = ? AND deleted_at IS NULL`,
    [mealDate, mealType]
  );

  const cost = Math.max(0, Math.round(Number(estimatedCost) || 0));
  if (existing) {
    if (existing.status === 'consumed') {
      throw new Error('Slot makan ini sudah ditandai selesai dikonsumsi.');
    }
    await db.run(
      `UPDATE meal_plans SET food_item_id = ?, estimated_cost = ?, status = 'planned', updated_at = ? WHERE id = ?`,
      [foodItemId, cost, now, existing.id]
    );
    return existing.id;
  }

  const id = generateUUID();
  await db.run(
    `INSERT INTO meal_plans (
      id, meal_date, meal_type, food_item_id, estimated_cost, actual_cost,
      status, transaction_id, notes, created_at, updated_at, deleted_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 'planned', NULL, NULL, ?, ?, NULL)`,
    [id, mealDate, mealType, foodItemId, cost, now, now]
  );
  return id;
}

/**
 * Mark meal as consumed and atomically create an expense transaction if cost > 0.
 */
export async function consumeMealPlan(db, { mealPlanId, walletId, periodId, actualCost, recordExpense = true, isTreatMeal = false }) {
  const plan = await db.queryOne(
    `SELECT mp.*, f.name AS food_name, f.calories, f.protein FROM meal_plans mp JOIN food_items f ON f.id = mp.food_item_id
     WHERE mp.id = ? AND mp.deleted_at IS NULL`,
    [mealPlanId]
  );
  if (!plan) throw new Error('Rencana makan tidak ditemukan.');
  if (plan.status === 'consumed' && plan.transaction_id) {
    throw new Error('Pengeluaran untuk menu ini sudah tercatat.');
  }

  const now = toIsoUtc();
  const cost = recordExpense ? Math.max(0, Math.round(Number(actualCost ?? plan.estimated_cost))) : 0;

  return db.transaction(async () => {
    let txId = null;
    if (recordExpense && cost > 0) {
      if (!walletId) throw new Error('Pilih dompet untuk mencatat pengeluaran makan.');
      const tx = await createTransaction(db, {
        periodId,
        walletId,
        categoryId: 'cat-exp-food',
        type: 'expense',
        amount: cost,
        transactionDate: `${plan.meal_date} ${new Date().toTimeString().slice(0, 8)}`,
        description: `Makan: ${plan.food_name}`,
        isUnexpected: false,
        mealSlot: plan.meal_type,
        calories: plan.calories ?? null,
        protein: plan.protein ?? null,
        isTreatMeal
      });
      txId = tx.id;
    }

    await db.run(
      `UPDATE meal_plans SET status = 'consumed', actual_cost = ?, transaction_id = ?, updated_at = ? WHERE id = ?`,
      [cost, txId, now, plan.id]
    );
    return { mealPlanId: plan.id, transactionId: txId, actualCost: cost };
  });
}

export async function skipMealPlan(db, mealPlanId) {
  await db.run(
    `UPDATE meal_plans SET status = 'skipped', updated_at = ? WHERE id = ? AND status = 'planned'`,
    [toIsoUtc(), mealPlanId]
  );
}

// ==================== FOOD PREFERENCES ====================

export async function listFoodPreferences(db) {
  return db.query('SELECT * FROM food_preferences WHERE deleted_at IS NULL ORDER BY preference_type, preference_value');
}

export async function replaceFoodPreferences(db, items) {
  const now = toIsoUtc();
  await db.transaction(async () => {
    await db.run('DELETE FROM food_preferences');
    for (const item of items) {
      await db.run(
        `INSERT INTO food_preferences (id, preference_type, preference_value, created_at, updated_at, deleted_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [generateUUID(), item.preferenceType, item.preferenceValue, now, now]
      );
    }
  });
  return listFoodPreferences(db);
}
