# 設計 Token 系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立一套設計 token（色彩/圓角/字級/間距），將全站硬寫的 Tailwind utility 遷移為語意化 class，統一品牌橘、消除 60 條深色模式 `!important` 覆寫。

**Architecture:** 在 `styles.css` 的 `:root`/`.dark` 定義 CSS 變數 token，於 `tailwind.config.js` 把變數註冊成語意色與圓角（主色用 `rgb(var(--x) / <alpha-value>)` 以支援透明度 utility），重新編譯 `tailwind.css`，再依「語意」逐項替換 `index.html`/`app.js` 的 utility。深淺色由變數自動切換，故 `.dark …!important` 覆寫整批刪除。

**Tech Stack:** Vue 3（CDN）、standalone Tailwind CSS v3.4.17 binary（無 npm）、原生 CSS 變數。

## Global Constraints

- 版本升至 `0.2.0`（架構調整=MINOR），完成時同步 CLAUDE.md 規定四處：`app.js` 的 `console.log('App initialization starting... v0.2.0')`、`app.js` 的 `const appVersion = ref('0.2.0')`、`service-worker.js` 的 `const CACHE_NAME = 'diet-tracker-v0.2.0'`、`index.html` 的 `<script type="module" src="app.js?v=0.2.0">`。
- UI 文案一律繁體中文。**不改任何功能邏輯、資料結構、事件行為**，僅動視覺層（class / CSS / 硬寫色）。
- Tailwind 重新編譯指令（每次改 `tailwind.config.js` 或新增用到的 class 後執行）：`export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`
- 回歸底線：`node --test recommend.test.mjs` 必須維持通過（純邏輯，不受視覺影響）。
- **遷移依語意判斷，非機械全域取代**：同一個 `indigo` 既是舊品牌也是「中碳日」分類色，務必分開處理（見 Task 2 / Task 4）。
- 每個遷移任務的驗收＝grep 計數歸零 + 實機淺色/深色目視。實機驗證：瀏覽器開 `index.html`，用設定頁的深色切換或 devtools 在 `<html>` 加/移除 `class="dark"`。

## 遷移基準數量（實作前 grep 計數，供驗收比對）

- `grep -o "indigo-[0-9]*" index.html app.js | wc -l` → **186**
- `grep -o "slate-[0-9]*" index.html app.js | wc -l` → **277**
- `grep -o "#f59e0b\|amber-[0-9]*" index.html app.js | wc -l` → **23**

## 色彩語意遷移對照表（全任務共用）

| 舊 | 新 | 說明 |
|---|---|---|
| 通用 `indigo-600/500`（按鈕/Logo/連結/focus） | `brand` | Task 2 |
| `indigo-50/100`（淡底/chip） | `brand-soft` | Task 2 |
| `text-slate-900/800` | `text-ink` | Task 3 |
| `text-slate-700/600/500/400` | `text-muted` | Task 3 |
| `text-slate-300`（極淡圖示） | `text-muted opacity-60` | Task 3 |
| `bg-white` | `bg-surface` | Task 3 |
| `bg-slate-50` | `bg-page` | Task 3 |
| `bg-slate-100` | `bg-line` | Task 3 |
| `border-slate-50/100/200` | `border-line` | Task 3 |
| 碳循環 hex map `#f59e0b/#6366f1/#f43f5e/#64748b` | `var(--c-high/med/low/rest)` | Task 4 |
| 高碳 `bg-amber-500` / `amber-*` | `bg-high` / `high` | Task 4 |
| 中碳 `bg-indigo-500`（planType 條件式） | `bg-med` | Task 4 |

---

### Task 1: 定義 tokens、註冊 Tailwind、重新編譯（基礎）

**Files:**
- Modify: `styles.css`（於檔首 `:root`/`.dark` 區塊，約 `styles.css:3-31`）
- Modify: `tailwind.config.js`
- Regenerate: `tailwind.css`（由 binary 產生，勿手改）

**Interfaces:**
- Produces：語意 class `bg-brand / text-brand / border-brand / bg-brand-soft / bg-surface / bg-page / text-ink / text-muted / border-line / bg-high / bg-med / bg-low / bg-rest / text-good / text-danger`；圓角 `rounded-sm/md/lg/xl`（值見下）；CSS 變數 `--c-*`、`--r-*`、`--c-brand-hover`。後續所有任務消費這些。

- [ ] **Step 1: 在 `styles.css` 現有 `:root` 內新增 token 變數（保留現有變數，新增以下；勿刪舊變數，Task 5 才清）**

