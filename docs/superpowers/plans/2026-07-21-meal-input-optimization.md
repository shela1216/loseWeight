# 餐點輸入優化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓組合餐點可帶入資料庫既有品項(名稱自動完成 + 挑選按鈕),並讓食物資料庫搜尋依當日目標缺口把最該補的營養素排前面。

**Architecture:** 兩功能共用同一個改良後的「食物資料庫 Modal」。推薦排序的核心判斷抽成純函式(`recommend.js`)以便測試;缺口計算抽成本地 helper 供推薦排序與既有 `getGap`/`getGoalMidpoint` 共用。組合品項提供兩個帶入入口:名稱欄即時自動完成、以及開啟共用 Modal 的挑選按鈕(pick mode)。

**Tech Stack:** Vue 3(CDN, `createApp({ setup })`)、原生 ES module(`app.js` 以 `type="module"` 載入)、Tailwind class、Firestore 持久化。無建置工具、無測試框架 → 純函式測試用 `node` 直接跑 `.mjs`。

## Global Constraints

- 全部應用邏輯在 [app.js](../../../app.js);全部 markup 在 [index.html](../../../index.html)。沿用既有 class/命名風格,不重構無關程式。
- 「食物資料庫」= `templates` reactive 物件,每筆已正規化為 `amount:1`,形狀 `{ type, name, amount:1, unit, calories, carbs, protein, fat, items?, count }`。
- 組合品項營養素**不隨 amount 縮放**(沿用現況,由使用者輸入),帶入時直接複製 template 值。
- 缺口推薦**只看三大營養素**(`carbs`/`protein`/`fat`),不含熱量。
- 缺口基準為目前選取日期(`selectedDate`)。
- 版號規則(見 [CLAUDE.md](../../../CLAUDE.md)):本次為新功能 → MINOR +1 → `0.0.23` 變 `0.1.0`,四處同步(見 Task 5)。
- 繁體中文 UI 文案。

---

### Task 1: 推薦排序純函式 + 自我檢查

**Files:**
- Create: `recommend.js`
- Test: `recommend.test.mjs`

**Interfaces:**
- Produces: `pickPriorityNutrient(stats)` — `stats` 形狀 `{ carbs: {gap, mid}, protein: {gap, mid}, fat: {gap, mid} }`;回傳 `'carbs'|'protein'|'fat'` 或 `null`(三項相對缺口皆 ≤0)。相對缺口 = `max(0, gap) / mid`,取最大者;`mid <= 0` 的項目略過。

- [ ] **Step 1: 寫 failing test**

建立 `recommend.test.mjs`:

```js
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
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `node recommend.test.mjs`
Expected: FAIL —「Cannot find module './recommend.js'」或 import 錯誤。

- [ ] **Step 3: 寫最小實作**

建立 `recommend.js`:

```js
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
```

- [ ] **Step 4: 跑測試確認通過**

Run: `node recommend.test.mjs`
Expected: PASS — 印出 `recommend tests passed`,exit code 0。

- [ ] **Step 5: Commit**

```bash
git add recommend.js recommend.test.mjs
git commit -m "feat: 新增缺口推薦排序純函式 pickPriorityNutrient"
```

---

### Task 2: 食物資料庫依缺口推薦排序

把 Task 1 的純函式接進 `mealHistory` 排序,新增「推薦」排序選項並設為開啟 Modal 時的預設,加上推薦提示標籤。

**Files:**
- Modify: `app.js`(頂端 import;約 405 行新增本地 helper 與 `priorityNutrient`/`priorityNutrientLabel` computed;440-455 排序分支;`getGap`/`getGoalMidpoint` 改用 helper;新增 `openHistory`;return 物件補匯出)
- Modify: `index.html`(排序下拉新增選項;新增推薦提示標籤;開啟 Modal 的兩個按鈕改用 `openHistory()`)

**Interfaces:**
- Consumes: `pickPriorityNutrient`(Task 1)。
- Produces: `openHistory(pickIdx = null)`(Task 4 會用到 `pickIdx`,本 Task 只用 `null`);本地 helper `goalGap(type)`、`goalMidpoint(type)`;computed `priorityNutrient`、`priorityNutrientLabel`;ref `historyPickMode`(Task 4 使用)。

- [ ] **Step 1: 在 app.js 頂端加入 import**

`app.js:1-3` 已有 Firebase 的 ES import。在 `app.js:3`(最後一個 firebase import)**之後**、`app.js:5`(`const { createApp... } = Vue;`)之前插入:

```js
        import { pickPriorityNutrient } from './recommend.js';
