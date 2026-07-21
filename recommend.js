// 純函式:依相對缺口挑出最該補的營養素(只看三大營養素)
// stats: { carbs: {gap, mid}, protein: {gap, mid}, fat: {gap, mid} }
// 回傳 'carbs' | 'protein' | 'fat',三項相對缺口皆 <= 0 時回傳 null
export function pickPriorityNutrient(stats) {
    let best = null;
    let bestRatio = 0;
    for (const key of ['carbs', 'protein', 'fat']) {
        const s = stats[key];
        if (!s || !s.mid || s.mid <= 0) continue;
        const ratio = Math.max(0, s.gap) / s.mid;
        if (ratio > bestRatio) {
            bestRatio = ratio;
            best = key;
        }
    }
    return best;
}
