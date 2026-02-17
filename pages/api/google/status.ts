// GET /api/google/status?uid=xxx — Check if user has Google Calendar connected
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTokens } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { uid } = req.query;
    if (!uid || typeof uid !== 'string') return res.status(400).json({ error: 'uid is required' });

    try {
        const tokens = await getTokens(uid);
        if (!tokens) {
            return res.status(200).json({ connected: false });
        }
        return res.status(200).json({
            connected: true,
            email: tokens.email || '',
            selectedCalendars: tokens.selectedCalendars || ['primary'],
            connectedAt: tokens.connectedAt,
        });
    } catch (err: any) {
        return res.status(200).json({ connected: false });
    }
}
