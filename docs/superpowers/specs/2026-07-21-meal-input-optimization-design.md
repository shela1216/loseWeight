# 餐點輸入優化設計

日期:2026-07-21

## 目標

讓餐點輸入更順手,兩個功能:

1. **組合餐點帶入資料庫已有品項** — 建立組合餐時可直接引用 `templates`(食物資料庫)裡既有品項,不用重打營養素。
2. **DB 搜尋依目標缺口推薦排序** — 搜尋食物資料庫時,依當日目標缺口把「最該補的營養素」含量高的食物排在前面。

兩功能共用同一個改良後的 DB 搜尋 modal。

## 現況(參考)

- 全部邏輯在 [app.js](../../../app.js),markup 在 [index.html](../../../index.html)。
- 「食物資料庫」= `templates` reactive 物件,key 為 `name.toLowerCase().trim()`,每筆正規化為 `amount:1`,形狀 `{ type, name, amount:1, unit, calories, carbs, protein, fat, items?, count }`。
- 組合品項形狀 `{ name, amount, unit, calories, carbs, protein, fat, qInput }`,目前純文字手打,與 `templates` 無連結。`addItem`(app.js:327)推入空白列,`updateTotalsFromItems`(app.js:311)加總品項營養素到父餐點。
- DB 搜尋 modal(index.html:824-940):搜尋 `historySearch`、分頁籤 `historyTab`(general/combo)、排序 `historySortBy`(count/calories/carbs/protein/fat)+ `historySortOrder`。核心在 `mealHistory` computed(app.js:407-458),`sortScale` 對 `unit==='g'` 品項 ×100 做 per-100g 比較(count 除外)。點結果呼叫 `addFromHistory(item)`(app.js:477)加到當日餐點。
- 缺口:`getGap(type)`(app.js:1057)依 `{min,max}` goal 算剩餘;`getGoalMidpoint(type)`(app.js:1081)取範圍中點。皆基於目前選取日期(`selectedDate`)。

## 功能一:組合餐點帶入資料庫品項

兩種入口並存。

### 入口 A — 名稱欄自動完成

- 在每個組合品項的名稱輸入框下方,打字時即時列出 `templates` 中 `name.includes(term)`(不分大小寫)的品項,最多 6 筆。
- 點選 → 把該 template 的 `calories/carbs/protein/fat/unit` 複製進該組合品項,`name` 填入 template 名稱,`amount` 設為 1。
- 觸發 `updateTotalsFromItems` 重算父餐點總和。
- 用一個 reactive 記錄目前哪一列開著建議清單(例如 `activeSuggestItem` = 品項 index 或 null),避免所有列同時展開。

### 入口 B — 「從資料庫挑選」按鈕

- 每個組合品項列旁加一個小按鈕,點開現有 DB 搜尋 modal(含功能二推薦排序)。
- modal 新增 `pickMode` 狀態:記住要填回哪一個組合品項 index。
- `addFromHistory(item)` 在 `pickMode` 有值時,改為把品項營養素填回 `editingMeal.items[pickMode]` 並關閉 modal;`pickMode` 為 null 時維持現行「加到當日餐點」行為。
- 關閉 modal 時清掉 `pickMode`。

### 縮放行為

品項營養素直接複製 template 值(template 已 amount=1),沿用現有「品項營養素不隨 amount 縮放、由使用者自行輸入」的行為,不新增縮放邏輯。

## 功能二:DB 搜尋依缺口推薦排序

### 排序選項

- `historySortBy` 新增值 `recommend`(顯示「推薦(依缺口)」)。
- 打開 DB 搜尋 modal 時預設為 `recommend`。

### 推薦邏輯

只看三大營養素(碳/蛋白/脂肪,不含熱量):

1. 對 `carbs`、`protein`、`fat` 各算相對缺口:
   `ratio(key) = max(0, getGap(key)) / getGoalMidpoint(key)`
   (正規化成比例才能跨營養素比大小;`getGoalMidpoint` 為 0 時該項 ratio 視為 0,避免除以 0。)
2. 取 ratio 最大者為「優先補的營養素」`priorityNutrient`。
3. 食物依 `priorityNutrient` 含量由高到低排(沿用 `sortScale` 的 per-100g 比較,與既有排序一致)。
4. 三項 ratio 皆為 0(都已達標/超標)→ 退回用 `count` 排序。

### 提示

modal 頂端顯示一行,例如「目前推薦補:蛋白質」;無優先項(退回 count)時顯示對應文字(例如「三大營養素皆達標,依常用度排序」)。

### 缺口基準

用目前選取日期的 gap(`getGap` / `getGoalMidpoint` 本就基於 `selectedDate`),無需額外參數。

## 影響範圍

- **app.js**:`mealHistory` computed 加 `recommend` 分支 + `priorityNutrient` 計算(computed);組合品項自動完成的建議清單(computed + `activeSuggestItem` ref + 選取 handler);`addFromHistory` 加 `pickMode` 分支;`pickMode` ref;開 modal 的地方設預設排序為 `recommend`。
- **index.html**:組合品項列(655-697)加名稱自動完成下拉 + 「從資料庫挑選」按鈕;排序下拉(872-879)加 `recommend` 選項;modal 頂端(852 附近)加推薦提示行。
- 版號依 CLAUDE.md 規則 +MINOR(新功能),四處同步更新;service-worker 快取版號、index.html script 版本參數。

## 測試 / 驗證

- 推薦邏輯是純函式化的優先項判斷,加一個小自我檢查:給定假的 gap/midpoint,驗證 `priorityNutrient` 選出正確營養素、全達標時退回 count。
- 手動驗證:建組合餐用自動完成填一筆、用挑選按鈕填一筆,確認總和正確;DB 搜尋切到推薦排序,確認提示營養素與排序結果一致。

## 不做(YAGNI)

- 組合品項營養素隨 amount 縮放。
- 綜合加權分數排序(僅取單一最大缺口)。
- 熱量納入推薦。
- 模糊搜尋 / 營養素範圍篩選。
- 跨日累積缺口 / 週報。
