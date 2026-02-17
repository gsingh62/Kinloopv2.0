// lib/googleCalendar.ts — Server-side Google Calendar utilities
import { adminDb } from './firebaseAdmin';

const GOOGLE_CLIENT_ID = (process.env.GOOGLE_CLIENT_ID || '').trim();
const GOOGLE_CLIENT_SECRET = (process.env.GOOGLE_CLIENT_SECRET || '').trim();
const GOOGLE_REDIRECT_URI = (process.env.GOOGLE_REDIRECT_URI || 'https://kin-loop.vercel.app/api/google/callback').trim();
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const GCAL_API = 'https://www.googleapis.com/calendar/v3';

// ─── OAuth URL ───

export function getGoogleAuthUrl(state: string): string {
    const params = new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: GOOGLE_REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES.join(' '),
        access_type: 'offline',
        prompt: 'consent',
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

// ─── Token Exchange ───

interface GoogleTokens {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
    scope: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokens> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            redirect_uri: GOOGLE_REDIRECT_URI,
            grant_type: 'authorization_code',
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Token exchange failed: ${err}`);
    }
    return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string; expires_in: number }> {
    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            refresh_token: refreshToken,
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            grant_type: 'refresh_token',
        }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Token refresh failed: ${err}`);
    }
    return res.json();
}

// ─── Token Storage (Firestore via Admin SDK) ───

interface StoredTokens {
    accessToken: string;
    refreshToken: string;
    expiresAt: number; // Unix timestamp ms
    email?: string;
    selectedCalendars?: string[]; // calendar IDs to sync
    connectedAt: number;
}

export async function saveTokens(uid: string, tokens: GoogleTokens, email?: string): Promise<void> {
    const docRef = adminDb.collection('users').doc(uid).collection('integrations').doc('google');
    const existing = await docRef.get();
    const existingData = existing.data() as StoredTokens | undefined;

    await docRef.set({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || existingData?.refreshToken || '',
        expiresAt: Date.now() + tokens.expires_in * 1000,
        email: email || existingData?.email || '',
        selectedCalendars: existingData?.selectedCalendars || ['primary'],
        connectedAt: existingData?.connectedAt || Date.now(),
    });
}

export async function getTokens(uid: string): Promise<StoredTokens | null> {
    const docRef = adminDb.collection('users').doc(uid).collection('integrations').doc('google');
    const snap = await docRef.get();
    if (!snap.exists) return null;
    return snap.data() as StoredTokens;
}

export async function removeTokens(uid: string): Promise<void> {
    const docRef = adminDb.collection('users').doc(uid).collection('integrations').doc('google');
    await docRef.delete();
}

export async function updateSelectedCalendars(uid: string, calendarIds: string[]): Promise<void> {
    const docRef = adminDb.collection('users').doc(uid).collection('integrations').doc('google');
    await docRef.update({ selectedCalendars: calendarIds });
}

/** Get a valid access token, refreshing if expired */
export async function getValidAccessToken(uid: string): Promise<string> {
    const stored = await getTokens(uid);
    if (!stored) throw new Error('Google Calendar not connected');

    if (Date.now() < stored.expiresAt - 60_000) {
        return stored.accessToken;
    }

    // Token expired — refresh it
    const refreshed = await refreshAccessToken(stored.refreshToken);
    await saveTokens(uid, {
        access_token: refreshed.access_token,
        expires_in: refreshed.expires_in,
        token_type: 'Bearer',
        scope: SCOPES.join(' '),
    });
    return refreshed.access_token;
}

// ─── Google Calendar API Calls ───

export interface GoogleCalendar {
    id: string;
    summary: string;
    description?: string;
    primary?: boolean;
    backgroundColor?: string;
    accessRole: string;
}

export async function listCalendars(accessToken: string): Promise<GoogleCalendar[]> {
    const res = await fetch(`${GCAL_API}/users/me/calendarList`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) throw new Error(`Failed to list calendars: ${res.status}`);
    const data = await res.json();
    return (data.items || []).filter((c: any) => c.accessRole === 'owner' || c.accessRole === 'writer');
}

export interface GoogleEvent {
    id?: string;
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    attendees?: { email: string; displayName?: string; responseStatus?: string }[];
    status?: string;
    htmlLink?: string;
    colorId?: string;
    recurrence?: string[];
    updated?: string;
}

