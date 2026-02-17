// POST /api/google/export — Export a KinLoop event to Google Calendar
import type { NextApiRequest, NextApiResponse } from 'next';
import { adminDb } from '../../../lib/firebaseAdmin';
import {
    getValidAccessToken,
    getTokens,
    createEvent,
    updateEvent,
    deleteEvent as deleteGoogleEvent,
    kinloopToGoogleEvent,
} from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, roomId, eventId, action } = req.body;
    if (!uid || !roomId || !eventId) {
        return res.status(400).json({ error: 'uid, roomId, and eventId are required' });
    }

    try {
        const accessToken = await getValidAccessToken(uid);
        const stored = await getTokens(uid);
        if (!stored) return res.status(400).json({ error: 'Google Calendar not connected' });

        const calendarId = stored.selectedCalendars?.[0] || 'primary';
        const eventRef = adminDb.collection('rooms').doc(roomId).collection('events').doc(eventId);
        const eventSnap = await eventRef.get();

        if (!eventSnap.exists) {
            return res.status(404).json({ error: 'Event not found' });
        }

        const eventData = eventSnap.data()!;

        if (action === 'delete' && eventData.googleEventId) {
            // Remove from Google Calendar
            await deleteGoogleEvent(accessToken, calendarId, eventData.googleEventId);
            await eventRef.update({
                googleEventId: null,
                googleCalendarId: null,
                syncedAt: Date.now(),
            });
            return res.status(200).json({ success: true, action: 'deleted' });
        }

        // Convert to Google event format
        const gEvent = kinloopToGoogleEvent({
            title: eventData.title,
            date: eventData.date,
            startTime: eventData.startTime,
            endTime: eventData.endTime,
            description: eventData.description,
            allDay: eventData.allDay,
            participants: eventData.participants,
        });

        if (eventData.googleEventId) {
            // Update existing Google event
            const updated = await updateEvent(accessToken, calendarId, eventData.googleEventId, gEvent);
            await eventRef.update({
                googleEventId: updated.id,
                googleCalendarId: calendarId,
                syncedAt: Date.now(),
            });
            return res.status(200).json({ success: true, action: 'updated', googleEventId: updated.id });
        } else {
            // Create new Google event
            const created = await createEvent(accessToken, calendarId, gEvent);
            await eventRef.update({
                googleEventId: created.id,
                googleCalendarId: calendarId,
                syncedAt: Date.now(),
            });
            return res.status(200).json({ success: true, action: 'created', googleEventId: created.id });
        }
    } catch (err: any) {
        console.error('Export error:', err);
        return res.status(500).json({ error: err.message || 'Export failed' });
    }
}
