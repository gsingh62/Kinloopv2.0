// GET /api/google/auth?uid=xxx&roomId=xxx — Redirect to Google OAuth consent screen
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { uid, roomId, debug } = req.query;
    if (!uid || typeof uid !== 'string') {
        return res.status(400).json({ error: 'uid is required' });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://kin-loop.vercel.app/api/google/callback';

    // Debug mode: show the URL instead of redirecting
    if (debug === '1') {
        return res.status(200).json({
            hasClientId: !!clientId,
            clientIdPrefix: clientId?.slice(0, 10) || 'MISSING',
            redirectUri,
            hasSecret: !!process.env.GOOGLE_CLIENT_SECRET,
        });
    }

    if (!clientId) {
        return res.status(500).json({ error: 'GOOGLE_CLIENT_ID not configured' });
    }

    // Encode uid and roomId in state so we can recover them in callback
    const state = JSON.stringify({ uid, roomId: roomId || '' });
    const stateBase64 = Buffer.from(state).toString('base64url');

    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'https://www.googleapis.com/auth/calendar',
        access_type: 'offline',
        prompt: 'consent',
        state: stateBase64,
    });

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    res.redirect(302, url);
}