```css
:root {
  /* === Design tokens (v0.2.0) === */
  --c-brand-rgb: 249 115 22;      /* #F97316 */
  --c-brand-hover: #EA6A0C;
  --c-brand-soft: #FEF0E6;
  --c-page: #F7F5F3;
  --c-surface: #FFFFFF;
  --c-ink-rgb: 36 26 20;          /* #241A14 */
  --c-muted: #6F675F;
  --c-line: #ECE7E2;
  --c-high: #10B981; --c-med: #6366F1; --c-low: #F43F5E; --c-rest: #64748B;
  --c-good: #14B8A6; --c-danger: #F43F5E;
  /* 圓角採「角色命名」，避免與 Tailwind 內建 sm/md/lg/xl 撞名（既有 markup 已用 48 次） */
  --r-chip: 12px; --r-control: 16px; --r-card: 20px; --r-panel: 24px;
}
```

> **命名決定**：圓角 token 用角色名 `chip/control/card/panel` 而非 `sm/md/lg/xl`。原因：後者會**覆寫** Tailwind 內建同名圓角，導致既有 `rounded-lg` 等 48 處立刻位移（8px→20px），破壞本任務「畫面不變」的前提。角色名走 `extend`（新增而非覆寫），既有圓角維持不動，直到 Task 6 才刻意套用。

- [ ] **Step 2: 在 `styles.css` 現有 `.dark` 內新增對應深色 token**

```css
.dark {
  --c-brand-rgb: 251 146 60;      /* #FB923C */
  --c-brand-hover: #F9822A;
  --c-brand-soft: rgba(251,146,60,.16);
  --c-page: #221B15;
  --c-surface: #2C241E;
  --c-ink-rgb: 255 255 255;
  --c-muted: #B0A79D;
  --c-line: #3B342C;
  --c-high: #34D399; --c-med: #818CF8; --c-low: #FB7185; --c-rest: #94A3B8;
  --c-good: #2DD4BF; --c-danger: #FB7185;
}
```

- [ ] **Step 3: 在 `tailwind.config.js` `theme.extend.colors` 註冊語意色（保留現有 indigo 覆寫直到 Task 2 完成），`borderRadius` 改為語意階梯**

```js
theme: {
  extend: {
    colors: {
      indigo: { 500: '#6366f1', 600: '#4f46e5' }, // 暫留，Task 2 遷移後刪
      brand:      'rgb(var(--c-brand-rgb) / <alpha-value>)',
      'brand-soft': 'var(--c-brand-soft)',
      surface:    'var(--c-surface)',
      page:       'var(--c-page)',
      ink:        'rgb(var(--c-ink-rgb) / <alpha-value>)',
      muted:      'var(--c-muted)',
      line:       'var(--c-line)',
      high: 'var(--c-high)', med: 'var(--c-med)', low: 'var(--c-low)', rest: 'var(--c-rest)',
      good: 'var(--c-good)', danger: 'var(--c-danger)',
    },
    // 角色命名，走 extend 新增（不覆寫 Tailwind 內建 sm/md/lg/xl），既有圓角不受影響
    borderRadius: { chip: 'var(--r-chip)', control: 'var(--r-control)', card: 'var(--r-card)', panel: 'var(--r-panel)' },
  },
}
```

- [ ] **Step 4: 重新編譯 tailwind.css**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`
Expected: `Done in ...ms`，無錯誤。

- [ ] **Step 5: 驗證語意 class 已產生於輸出**

Run: `grep -c "\.bg-brand\|\.text-ink\|\.bg-surface" tailwind.css`
Expected: 數字 > 0（class 已被 Tailwind 產出，因對照表中的新 class 尚未被使用，Tailwind 為 JIT，需先在某處引用才會產出——見下方註）。

> **JIT 註**：Tailwind v3 只會產出「content 檔案裡實際出現」的 class。因此 Step 5 在遷移前可能為 0。可接受：真正的產出驗證併入 Task 2 起各遷移任務（該任務會實際用到 class）。本任務只需確認編譯**無錯**且 config 語法正確。改用下方指令驗證 config 有效：

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && echo '<div class="bg-brand text-ink rounded-card bg-brand/10"></div>' > /tmp/tw-probe.html && ./tailwindcss -i tailwind.input.css -o /tmp/tw-probe.css --content /tmp/tw-probe.html 2>&1 | tail -1 && grep -c "bg-brand\|text-ink\|rounded-card" /tmp/tw-probe.css`
Expected: 產出行數 > 0，代表語意色 + `<alpha-value>` 透明度 + 角色圓角（`rounded-card`）皆有效。

- [ ] **Step 6: 實機確認未破版（此時仍用舊 class，畫面應與遷移前一致）**

開 `index.html`，確認登入頁與主頁正常顯示、深色切換正常（尚未變橘，屬預期）。

