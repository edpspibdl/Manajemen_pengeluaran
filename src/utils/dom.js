/**
 * Escape HTML special characters to safely interpolate user-provided strings into templates.
 * @param {string | number | null | undefined} value
 * @returns {string}
 */
export function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const MEAL_TYPE_LABELS = {
  breakfast: 'Sarapan',
  lunch: 'Makan Siang',
  dinner: 'Makan Malam',
  snack: 'Camilan'
};

export const FOOD_CATEGORY_LABELS = {
  super_hemat: 'Super Hemat',
  hemat: 'Hemat',
  normal: 'Normal',
  fleksibel: 'Fleksibel'
};

export const EQUIPMENT_LABELS = {
  none: 'Beli Jadi / Tanpa Alat',
  kettle: 'Teko Listrik',
  rice_cooker: 'Rice Cooker',
  stove: 'Kompor / Dapur',
  fridge: 'Kulkas'
};
