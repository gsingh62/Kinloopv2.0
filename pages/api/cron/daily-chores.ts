// GET /api/cron/daily-chores — Send daily chore reminders via push + email
// Triggered by Vercel Cron or manual call with secret
import type { NextApiRequest, NextApiResponse } from 'next';
import webpush from 'web-push';
import { Resend } from 'resend';
import { adminDb, adminAuth } from '../../../lib/firebaseAdmin';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const CRON_SECRET = process.env.CRON_SECRET || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://kin-loop.vercel.app';
const FROM_EMAIL = process.env.FROM_EMAIL || 'KinLoop <onboarding@resend.dev>';

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

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
    } catch {
        return false;
    }
}

/** Build a beautiful HTML email for the daily chore list */
function buildChoreEmail(
    userName: string,
    roomName: string,
    boards: { boardName: string; chores: string[] }[],
    roomUrl: string,
): string {
    const totalChores = boards.reduce((sum, b) => sum + b.chores.length, 0);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    const choreListHtml = boards.map(b => `
        <div style="margin-bottom: 16px;">
            ${boards.length > 1 ? `<p style="font-size: 13px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px 0;">${b.boardName}</p>` : ''}
            ${b.chores.map(c => `
                <div style="display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: #f9fafb; border-radius: 10px; margin-bottom: 6px;">
                    <div style="width: 20px; height: 20px; border: 2px solid #d1d5db; border-radius: 50; flex-shrink: 0;"></div>
                    <span style="font-size: 14px; color: #374151;">${c}</span>
                </div>
            `).join('')}
        </div>
    `).join('');

    return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f5f3ef; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
    <div style="max-width: 520px; margin: 0 auto; padding: 24px 16px;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 24px;">
            <div style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6366f1); padding: 10px 20px; border-radius: 14px; margin-bottom: 12px;">
                <span style="font-size: 20px; color: white; font-weight: 700;">📋 KinLoop</span>
            </div>
            <p style="color: #9ca3af; font-size: 13px; margin: 0;">${today}</p>
        </div>

        <!-- Main Card -->
        <div style="background: white; border-radius: 16px; padding: 28px 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.06);">
            <h1 style="font-size: 20px; color: #1f2937; margin: 0 0 4px 0;">
                Good morning${userName ? `, ${userName}` : ''}! ☀️
            </h1>
            <p style="font-size: 14px; color: #6b7280; margin: 0 0 20px 0;">
                You have <strong style="color: #4f46e5;">${totalChores} chore${totalChores !== 1 ? 's' : ''}</strong> to tackle today in <strong>${roomName}</strong>.
            </p>

            <div style="border-top: 1px solid #f3f4f6; padding-top: 16px;">
                ${choreListHtml}
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin-top: 20px;">
                <a href="${roomUrl}" style="display: inline-block; background: linear-gradient(135deg, #7c3aed, #6366f1); color: white; text-decoration: none; padding: 12px 32px; border-radius: 12px; font-size: 14px; font-weight: 600;">
                    Open Chore Board →
                </a>
            </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 20px; padding: 0 16px;">
            <p style="font-size: 11px; color: #9ca3af; margin: 0;">
                Sent by KinLoop • <a href="${APP_URL}" style="color: #7c3aed; text-decoration: none;">kin-loop.vercel.app</a>
            </p>
            <p style="font-size: 11px; color: #d1d5db; margin: 4px 0 0 0;">
                Turn off reminders in your room settings.
            </p>
        </div>
    </div>
