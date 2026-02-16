import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already
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
        // Get room members
        const roomDoc = await adminDb.collection('rooms').doc(roomId).get();
        if (!roomDoc.exists) {
            return res.status(404).json({ error: 'Room not found' });
        }

        const memberIds: string[] = roomDoc.data()?.memberIds || [];
        const targetMembers = memberIds.filter(id => id !== senderUid);

        if (targetMembers.length === 0) {
            return res.status(200).json({ sent: 0 });
        }

        // Get push subscriptions for target members
        const subscriptionsSnap = await adminDb.collection('pushSubscriptions')
            .where('userId', 'in', targetMembers)
            .get();

        if (subscriptionsSnap.empty) {
            return res.status(200).json({ sent: 0 });
        }

        const payload = JSON.stringify({
            title,
            body,
            url: url || `/room/${roomId}`,
            roomId,
            tag: `kinloop-${roomId}`,
        });

        let sent = 0;
        let failed = 0;
        const staleSubscriptionIds: string[] = [];

        const sendPromises = subscriptionsSnap.docs.map(async (subDoc) => {
            const subData = subDoc.data().subscription;
            if (!subData?.endpoint) return;

            try {
                await webpush.sendNotification(
                    {
                        endpoint: subData.endpoint,
                        keys: subData.keys,
                    },
                    payload,
                    { TTL: 60 * 60 } // 1 hour TTL
                );
                sent++;
            } catch (err: any) {
                failed++;
                // Remove stale subscriptions (410 Gone or 404)
                if (err.statusCode === 410 || err.statusCode === 404) {
                    staleSubscriptionIds.push(subDoc.id);
                }
            }
        });

        await Promise.all(sendPromises);

        // Clean up stale subscriptions
        if (staleSubscriptionIds.length > 0) {
            await Promise.all(
                staleSubscriptionIds.map(id =>
                    adminDb.collection('pushSubscriptions').doc(id).delete()
                )
            );
        }

        return res.status(200).json({ sent, failed, cleaned: staleSubscriptionIds.length });
    } catch (error: any) {
        console.error('Push notification error:', error);
        return res.status(500).json({ error: error.message || 'Failed to send push' });
    }
}