- [ ] **Step 7: Commit**

```bash
git add styles.css tailwind.config.js tailwind.css
git commit -m "feat: 定義設計 token 並註冊 Tailwind 語意色/圓角"
```

---

### Task 2: 品牌色遷移（通用 indigo → brand）

**Files:**
- Modify: `index.html`、`app.js`
- Regenerate: `tailwind.css`

**Interfaces:**
- Consumes：Task 1 的 `brand` / `brand-soft` class。
- 產出前置：**排除**碳循環用途的 indigo（Task 4 處理）——即 `index.html:151` 的 `bg-indigo-500`（中碳條件式）與所有硬寫 `#6366f1` hex map。其餘 indigo 皆屬品牌。

- [ ] **Step 1: 先標記需排除的中碳 indigo（避免誤換）**

Run: `grep -n "bg-indigo-500" index.html`
確認並記下屬於 `planType === 'med'` 條件式的那一處（約 `index.html:151`），該處**不動**，留給 Task 4。

- [ ] **Step 2: 替換品牌 indigo 類（依語意，逐類替換）**

在 `index.html`、`app.js` 執行下列對應（用編輯器全域取代，逐條確認 diff）：
- `bg-indigo-600` → `bg-brand`；`hover:bg-indigo-700` → `hover:bg-brand-hover`（或 `hover:brightness-95`）
- `text-indigo-600/500/400` → `text-brand`
- `border-indigo-100/200` → `border-brand/20`
- `bg-indigo-50` / `bg-indigo-100` → `bg-brand-soft`
- `bg-indigo-500/10` → `bg-brand/10`；`shadow-indigo-500/20` → `shadow-brand/20`
- `focus:border-indigo-500` → `focus:border-brand`；`focus:ring-indigo-500/10` → `focus:ring-brand/10`
- 例外：Step 1 標記的中碳 `bg-indigo-500` **保留**。

代表範例（`index.html:79`）：
```html
<!-- before --> <button class="w-full bg-indigo-600 text-white ... hover:bg-indigo-700 ...">登入</button>
<!-- after  --> <button class="w-full bg-brand text-white ... hover:bg-brand-hover ...">登入</button>
```

- [ ] **Step 3: 更新 theme-color meta 與 loading spinner 硬寫色**

- `index.html:14` `<meta name="theme-color" content="#6366f1">` → `content="#F97316"`
- `index.html:33` spinner `border-indigo-100 border-t-indigo-600` → `border-brand/20 border-t-brand`
- `index.html:34` `text-indigo-600` → `text-brand`

- [ ] **Step 4: 重新編譯**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`

- [ ] **Step 5: 驗收 — 品牌 indigo 應歸零（僅剩中碳 1 處）**

Run: `grep -o "indigo-[0-9]*" index.html app.js | wc -l`
Expected: `1`（僅中碳 `bg-indigo-500`，Task 4 處理）。若 >1，檢查漏網。

- [ ] **Step 6: 實機目視（淺色 + 深色）**

登入頁、主頁 header、所有主要按鈕、focus 態應為橘色；深色為淺橘 `#FB923C`。中碳日仍為藍（正常）。

- [ ] **Step 7: Commit**

```bash
git add index.html app.js tailwind.css
git commit -m "feat: 品牌主色遷移為 brand（橘），中碳 indigo 暫留"
```

---

### Task 3: 中性色遷移（slate → surface/page/ink/muted/line）

**Files:**
- Modify: `index.html`、`app.js`
- Regenerate: `tailwind.css`

**Interfaces:**
- Consumes：`surface / page / ink / muted / line`。
- 排除：作為「自由日」分類色的 slate（`bg-slate-400`、hex `#64748b`）留給 Task 4。

- [ ] **Step 1: 標記需排除的自由日 slate**

Run: `grep -n "bg-slate-400\|#64748b\|#64748B" index.html app.js`
記下屬 `planType === 'rest'` 條件式與碳循環 hex map 的處，**不動**（Task 4）。

- [ ] **Step 2: 依對照表替換（文字類）**

- `text-slate-900` / `text-slate-800` → `text-ink`
- `text-slate-700` / `600` / `500` / `400` → `text-muted`（其中作為自由日者除外）
- `text-slate-300` / `200` → `text-muted opacity-60`
- `group-hover:text-slate-*` 同規則對應

- [ ] **Step 3: 依對照表替換（背景 / 邊框類）**

- `bg-white` → `bg-surface`（注意：純白 chip 若在深色需為卡面，`surface` 已處理）
- `bg-slate-50`（含 `/50` `/80`）→ `bg-page`
- `bg-slate-100` → `bg-line`
- `bg-[#f8f9fb]` / `bg-[#fcfdfe]` → `bg-page`
- `border-slate-50` / `100` / `200` → `border-line`