</body>
</html>`;
}

async function getUserEmail(userId: string): Promise<{ email: string; name: string } | null> {
    try {
        // Try Firestore users collection first
        const userDoc = await adminDb.collection('users').doc(userId).get();
        if (userDoc.exists) {
            const data = userDoc.data();
            if (data?.email) {
                return { email: data.email, name: data.name || data.email.split('@')[0] };
            }
        }
        // Fallback to Firebase Auth
        const authUser = await adminAuth.getUser(userId);
        return {
            email: authUser.email || '',
            name: authUser.displayName || authUser.email?.split('@')[0] || '',
        };
    } catch {
        return null;
    }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const authHeader = req.headers['authorization'];
    const querySecret = req.query.secret;
    if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}` && querySecret !== CRON_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const roomsSnap = await adminDb.collection('rooms').get();
        let pushSent = 0;
        let emailsSent = 0;
        let totalUsers = 0;
        let roomsProcessed = 0;
        const errors: string[] = [];

        for (const roomDoc of roomsSnap.docs) {
            const roomData = roomDoc.data();
            const roomId = roomDoc.id;
            const roomName = roomData.name || 'Family Room';

            if (roomData.dailyChoreReminders === false) continue;

            try {
                const listsSnap = await adminDb
                    .collection('rooms').doc(roomId)
                    .collection('lists')
                    .where('type', '==', 'choreboard')
                    .get();

                if (listsSnap.empty) continue;

                // Collect uncompleted chores by user
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
                        if (!assignedTo) continue;

                        if (!choresByUser[assignedTo]) choresByUser[assignedTo] = [];

                        let boardEntry = choresByUser[assignedTo].find(b => b.boardName === boardName);
                        if (!boardEntry) {
                            boardEntry = { name: item.assignedToName || '', boardName, chores: [] };
                            choresByUser[assignedTo].push(boardEntry);
                        }
                        boardEntry.chores.push(item.content || 'Untitled chore');
                    }
                }

                const userIds = Object.keys(choresByUser);
                if (userIds.length === 0) continue;

                roomsProcessed++;

                for (const userId of userIds) {
                    const boards = choresByUser[userId];
                    const totalChores = boards.reduce((sum, b) => sum + b.chores.length, 0);
                    if (totalChores === 0) continue;

                    // --- Push Notification ---
                    let pushBody: string;
                    if (boards.length === 1 && totalChores <= 4) {
                        pushBody = boards[0].chores.map(c => `• ${c}`).join('\n');
                    } else if (totalChores <= 6) {
                        pushBody = boards.map(b => `${b.boardName}: ${b.chores.join(', ')}`).join('\n');
                    } else {
                        pushBody = boards.map(b =>
                            `${b.boardName}: ${b.chores.length} chore${b.chores.length > 1 ? 's' : ''}`
                        ).join(', ') + ` (${totalChores} total)`;
                    }

                    const pushPayload = JSON.stringify({
                        title: `📋 Your chores for today — ${roomName}`,
                        body: pushBody,
                        url: `/room/${roomId}?tab=lists`,
                        roomId,
                        tag: `daily-chores-${roomId}-${userId}`,
                    });

                    const subsSnap = await adminDb
                        .collection('pushSubscriptions')
                        .where('userId', '==', userId)
                        .get();

                    const gone: string[] = [];
                    for (const subDoc of subsSnap.docs) {
                        const subData = subDoc.data().subscription;
                        if (!subData?.endpoint || !subData?.keys) continue;
                        const ok = await sendPush({ endpoint: subData.endpoint, keys: subData.keys }, pushPayload);
                        if (ok) pushSent++;
                        else gone.push(subDoc.id);
                    }
                    for (const id of gone) {
                        await adminDb.collection('pushSubscriptions').doc(id).delete().catch(() => {});
                    }

                    // --- Email ---
                    if (resend) {
                        try {
                            const userInfo = await getUserEmail(userId);
                            if (userInfo?.email) {
                                const roomUrl = `${APP_URL}/room/${roomId}?tab=lists`;
                                const html = buildChoreEmail(
                                    boards[0]?.name || userInfo.name,
                                    roomName,
                                    boards,
                                    roomUrl,
                                );
                                await resend.emails.send({
                                    from: FROM_EMAIL,
                                    to: userInfo.email,
                                    subject: `📋 Your ${totalChores} chore${totalChores !== 1 ? 's' : ''} for today — ${roomName}`,
                                    html,
                                });
                                emailsSent++;
                            }
                        } catch (emailErr: any) {
                            errors.push(`Email to ${userId}: ${emailErr.message}`);
                        }
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
            pushNotificationsSent: pushSent,
            emailsSent,
            emailEnabled: !!resend,
            errors: errors.length > 0 ? errors : undefined,
            timestamp: new Date().toISOString(),
        });
    } catch (err: any) {
        console.error('Daily chores cron error:', err);
        return res.status(500).json({ error: err.message || 'Cron job failed' });
    }
}