```

（`app.js` 已是 ES module,支援 `import`;沿用同段縮排。）

- [ ] **Step 2: 新增缺口本地 helper 與推薦 computed**

在 `app.js:405`(`// 計算歷史紀錄 (食物資料庫)` 註解那一行)**之前**插入以下區塊。這些 helper 與既有 `getGap`(app.js:1057)/`getGoalMidpoint`(app.js:1081)邏輯相同,抽出來供推薦排序共用:

```js
                // 目標缺口/中點(本地版,供推薦排序與 return 物件的 getGap/getGoalMidpoint 共用)
                const goalMidpoint = (type) => {
                    const day = allData[selectedDate.value];
                    const plan = activePlan(selectedDate.value, day);
                    const goal = plan[type];
                    if (typeof goal === 'object' && goal !== null) return Math.round((goal.min + goal.max) / 2);
                    return goal || 1;
                };
                const goalGap = (type) => {
                    const day = allData[selectedDate.value];
                    const plan = activePlan(selectedDate.value, day);
                    const goal = plan[type];
                    const sum = (allData[selectedDate.value]?.meals || []).reduce((s, m) => s + (Number(m[type]) || 0), 0);
                    if (typeof goal === 'object' && goal !== null) {
                        const mid = Math.round((goal.min + goal.max) / 2);
                        if (sum < goal.min) return mid - sum;
                        if (sum > goal.max) return Math.round(goal.max - sum);
                        return Math.round(goal.max - sum);
                    }
                    return Math.round((goal || 0) - sum);
                };
                const priorityNutrient = computed(() => pickPriorityNutrient({
                    carbs:   { gap: goalGap('carbs'),   mid: goalMidpoint('carbs')   },
                    protein: { gap: goalGap('protein'), mid: goalMidpoint('protein') },
                    fat:     { gap: goalGap('fat'),     mid: goalMidpoint('fat')     },
                }));
                const priorityNutrientLabel = computed(() => {
                    const k = priorityNutrient.value;
                    if (!k) return '三大營養素皆達標,依常用度排序';
                    const map = { carbs: '淨碳水', protein: '蛋白質', fat: '脂肪' };
                    return '目前推薦補:' + map[k];
                });
```

- [ ] **Step 3: 在 mealHistory 排序加入 recommend 分支**

`app.js:434-448`,把排序區塊改成(在 `list.sort` 前先算好 `recKey`,避免每次比較重算):

```js
                    // 3. 排序邏輯
                    const sortBy = historySortBy.value;
                    const sortOrder = historySortOrder.value;

                    // 統一排序基準：g 單位的餐點換算為 per-100g 再比較
                    const sortScale = (item) => item.unit === 'g' ? 100 : 1;

                    // 推薦排序:取當日最該補的營養素;皆達標時 recKey 為 null → 退回次數排序
                    const recKey = sortBy === 'recommend' ? priorityNutrient.value : null;

                    list.sort((a, b) => {
                        let valA, valB;
                        if (sortBy === 'count' || (sortBy === 'recommend' && !recKey)) {
                            valA = a.count;
                            valB = b.count;
                        } else {
                            const key = sortBy === 'recommend' ? recKey : sortBy;
                            valA = (a[key] || 0) * sortScale(a);
                            valB = (b[key] || 0) * sortScale(b);
                        }

                        if (sortOrder === 'desc') {
                            return valB - valA;
                        } else {
                            return valA - valB;
                        }
                    });
```

- [ ] **Step 4: getGap/getGoalMidpoint 改用共用 helper(DRY)**

`app.js:1057-1070` 的 `getGap` 整段改為委派:

```js
                    getGap: (type) => goalGap(type),
```

`app.js:1081-1089` 的 `getGoalMidpoint` 整段改為委派:

```js
                    getGoalMidpoint: (type) => goalMidpoint(type),
```