代表範例（`index.html:657`）：
```html
<!-- before --> <button class="... bg-white text-slate-300 hover:text-rose-500 ...">
<!-- after  --> <button class="... bg-surface text-muted opacity-60 hover:text-rose-500 ...">
```

- [ ] **Step 4: 重新編譯**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`

- [ ] **Step 5: 驗收 — slate 僅剩自由日用途**

Run: `grep -o "slate-[0-9]*" index.html app.js | wc -l`
Expected: 僅剩自由日條件式的 `slate-400`（約 1 處；記下 Step 1 實際數量作為預期值）。`grep -n "bg-white\|slate-50\|slate-100" index.html app.js` 應為 0。

- [ ] **Step 6: 實機目視（淺色 + 深色）**

主頁、設定頁、Modal 的文字主/次階、卡片面、邊框在深淺色皆正確；頁面底轉為微暖中性。注意深色此時可能有殘影（`!important` 尚在），Task 5 清除後複驗。

- [ ] **Step 7: Commit**

```bash
git add index.html app.js tailwind.css
git commit -m "feat: 中性色遷移為 surface/page/ink/muted/line"
```

---

### Task 4: 碳循環分類色遷移（高碳 amber→emerald，統一 hex map）

**Files:**
- Modify: `styles.css`（category token 改 alpha-capable）、`tailwind.config.js`（high/med/low/rest 註冊為 alpha）、`index.html`（`:151`、hex maps、設定頁計畫卡 `1134-1170`）、`app.js`（colorMap）
- Regenerate: `tailwind.css`

**Interfaces:**
- Consumes：`high / med / low / rest` 語意色（本任務將它們升級為 alpha-capable，使 `bg-high/8`、`border-med/40` 等軟色調可用）。
- 完成後：`index.html:151` 中碳 `bg-indigo-500` 收斂為 `bg-med`；Task 3 保留的自由日 slate 收斂；**修正 Task 2 的語意外洩**——設定頁 med 計畫卡目前被誤染成 brand 橘（`bg-brand-soft border-brand/20 text-brand`），本任務改回 med 藍。

> **背景**：`high/med/low/rest` 在 Task 1 定義為純 `var()`，不支援 `/NN` 透明度（`bg-high/8` 會是死 class）。而設定頁計畫卡需要軟色調底（原本 `bg-amber-50/60` 等）。故本任務先把這四個 token 改為 RGB 三元組並註冊 `<alpha-value>`，同時保留 `var(--c-high)` 全色字串供 SVG stroke/colorMap 使用。

- [ ] **Step 0: 將 category token 改為 alpha-capable（styles.css + config）**

在 `styles.css` `:root` 把四個 category token 改為「三元組 + 衍生全色」雙定義：
```css
:root {
  --c-high-rgb: 16 185 129;  --c-high: rgb(var(--c-high-rgb));
  --c-med-rgb: 99 102 241;   --c-med: rgb(var(--c-med-rgb));
  --c-low-rgb: 244 63 94;    --c-low: rgb(var(--c-low-rgb));
  --c-rest-rgb: 100 116 139; --c-rest: rgb(var(--c-rest-rgb));
}
.dark {
  --c-high-rgb: 52 211 153;  --c-high: rgb(var(--c-high-rgb));
  --c-med-rgb: 129 140 248;  --c-med: rgb(var(--c-med-rgb));
  --c-low-rgb: 251 113 133;  --c-low: rgb(var(--c-low-rgb));
  --c-rest-rgb: 148 163 184; --c-rest: rgb(var(--c-rest-rgb));
}
```
在 `tailwind.config.js` 把 high/med/low/rest 改為 alpha 形式：
```js
high: 'rgb(var(--c-high-rgb) / <alpha-value>)',
med:  'rgb(var(--c-med-rgb) / <alpha-value>)',
low:  'rgb(var(--c-low-rgb) / <alpha-value>)',
rest: 'rgb(var(--c-rest-rgb) / <alpha-value>)',
```
> `var(--c-high)`（全色）仍可用於 SVG `:stroke` 與 colorMap；`bg-high` / `bg-high/8` 兩種寫法皆有效。

- [ ] **Step 1: 替換 planType 條件式 class（`index.html:151`）**

```html
<!-- before -->
:class="{'bg-amber-500': ...==='high','bg-indigo-500': ...==='med','bg-rose-500': ...==='low','bg-slate-400': ...==='rest'}"
<!-- after -->
:class="{'bg-high': ...==='high','bg-med': ...==='med','bg-low': ...==='low','bg-rest': ...==='rest'}"
```

- [ ] **Step 2: 替換所有硬寫 hex color map（`index.html:220,238,271,273` 及 `app.js` colorMap）**

將每個 `{high:'#f59e0b', med:'#6366f1', low:'#f43f5e', rest:'#64748b'}` 改為：
```js
{high:'var(--c-high)', med:'var(--c-med)', low:'var(--c-low)', rest:'var(--c-rest)'}
```
`index.html:220` 圖例陣列 `[{c:'#f59e0b',t:'高碳日'},...]` 的 `c` 同步改為 `var(--c-high)` 等。
同步處理設定頁計畫卡的 inline style 色點（`index.html:1144` 附近）：`background: key === 'high' ? '#f59e0b' : key === 'med' ? '#6366f1' : key === 'low' ? '#f43f5e' : '#64748b'` → 改為 `var(--c-high/med/low/rest)`。

> 註：SVG `:stroke` 綁定接受 CSS 變數字串（`stroke="var(--c-high)"`），瀏覽器可解析。若某處 SVG 在 `<defs>`/漸層無法吃變數，退回實際 hex（高碳 `#10B981`／深色 `#34D399`）並加註。

