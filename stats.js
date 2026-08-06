// 報告統計與分頁的純邏輯

// 把一張長圖切成多頁。cuts 是「可安全斷開」的 y 座標(各區塊的頂端),
// 每頁盡量塞滿再退回到最後一個放得下的斷點,避免橫切穿內容。
// 回傳 [{start, end}],保證遞增且完整覆蓋 0..totalHeight。
export function paginate(totalHeight, pageHeight, cuts = []) {
    if (!(totalHeight > 0) || !(pageHeight > 0)) return [];
    const safe = [...new Set(cuts)].filter(c => c > 0 && c < totalHeight).sort((a, b) => a - b);
    const pages = [];
    let y = 0;
    while (y < totalHeight) {
        const limit = y + pageHeight;
        if (limit >= totalHeight) { pages.push({ start: y, end: totalHeight }); break; }
        // 太靠頁首的斷點不用,否則會生出一頁幾乎空白的紙
        const min = y + pageHeight * 0.2;
        let end = 0;
        for (const c of safe) if (c > min && c <= limit) end = c;
        // 找不到斷點就硬切:寧可切到單一超長區塊,也不能卡住不前進
        pages.push({ start: y, end: end || limit });
        y = end || limit;
    }
    return pages;
}

// 列出日期區間跨到的每一個月(含頭尾),格式 'YYYY-MM'。
// 資料是分月按需載入的,匯出前要靠這份清單把沒載入的月份補齊。
export function monthsInRange(startStr, endStr) {
    const start = new Date(startStr);
    const end = new Date(endStr);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
    const out = [];
    const m = new Date(start.getFullYear(), start.getMonth(), 1);
    const last = new Date(end.getFullYear(), end.getMonth(), 1);
    while (m <= last) {
        out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`);
        m.setMonth(m.getMonth() + 1);
    }
    return out;
}

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
