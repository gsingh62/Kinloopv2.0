// sw.js — KinLoop Service Worker
// Provides offline caching and enables PWA installability

const CACHE_NAME = 'kinloop-v1';

// Pre-cache the app shell on install
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/dashboard',
                '/manifest.json',
            ]);
        })
    );
    // Activate immediately
    self.skipWaiting();
});

// Clean up old caches on activate
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
    // Take control of all pages immediately
    self.clients.claim();
});

// Network-first strategy: try network, fall back to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests and Firebase/external API calls
    if (event.request.method !== 'GET') return;
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    // For navigation requests (HTML pages), use network-first
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache a copy of the response
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(() => {
                    // If offline, serve from cache
                    return caches.match(event.request).then((cached) => {
                        return cached || caches.match('/');
                    });
                })
        );
        return;
    }

    // For static assets (_next/static/), use cache-first
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

    // For everything else, network-first with cache fallback
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