- [ ] **Step 3: 修正設定頁計畫卡四色（含改回 med 藍、還原 rest 灰識別）**

現況（Task 2/3 後）計畫卡 class 為：
```
'bg-amber-50/60 border-amber-100': key === 'high',      // amber 未遷
'bg-brand-soft border-brand/20':   key === 'med',        // ← 被 Task 2 誤染成 brand 橘
'bg-rose-50/60 border-rose-100':   key === 'low',        // rose 未遷
'bg-page border-line':             key === 'rest'         // ← 失去灰階識別
```
改為（用 alpha-capable category token，四色一致）：
```
'bg-high/8 border-high/30': key === 'high',
'bg-med/8 border-med/30':   key === 'med',
'bg-low/8 border-low/30':   key === 'low',
'bg-rest/8 border-rest/30': key === 'rest'
```
同區塊的輸入框 border/text/ring（`index.html:1156-1159` 與 `1167-1170` 兩組）現況：
```
'border-amber-200 text-amber-500 focus:ring-amber-500/10 focus:border-amber-400': key === 'high',
'border-brand/20 text-brand focus:ring-brand/10 focus:border-brand':               key === 'med',  // ← 誤染
'border-rose-200 text-rose-500 focus:ring-rose-500/10 focus:border-rose-400':      key === 'low',
'border-line text-muted focus:ring-muted focus:border-muted':                      key === 'rest'  // ← 失識別
```
兩組都改為：
```
'border-high/40 text-high focus:ring-high/20 focus:border-high': key === 'high',
'border-med/40 text-med focus:ring-med/20 focus:border-med':     key === 'med',
'border-low/40 text-low focus:ring-low/20 focus:border-low':     key === 'low',
'border-rest/40 text-rest focus:ring-rest/20 focus:border-rest': key === 'rest'
```
> 重點：med 卡必須從 brand（橘）改回 med（藍）——這是修正 Task 2 把中碳誤當品牌色的外洩。rest 卡改用 rest（灰）token，恢復與其他三卡並列時的分類識別。
> 其他殘餘 `amber-`/`rose-` 若屬 high/low 語意（如 grep 到的計畫卡相關）一併改為 high/low 系；非分類語意的 amber/rose（若有純裝飾或「刪除=rose」危險色）保持不變。