（其餘 return 內容不動;`isGoalInRange`、`getGoalDisplay` 保持原樣。）

- [ ] **Step 5: 新增 openHistory 與 historyPickMode**

在 `app.js` 中 `addFromHistory`(477)**之前**插入:

```js
                const historyPickMode = ref(null); // null=加到當日;數字=填回組合品項 index
                const openHistory = (pickIdx = null) => {
                    historyPickMode.value = pickIdx;
                    historySortBy.value = 'recommend';
                    showHistory.value = true;
                };
```

- [ ] **Step 6: return 物件補匯出**

`app.js:1030` 起的 `return {` 物件內,補上新符號。在 `showHistory,`(app.js:1033)後面同一區塊加入:

```js
                    openHistory, historyPickMode, priorityNutrient, priorityNutrientLabel,
```

（`historySortBy` 已在 return 內,無需重加。）

- [ ] **Step 7: index.html 排序下拉新增「推薦」選項**

`index.html:874` 的 `<option value="count">次數</option>` 之前插入:

```html
                            <option value="recommend">推薦</option>
```

- [ ] **Step 8: index.html 加入推薦提示標籤**

`index.html:891`(排序那一行的 `</div>` 結束、`<div class="flex-1 overflow-y-auto...` 之前)插入:

```html
                    <div v-if="historySortBy === 'recommend'" class="px-2 mb-3 shrink-0">
                        <span class="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1.5 rounded-lg inline-block">{{ priorityNutrientLabel }}</span>
                    </div>
```

- [ ] **Step 9: 開啟 Modal 的按鈕改用 openHistory()**

`index.html:398`:`@click="showHistory = true"` 改為 `@click="openHistory()"`。
`index.html:622`:`@click="showHistory = true"` 改為 `@click="openHistory()"`。

- [ ] **Step 10: 手動驗證**

Run: 於瀏覽器開啟 app(或 `python3 -m http.server` 後開 `index.html`),硬重新整理。
Expected:
- 點食物資料庫按鈕 → Modal 開啟,排序下拉顯示「推薦」,頂端出現綠色提示標籤(例如「目前推薦補:蛋白質」),且列表確實把該營養素含量高的排前面。
- 切到「次數」再切回「推薦」排序正常。
- 主畫面缺口數字(getGap)與 macro 顯示不變(驗證 helper 委派未改變行為)。

- [ ] **Step 11: Commit**

```bash
git add app.js index.html
git commit -m "feat: 食物資料庫新增依缺口推薦排序(預設)與推薦提示"
```

---

### Task 3: 組合品項名稱自動完成(入口 A)

在組合品項的名稱欄打字時,即時列出 `templates` 中相符的一般品項,點選即帶入營養素。

**Files:**
- Modify: `app.js`(新增 `activeSuggestItem` ref、`itemSuggestions`、`applyItemSuggestion`;return 補匯出)
- Modify: `index.html:661`(名稱 input 包成含下拉的容器)

**Interfaces:**
- Consumes: `templates`、`updateTotalsFromItems`(app.js:311)。
- Produces: `activeSuggestItem`(ref,目前展開建議的品項 index 或 null)、`itemSuggestions(term)`(回傳最多 6 筆非組合 template)、`applyItemSuggestion(item, template)`。

- [ ] **Step 1: 新增 state 與函式**

在 `app.js` 的 `addItem`(327)**之前**插入:

```js
                const activeSuggestItem = ref(null); // 目前展開自動完成的組合品項 index
                const itemSuggestions = (term) => {
                    const q = (term || '').toLowerCase().trim();
                    if (!q) return [];
                    return Object.values(templates)
                        .filter(t => t && t.name && (!t.items || t.items.length === 0))
                        .filter(t => t.name.toLowerCase().includes(q))
                        .slice(0, 6);
                };
                const applyItemSuggestion = (item, template) => {
                    item.name = template.name;
                    item.unit = template.unit || '份';
                    item.amount = 1;
                    item.calories = Number(template.calories) || 0;
                    item.carbs = Number(template.carbs) || 0;
                    item.protein = Number(template.protein) || 0;
                    item.fat = Number(template.fat) || 0;
                    activeSuggestItem.value = null;
                    updateTotalsFromItems();
                };
```

