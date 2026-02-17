// GET /api/cron/daily-chores — Send daily chore reminders to assigned users
// Triggered by Vercel Cron or manual call with secret
import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';
import { adminDb } from '../../../lib/firebaseAdmin';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:kinloop@example.com',
        VAPID_PUBLIC_KEY,
        VAPID_PRIVATE_KEY,
    );
}

async function sendPush(
    sub: { endpoint: string; keys: any },
    payload: string,
): Promise<boolean> {
    try {
        await webpush.sendNotification(sub, payload, {
            TTL: 60 * 60 * 8,
            urgency: 'normal',
        });
        return true;
    } catch (err: any) {
        if (err.statusCode === 410) {
            // Subscription dead — clean it up
            return false;
        }
        return false;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    // Only allow GET (Vercel cron) or POST
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Verify authorization: Vercel cron sends Authorization header, or check secret
    const authHeader = req.headers['authorization'];
    const querySecret = req.query.secret;
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && querySecret !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
        return res.status(500).json({ error: 'VAPID keys not configured' });
    }

    try {
        // 1. Find all rooms
        const roomsSnap = await adminDb.collection('rooms').get();
        let totalNotifications = 0;
        let totalUsers = 0;
        let roomsProcessed = 0;
        const errors: string[] = [];

        for (const roomDoc of roomsSnap.docs) {
            const roomData = roomDoc.data();
            const roomId = roomDoc.id;
            const roomName = roomData.name || 'Family Room';

            // Check if daily reminders are enabled (default: true)
            if (roomData.dailyChoreReminders === false) continue;

            try {
                // 2. Find chore boards in this room
                const listsSnap = await adminDb
                    .collection('rooms').doc(roomId)
                    .collection('lists')
                    .where('type', '==', 'choreboard')
                    .get();

                if (listsSnap.empty) continue;

                // 3. Collect all uncompleted chores across all boards
                const choresByUser: Record<string, { name: string; chores: string[]; boardName: string }[]> = {};

                for (const listDoc of listsSnap.docs) {
                    const boardName = listDoc.data().name || 'Chore Board';
                    const itemsSnap = await adminDb
                        .collection('rooms').doc(roomId)
                        .collection('lists').doc(listDoc.id)
                        .collection('items')
                        .where('completed', '==', false)
                        .get();

                    for (const itemDoc of itemsSnap.docs) {
                        const item = itemDoc.data();
                        const assignedTo = item.assignedTo;
                        if (!assignedTo) continue; // Skip unassigned chores

                        if (!choresByUser[assignedTo]) choresByUser[assignedTo] = [];

                        // Check if we already have an entry for this board
                        let boardEntry = choresByUser[assignedTo].find(b => b.boardName === boardName);
                        if (!boardEntry) {
                            boardEntry = {
                                name: item.assignedToName || '',
                                boardName,
                                chores: [],
                            };
                            choresByUser[assignedTo].push(boardEntry);
                        }
                        boardEntry.chores.push(item.content || 'Untitled chore');
                    }
                }

                // 4. Send push notification to each user with their chores
                const userIds = Object.keys(choresByUser);
                if (userIds.length === 0) continue;

                roomsProcessed++;

                for (const userId of userIds) {
                    const boards = choresByUser[userId];
                    const totalChores = boards.reduce((sum, b) => sum + b.chores.length, 0);
                    if (totalChores === 0) continue;

                    // Build notification body
                    let body: string;
                    if (boards.length === 1 && totalChores <= 4) {
                        // Compact: list the chores
                        body = boards[0].chores.map(c => `• ${c}`).join('\n');
                    } else if (totalChores <= 6) {
                        // Multi-board: group by board
                        body = boards.map(b =>
                            `${b.boardName}: ${b.chores.join(', ')}`
                        ).join('\n');
                    } else {
                        // Many chores: summary
                        body = boards.map(b =>
                            `${b.boardName}: ${b.chores.length} chore${b.chores.length > 1 ? 's' : ''}`
                        ).join(', ') + ` (${totalChores} total)`;
                    }

                    const title = `📋 Your chores for today — ${roomName}`;
                    const payload = JSON.stringify({
                        title,
                        body,
                        url: `/room/${roomId}?tab=lists`,
                        roomId,
                        tag: `daily-chores-${roomId}-${userId}`,
                    });

                    // Fetch push subscriptions for this user
                    const subsSnap = await adminDb
                        .collection('pushSubscriptions')
                        .where('userId', '==', userId)
                        .get();

                    const gone: string[] = [];
                    for (const subDoc of subsSnap.docs) {
                        const subData = subDoc.data().subscription;
                        if (!subData?.endpoint || !subData?.keys) continue;

                        const ok = await sendPush(
                            { endpoint: subData.endpoint, keys: subData.keys },
                            payload,
                        );
                        if (ok) {
                            totalNotifications++;
                        } else {
                            gone.push(subDoc.id);
                        }
                    }

                    // Clean up dead subscriptions
                    for (const id of gone) {
                        await adminDb.collection('pushSubscriptions').doc(id).delete().catch(() => {});
                    }

                    totalUsers++;
                }
            } catch (roomErr: any) {
                errors.push(`Room ${roomId}: ${roomErr.message}`);
            }
        }

        return res.status(200).json({
            success: true,
            roomsProcessed,
            usersNotified: totalUsers,
            notificationsSent: totalNotifications,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('Daily chores cron error:', err);
        return res.status(500).json({ error: err.message || 'Cron job failed' });
    }
}