- [ ] **Step 4: 重新編譯**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`

- [ ] **Step 5: 驗收**

- `grep -oE "#f59e0b|#6366f1|#f43f5e|#64748b" index.html app.js | wc -l` → `0`（category hex 全數改 var）
- `grep -oE "indigo-[0-9]+|slate-[0-9]+" index.html app.js | wc -l` → `0`（品牌與中性已在 Task 2/3 清空，本任務清掉最後的中碳 `bg-indigo-500`/自由 `bg-slate-400`）
- 設定頁 med 卡不再是 brand：計畫卡區塊 `grep -n "brand" index.html`（`1130-1175` 範圍內）應無殘留；med 卡改為 `bg-med/8`、`text-med` 等。
- alpha 軟色調有效（非死 class）：`export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && grep -oE "bg-(high|med|low|rest)\\\\/[0-9]+\{[^}]*\}" tailwind.css | head` → 應能找到如 `.bg-med\/8{...}` 之類的實際規則。
- 計畫卡相關 `amber-`/`rose-`（high/low 分支）應已改為 high/low 系。

- [ ] **Step 6: 實機目視**

碳循環選擇器四色：高碳綠、中碳藍、低碳玫瑰、自由灰；日曆進度環、圖例一致。設定頁四張計畫卡分別為：高碳綠、**中碳藍（不可是橘）**、低碳玫瑰、自由灰，各自軟色調底 + 對應邊框/文字。深淺色皆檢查。

- [ ] **Step 7: Commit**

```bash
git add index.html app.js tailwind.css
git commit -m "feat: 碳循環分類色遷移，高碳改 emerald 綠"
```

---

### Task 5: 刪除深色模式 `!important` 覆寫

**Files:**
- Modify: `styles.css`（刪除約 `styles.css:89-172` 的 `.dark .xxx !important` 區塊，及 `styles.css:305-307` 的 floating bar override 若已無對應 class）

**Interfaces:**
- 前置：Task 2/3/4 必須已完成（覆寫是為補償硬寫的 slate/indigo；遷移後這些規則已無對應目標，屬死碼）。

- [ ] **Step 1: 刪除 `.dark` Tailwind 覆寫區塊**

移除 `styles.css` 中 `=== Tailwind 暗色模式強制覆寫 ===`、`=== 設定面板：計畫卡片深色模式 ===`、`Dark mode input overrides` 三段內所有 `.dark .<utility> { … !important }` 規則。
保留：`.dark .premium-card-*`（元件類，非 utility 覆寫）、`.dark .modal-overlay`、以及仍被引用的 `.dark input/select/textarea` 基礎樣式（若語意 input 尚依賴）。

> 判準：凡選擇器是 `.dark` + 一個 Tailwind「顏色 utility」（`.bg-slate-*`/`.text-slate-*`/`.bg-indigo-*`/`.text-indigo-*`/`.bg-amber-*`/`.bg-rose-*` 等）者，刪。凡是 `.dark` + 自訂元件 class 者，留。

- [ ] **Step 2: 刪除 Task 1 暫留的舊變數與 config indigo（收尾）**

- `styles.css:10` `--accent-primary` 若已無引用則刪（先 `grep -n "accent-primary" styles.css index.html app.js` 確認）。
- `tailwind.config.js` 的 `colors.indigo` 覆寫刪除。

- [ ] **Step 3: 重新編譯**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`

- [ ] **Step 4: 驗收 — 深色模式全頁複驗（關鍵）**

逐頁切深色：登入、主頁、碳循環選擇器、日曆、設定頁、每個 Modal。確認無因刪覆寫而露餡的硬寫色（若有，代表 Task 2-4 有漏網，回補後重編譯）。

- [ ] **Step 5: Commit**

```bash
git add styles.css tailwind.config.js tailwind.css
git commit -m "refactor: 移除 60 條深色模式 !important 覆寫（token 上線後已無用）"
```

---

### Task 6: 圓角階梯統一

**Files:**
- Modify: `styles.css`（元件圓角）、`index.html`、`app.js`
- Regenerate: `tailwind.css`

**Interfaces:**
- Consumes：角色圓角 token `--r-chip/control/card/panel` 與 class `rounded-chip/control/card/panel`（Task 1 以 `extend` 新增，不與 Tailwind 內建 sm/md/lg/xl 撞名）。
- 對照：chip=12px（標籤）、control=16px（按鈕/輸入/圖示框）、card=20px（次卡片/餐點卡/分段控制）、panel=24px（主卡片/Modal）。

- [ ] **Step 1: styles.css 元件圓角改用變數**

- `input,select,textarea` `border-radius: 1.5rem` → `var(--r-control)`（`styles.css:78`）
- `.modal-input` `1rem` → `var(--r-control)`（`styles.css:361`）
- `.btn-circular .icon-wrapper` `1.25rem` → `var(--r-control)`（`styles.css:198`）
- `.segment-indicator` `1.15rem` / `.segmented-control` `1.5rem` → `var(--r-card)`（`styles.css:240,270`）
- `--card-radius-main: 1.5rem` → `var(--r-panel)`；`--card-radius-sub: 1rem` → `var(--r-card)`（`styles.css:11-12`）

- [ ] **Step 2: HTML/JS utility 圓角歸階（含既有 Tailwind 內建圓角，依語意重新指派角色）**

先列出所有圓角用途：`grep -o "rounded-[a-z0-9\[\].rem-]*" index.html app.js | sort | uniq -c`
再依「元素角色」對應（非機械換名）：
- 藥丸/圓形/頭像/日期圈 → 保留 `rounded-full`
- 標籤/chip/小徽章 → `rounded-chip`
- 按鈕/輸入框/圖示方框 → `rounded-control`（含既有 `rounded-2xl`、`rounded-xl`、`rounded-lg` 屬此角色者）
- 次卡片/餐點卡/區塊/分段控制 → `rounded-card`
- 主卡片/Modal 容器/大 hero 框（含 `rounded-[2.5rem]`、`rounded-[2rem]`、`rounded-3xl`）→ `rounded-panel`
> 重點：Task 1 未覆寫 Tailwind 內建圓角，故此步必須**檢視每一處既有 `rounded-sm/md/lg/xl/2xl/3xl`** 並依角色重新指派為 chip/control/card/panel，不可略過既有用法。

