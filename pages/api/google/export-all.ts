// POST /api/google/export-all — Export all KinLoop-created events to Google Calendar
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../../lib/firebaseAdmin';
import {
    getValidAccessToken,
    getTokens,
    createEvent,
    updateEvent,
    kinloopToGoogleEvent,
} from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, roomId } = req.body;
    if (!uid || !roomId) return res.status(400).json({ error: 'uid and roomId are required' });

    try {
        const accessToken = await getValidAccessToken(uid);
        const stored = await getTokens(uid);
        if (!stored) return res.status(400).json({ error: 'Google Calendar not connected' });

        const calendarId = stored.selectedCalendars?.[0] || 'primary';
        const eventsRef = adminDb.collection('rooms').doc(roomId).collection('events');

        // Get all KinLoop-created events (source !== 'google') that haven't been exported yet
        const snapshot = await eventsRef.get();
        const kinloopEvents = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.source !== 'google' && !data.googleEventId;
        });

        let exported = 0;
        let failed = 0;

        for (const doc of kinloopEvents) {
            const eventData = doc.data();
            try {
                const gEvent = kinloopToGoogleEvent({
                    title: eventData.title,
                    date: eventData.date,
                    startTime: eventData.startTime,
                    endTime: eventData.endTime,
                    description: eventData.description,
                    allDay: eventData.allDay,
                    participants: eventData.participants,
                });

                const created = await createEvent(accessToken, calendarId, gEvent);
                await doc.ref.update({
                    googleEventId: created.id,
                    googleCalendarId: calendarId,
                    syncedAt: Date.now(),
                });
                exported++;
            } catch (err: any) {
                console.error(`Failed to export event ${doc.id}:`, err);
                failed++;
            }
        }

        // Also update existing exported events
        const alreadyExported = snapshot.docs.filter(doc => {
            const data = doc.data();
            return data.source !== 'google' && data.googleEventId;
        });

        let updated = 0;
        for (const doc of alreadyExported) {
            const eventData = doc.data();
            try {
                const gEvent = kinloopToGoogleEvent({
                    title: eventData.title,
                    date: eventData.date,
                    startTime: eventData.startTime,
                    endTime: eventData.endTime,
                    description: eventData.description,
                    allDay: eventData.allDay,
                    participants: eventData.participants,
                });

                await updateEvent(accessToken, calendarId, eventData.googleEventId, gEvent);
                await doc.ref.update({ syncedAt: Date.now() });
                updated++;
            } catch (err: any) {
                console.error(`Failed to update Google event for ${doc.id}:`, err);
            }
        }

        return res.status(200).json({
            success: true,
            exported,
            updated,
            failed,
        });
    } catch (err: any) {
        console.error('Export-all error:', err);
        return res.status(500).json({ error: err.message || 'Export failed' });
    }
}
