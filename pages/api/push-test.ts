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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    const { userId, action } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId required' });

    try {
        // Action: "check" — see what subscriptions exist for this user
        if (action === 'check') {
            const snap = await adminDb.collection('pushSubscriptions')
                .where('userId', '==', userId)
                .get();

            const subs = snap.docs.map(d => {
                const data = d.data();
                const endpoint = data.subscription?.endpoint || 'no endpoint';
                const hasKeys = !!(data.subscription?.keys?.p256dh && data.subscription?.keys?.auth);
                return {
                    docId: d.id,
                    endpoint: endpoint.slice(0, 60) + '...',
                    hasKeys,
                    userAgent: (data.userAgent || '').slice(0, 50),
                    updatedAt: data.updatedAt?.toDate?.()?.toISOString() || 'unknown',
                };
            });

            return res.status(200).json({
                vapidConfigured: !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY),
                subscriptionCount: subs.length,
                subscriptions: subs,
            });
        }

        // Action: "test" — send a test push to this user
        if (action === 'test') {
            const snap = await adminDb.collection('pushSubscriptions')
                .where('userId', '==', userId)
                .get();

            if (snap.empty) {
                return res.status(200).json({ sent: 0, error: 'No subscriptions found for this user' });
            }

            const payload = JSON.stringify({
                title: 'KinLoop Test',
                body: `Test notification at ${new Date().toLocaleTimeString()}`,
                tag: 'test-' + Date.now(),
                url: '/',
            });

            const results: any[] = [];

            for (const subDoc of snap.docs) {
                const subData = subDoc.data().subscription;
                if (!subData?.endpoint || !subData?.keys) {
                    results.push({ docId: subDoc.id, status: 'invalid', detail: 'missing endpoint or keys' });
                    continue;
                }

                try {
                    await webpush.sendNotification(
                        { endpoint: subData.endpoint, keys: subData.keys },
                        payload,
                        { TTL: 60, urgency: 'high' },
                    );
                    results.push({ docId: subDoc.id, status: 'sent' });
                } catch (err: any) {
                    results.push({
                        docId: subDoc.id,
                        status: 'failed',
                        statusCode: err.statusCode,
                        message: err.body || err.message || 'unknown error',
                    });
                }
            }

            const sentCount = results.filter(r => r.status === 'sent').length;
            return res.status(200).json({ sent: sentCount, total: results.length, results });
        }

        return res.status(400).json({ error: 'action must be "check" or "test"' });
    } catch (error: any) {
        return res.status(500).json({ error: error.message });
    }
}
