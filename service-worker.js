// 快取版本號
const CACHE_NAME = 'diet-tracker-v1'; 

// 需要快取的靜態資源列表
const urlsToCache = [
    'index.html',
    'manifest.json',
    'https://cdn.tailwindcss.com',
    'https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap', // Google Font CSS
    'https://unpkg.com/lucide@latest' // Icon library
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

// 監聽 'fetch' 事件：攔截網路請求並使用快取優先策略
self.addEventListener('fetch', (event) => {
    // 僅處理 GET 請求
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // 1. 如果在快取中找到回應，則直接返回
                if (response) {
                    return response;
                }
                
                // 2. 如果快取中找不到，則發出網路請求
                return fetch(event.request).then((networkResponse) => {
                    // 檢查回應是否有效
                    if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic' && networkResponse.type !== 'opaque') {
                        return networkResponse;
                    }

                    // 3. 將網路回應複製一份，並存入快取 (快取新下載的資源)
                    const responseToCache = networkResponse.clone();
                    
                    // 僅快取核心資源或特定的跨來源資源
                    if (urlsToCache.some(url => event.request.url.includes(url))) {
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                // 限制快取大小，避免快取過大的圖片等
                                if (event.request.url.includes('fonts.gstatic.com')) {
                                    // 針對字體等特殊資源快取
                                    return cache.put(event.request, responseToCache);
                                }
                                // 快取應用程式外殼的其他內容
                                return cache.put(event.request, responseToCache);
                            });
                    }

                    return networkResponse;
                }).catch((error) => {
                    // 4. 網路錯誤時的處理，這是在離線時發生的
                    console.error('[Service Worker] 獲取失敗:', error);
                    // 如果快取和網路都失敗，可以返回一個離線頁面 (這裡我們沒有離線頁面，所以只返回錯誤)
                    return new Response('應用程式處於離線狀態，且資源不在快取中。', { status: 503 });
                });
            })
    );
});