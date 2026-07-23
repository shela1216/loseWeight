import assert from 'node:assert';
import { weightGaugeData } from './weightGauge.js';

// 未設目標 → hasTarget:false
assert.strictEqual(weightGaugeData(78, null).hasTarget, false);
assert.strictEqual(weightGaugeData(78, 0).hasTarget, false);

// 已達標（目前 <= 目標）→ reached、fill=1、remaining=0
const r1 = weightGaugeData(64, 65);
assert.strictEqual(r1.reached, true);
assert.strictEqual(r1.fill, 1);
assert.strictEqual(r1.remaining, 0);

// 高於目標：越接近越滿，remaining 為差值
const r2 = weightGaugeData(70, 65); // over=5/65=0.0769, fill=1-0.0769/0.35≈0.78
assert.strictEqual(r2.reached, false);
assert.strictEqual(r2.remaining, 5);
assert.ok(r2.fill > 0.7 && r2.fill < 0.85, `fill=${r2.fill}`);

// 超出 cap → fill 夾為 0，不為負
const r3 = weightGaugeData(100, 65);
assert.strictEqual(r3.fill, 0);

// 體重無效（0 / null / 空）→ hasTarget:false，不誤報已達標
assert.strictEqual(weightGaugeData(0, 65).hasTarget, false);
assert.strictEqual(weightGaugeData(null, 65).hasTarget, false);

console.log('weightGauge tests passed');
