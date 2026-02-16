// sw.js — KinLoop Service Worker v4
// Push notifications, offline caching, PWA installability

const CACHE_NAME = 'kinloop-v4';

// ─── IndexedDB helper for storing user ID ───
function openKinloopDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('kinloop-sw', 1);
        req.onupgradeneeded = () => {
            req.result.createObjectStore('meta');
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function getStoredUserId() {
    try {
        const db = await openKinloopDB();
        return new Promise((resolve) => {
            const tx = db.transaction('meta', 'readonly');
            const req = tx.objectStore('meta').get('userId');
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function storeUserId(userId) {
    try {
        const db = await openKinloopDB();
        const tx = db.transaction('meta', 'readwrite');
        tx.objectStore('meta').put(userId, 'userId');
    } catch {
        // Not critical
    }
}

// ─── Listen for messages from the app ───
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SET_USER_ID' && event.data.userId) {
        storeUserId(event.data.userId);
    }
});

// ─── Push Notifications ───
self.addEventListener('push', (event) => {
    if (!event.data) return;
    let data;
    try {
        data = event.data.json();
    } catch {
        data = { title: 'KinLoop', body: event.data.text() };
    }

    const uniqueTag = data.tag || ('kinloop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));

    const options = {
        body: data.body || '',
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: uniqueTag,
        renotify: true,
        requireInteraction: false,
        data: {
            url: data.url || '/',
            roomId: data.roomId,
        },
        vibrate: [200, 100, 200],
        silent: false,
    };

    event.waitUntil(
        self.registration.showNotification(data.title || 'KinLoop', options)
    );
});

// ─── Notification Click ───
self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const urlToOpen = event.notification.data?.url || '/';
    const fullUrl = new URL(urlToOpen, self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    client.navigate(fullUrl);
                    return;
                }
            }
            return self.clients.openWindow(fullUrl);
        })
    );
});

// ─── Subscription Change (critical for iOS) ───
// When iOS/Apple rotates the push endpoint, re-subscribe and save directly via API
self.addEventListener('pushsubscriptionchange', (event) => {
    event.waitUntil((async () => {
        try {
            const newSub = await self.registration.pushManager.subscribe(
                event.oldSubscription?.options || { userVisibleOnly: true }
            );

            const userId = await getStoredUserId();
            if (!userId) return;

            // Save new subscription directly to Firestore via our API
            await fetch(new URL('/api/save-subscription', self.location.origin).href, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    subscription: newSub.toJSON(),
                    oldEndpoint: event.oldSubscription?.endpoint || null,
                }),
            });

            // Also notify any open clients
            const clients = await self.clients.matchAll();
            clients.forEach((client) => {
                client.postMessage({
                    type: 'PUSH_SUBSCRIPTION_CHANGED',
                    subscription: newSub.toJSON(),
                });
            });
        } catch (err) {
            // Subscription change handling failed — will be retried next time app opens
        }
    })());
});

// ─── Install ───
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(['/', '/dashboard']);
        })
    );
    self.skipWaiting();
});

// ─── Activate ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// ─── Fetch: Network-first ───
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then((cached) => {
                        return cached || caches.match('/');
                    });
                })
        );
        return;
    }

    if (url.pathname.startsWith('/_next/static/')) {
        event.respondWith(
            caches.match(event.request).then((cached) => {
                if (cached) return cached;
                return fetch(event.request).then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                });
            })
        );
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
