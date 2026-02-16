import { db, auth } from './firebase';
import { doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
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

            // Send the user ID to the service worker so it can handle
            // subscription changes even when the app is closed
            const user = auth.currentUser;
            if (user) {
                registration.active?.postMessage({
                    type: 'SET_USER_ID',
                    userId: user.uid,
                });
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

            // Always save — ensures Firestore has the current subscription
            await savePushSubscription(subscription);

            // Listen for subscription changes from the SW
            navigator.serviceWorker.addEventListener('message', async (event) => {
                if (event.data?.type === 'PUSH_SUBSCRIPTION_CHANGED') {
                    const newSub = await registration.pushManager.getSubscription();
                    if (newSub) await savePushSubscription(newSub);
                }
            });
        } catch (err) {
            console.error('Push subscription failed (non-fatal):', err);
        }
    }, 2000);
}

async function savePushSubscription(subscription: PushSubscription) {
    try {
        const user = auth.currentUser;
        if (!user) return;

        const subData = subscription.toJSON();
        if (!subData.endpoint) return;
        const subId = btoa(subData.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

        await setDoc(doc(db, 'pushSubscriptions', `${user.uid}_${subId}`), {
            userId: user.uid,
            email: user.email || '',
            subscription: subData,
            userAgent: navigator.userAgent || '',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('Failed to save push subscription (non-fatal):', err);
    }
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

        const subId = btoa(subData.endpoint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

        try {
            await setDoc(doc(db, 'pushSubscriptions', `${user.uid}_${subId}`), {
                userId: user.uid,
                email: user.email || '',
                subscription: subData,
                userAgent: navigator.userAgent || '',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (err: any) {
            return `error: Firestore save failed — ${err.message || err}`;
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
            const user = auth.currentUser;
            if (user) {
                const subData = subscription.toJSON();
                const subId = btoa(subData.endpoint || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);
                await deleteDoc(doc(db, 'pushSubscriptions', `${user.uid}_${subId}`));
            }
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
