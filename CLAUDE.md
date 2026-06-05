# loseWeight 專案說明

## 版號規則

版號格式：`MAJOR.MINOR.PATCH`（例如 `0.1.2`）

| 類型 | 進位 | 範例 |
|------|------|------|
| 一般修復、樣式調整、小功能 | PATCH +1 | `0.0.11` → `0.0.12` |
| 較大功能新增、架構調整 | MINOR +1，PATCH 歸零 | `0.0.12` → `0.1.0` |
| 重大改版 | MAJOR +1，其餘歸零 | `0.1.0` → `1.0.0` |

## 每次 commit 必須同步更新的四個地方

1. **[app.js](app.js)** — `console.log('App initialization starting... vX.X.X')`
2. **[app.js](app.js)** — `const appVersion = ref('X.X.X')`（顯示在設定頁面的 Version 欄位）
3. **[service-worker.js](service-worker.js)** — `const CACHE_NAME = 'diet-tracker-vX.X.X'`（更新此值才會強制清除舊快取）
4. **[index.html](index.html)** — `<script type="module" src="app.js?v=X.X.X">`（快取破解參數）
