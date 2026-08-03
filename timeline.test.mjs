import assert from 'node:assert';
import {
    DEFAULT_MEAL_TIME, mealTime, mealTypeForTime,
    toMinutes, toHHMM, snapTime, buildTimeline
} from './timeline.js';

// --- mealTime: 有 time 就用 time ---
assert.strictEqual(mealTime({ type: 'lunch', time: '13:45' }), '13:45');

// --- mealTime: 舊資料無 time → 依餐別 fallback ---
assert.strictEqual(mealTime({ type: 'breakfast' }), '08:00');
assert.strictEqual(mealTime({ type: 'lunch' }), '12:00');
assert.strictEqual(mealTime({ type: 'dinner' }), '18:30');
assert.strictEqual(mealTime({ type: 'snack' }), '15:00');

// --- mealTime: type 也壞掉/缺失 → 落到 lunch 的預設值,不回傳 undefined ---
assert.strictEqual(mealTime({}), '12:00');
assert.strictEqual(mealTime({ type: 'brunch' }), '12:00');
assert.strictEqual(mealTime({ type: 'lunch', time: '' }), '12:00');

// --- toMinutes / toHHMM 互為反函式,且零填補 ---
assert.strictEqual(toMinutes('00:00'), 0);
assert.strictEqual(toMinutes('07:05'), 425);
assert.strictEqual(toMinutes('23:45'), 1425);
assert.strictEqual(toHHMM(0), '00:00');
assert.strictEqual(toHHMM(425), '07:05');
assert.strictEqual(toHHMM(1425), '23:45');

// --- mealTypeForTime: 邊界要明確,不能有兩個區間都成立的時間 ---
assert.strictEqual(mealTypeForTime('05:00'), 'breakfast'); // 05:00–10:29 早餐
assert.strictEqual(mealTypeForTime('10:29'), 'breakfast');
assert.strictEqual(mealTypeForTime('10:30'), 'lunch');     // 10:30–14:29 午餐
assert.strictEqual(mealTypeForTime('14:29'), 'lunch');
assert.strictEqual(mealTypeForTime('14:30'), 'snack');     // 14:30–16:59 點心
assert.strictEqual(mealTypeForTime('16:59'), 'snack');
assert.strictEqual(mealTypeForTime('17:00'), 'dinner');    // 17:00–20:59 晚餐
assert.strictEqual(mealTypeForTime('20:59'), 'dinner');
assert.strictEqual(mealTypeForTime('21:00'), 'snack');     // 21:00–04:59 宵夜歸點心
assert.strictEqual(mealTypeForTime('02:00'), 'snack');

// --- snapTime: 15 分鐘對齊 ---
assert.strictEqual(snapTime('12:00', 15), '12:15');
assert.strictEqual(snapTime('12:00', 7), '12:00');   // 7 分 → 四捨五入回 0 格
assert.strictEqual(snapTime('12:00', 8), '12:15');   // 8 分 → 進 1 格
assert.strictEqual(snapTime('12:00', -15), '11:45');
assert.strictEqual(snapTime('12:07', 0), '12:00');   // 起始時間本身也對齊到格線

// --- snapTime: clamp 在 00:00–23:45,不繞日 ---
assert.strictEqual(snapTime('00:00', -60), '00:00');
assert.strictEqual(snapTime('23:45', 60), '23:45');
assert.strictEqual(snapTime('23:00', 999), '23:45');

// --- buildTimeline: meals 與 workouts 交錯,按時間升冪 ---
const meals = [
    { type: 'dinner', name: '晚餐', time: '19:00' },
    { type: 'breakfast', name: '早餐', time: '08:10' },
    { type: 'snack', name: '宵夜', time: '21:30' },
];
const workouts = [
    { type: 'gym', duration: 45, time: '19:30' },
    { type: 'run', duration: 30, time: '07:00' },
];
const tl = buildTimeline(meals, workouts);
assert.deepStrictEqual(
    tl.map(r => [r.time, r.kind, r.originalIndex]),
    [
        ['07:00', 'workout', 1],
        ['08:10', 'meal', 1],
        ['19:00', 'meal', 0],
        ['19:30', 'workout', 0],
        ['21:30', 'meal', 2],
    ]
);
// originalIndex 必須指回原陣列位置,編輯/刪除靠它定位
assert.strictEqual(tl[1].data.name, '早餐');
assert.strictEqual(tl[0].data.duration, 30);

// --- buildTimeline: 舊資料無 time 也要能排 ---
assert.deepStrictEqual(
    buildTimeline([{ type: 'dinner', name: 'D' }, { type: 'breakfast', name: 'B' }], []).map(r => r.time),
    ['08:00', '18:30']
);

// --- buildTimeline: 同時間維持原有相對順序(穩定排序),餐點在前 ---
assert.deepStrictEqual(
    buildTimeline(
        [{ type: 'lunch', name: 'A', time: '12:00' }, { type: 'lunch', name: 'B', time: '12:00' }],
        [{ type: 'walk', duration: 10, time: '12:00' }]
    ).map(r => r.kind === 'meal' ? r.data.name : 'W'),
    ['A', 'B', 'W']
);

// --- buildTimeline: 缺 workouts(舊資料沒這個欄位)不當機 ---
assert.deepStrictEqual(buildTimeline([], undefined).length, 0);
assert.deepStrictEqual(buildTimeline(undefined, undefined).length, 0);

console.log('timeline tests passed');
