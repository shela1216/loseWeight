# 設計 Token 系統 — 設計文件

日期：2026-07-22
狀態：待實作
版本影響：`0.1.7 → 0.2.0`（架構調整，MINOR +1）

## 背景與問題

整體視覺缺乏一致美感，根源不是單一 bug，而是缺少一套設計 token：

1. **品牌色三套打架** — `--accent-primary`(`#6d73c9`)、`indigo-600`(`#4f46e5`)、`indigo-500`/theme-color(`#6366f1`) 同時出現。
2. **顏色寫死、深色模式靠 60 條 `!important` 硬補** — [styles.css:89-172](../../../styles.css)。顏色直接用 Tailwind 的 `slate-*`（277+ 行）、`indigo-*`（180+ 處），每加元素就要再補 dark 覆寫，永遠對不齊。
3. **圓角無尺度** — `1rem / 1.15rem / 1.25rem / 1.5rem / 2rem / 2.5rem / full` 混用。
4. **字重無主從** — 幾乎全是 `font-black`(900)，內文過重、缺層級。

**根治方向**：把 CSS 變數註冊成 Tailwind 語意色，class 名稱本身即語意，深淺色靠變數自動切換，`!important` 覆寫整批刪除。

## 範圍

- 一次建立完整 token 系統：**色彩 + 圓角 + 字級/字重 + 間距**。
- 全面遷移 [index.html](../../../index.html)、[app.js](../../../app.js) 內的硬寫 utility。
- 不改功能邏輯，只改視覺層與 class。

## 決策（已與使用者確認）

- **品牌主色 = Tangerine 橘** `#F97316`（呼應健康主題）。
- **高碳日功能色 = Emerald 綠** `#10B981`（原 amber 與橘撞色，改綠）。中碳/低碳/自由不變。
- 頁面背景由冷灰改為**微暖中性**，配合橘品牌；深色底去除原紫調。
- 一次做完整套，不分階段。

## 一、色彩 tokens

於 [styles.css](../../../styles.css) 定義。為支援 `bg-brand/10` 這類透明度 utility，主要色以 **RGB 三元組**定義，供 `<alpha-value>` 使用。

```css
:root {
  /* 品牌 */
  --c-brand-rgb: 249 115 22;      /* #F97316 */
  --c-brand-hover: #EA6A0C;
  --c-brand-soft: #FEF0E6;
  /* 表面 / 文字 / 線 */
  --c-page: #F7F5F3;
  --c-surface: #FFFFFF;
  --c-ink-rgb: 36 26 20;          /* #241A14 暖黑 */
  --c-muted: #6F675F;
  --c-line: #ECE7E2;
  /* 碳循環分類色 */
  --c-high: #10B981;  --c-med: #6366F1;  --c-low: #F43F5E;  --c-rest: #64748B;
  /* 語意色 */
  --c-good: #14B8A6;              /* 達標/in-range，維持 teal，與高碳綠區隔 */
  --c-danger: #F43F5E;            /* 超標/刪除 */
}
.dark {
  --c-brand-rgb: 251 146 60;      /* #FB923C */
  --c-brand-hover: #F9822A;
  --c-brand-soft: rgba(251,146,60,.16);
  --c-page: #221B15;
  --c-surface: #2C241E;
  --c-ink-rgb: 255 255 255;
  --c-muted: #B0A79D;
  --c-line: #3B342C;
  --c-high: #34D399;  --c-med: #818CF8;  --c-low: #FB7185;  --c-rest: #94A3B8;
  --c-good: #2DD4BF;  --c-danger: #FB7185;
}
```

### 遷移對照表

| 舊 utility | 新語意色 |
|---|---|
| `indigo-600` / `indigo-500`（品牌用途） | `brand` |
| `indigo-50` / `indigo-100`（淡底） | `brand-soft` |
| `bg-white` / `bg-slate-50`（面） | `surface` |
| `bg-main` / 頁面底 | `page` |
| `text-slate-900` / `800` | `ink` |
| `text-slate-400` / `500` / `600` | `muted` |
| `border-slate-100` / `200` | `line` |
| 高碳 `amber` `#f59e0b` | `high` `#10B981` |

### tailwind.config.js 註冊

