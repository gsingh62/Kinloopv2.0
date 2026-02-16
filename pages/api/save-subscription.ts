import type { NextApiRequest, NextApiResponse } from 'next';
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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).end();

    const { userId, subscription, oldEndpoint } = req.body;

    if (!userId || !subscription?.endpoint || !subscription?.keys) {
        return res.status(400).json({ error: 'userId and subscription required' });
    }

    try {
        // Generate a document ID from the new endpoint
        const subId = Buffer.from(subscription.endpoint)
            .toString('base64')
            .replace(/[^a-zA-Z0-9]/g, '')
            .slice(0, 40);

        // Save the new subscription
        await adminDb.collection('pushSubscriptions').doc(`${userId}_${subId}`).set({
            userId,
            subscription,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        // If there's an old endpoint, clean it up
        if (oldEndpoint && oldEndpoint !== subscription.endpoint) {
            const oldSubId = Buffer.from(oldEndpoint)
                .toString('base64')
                .replace(/[^a-zA-Z0-9]/g, '')
                .slice(0, 40);
            const oldDocId = `${userId}_${oldSubId}`;
            await adminDb.collection('pushSubscriptions').doc(oldDocId).delete().catch(() => {});
        }

        return res.status(200).json({ ok: true });
    } catch (error: any) {
        console.error('Save subscription error:', error);
        return res.status(500).json({ error: error.message });
    }
}
