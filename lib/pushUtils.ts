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
    // Fire-and-forget — never blocks navigation or rendering
    setTimeout(async () => {
        try {
            if (typeof window === 'undefined') return;
            if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
            if (!('Notification' in window)) return;
            if (!VAPID_PUBLIC_KEY) return;

            // Only proceed if permission is already granted.
            // If 'default', request it — but if denied, bail out.
            let permission = Notification.permission;
            if (permission === 'default') {
                permission = await Notification.requestPermission();
            }
            if (permission !== 'granted') return;

            const registration = await navigator.serviceWorker.ready;

            // Check for existing subscription
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            }

            await savePushSubscription(subscription);
        } catch (err) {
            console.error('Push subscription failed (non-fatal):', err);
        }
    }, 2000); // Delay 2s so it never races with page load
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
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('Failed to save push subscription (non-fatal):', err);
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

/**
 * Send a push notification to all members of a room (except the sender).
 * Calls the /api/push server route which handles the actual web-push sending.
 */
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
        // Push notification is best-effort, don't block the UI
    }
}
