// lib/firestoreUtils.ts
import { db } from './firebase';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    orderBy,
    onSnapshot,
    doc,
    deleteDoc,
    setDoc,
    getDocs, updateDoc
} from 'firebase/firestore';

export async function updateDocTitle(roomId: string, docId: string, title: string) {
    const ref = doc(db, 'rooms', roomId, 'documents', docId);
    await updateDoc(ref, { title });
}

export async function createDoc(roomId: string, title: string, content: string, userId: string) {
    const docRef = await addDoc(collection(db, 'rooms', roomId, 'documents'), {
        title,
        content,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: userId,
    });
    return docRef.id;
}

export async function fetchDocs(roomId: string): Promise<any[]> {
    const docsSnap = await getDocs(collection(db, 'rooms', roomId, 'documents'));
    return docsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

export const addComment = async (
    roomId: string,
    text: string,
    userId: string,
    userEmail: string
) => {
    const commentRef = collection(db, 'rooms', roomId, 'comments');
    await addDoc(commentRef, {
        text,
        userId,
        userEmail,
        createdAt: serverTimestamp(),
    });
};

export function subscribeToDoc(
    roomId: string,
    docId: string,
    onUpdate: (content: any) => void
) {
    const docRef = doc(db, 'rooms', roomId, 'documents', docId);
    return onSnapshot(docRef, snapshot => {
        const data = snapshot.data();
        if (data?.content) onUpdate(data.content);
    });
}

/**
 * One-time fetch of document content (no subscription / feedback loop).
 */
export async function fetchDocContent(roomId: string, docId: string): Promise<string> {
    const { getDoc } = await import('firebase/firestore');
    const docRef = doc(db, 'rooms', roomId, 'documents', docId);
    const snap = await getDoc(docRef);
    const data = snap.data();
    return data?.content || '';
}


/**
 * Save document content to Firestore.
 * Includes lastEditedBy and updatedAt for real-time collaboration.
 */
export async function saveDoc(roomId: string, docId: string, content: any, userId?: string) {
    const docRef = doc(db, 'rooms', roomId, 'documents', docId);
    await setDoc(docRef, {
        content,
        updatedAt: serverTimestamp(),
        ...(userId ? { lastEditedBy: userId } : {}),
    }, { merge: true });
}


// ─── Enhanced Calendar Event Types ───

export interface CalendarEvent {
    id: string;
    title: string;
    date: string;        // YYYY-MM-DD
    startTime?: string;  // HH:mm (24h)
    endTime?: string;    // HH:mm (24h)
    description?: string;
    color: string;       // hex color for visual coding
    assignedTo?: string[];  // array of user UIDs
    allDay: boolean;
    createdBy: string;   // UID
    createdAt?: any;
}

export type CalendarEventInput = Omit<CalendarEvent, 'id' | 'createdAt'>;

export function subscribeToEvents(roomId: string, callback: (events: CalendarEvent[]) => void) {
    const colRef = collection(db, 'rooms', roomId, 'events');
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as CalendarEvent));
        callback(data);
    });
}

export async function getEvents(roomId: string, setEvents: (events: any[]) => void) {
    const colRef = collection(db, 'rooms', roomId, 'events');
    return onSnapshot(colRef, (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setEvents(data);
    });
}

export async function addEvent(roomId: string, title: string, date: string) {
    const colRef = collection(db, 'rooms', roomId, 'events');
    await addDoc(colRef, { title, date, allDay: true, color: '#3B82F6', createdAt: serverTimestamp() });
}

// Firestore does not accept undefined values — strip them out
function stripUndefined(obj: Record<string, any>): Record<string, any> {
    return Object.fromEntries(Object.entries(obj).filter(([_, v]) => v !== undefined));
}

export async function addCalendarEvent(roomId: string, event: CalendarEventInput) {
    const colRef = collection(db, 'rooms', roomId, 'events');
    await addDoc(colRef, { ...stripUndefined(event as any), createdAt: serverTimestamp() });
}

export async function updateCalendarEvent(roomId: string, eventId: string, updates: Partial<CalendarEventInput>) {
    const ref = doc(db, 'rooms', roomId, 'events', eventId);
    await updateDoc(ref, stripUndefined(updates as any));
}

export async function deleteEvent(roomId: string, eventId: string) {
    const docRef = doc(db, 'rooms', roomId, 'events', eventId);
    await deleteDoc(docRef);
}

export const deleteListItem = async (roomId: string, itemId: string) => {
    const itemRef = doc(db, 'rooms', roomId, 'lists', itemId);
    await deleteDoc(itemRef);
};
export const getLists = (roomId: string, callback: (data: any[]) => void) => {
    const q = query(collection(db, 'rooms', roomId, 'lists'), orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        callback(items);
    });
};

export const addListItem = async (roomId: string, text: string) => {
    await addDoc(collection(db, 'rooms', roomId, 'lists'), {
        text,
        createdAt: new Date().toISOString(),
    });
};

/**
 * Send a message to a specific room's chat
 */
export async function sendMessage(roomId: string, content: string, senderId: string, senderEmail: string) {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    await addDoc(messagesRef, {
        content,
        senderId,
        senderEmail,
        createdAt: serverTimestamp(),
    });
}

/**
 * Optional: Real-time listener for messages in a room (you can call this later when rendering messages)
 */
export function subscribeToMessages(roomId: string, callback: (messages: any[]) => void) {
    const messagesRef = collection(db, 'rooms', roomId, 'messages');
    const q = query(messagesRef, orderBy('createdAt', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        callback(messages);
    });
}
