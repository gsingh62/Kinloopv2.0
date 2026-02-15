// scripts/setupFirestoreStructure.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { nanoid } from 'nanoid'; // add this
import { ServiceAccount } from 'firebase-admin';

const serviceAccount = require('./serviceAccountKey.json');

initializeApp({
    credential: cert(serviceAccount),
});

const db = getFirestore();

async function setupRoom(roomId: string) {
    const roomRef = db.collection('rooms').doc(roomId);

    const inviteCode = nanoid(6).toUpperCase(); // e.g., A1B2C3

    // Set base room data with inviteCode
    await roomRef.set({
        name: 'Sample Room',
        createdAt: new Date().toISOString(),
        inviteCode,
        createdBy: 'admin-script',
        memberIds: ['admin-script'],
    });

    // Subcollection: messages
    await roomRef.collection('messages').add({
        content: 'Hello world!',
        senderId: 'user1',
        senderEmail: 'test@example.com',
        createdAt: new Date(),
    });

    // Subcollection: lists
    await roomRef.collection('lists').add({
        text: 'Buy groceries',
        createdAt: new Date().toISOString(),
    });

    // Subcollection: events
    await roomRef.collection('events').add({
        title: 'Family Dinner',
        date: '2025-07-01',
    });

    // Subcollection: documents/shared (doc with id "shared")
    await roomRef.collection('documents').doc('shared').set({
        content: '<p>Welcome to your shared doc!</p>',
    });

    console.log(`Structure for room "${roomId}" created successfully with inviteCode: ${inviteCode}`);
}

setupRoom('sample-room-id')
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error creating structure:', err);
        process.exit(1);
    });