export async function listEvents(
    accessToken: string,
    calendarId: string,
    timeMin: string,
    timeMax: string,
    syncToken?: string,
): Promise<{ events: GoogleEvent[]; nextSyncToken?: string }> {
    const params: Record<string, string> = {
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '250',
    };

    if (syncToken) {
        params.syncToken = syncToken;
    } else {
        params.timeMin = timeMin;
        params.timeMax = timeMax;
    }

    const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events?${new URLSearchParams(params)}`;
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 410) {
        // Sync token expired — do a full sync
        return listEvents(accessToken, calendarId, timeMin, timeMax);
    }

    if (!res.ok) throw new Error(`Failed to list events: ${res.status}`);
    const data = await res.json();
    return {
        events: data.items || [],
        nextSyncToken: data.nextSyncToken,
    };
}

export async function createEvent(accessToken: string, calendarId: string, event: GoogleEvent): Promise<GoogleEvent> {
    const res = await fetch(`${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`Failed to create event: ${err}`);
    }
    return res.json();
}

export async function updateEvent(
    accessToken: string,
    calendarId: string,
    eventId: string,
    event: Partial<GoogleEvent>,
): Promise<GoogleEvent> {
    const res = await fetch(`${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
        method: 'PATCH',
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error(`Failed to update event: ${res.status}`);
    return res.json();
}

export async function deleteEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
    const res = await fetch(
        `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`,
        {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${accessToken}` },
        },
    );
    if (!res.ok && res.status !== 404) throw new Error(`Failed to delete event: ${res.status}`);
}

// ─── Conversion Helpers ───

/** Convert a KinLoop event to a Google Calendar event */
export function kinloopToGoogleEvent(event: {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    allDay?: boolean;
    participants?: { email: string; name?: string }[];
}): GoogleEvent {
    const isAllDay = event.allDay || !event.startTime;

    const gEvent: GoogleEvent = {
        summary: event.title,
        description: event.description,
    };

    if (isAllDay) {
        gEvent.start = { date: event.date };
        // Google all-day events end on the NEXT day
        const endDate = new Date(event.date + 'T00:00:00');
        endDate.setDate(endDate.getDate() + 1);
        const endStr = endDate.toISOString().split('T')[0];
        gEvent.end = { date: endStr };
    } else {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles';
        gEvent.start = { dateTime: `${event.date}T${event.startTime}:00`, timeZone: tz };
        gEvent.end = {
            dateTime: `${event.date}T${event.endTime || event.startTime}:00`,
            timeZone: tz,
        };
    }

    if (event.participants?.length) {
        gEvent.attendees = event.participants
            .filter(p => p.email)
            .map(p => ({ email: p.email, displayName: p.name }));
    }

    return gEvent;
}

/** Convert a Google Calendar event to KinLoop event fields */
export function googleToKinloopEvent(gEvent: GoogleEvent): {
    title: string;
    date: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    allDay: boolean;
    participants?: { email: string; name?: string; rsvp?: string }[];
    googleEventId: string;
} {
    const isAllDay = !!gEvent.start.date;
    let date: string;
    let startTime: string | undefined;
    let endTime: string | undefined;

    if (isAllDay) {
        date = gEvent.start.date!;
    } else {
        const startDt = new Date(gEvent.start.dateTime!);
        date = startDt.toISOString().split('T')[0];
        startTime = startDt.toTimeString().slice(0, 5);
        if (gEvent.end.dateTime) {
            endTime = new Date(gEvent.end.dateTime).toTimeString().slice(0, 5);
        }
    }

    const participants = gEvent.attendees?.map(a => ({
        email: a.email,
        name: a.displayName,
        rsvp: a.responseStatus === 'accepted' ? 'accepted' as const
            : a.responseStatus === 'declined' ? 'declined' as const
            : a.responseStatus === 'tentative' ? 'tentative' as const
            : 'needsAction' as const,
    }));

    return {
        title: gEvent.summary || 'Untitled',
        date,
        startTime,
        endTime,
        description: gEvent.description,
        allDay: isAllDay,
        participants,
        googleEventId: gEvent.id || '',
    };
}
