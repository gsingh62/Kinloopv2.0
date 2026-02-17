// POST /api/google/disconnect — Revoke Google access and remove stored tokens
import type { NextApiRequest, NextApiResponse } from 'next';
import { getTokens, removeTokens } from '../../../lib/googleCalendar';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { uid } = req.body;
    if (!uid) return res.status(400).json({ error: 'uid is required' });

    try {
        const tokens = await getTokens(uid);

        // Revoke the token at Google (best-effort)
        if (tokens?.accessToken) {
            try {
                await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.accessToken}`, {
                    method: 'POST',
                });
            } catch {}
        }

        // Remove from Firestore
        await removeTokens(uid);

        return res.status(200).json({ success: true });
    } catch (err: any) {
        console.error('Disconnect error:', err);
        return res.status(500).json({ error: err.message || 'Failed to disconnect' });
    }
}