- [ ] **Step 3: 重新編譯**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && ./tailwindcss -i tailwind.input.css -o tailwind.css --minify`

- [ ] **Step 4: 驗收**

Run: `grep -o "rounded-\[[0-9.]*rem\]" index.html app.js | wc -l`
Expected: `0`（無殘留 arbitrary 圓角）。

- [ ] **Step 5: 實機目視**：卡片、按鈕、輸入框、分段控制圓角一致成階梯。

- [ ] **Step 6: Commit**

```bash
git add styles.css index.html app.js tailwind.css
git commit -m "refactor: 圓角統一為 chip/control/card/panel 角色階梯"
```

---

### Task 7: 字級 / 字重階層

**Files:**
- Modify: `index.html`、`app.js`（動態 class）、`styles.css`（`.nutrient-label` 等）

**Interfaces:**
- 規則：Display 900 僅限數字（`.calorie-num` 沿用）；標題 800；**內文 body 由 black 降 500–600**；label 700；caption 700。

- [ ] **Step 1: 內文降重**

將明顯的內文性 `font-black` / `font-800`（描述文字、次要說明、清單項）改為 `font-medium`（500）或 `font-semibold`（600）。標題（h1/h2、卡片標題）維持 `font-extrabold`（800）。數字（卡路里、營養值大數）維持 900。
> 判準：是「一段可讀文字」→ 500/600；是「標題/數字/短標籤」→ 維持重。

- [ ] **Step 2: 標籤 / 小標統一**

`.nutrient-label`（`styles.css:232`）`font-weight: 800` → `700`；HTML 內 `text-[10px]` 小標統一 `font-bold`（700）+ `uppercase`（既有者保留）。

- [ ] **Step 3: 驗收（目視為主）**：主頁應出現清楚主從——大數字最重、標題次之、內文明顯較輕、有呼吸感。淺深色皆檢查。

- [ ] **Step 4: Commit**

```bash
git add index.html app.js styles.css
git commit -m "refactor: 建立字級/字重階層，內文降重"
```

---

### Task 8: PDF 匯出模板對齊新色板

**Files:**
- Modify: `index.html`（PDF 匯出報表模板，約 `1490-1628`）
- Regenerate: `tailwind.css`（若模板改用 utility；若仍為 inline hex 則免）

**Interfaces:**
- PDF 匯出是**永遠淺色**的獨立列印文件，故用**固定 hex**（不可用會隨深色切換的 `var(--c-*)`），但 hex 值要對齊新色板的「淺色版」。

- [ ] **Step 1: 對齊品牌強調色**

模板內舊品牌 `#4f46e5`（如 `index.html:1534,1598` 的 `border-left: 4px solid #4f46e5`、`:1501` 文字色 `#6366f1`）→ 改為新品牌橘 `#F97316`。

- [ ] **Step 2: 對齊碳循環分類色地圖（`index.html:1526`）**

模板的分類色地圖現為舊配色：
```
背景 {high:'#eef2ff', med:'#f5f3ff', low:'#fdf2f8', rest:'#f8fafc'}
文字 {high:'#4338ca', med:'#6d28d9', low:'#be185d', rest:'#64748b'}
```
改為對齊新色板（淺色文件用「淡底 + 深字」，各自取新分類色的明暗兩階）：
```
背景 {high:'#E6F7F0', med:'#EEF0FE', low:'#FEECEF', rest:'#F1F5F9'}
文字 {high:'#0A9C6D', med:'#4F46E5', low:'#BE123C', rest:'#475569'}
```
> high=emerald 系、med=indigo 系、low=rose 系、rest=slate 系，與 App live 分類色一致（高碳綠、中碳藍、低碳玫瑰、自由灰）。

- [ ] **Step 3: 掃描模板其餘舊色**

`sed -n '1490,1628p' index.html | grep -oE "#[0-9a-fA-F]{6}"` 列出模板所有 hex；確認除了刻意的中性灰（`#64748b`→可改 `#475569`）與上面已對齊者外，無殘留舊品牌紫（`#4f46e5`/`#6366f1`/`#6d73c9`）。

- [ ] **Step 4: 驗收**

`grep -oE "#4f46e5|#6d73c9" index.html | wc -l` → `0`（舊品牌紫在 PDF 模板也清除）。
`sed -n '1490,1628p' index.html | grep -c "var(--c-"` → `0`（模板仍為固定 hex，未誤用會變色的 token）。

