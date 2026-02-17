// GET /api/google/callback — Handle Google OAuth callback
import type { NextApiRequest, NextApiResponse } from 'next';
import { exchangeCodeForTokens, saveTokens } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { code, state, error } = req.query;

    if (error) {
        // User denied access
        return res.redirect(302, '/dashboard?gcal=denied');
    }

    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
        return res.status(400).json({ error: 'Missing code or state' });
    }

    try {
        // Decode state to get uid and roomId
        const stateJson = Buffer.from(state, 'base64url').toString('utf-8');
        const { uid, roomId } = JSON.parse(stateJson);

        if (!uid) return res.status(400).json({ error: 'Invalid state: missing uid' });

        // Exchange code for tokens
        const tokens = await exchangeCodeForTokens(code);

        // Fetch user's Google email for display
        let email = '';
        try {
            const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                headers: { Authorization: `Bearer ${tokens.access_token}` },
            });
            if (profileRes.ok) {
                const profile = await profileRes.json();
                email = profile.email || '';
            }
        } catch {}

        // Save tokens to Firestore
        await saveTokens(uid, tokens, email);

        // Redirect back to the room calendar with success indicator
        const redirectUrl = roomId
            ? `/room/${roomId}?tab=events&gcal=connected`
            : '/dashboard?gcal=connected';

        res.redirect(302, redirectUrl);
    } catch (err: any) {
        console.error('Google OAuth callback error:', err);
        res.redirect(302, '/dashboard?gcal=error');
    }
}
