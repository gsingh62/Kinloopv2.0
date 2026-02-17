// POST /api/google/sync — Sync events between Google Calendar and KinLoop
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../../lib/firebaseAdmin';
import {
    getValidAccessToken,
    getTokens,
    listEvents,
    googleToKinloopEvent,
} from '../../../lib/googleCalendar';

/** Recursively strip undefined values so Firestore doesn't reject the write */
function stripUndefined(obj: any): any {
    if (Array.isArray(obj)) return obj.map(stripUndefined);
    if (obj && typeof obj === 'object' && !(obj instanceof Date)) {
        const clean: any = {};
        for (const [k, v] of Object.entries(obj)) {
            if (v !== undefined) clean[k] = stripUndefined(v);
        }
        return clean;
    }
    return obj;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, roomId } = req.body;
    if (!uid || !roomId) return res.status(400).json({ error: 'uid and roomId are required' });

    try {
        const accessToken = await getValidAccessToken(uid);
        const stored = await getTokens(uid);
        if (!stored) return res.status(400).json({ error: 'Google Calendar not connected' });

        const calendarIds = stored.selectedCalendars || ['primary'];

        // Time range: 3 months back, 12 months forward
        const now = new Date();
        const timeMin = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
        const timeMax = new Date(now.getFullYear(), now.getMonth() + 12, 0).toISOString();

        const eventsRef = adminDb.collection('rooms').doc(roomId).collection('events');

        let imported = 0;
        let updated = 0;
        let removed = 0;
        const errors: string[] = [];

        for (const calendarId of calendarIds) {
            try {
                const { events: googleEvents } = await listEvents(accessToken, calendarId, timeMin, timeMax);

                // Get existing Google-imported events for this calendar
                const existingSnap = await eventsRef
                    .where('source', '==', 'google')
                    .where('googleCalendarId', '==', calendarId)
                    .where('createdBy', '==', uid)
                    .get();

                const existingByGoogleId = new Map<string, FirebaseFirestore.DocumentSnapshot>();
                existingSnap.docs.forEach(doc => {
                    const data = doc.data();
                    if (data.googleEventId) {
                        existingByGoogleId.set(data.googleEventId, doc);
                    }
                });

                const seenGoogleIds = new Set<string>();

                for (const gEvent of googleEvents) {
                    if (!gEvent.id || gEvent.status === 'cancelled') continue;
                    seenGoogleIds.add(gEvent.id);

                    const kinEvent = googleToKinloopEvent(gEvent);
                    const existing = existingByGoogleId.get(gEvent.id);

                    if (existing) {
                        // Update existing event
                        await existing.ref.update(stripUndefined({
                            title: kinEvent.title,
                            date: kinEvent.date,
                            startTime: kinEvent.startTime || null,
                            endTime: kinEvent.endTime || null,
                            description: kinEvent.description || null,
                            allDay: kinEvent.allDay,
                            participants: kinEvent.participants || [],
                            syncedAt: Date.now(),
                        }));
                        updated++;
                    } else {
                        // Create new event
                        await eventsRef.add(stripUndefined({
                            title: kinEvent.title,
                            date: kinEvent.date,
                            startTime: kinEvent.startTime || null,
                            endTime: kinEvent.endTime || null,
                            description: kinEvent.description || null,
                            allDay: kinEvent.allDay,
                            color: '#4285F4', // Google blue
                            createdBy: uid,
                            participants: kinEvent.participants || [],
                            source: 'google',
                            googleEventId: gEvent.id,
                            googleCalendarId: calendarId,
                            visibility: 'everyone',
                            syncedAt: Date.now(),
                            createdAt: new Date(),
                        }));
                        imported++;
                    }
                }

                // Remove events that no longer exist in Google Calendar
                for (const [googleId, docSnap] of existingByGoogleId) {
                    if (!seenGoogleIds.has(googleId)) {
                        await docSnap.ref.delete();
                        removed++;
                    }
                }
            } catch (calErr: any) {
                const errMsg = calErr?.message || String(calErr);
                console.error(`Sync error for calendar ${calendarId}:`, calErr);
                errors.push(`Calendar ${calendarId}: ${errMsg}`);
            }
        }

        return res.status(200).json({
            success: errors.length === 0,
            imported,
            updated,
            removed,
            total: imported + updated,
            errors: errors.length > 0 ? errors : undefined,
        });
    } catch (err: any) {
        console.error('Sync error:', err);
        return res.status(500).json({ error: err.message || 'Sync failed' });
    }
}
