// GET /api/google/calendars?uid=xxx — List user's Google Calendars
// POST /api/google/calendars — Update selected calendars
import type { NextApiRequest, NextApiResponse } from 'next';
import { getValidAccessToken, listCalendars, getTokens, updateSelectedCalendars } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method === 'GET') {
        const { uid } = req.query;
        if (!uid || typeof uid !== 'string') return res.status(400).json({ error: 'uid is required' });

        try {
            const accessToken = await getValidAccessToken(uid);
            const calendars = await listCalendars(accessToken);
            const stored = await getTokens(uid);

            return res.status(200).json({
                calendars,
                selectedCalendars: stored?.selectedCalendars || ['primary'],
                email: stored?.email || '',
            });
        } catch (err: any) {
            console.error('List calendars error:', err);
            return res.status(500).json({ error: err.message || 'Failed to list calendars' });
        }
    }

    if (req.method === 'POST') {
        const { uid, calendarIds } = req.body;
        if (!uid || !Array.isArray(calendarIds)) {
            return res.status(400).json({ error: 'uid and calendarIds are required' });
        }

        try {
            await updateSelectedCalendars(uid, calendarIds);
            return res.status(200).json({ success: true });
        } catch (err: any) {
            return res.status(500).json({ error: err.message });
        }
    }

    return res.status(405).json({ error: 'Method not allowed' });
}
