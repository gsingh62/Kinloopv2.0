import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const adminDb = admin.firestore();

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:kinloop@example.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
    );
}

async function sendWithRetry(
    sub: { endpoint: string; keys: any },
    payload: string,
    retries = 2,
): Promise<{ ok: boolean; statusCode?: number }> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            await webpush.sendNotification(sub, payload, {
                TTL: 60 * 60 * 4,
                urgency: 'high',
            });
            return { ok: true };
        } catch (err: any) {
            const status = err.statusCode;
            // 410 Gone = subscription permanently invalid, no point retrying
            if (status === 410) return { ok: false, statusCode: 410 };
            // 404 = endpoint not found, might be temporary on iOS
            if (status === 404 && attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            // 429 = rate limited, wait and retry
            if (status === 429 && attempt < retries) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                continue;
            }
            // 5xx = server error, retry
            if (status >= 500 && attempt < retries) {
                await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
                continue;
            }
            return { ok: false, statusCode: status };
        }
    }
    return { ok: false };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { roomId, senderUid, title, body, url } = req.body;

    if (!roomId || !senderUid || !title) {
        return res.status(400).json({ error: 'roomId, senderUid, and title are required' });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return res.status(500).json({ error: 'VAPID keys not configured' });
    }

    try {
        const roomDoc = await adminDb.collection('rooms').doc(roomId).get();
        if (!roomDoc.exists) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const memberIds: string[] = roomDoc.data()?.memberIds || [];
        const targetMembers = memberIds.filter(id => id !== senderUid);

        if (targetMembers.length === 0) {
            return res.status(200).json({ sent: 0 });
        }

        // Firestore 'in' supports up to 30 items; batch if needed
        const batches: string[][] = [];
        for (let i = 0; i < targetMembers.length; i += 30) {
            batches.push(targetMembers.slice(i, i + 30));
        }

        let allDocs: admin.firestore.QueryDocumentSnapshot[] = [];
        for (const batch of batches) {
            const snap = await adminDb.collection('pushSubscriptions')
                .where('userId', 'in', batch)
                .get();
            allDocs = allDocs.concat(snap.docs);
        }

        if (allDocs.length === 0) {
            return res.status(200).json({ sent: 0, reason: 'no_subscriptions' });
        }

        const notifId = `${roomId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

        const payload = JSON.stringify({
            title,
            body,
            url: url || `/room/${roomId}`,
            roomId,
            tag: notifId,
        });

        let sent = 0;
        let failed = 0;
        const gone: string[] = []; // Only truly dead (410 Gone)

        const results = await Promise.all(allDocs.map(async (subDoc) => {
            const subData = subDoc.data().subscription;
            if (!subData?.endpoint || !subData?.keys) {
                return { id: subDoc.id, status: 'invalid' };
            }

            const result = await sendWithRetry(
                { endpoint: subData.endpoint, keys: subData.keys },
                payload,
            );

            if (result.ok) {
                sent++;
                return { id: subDoc.id, status: 'sent' };
            } else {
                failed++;
                // ONLY delete on 410 Gone — the subscription is confirmed dead
                // Do NOT delete on 404, 429, or any other error
                if (result.statusCode === 410) {
                    gone.push(subDoc.id);
                }
                return { id: subDoc.id, status: 'failed', code: result.statusCode };
            }
        }));

        // Only clean up confirmed-dead subscriptions (410 Gone)
        if (gone.length > 0) {
            await Promise.all(
                gone.map(id => adminDb.collection('pushSubscriptions').doc(id).delete())
            );
        }

        return res.status(200).json({ sent, failed, cleaned: gone.length, total: allDocs.length });
    } catch (error: any) {
        console.error('Push notification error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send push' });
    }
}
