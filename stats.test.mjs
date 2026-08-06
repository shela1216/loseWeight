import assert from 'node:assert';
import { topMealRanking, paginate, monthsInRange } from './stats.js';

// 組合餐點本身與品項都計次;同名跨天累加
assert.deepStrictEqual(topMealRanking([
    { name: '雞胸便當', items: [{ name: '雞胸肉' }, { name: '白飯' }] },
    { name: '雞胸便當', items: [{ name: '雞胸肉' }, { name: '地瓜' }] },
    { name: '蛋白飲' },
], 3), [
    { name: '雞胸便當', count: 2 },
    { name: '雞胸肉', count: 2 },
    { name: '地瓜', count: 1 },   // 同為 1 次時按名稱排序,'地瓜' < '白飯' < '蛋白飲'
]);

// 空名稱、缺 items、null 都不當機也不列入
assert.deepStrictEqual(topMealRanking([
    { name: '  ' },
    { name: '燕麥' },
    { name: '燕麥', items: null },
    null,
]), [{ name: '燕麥', count: 2 }]);

// 沒資料回空陣列
assert.deepStrictEqual(topMealRanking([]), []);
assert.deepStrictEqual(topMealRanking(undefined), []);

// --- paginate ---

// 內容比一頁短 → 單頁
assert.deepStrictEqual(paginate(80, 100, [30]), [{ start: 0, end: 80 }]);

// 沒有斷點 → 等分硬切,最後一頁補到底
assert.deepStrictEqual(paginate(250, 100, []), [
    { start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 250 },
]);

// 有斷點 → 退回到該頁放得下的最後一個斷點
assert.deepStrictEqual(paginate(250, 100, [40, 90, 130, 185]), [
    { start: 0, end: 90 },    // 90 是 <=100 的最後一個斷點
    { start: 90, end: 185 },  // 130 也放得下但 185 更滿
    { start: 185, end: 250 },
]);

// 斷點太靠頁首(<20%)不採用,改硬切,避免產生近乎空白的一頁
assert.deepStrictEqual(paginate(150, 100, [10]), [
    { start: 0, end: 100 }, { start: 100, end: 150 },
]);

// 單一超長區塊(斷點之間就大於一頁)仍會前進,不會無限迴圈
assert.deepStrictEqual(paginate(300, 100, [250]), [
    { start: 0, end: 100 }, { start: 100, end: 200 }, { start: 200, end: 300 },
]);

// 每頁必須首尾相接且覆蓋完整高度
const pages = paginate(1000, 297, [50, 300, 420, 700, 880]);
assert.strictEqual(pages[0].start, 0);
assert.strictEqual(pages[pages.length - 1].end, 1000);
pages.forEach((p, i) => {
    assert.ok(p.end > p.start, '每頁高度必須為正');
    if (i > 0) assert.strictEqual(p.start, pages[i - 1].end, '頁與頁之間不能有縫或重疊');
});

// 無效輸入 → 空陣列(不當機)
assert.deepStrictEqual(paginate(0, 100, []), []);
assert.deepStrictEqual(paginate(100, 0, []), []);

// --- monthsInRange ---

// 同月 → 一個月
assert.deepStrictEqual(monthsInRange('2026-03-05', '2026-03-28'), ['2026-03']);

// 跨月 → 含頭尾每一個月
assert.deepStrictEqual(monthsInRange('2026-01-28', '2026-04-02'),
    ['2026-01', '2026-02', '2026-03', '2026-04']);

// 跨年 → 月份正確進位、不會卡在 12 月
assert.deepStrictEqual(monthsInRange('2025-11-15', '2026-02-01'),
    ['2025-11', '2025-12', '2026-01', '2026-02']);

// 從 1/31 起算不會因 setMonth 溢位跳過 2 月
assert.deepStrictEqual(monthsInRange('2026-01-31', '2026-03-31'),
    ['2026-01', '2026-02', '2026-03']);

// 起訖同一天 → 一個月
assert.deepStrictEqual(monthsInRange('2026-06-10', '2026-06-10'), ['2026-06']);

// 顛倒或無效日期 → 空陣列(不當機)
assert.deepStrictEqual(monthsInRange('2026-05-01', '2026-04-01'), []);
assert.deepStrictEqual(monthsInRange('', '2026-04-01'), []);
assert.deepStrictEqual(monthsInRange('abc', 'def'), []);

console.log('stats tests passed');