- [ ] **Step 5: Commit**

```bash
git add index.html
git commit -m "refactor: PDF 匯出模板對齊新品牌橘與碳循環分類色"
```

---

### Task 9: 修正殘留舊紫、版本升級與最終驗證

**Files:**
- Modify: `styles.css`（--accent-primary）、`app.js`、`service-worker.js`、`index.html`

- [ ] **Step 0: 修正 `--accent-primary` 仍為舊品牌紫（重要遺漏）**

`--accent-primary` 是先於 token 系統存在的「第二品牌色變數」，目前仍是舊紫（`styles.css:10` `#6d73c9`、`.dark` `styles.css:42` `#6c69eb`），被多個元件樣式與 2 處 inline style 使用（`.btn-circular` 圓形按鈕、`.selected-day-ring` 日曆選中圈、`.segment-*`、`.meal-card` hover、`.settings-range` 滑桿、`index.html:149` 日期數字、`index.html:169` today pill）。這些元素現在仍是紫色，未跟上品牌橘。
修正（讓它成為 brand 的別名，單一來源、自動深淺切換）：
- `styles.css:10` `:root` 的 `--accent-primary: #6d73c9;` → `--accent-primary: rgb(var(--c-brand-rgb));`
- `styles.css:42` `.dark` 的 `--accent-primary: #6c69eb;` → **刪除該行**（`--c-brand-rgb` 已在 `.dark` 翻轉，別名自動跟隨）。
> 不需改任何 `var(--accent-primary)` 使用點；它們會自動變成品牌橘。

- [ ] **Step 1: 更新四處版本號至 `0.2.0`**

- `app.js`：`console.log('App initialization starting... v0.2.0')`
- `app.js`：`const appVersion = ref('0.2.0')`
- `service-worker.js`：`const CACHE_NAME = 'diet-tracker-v0.2.0'`
- `index.html`：`<script type="module" src="app.js?v=0.2.0">`

- [ ] **Step 2: 回歸測試**

Run: `export PATH="/Users/sheal/.nvm/versions/node/v20.20.0/bin:$PATH" && node --test recommend.test.mjs`
Expected: 全數通過。

- [ ] **Step 3: 全域殘留掃描（一致性總驗收）**

Run: `grep -o "indigo-[0-9]*\|slate-[0-9]*\|#6d73c9\|#4f46e5" index.html app.js styles.css | wc -l`
Expected: `0`。
Run: `grep -c "!important" styles.css`
Expected: 大幅下降（僅保留必要的少數，如非顏色的 floating bar 定位）。

- [ ] **Step 4: 實機全頁走查（淺色 + 深色）**

登入 → 主追蹤頁 → 新增/編輯餐點 Modal → 碳循環選擇器 → 日曆/月檢視 → 設定頁（計畫卡、range slider）→ 刪除確認 Modal。確認：品牌橘一致、四色碳循環可辨、圓角成階、字重有主從、深色無破圖、設定頁 Version 顯示 `0.2.0`。

- [ ] **Step 5: Commit**

```bash
git add styles.css app.js service-worker.js index.html
git commit -m "chore: 修正 accent-primary 為品牌橘、版本升級至 0.2.0（設計 token 系統）"
```

---

## Self-Review（計畫對規格覆蓋）

- ✅ 色彩 tokens（規格一）→ Task 1 定義、Task 2/3/4 遷移
- ✅ 圓角階梯（規格二）→ Task 1 註冊、Task 6 遷移
- ✅ 字級/字重（規格三）→ Task 7
- ✅ 間距（規格四）→ 沿用 Tailwind 4px 尺度，遷移中收斂 arbitrary 值（併入 Task 3/6）
- ✅ RGB `<alpha-value>` 支援 → Task 1 Step 5 驗證
- ✅ 刪 60 條 `!important` → Task 5
- ✅ standalone binary 重編譯 → 各任務 Step「重新編譯」
- ✅ PDF 匯出模板對齊新色板（Task 4 審查發現的一致性缺口）→ Task 8
- ✅ 版本四處 + 回歸測試 → Task 9
- ✅ indigo 雙重語意（品牌 vs 中碳）風險 → Task 2 Step 1 排除、Task 4 收斂
- ✅ slate 雙重語意（中性 vs 自由日）風險 → Task 3 Step 1 排除、Task 4 收斂

**間距（規格四）獨立性檢查**：規格四未新增 token（沿用 Tailwind 預設 4px 尺度），故不需獨立任務，僅在 Task 3/6 遷移時順手收斂 arbitrary px 值。此為刻意決定，非遺漏。
