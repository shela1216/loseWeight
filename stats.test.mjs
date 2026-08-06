import assert from 'node:assert';
import { topMealRanking } from './stats.js';

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

console.log('stats tests passed');
