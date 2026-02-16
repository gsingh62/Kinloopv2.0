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

    try {
        const { roomId, uid } = req.body;
        if (!roomId || !uid) return res.status(400).end();

        await adminDb.collection('rooms').doc(roomId).collection('presence').doc(uid).set(
            { isOnline: false, lastSeen: admin.firestore.FieldValue.serverTimestamp() },
            { merge: true }
        );

        return res.status(200).end();
    } catch {
        return res.status(500).end();
    }
}