```js
theme: {
  extend: {
    colors: {
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
  },
}
```

> `brand-hover` 用於 hover 態（`hover:bg-[--c-brand-hover]` 或在 styles.css 定義 `.btn-brand:hover`）。

## 二、圓角階梯

```css
:root {
  --r-sm: 12px;   /* 標籤、chip */
  --r-md: 16px;   /* 按鈕、輸入框、圖示框 */
  --r-lg: 20px;   /* 次卡片、餐點卡、分段控制 */
  --r-xl: 24px;   /* 主卡片、Modal 容器 */
  --r-full: 9999px;
}
```

tailwind.config.js `borderRadius`：`sm/md/lg/xl` 對應上表，移除 `4xl/5xl`。
遷移：`rounded-2xl`→依語意 `rounded-md`(按鈕) 或 `rounded-lg`(卡)；`rounded-[2.5rem]`→`rounded-xl`；雜項 `1.15/1.25rem`→就近歸階。

## 三、字級 / 字重階層

| 用途 | 大小 | 字重 | class 慣例 |
|---|---|---|---|
| Display（卡路里數字） | `clamp(2rem,10vw,3rem)` | 900 | `.calorie-num`（沿用） |
| 頁面標題 h1 | 1.5rem | 800 | `text-2xl font-extrabold` |
| 區塊標題 h2 | 1.125rem | 800 | `text-lg font-extrabold` |
| 內文 body | 0.875rem | **500–600** | `text-sm font-medium/semibold` |
| 標籤 label | 0.75rem | 700 | `text-xs font-bold` |
| 小標 caption | 0.625rem | 700 大寫 | `text-[10px] font-bold uppercase` |

核心原則：**900 只保留給數字/Display**；內文由 black 降為 500–600，建立呼吸感與主從。

## 四、間距（4px 基準）

尺度：`4, 8, 12, 16, 20, 24, 32`。
- 主卡片內距 24、次卡片內距 16
- 區塊間距 20、元素間距 12 / 8

沿用 Tailwind 預設間距 utility（皆為 4px 倍數），僅收斂雜項 arbitrary 值。

## 實作步驟

1. 在 [styles.css](../../../styles.css) `:root`/`.dark` 定義全部 tokens（色彩/圓角）。
2. 在 [tailwind.config.js](../../../tailwind.config.js) 註冊語意色與圓角（含 `<alpha-value>`）。
3. 重新編譯：`./tailwindcss -i tailwind.input.css -o tailwind.css`（standalone binary，無 npm）。
4. 遷移色彩 utility：依對照表替換 [index.html](../../../index.html)、[app.js](../../../app.js) 內的 `indigo-*` / `slate-*` / 高碳 `amber`（含 `getPlanColor`、SVG stroke `#f59e0b` 等硬寫 hex）。
5. **刪除 [styles.css:89-172](../../../styles.css) 的 60 條 `.dark …!important` 覆寫**。
6. 遷移圓角與字重 utility。
7. 版本 `0.2.0`，同步更新 CLAUDE.md 規定四處：`app.js` console.log、`app.js` `appVersion`、`service-worker.js` `CACHE_NAME`、`index.html` `app.js?v=`。

## 驗證

- 以 [/run](../../../) 或本機開啟 App，逐頁檢查淺色 + 深色：登入頁、主追蹤頁、碳循環選擇器、日曆、設定頁、各 Modal。
- 確認：品牌橘一致、四色碳循環可分辨、無殘留紫色、深色模式無破圖（`!important` 移除後）。
- `recommend.test.mjs` 仍通過（純邏輯，不受視覺影響，作為回歸底線）。

## 風險

- 遷移面大（400+ 處），需避免誤傷非品牌用途的 `indigo`/`slate`（例如純中性灰的 slate 應歸 `muted`/`line` 而非 `brand`）。逐檔審查、依語意而非機械全域取代。
- 移除 `!important` 後若仍有漏網的硬寫色，深色模式會露餡 → 靠逐頁驗證補齊。

## 非目標（YAGNI）

- 不新增元件庫、不引入建置工具鏈（維持 standalone binary）。
- 不重構功能邏輯、不動資料結構。
- 不做動畫/微互動的全面翻修（僅順手收斂既有 transition）。