- [ ] **Step 2: return 物件補匯出**

在 Task 2 Step 6 加入的那一行後,再加入:

```js
                    activeSuggestItem, itemSuggestions, applyItemSuggestion,
```

- [ ] **Step 3: 改寫名稱 input 為含下拉的容器**

`index.html:661` 整行(那個 `<input v-model="item.name" ...>`)替換為:

```html
                                    <div class="relative flex-1">
                                        <input v-model="item.name"
                                            @input="activeSuggestItem = idx; updateTotalsFromItems()"
                                            @focus="activeSuggestItem = idx"
                                            @blur="activeSuggestItem = null"
                                            class="w-full bg-white px-4 py-2.5 rounded-xl text-sm font-black outline-none border border-transparent focus:border-indigo-200 shadow-sm transition-all"
                                            placeholder="品項名稱 (如：蔥花蛋)">
                                        <div v-if="activeSuggestItem === idx && itemSuggestions(item.name).length > 0"
                                            class="absolute z-30 left-0 right-0 mt-1 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden">
                                            <button v-for="s in itemSuggestions(item.name)" :key="s.name" type="button"
                                                @mousedown.prevent="applyItemSuggestion(item, s)"
                                                class="w-full text-left px-4 py-2 text-xs font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex justify-between gap-2">
                                                <span class="truncate">{{ s.name }}</span>
                                                <span class="text-slate-300 shrink-0 whitespace-nowrap">{{ formatFloat(s.calories) }}kcal</span>
                                            </button>
                                        </div>
                                    </div>
```

（用 `@mousedown.prevent` 讓點選建議時 input 不先觸發 blur,確保選取成功;點別處才會 blur 關閉。）

- [ ] **Step 4: 手動驗證**

Expected:於新增/編輯餐點的組合品項區,新增一個品項,在名稱欄輸入資料庫既有品項的部分字串 → 下方出現建議清單 → 點一筆 → 名稱與四個營養素欄自動填入,且主餐點總計同步更新。輸入不存在字串時無下拉。

- [ ] **Step 5: Commit**

```bash
git add app.js index.html
git commit -m "feat: 組合品項名稱欄支援資料庫品項自動完成"
```

---

### Task 4: 組合品項「從資料庫挑選」按鈕(入口 B)

每個組合品項列加一個按鈕,開啟共用的食物資料庫 Modal(pick mode),選一筆後填回該品項。

**Files:**
- Modify: `app.js`(`addFromHistory` 加 pick mode 分支;新增 `closeHistory`;return 補匯出)
- Modify: `index.html`(品項列加挑選按鈕;Modal 關閉處改用 closeHistory 以重置 pickMode)

**Interfaces:**
- Consumes: `openHistory(pickIdx)`(Task 2)、`historyPickMode`(Task 2)、`editingMeal.items`、`updateTotalsFromItems`。
- Produces: `closeHistory()`(關閉 Modal 並清 `historyPickMode`)。

- [ ] **Step 1: addFromHistory 加入 pick mode 分支**

`app.js:477` 的 `addFromHistory` 函式,在函式**最上方**(`const newMeal = ...` 之前)插入:

```js
                    if (historyPickMode.value !== null) {
                        const item = editingMeal.items[historyPickMode.value];
                        if (item) {
                            item.name = meal.name;
                            item.unit = meal.unit || '份';
                            item.amount = 1;
                            item.calories = Number(meal.calories) || 0;
                            item.carbs = Number(meal.carbs) || 0;
                            item.protein = Number(meal.protein) || 0;
                            item.fat = Number(meal.fat) || 0;
                            updateTotalsFromItems();
                        }
                        historyPickMode.value = null;
                        showHistory.value = false;
                        return;
                    }
```

- [ ] **Step 2: 新增 closeHistory**

在 `app.js` 的 `openHistory`(Task 2 Step 5)後面插入:

```js
                const closeHistory = () => {
                    historyPickMode.value = null;
                    showHistory.value = false;
                };
```

- [ ] **Step 3: return 物件補匯出**

在先前加入的匯出行後,再加入:

```js
                    closeHistory,
```

