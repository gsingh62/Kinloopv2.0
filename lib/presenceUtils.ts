import { db, auth } from './firebase';
import { doc, setDoc, onSnapshot, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';

const HEARTBEAT_INTERVAL = 60_000; // 1 minute
const ONLINE_THRESHOLD = 2 * 60_000; // 2 minutes

export interface PresenceData {
    uid: string;
    isOnline: boolean;
    lastSeen: Date | null;
}

let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

export function startPresence(roomId: string) {
    const user = auth.currentUser;
    if (!user || typeof window === 'undefined') return;

    const presenceRef = doc(db, 'rooms', roomId, 'presence', user.uid);

    const updatePresence = () => {
        setDoc(presenceRef, {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || user.email?.split('@')[0] || '',
            lastSeen: serverTimestamp(),
            isOnline: true,
        }, { merge: true }).catch(() => {});
    };

    // Initial update
    updatePresence();

    // Heartbeat
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(updatePresence, HEARTBEAT_INTERVAL);

    // Update on visibility change
    const handleVisibility = () => {
        if (document.visibilityState === 'visible') {
            updatePresence();
        } else {
            // Mark as offline when tab becomes hidden
            setDoc(presenceRef, { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
        }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // Mark offline on page unload
    const handleUnload = () => {
        // Use sendBeacon for reliability on mobile
        const data = JSON.stringify({ roomId, uid: user.uid });
        navigator.sendBeacon?.('/api/presence-offline', data);
    };
    window.addEventListener('beforeunload', handleUnload);

    return () => {
        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        document.removeEventListener('visibilitychange', handleVisibility);
        window.removeEventListener('beforeunload', handleUnload);
        setDoc(presenceRef, { isOnline: false, lastSeen: serverTimestamp() }, { merge: true }).catch(() => {});
    };
}

export function subscribeToPresence(roomId: string, callback: (presence: PresenceData[]) => void) {
    const presenceCol = collection(db, 'rooms', roomId, 'presence');
    return onSnapshot(presenceCol, (snapshot) => {
        const now = Date.now();
        const presenceList = snapshot.docs.map(d => {
            const data = d.data();
            const lastSeen = data.lastSeen?.toDate?.() || null;
            const isOnline = data.isOnline && lastSeen && (now - lastSeen.getTime()) < ONLINE_THRESHOLD;
            return {
                uid: d.id,
                isOnline: !!isOnline,
                lastSeen,
            };
        });
        callback(presenceList);
    });
}

// ─── Read Receipts ───

export async function updateReadReceipt(roomId: string, lastMessageId: string) {
    const user = auth.currentUser;
    if (!user || !lastMessageId) return;

    try {
        await setDoc(doc(db, 'rooms', roomId, 'readReceipts', user.uid), {
            uid: user.uid,
            email: user.email || '',
            name: user.displayName || user.email?.split('@')[0] || '',
            lastReadMessageId: lastMessageId,
            readAt: serverTimestamp(),
        });
    } catch (err) {
        console.error('Failed to update read receipt:', err);
    }
}

export interface ReadReceipt {
    uid: string;
    name: string;
    lastReadMessageId: string;
    readAt: Date | null;
}

export function subscribeToReadReceipts(roomId: string, callback: (receipts: ReadReceipt[]) => void) {
    const receiptsCol = collection(db, 'rooms', roomId, 'readReceipts');
    return onSnapshot(receiptsCol, (snapshot) => {
        const receipts = snapshot.docs.map(d => {
            const data = d.data();
            return {
                uid: d.id,
                name: data.name || data.email?.split('@')[0] || 'Unknown',
                lastReadMessageId: data.lastReadMessageId || '',
                readAt: data.readAt?.toDate?.() || null,
            };
        });
        callback(receipts);
    });
}
