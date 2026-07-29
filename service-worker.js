// 快取版本號
const CACHE_NAME = 'diet-tracker-v0.3.5';

// 需要快取的靜態資源列表
const urlsToCache = [
    '/',
    'index.html',
    'app.js',
    'styles.css',
    'manifest.json',
    'leaf.png',
    'tailwind.css',
    'https://unpkg.com/vue@3.5.35/dist/vue.global.prod.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap'
];

// 監聽 'install' 事件：安裝 Service Worker 時，快取所有核心資源
self.addEventListener('install', (event) => {
    // 立即跳過等待，確保新的 Service Worker 立即啟動
    self.skipWaiting(); 
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] 快取核心應用程式外殼...');
                // 將所有 URLs 加入快取
                return cache.addAll(urlsToCache).catch(error => {
                    console.error('[Service Worker] 快取失敗的資源:', error);
                    // 即使部分資源快取失敗，仍然嘗試繼續
                });
            })
    );
});

// 監聽 'activate' 事件：清理舊的快取版本
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // 刪除與當前版本不符的所有快取
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] 刪除舊快取:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 確保 Service Worker 立即控制頁面
    return self.clients.claim();
});

// 允許頁面端要求等待中的新版立即接手(避免卡在 waiting)
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 監聽 'fetch' 事件
self.addEventListener('fetch', (event) => {
    // 僅處理 GET 請求
    if (event.request.method !== 'GET') {
        return;
    }

    const req = event.request;
    const url = new URL(req.url);

    // 應用程式外殼(導覽/HTML/app.js)採「網路優先」：確保永遠拿到最新版，離線才退回快取
    const isAppShell = req.mode === 'navigate'
        || url.pathname === '/'
        || url.pathname.endsWith('/index.html')
        || url.pathname.endsWith('/app.js');

    if (isAppShell) {
        event.respondWith(
            fetch(req)
                .then((networkResponse) => {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
                    return networkResponse;
                })
                .catch(() => caches.match(req).then((r) => r || caches.match('index.html')))
        );
        return;
    }

    // 其他靜態資源：快取優先
    event.respondWith(
        caches.match(req).then((response) => {
            if (response) {
                return response;
            }
            return fetch(req).then((networkResponse) => {
                if (!networkResponse || networkResponse.status !== 200 || (networkResponse.type !== 'basic' && networkResponse.type !== 'opaque')) {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                if (urlsToCache.some((u) => req.url.includes(u))) {
                    caches.open(CACHE_NAME).then((cache) => cache.put(req, responseToCache)).catch(() => {});
                }
                return networkResponse;
            }).catch((error) => {
                console.error('[Service Worker] 獲取失敗:', error);
                return new Response('應用程式處於離線狀態，且資源不在快取中。', { status: 503 });
            });
        })
    );
});