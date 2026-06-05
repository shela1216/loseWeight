# loseWeight 專案開發規範 (GEMINI.md)

本文件定義了專案的開發規範與自動化流程，Gemini CLI 應嚴格遵守。

## 1. 版本號規範 (Semantic Versioning)

本專案遵循 `MAJOR.MINOR.PATCH` 格式。

| 變更類型 | 規則 | 範例 |
| :--- | :--- | :--- |
| **PATCH** | 一般 Bug 修復、樣式調整、小功能優化 | `0.0.11` → `0.0.12` |
| **MINOR** | 較大功能新增、非破壞性架構調整 | `0.0.12` → `0.1.0` |
| **MAJOR** | 重大改版、破壞性變更 | `0.1.0` → `1.0.0` |

---

## 2. 提交 (Commit) 必備同步步驟

每次執行 `commit` 前，**必須**確保以下三個位置的版號已同步更新：

1.  **`app.js` (啟動日誌)**:
    -   尋找 `console.log('App initialization starting... vX.X.X');` 並更新。
2.  **`app.js` (響應式變數)**:
    -   尋找 `const appVersion = ref('X.X.X');` 並更新。
3.  **`service-worker.js` (快取控制)**:
    -   尋找 `const CACHE_NAME = 'diet-tracker-vX.X.X';` 並更新。
    -   *注意：更新此值是強制瀏覽器清除舊快取、載入新功能的唯一方式。*
4. **[index.html](index.html)** — `<script type="module" src="app.js?v=X.X.X">`（快取破解參數）
---

## 3. 技術棧參考

-   **Frontend**: Vue 3 (via CDN, using `setup()` Composition API)
-   **Styling**: Vanilla CSS + Tailwind-like utility classes (Tailwind is not used as a library, styles are in `styles.css`)
-   **Backend**: Firebase (Auth, Firestore)
-   **PWA**: Service Worker (`service-worker.js`)
