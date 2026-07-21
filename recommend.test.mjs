import assert from 'node:assert';
import { pickPriorityNutrient } from './recommend.js';

// 蛋白質相對缺最多(0.5 > 0.1)→ 選 protein
assert.strictEqual(pickPriorityNutrient({
    carbs:   { gap: 20, mid: 200 }, // 0.10
    protein: { gap: 60, mid: 120 }, // 0.50
    fat:     { gap: 5,  mid: 50  }, // 0.10
}), 'protein');

// 三項皆達標(gap <= 0)→ null
assert.strictEqual(pickPriorityNutrient({
    carbs:   { gap: -10, mid: 200 },
    protein: { gap: 0,   mid: 120 },
    fat:     { gap: -5,  mid: 50  },
}), null);

// mid=0 不當機、該項略過,改選 protein
assert.strictEqual(pickPriorityNutrient({
    carbs:   { gap: 10, mid: 0   },
    protein: { gap: 5,  mid: 100 }, // 0.05
    fat:     { gap: 0,  mid: 50  },
}), 'protein');

console.log('recommend tests passed');