- [ ] **Step 4: Modal 關閉處改用 closeHistory**

`index.html:826` 的 overlay:`@click="showHistory = false"` 改為 `@click="closeHistory()"`。
`index.html:841` 的關閉 X 按鈕:`@click="showHistory = false"` 改為 `@click="closeHistory()"`。

- [ ] **Step 5: 品項列加入「從資料庫挑選」按鈕**

`index.html:662` 的 `<div class="flex items-center gap-2 w-full sm:w-auto">` 之後、份量輸入框 `<div class="flex-1 sm:w-28 ...">`(663)之前,插入按鈕:

```html
                                        <button type="button" @click="openHistory(idx)" title="從資料庫挑選"
                                            class="w-10 shrink-0 flex items-center justify-center bg-indigo-50 text-indigo-500 rounded-xl hover:bg-indigo-100 transition-all active:scale-95">
                                            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                                                <path stroke-linecap="round" stroke-linejoin="round" d="M4 7v10c0 2 3 3 8 3s8-1 8-3V7M4 7c0 2 3 3 8 3s8-1 8-3M4 7c0-2 3-3 8-3s8 1 8 3" />
                                            </svg>
                                        </button>
```

- [ ] **Step 6: 手動驗證**

Expected:
- 組合品項列的挑選按鈕 → 開啟食物資料庫 Modal(預設推薦排序)→ 點任一筆 → Modal 關閉,該組合品項填入名稱與營養素,主餐點總計同步。
- 從一般入口(index.html:398/622)開啟 Modal 並點品項 → 維持「加到當日餐點」行為(pickMode 為 null)。
- 開啟 pick mode 後改用 X 或點遮罩關閉 → 再從一般入口開啟並點品項 → 不會誤填回組合品項(closeHistory 已清 pickMode)。

- [ ] **Step 7: Commit**

```bash
git add app.js index.html
git commit -m "feat: 組合品項新增從資料庫挑選按鈕(共用 Modal pick mode)"
```

---

### Task 5: 版號更新

**Files:**
- Modify: `app.js:22`、`app.js:307`、`service-worker.js:2`、`index.html:1609`

- [ ] **Step 1: 更新四處版號 0.0.23 → 0.1.0**

- `app.js:22`：`console.log('App initialization starting... v0.1.0');`
- `app.js:307`：`const appVersion = ref('0.1.0');`
- `service-worker.js:2`：`const CACHE_NAME = 'diet-tracker-v0.1.0';`
- `index.html:1609`：`<script type="module" src="app.js?v=0.1.0"></script>`

- [ ] **Step 2: 驗證**

Run: `grep -rn "0.0.23" app.js index.html service-worker.js`
Expected: 無輸出(舊版號已全部替換)。

- [ ] **Step 3: Commit**

```bash
git add app.js index.html service-worker.js
git commit -m "chore: 更新版本至 0.1.0（餐點輸入優化）"
```

---

## Self-Review

**Spec coverage:**
- 功能一入口 A(名稱自動完成)→ Task 3 ✓
- 功能一入口 B(挑選按鈕 + pick mode)→ Task 4 ✓
- 品項營養素直接複製不縮放 → Task 3 Step 1 / Task 4 Step 1 ✓
- 功能二 recommend 排序 + 只看三大營養素 + 相對缺口 + 皆達標退回 count → Task 1 + Task 2 ✓
- recommend 設為預設 → Task 2 Step 5(openHistory)✓
- 提示行 → Task 2 Step 8 ✓
- sortScale per-100g 沿用 → Task 2 Step 3 ✓
- 缺口基準用選取日期 → goalGap/goalMidpoint 沿用 activePlan/selectedDate ✓
- 自我檢查 → Task 1 ✓
- 版號四處 + SW + script 參數 → Task 5 ✓

**Placeholder scan:** 無 TBD/TODO;每個 code step 皆有完整程式碼。

**Type consistency:** `pickPriorityNutrient(stats)` 的 `stats` 形狀在 Task 1 定義、Task 2 Step 2 使用一致;`openHistory(pickIdx)`、`historyPickMode`、`activeSuggestItem`、`itemSuggestions`、`applyItemSuggestion`、`closeHistory` 命名跨 Task 一致。
