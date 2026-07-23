// 體重 gauge 資料。App 無「起始體重」，故非進度弧，而是「離目標接近度」：
// 越接近目標弧越滿、達標填滿。只依賴 目前 + 目標，穩定。
// ponytail: capPct=0.35 為校準旋鈕——超出目標 35% 時弧歸零；覺得起始太空/太滿就調它。
export function weightGaugeData(weight, target, capPct = 0.35) {
    const t = Number(target), w = Number(weight);
    if (!target || isNaN(t) || t <= 0 || isNaN(w)) return { hasTarget: false };
    const reached = w <= t;
    const over = (w - t) / t;
    const fill = reached ? 1 : Math.max(0, Math.min(1, 1 - over / capPct));
    return {
        hasTarget: true, reached,
        remaining: Math.max(0, Math.round((w - t) * 10) / 10),
        fill, current: w, target: t,
    };
}
