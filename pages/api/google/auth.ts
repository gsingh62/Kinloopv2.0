// GET /api/google/auth?uid=xxx&roomId=xxx — Redirect to Google OAuth consent screen
import type { NextApiRequest, NextApiResponse } from 'next';
import { getGoogleAuthUrl } from '../../../lib/googleCalendar';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, roomId } = req.query;
    if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ error: 'uid is required' });
    }

    // Encode uid and roomId in state so we can recover them in callback
    const state = JSON.stringify({ uid, roomId: roomId || '' });
    const stateBase64 = Buffer.from(state).toString('base64url');

    const url = getGoogleAuthUrl(stateBase64);
    res.redirect(302, url);
}
