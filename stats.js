// 報告統計的純邏輯

// 餐點重複次數排行。組合餐點本身與其所含品項都各算一次,
// 名稱去頭尾空白後比對,空名稱不列入。
export function topMealRanking(meals, limit = 5) {
    const count = new Map();
    const bump = (name) => {
        const key = String(name ?? '').trim();
        if (!key) return;
        count.set(key, (count.get(key) || 0) + 1);
    };
    (meals || []).forEach(m => {
        bump(m && m.name);
        ((m && m.items) || []).forEach(it => bump(it && it.name));
    });
    return [...count.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([name, n]) => ({ name, count: n }));
}
