# loseWeight 專案說明

## 版號規則

版號格式：`MAJOR.MINOR.PATCH`（例如 `0.1.2`）

| 類型 | 進位 | 範例 |
|------|------|------|
| 一般修復、樣式調整、小功能 | PATCH +1 | `0.0.11` → `0.0.12` |
| 較大功能新增、架構調整 | MINOR +1，PATCH 歸零 | `0.0.12` → `0.1.0` |
| 重大改版 | MAJOR +1，其餘歸零 | `0.1.0` → `1.0.0` |

## 每次 commit 必須同步更新的版號

專案裡所有版號字串都一致，所以整批取代即可：

```sh
sed -i '' 's/0\.5\.5/0.5.6/g' app.js service-worker.js index.html
```

逐處清單（新增檔案時記得一併加入）：

1. **[app.js](app.js)** — `console.log('App initialization starting... vX.X.X')`
2. **[app.js](app.js)** — `const appVersion = ref('X.X.X')`（顯示在設定頁面的 Version 欄位）
3. **[app.js](app.js)** — 本地模組 import 的 `?v=X.X.X`（`recommend.js` / `timeline.js` / `stats.js`）
4. **[service-worker.js](service-worker.js)** — `const CACHE_NAME = 'diet-tracker-vX.X.X'`（更新此值才會強制清除舊快取）
5. **[index.html](index.html)** — `<script type="module" src="app.js?v=X.X.X">` 與兩個 CSS 的 `?v=`（快取破解參數）

### 為什麼本地 import 也要帶版號

service worker 對本站 `.js` 是 network-first，但它用的 `fetch(req)` 仍會吃瀏覽器 HTTP 快取。
import 路徑不帶版號時 URL 從不改變，瀏覽器就繼續給舊檔，於是新版 `app.js` 搭到舊版模組，
在 console 噴 `does not provide an export named ...`。改 URL 是唯一可靠的破解方式。
