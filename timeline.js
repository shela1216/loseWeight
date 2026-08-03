// 餐點時間軸的純邏輯:預設時間 fallback、時間換算、時間軸合併排序
// 時間一律為 'HH:MM' 24 小時制零填補字串,字典序即時間序

export const DEFAULT_MEAL_TIME = {
    breakfast: '08:00',
    lunch: '12:00',
    dinner: '18:30',
    snack: '15:00'
};

const STEP = 15;          // 拖曳調時間的最小格
const MIN_MINUTES = 0;    // 00:00
const MAX_MINUTES = 1425; // 23:45

// 舊資料沒有 time 欄位,依餐別給預設值;餐別也壞掉時落到午餐,避免回傳 undefined 讓排序爆掉
export function mealTime(meal) {
    return (meal && meal.time) || DEFAULT_MEAL_TIME[meal && meal.type] || DEFAULT_MEAL_TIME.lunch;
}

// 新增餐點時依當下時間推導餐別。21:00 之後與凌晨都算點心(宵夜)
export function mealTypeForTime(hhmm) {
    const m = toMinutes(hhmm);
    if (m >= 630 && m < 870) return 'lunch';      // 10:30–14:29
    if (m >= 870 && m < 1020) return 'snack';     // 14:30–16:59
    if (m >= 1020 && m < 1260) return 'dinner';   // 17:00–20:59
    if (m >= 300 && m < 630) return 'breakfast';  // 05:00–10:29
    return 'snack';                               // 21:00–04:59
}

export function toMinutes(hhmm) {
    const [h, m] = String(hhmm).split(':');
    return (Number(h) || 0) * 60 + (Number(m) || 0);
}

export function toHHMM(minutes) {
    const m = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES + STEP - 1, Math.round(minutes)));
    return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// 拖曳位移換算時間:對齊到 15 分鐘格線,並 clamp 在 00:00–23:45 不繞日
export function snapTime(startHHMM, deltaMinutes) {
    const base = Math.round(toMinutes(startHHMM) / STEP) * STEP;
    const steps = Math.round((Number(deltaMinutes) || 0) / STEP);
    const next = Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, base + steps * STEP));
    return toHHMM(next);
}

// 合併餐點與運動成單一時間軸。originalIndex 指回原陣列位置,供編輯/刪除定位
export function buildTimeline(meals, workouts) {
    const rows = [];
    (meals || []).forEach((data, originalIndex) => {
        rows.push({ kind: 'meal', time: mealTime(data), originalIndex, data });
    });
    (workouts || []).forEach((data, originalIndex) => {
        rows.push({ kind: 'workout', time: data.time || '00:00', originalIndex, data });
    });
    // Array.prototype.sort 在現代引擎為穩定排序,同時間維持推入順序(餐點在前)
    return rows.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}
