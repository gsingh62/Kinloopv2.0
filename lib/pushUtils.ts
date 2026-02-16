import { auth } from './firebase';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
}

/**
 * Save push subscription via server API (bypasses Firestore security rules).
 */
async function savePushSubscriptionViaAPI(subscription: PushSubscription, userId: string, email: string): Promise<void> {
    const subData = subscription.toJSON();
    const resp = await fetch('/api/save-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            email,
            subscription: subData,
            userAgent: navigator.userAgent || '',
        }),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'unknown' }));
        throw new Error(err.error || `HTTP ${resp.status}`);
    }
}

export function subscribeToPush(): void {
    setTimeout(async () => {
        try {
            if (typeof window === 'undefined') return;
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
            if (!('Notification' in window)) return;
            if (!VAPID_PUBLIC_KEY) return;

            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            if (permission !== 'granted') return;

            const registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('SW ready timeout')), 10000)
                ),
            ]);

            const user = auth.currentUser;
            if (user && registration.active) {
                registration.active.postMessage({ type: 'SET_USER_ID', userId: user.uid });
            }

            let subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                try {
                    const subJson = subscription.toJSON();
                    if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
                        await subscription.unsubscribe();
                        subscription = null;
                    }
                } catch {
                    subscription = null;
                }
            }

            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            }

            if (user) {
                await savePushSubscriptionViaAPI(subscription, user.uid, user.email || '');
            }

            navigator.serviceWorker.addEventListener('message', async (event) => {
                if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
                    const newSub = await registration.pushManager.getSubscription();
                    if (newSub && user) {
                        await savePushSubscriptionViaAPI(newSub, user.uid, user.email || '');
                    }
                }
            });
        } catch (err) {
            console.error('Push subscription failed (non-fatal):', err);
        }
    }, 2000);
}

/**
 * Synchronous version that returns detailed status for the UI.
 */
export async function subscribeToPushWithStatus(): Promise<string> {
    try {
        if (typeof window === 'undefined') return 'error: not in browser';
        if (!('serviceWorker' in navigator)) return 'error: no service worker support';
        if (!('PushManager' in window)) return 'error: no PushManager support';
        if (!('Notification' in window)) return 'error: no Notification support';
        if (!VAPID_PUBLIC_KEY) return 'error: VAPID key not configured';

        const permission = Notification.permission;
        if (permission !== 'granted') return `error: permission is "${permission}"`;

        const user = auth.currentUser;
        if (!user) return 'error: not logged in';

        let registration: ServiceWorkerRegistration;
        try {
            registration = await Promise.race([
                navigator.serviceWorker.ready,
                new Promise<never>((_, reject) =>
                    setTimeout(() => reject(new Error('timeout')), 10000)
                ),
            ]);
        } catch {
            return 'error: service worker not ready (timeout)';
        }

        if (registration.active) {
            registration.active.postMessage({ type: 'SET_USER_ID', userId: user.uid });
        }

        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            const subJson = subscription.toJSON();
            if (!subJson.endpoint || !subJson.keys?.p256dh || !subJson.keys?.auth) {
                await subscription.unsubscribe();
                subscription = null;
            }
        }

        if (!subscription) {
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            } catch (err: any) {
                return `error: subscribe failed — ${err.message || err}`;
            }
        }

        if (!subscription) return 'error: subscription is null after subscribe';

        const subData = subscription.toJSON();
        if (!subData.endpoint) return 'error: subscription has no endpoint';

        try {
            await savePushSubscriptionViaAPI(subscription, user.uid, user.email || '');
        } catch (err: any) {
            return `error: save failed — ${err.message || err}`;
        }

        const endpoint = subData.endpoint || '';
        const shortEndpoint = endpoint.slice(0, 50);
        return `ok: saved (${shortEndpoint}...)`;
    } catch (err: any) {
        return `error: ${err.message || err}`;
    }
}

export async function unsubscribeFromPush() {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await subscription.unsubscribe();
        }
    } catch (err) {
        console.error('Push unsubscribe failed:', err);
    }
}

export async function notifyRoomMembers(
    roomId: string,
    senderUid: string,
    title: string,
    body: string,
    url?: string,
) {
    try {
        await fetch('/api/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ roomId, senderUid, title, body, url }),
        });
    } catch {
        // Best-effort
    }
}
