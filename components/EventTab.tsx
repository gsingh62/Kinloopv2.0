// components/EventTab.tsx — Production-quality Shared Calendar
import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { auth } from '../lib/firebase';
import {
    CalendarEvent,
    CalendarEventInput,
    EventParticipant,
    EventVisibility,
    RoomMember,
    canUserSeeEvent,
    memberToParticipant,
    subscribeToEvents,
    addCalendarEvent,
    updateCalendarEvent,
    deleteEvent,
} from '../lib/firestoreUtils';
import {
    ChevronLeft, ChevronRight, Plus, X, Clock, Trash2, Edit3, Users, Calendar,
    Eye, EyeOff, Lock, Globe, UserCheck, Mail, Check, ChevronDown,
    RefreshCw, Loader2, Unlink, ExternalLink, CloudOff,
} from 'lucide-react';

// ─── Color Palette for events ───
const EVENT_COLORS = [
    { name: 'Coral', value: '#E8725C' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Green', value: '#22C55E' },
    { name: 'Sage', value: '#81B29A' },
    { name: 'Purple', value: '#A855F7' },
    { name: 'Orange', value: '#F97316' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Amber', value: '#F59E0B' },
];

// ─── Helper Functions ───
function getDaysInMonth(year: number, month: number): number {
    return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
    return new Date(year, month, 1).getDay();
}

function formatDate(year: number, month: number, day: number): string {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function formatTime12(time24: string): string {
    if (!time24) return '';
    const [h, m] = time24.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function isToday(year: number, month: number, day: number): boolean {
    const now = new Date();
    return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}

const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_LABELS_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// ─── Props ───
interface EventTabProps {
    roomId: string;
    members?: RoomMember[];
}

// ─── Google Calendar Icon ───
function GoogleCalIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return (
        <svg viewBox="0 0 24 24" width={size} height={size} className={className}>
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
    );
}

// ─── Event Form Modal ───
interface EventFormProps {
    initialDate?: string;
    event?: CalendarEvent;
    members: RoomMember[];
    googleConnected?: boolean;
    onSave: (event: CalendarEventInput, exportToGoogle?: boolean) => void;
    onDelete?: () => void;
    onClose: () => void;
}

// ─── Visibility Options ───
const VISIBILITY_OPTIONS: { value: EventVisibility; label: string; icon: typeof Globe; desc: string }[] = [
    { value: 'everyone', label: 'Everyone', icon: Globe, desc: 'All room members can see' },
    { value: 'participants', label: 'Participants only', icon: UserCheck, desc: 'Only people added as participants' },
    { value: 'private', label: 'Only me', icon: Lock, desc: 'Only you can see this event' },
    { value: 'custom', label: 'Custom', icon: Eye, desc: 'Choose who can see' },
];

function EventFormModal({ initialDate, event, members, googleConnected, onSave, onDelete, onClose }: EventFormProps) {
    const [title, setTitle] = useState(event?.title || '');
    const [date, setDate] = useState(event?.date || initialDate || '');
    const [allDay, setAllDay] = useState(event?.allDay ?? true);
    const [startTime, setStartTime] = useState(event?.startTime || '09:00');
    const [endTime, setEndTime] = useState(event?.endTime || '10:00');
    const [description, setDescription] = useState(event?.description || '');
    const [color, setColor] = useState(event?.color || EVENT_COLORS[0].value);

    // Participants — initialize from existing participants or legacy assignedTo
    const initParticipants = (): EventParticipant[] => {
        if (event?.participants?.length) return event.participants;
        if (event?.assignedTo?.length) {
            return event.assignedTo.map(uid => {
                const m = members.find(mb => mb.uid === uid);
                if (m) return memberToParticipant(m);
                return { uid, email: '', name: 'User' };
            });
        }
        return [];
    };
    const [participants, setParticipants] = useState<EventParticipant[]>(initParticipants);
    const [externalEmail, setExternalEmail] = useState('');

    // Visibility
    const [visibility, setVisibility] = useState<EventVisibility>(event?.visibility || 'everyone');
    const [visibleTo, setVisibleTo] = useState<string[]>(event?.visibleTo || []);
    const [showVisDropdown, setShowVisDropdown] = useState(false);

    // Google Calendar export
    const [exportToGoogle, setExportToGoogle] = useState(!!event?.googleEventId || false);

    const toggleParticipant = (member: RoomMember) => {
        setParticipants(prev => {
            const exists = prev.some(p => p.uid === member.uid);
            if (exists) return prev.filter(p => p.uid !== member.uid);
            return [...prev, memberToParticipant(member)];
        });
    };

    const addExternalParticipant = () => {
        const email = externalEmail.trim().toLowerCase();
        if (!email || !email.includes('@')) return;
        if (participants.some(p => p.email === email)) return;
        setParticipants(prev => [...prev, { email, name: email.split('@')[0], rsvp: 'needsAction' }]);
        setExternalEmail('');
    };

    const removeParticipant = (email: string) => {
        setParticipants(prev => prev.filter(p => p.email !== email));
    };

    const toggleVisibleTo = (uid: string) => {
        setVisibleTo(prev => prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !date) return;
        const user = auth.currentUser;
        if (!user) return;

        const eventData: CalendarEventInput = {
            title: title.trim(),
            date,
            allDay,
            startTime: allDay ? undefined : startTime,
            endTime: allDay ? undefined : endTime,
            description: description.trim() || undefined,
            color,
            createdBy: event?.createdBy || user.uid,
            participants: participants.length > 0 ? participants : undefined,
            assignedTo: participants.length > 0 ? participants.filter(p => p.uid).map(p => p.uid!) : undefined,
            visibility,
            visibleTo: visibility === 'custom' && visibleTo.length > 0 ? visibleTo : undefined,
        };

        onSave(eventData, exportToGoogle);
    };

    const selectedVis = VISIBILITY_OPTIONS.find(v => v.value === visibility)!;

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
             onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-warmgray-100">
                    <h3 className="text-lg font-semibold text-warmgray-900">
                        {event ? 'Edit Event' : 'New Event'}
                    </h3>
                    <button onClick={onClose} className="p-1 rounded-full hover:bg-warmgray-100 transition-colors">
                        <X size={20} className="text-warmgray-500" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="px-5 py-4 space-y-5">
                    {/* Title */}
                    <div>
                        <input
                            type="text"
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Event title"
                            required
                            autoFocus
                            className="w-full text-lg font-medium border-0 border-b-2 border-warmgray-200 focus:border-kin-500 focus:ring-0 pb-2 placeholder-warmgray-400 transition-colors"
                        />
                    </div>

                    {/* Date */}
                    <div className="flex items-center gap-3">
                        <Calendar size={18} className="text-warmgray-400 flex-shrink-0" />
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            required
                            className="flex-1 px-3 py-2.5 border border-warmgray-200 rounded-xl text-sm focus:ring-2 focus:ring-kin-500 focus:border-transparent"
                        />
                    </div>

                    {/* All Day Toggle */}
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-warmgray-700 font-medium">All day</span>
                        <button
                            type="button"
                            onClick={() => setAllDay(!allDay)}
                            className={`relative w-11 h-6 rounded-full transition-colors ${allDay ? 'bg-kin-500' : 'bg-warmgray-300'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${allDay ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                    </div>

                    {/* Time Pickers */}
                    {!allDay && (
                        <div className="flex items-center gap-3">
                            <Clock size={18} className="text-warmgray-400 flex-shrink-0" />
                            <div className="flex items-center gap-2 flex-1">
                                <input
                                    type="time"
                                    value={startTime}
                                    onChange={e => setStartTime(e.target.value)}
                                    className="flex-1 px-3 py-2.5 border border-warmgray-200 rounded-xl text-sm focus:ring-2 focus:ring-kin-500 focus:border-transparent"
                                />
                                <span className="text-warmgray-400 text-sm">to</span>
                                <input
                                    type="time"
                                    value={endTime}
                                    onChange={e => setEndTime(e.target.value)}
                                    className="flex-1 px-3 py-2.5 border border-warmgray-200 rounded-xl text-sm focus:ring-2 focus:ring-kin-500 focus:border-transparent"
                                />
                            </div>
                        </div>
                    )}

                    {/* Description */}
                    <div>
                        <textarea
                            value={description}
                            onChange={e => setDescription(e.target.value)}
                            placeholder="Add description..."
                            rows={2}
                            className="w-full px-3 py-2.5 border border-warmgray-200 rounded-xl text-sm focus:ring-2 focus:ring-kin-500 focus:border-transparent resize-none placeholder-warmgray-400"
                        />
                    </div>

                    {/* Color Picker */}
                    <div>
                        <p className="text-sm font-medium text-warmgray-700 mb-2">Color</p>
                        <div className="flex gap-2.5 flex-wrap">
                            {EVENT_COLORS.map(c => (
                                <button
                                    key={c.value}
                                    type="button"
                                    onClick={() => setColor(c.value)}
                                    className={`w-8 h-8 rounded-full transition-all ${color === c.value ? 'ring-2 ring-offset-2 ring-warmgray-400 scale-110' : 'hover:scale-110'}`}
                                    style={{ backgroundColor: c.value }}
                                    title={c.name}
                                />
                            ))}
                        </div>
                    </div>

                    {/* ─── Participants ─── */}
                    {members.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Users size={16} className="text-warmgray-400" />
                                <p className="text-sm font-medium text-warmgray-700">Participants</p>
                            </div>
                            {/* Room members */}
                            <div className="flex gap-2 flex-wrap mb-2">
                                {members.map(m => {
                                    const selected = participants.some(p => p.uid === m.uid);
                                    const displayName = m.name || m.email?.split('@')[0] || 'User';
                                    return (
                                        <button
                                            key={m.uid}
                                            type="button"
                                            onClick={() => toggleParticipant(m)}
                                            title={m.email}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                selected
                                                    ? 'bg-kin-100 text-kin-700 ring-1 ring-kin-300'
                                                    : 'bg-warmgray-100 text-warmgray-600 hover:bg-warmgray-200'
                                            }`}
                                        >
                                            {selected && <Check size={12} />}
                                            <span>{displayName}</span>
                                            {selected && m.email && (
                                                <span className="text-[10px] text-kin-500 opacity-75">{m.email}</span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            {/* External email input */}
                            <div className="flex gap-2">
                                <div className="flex-1 flex items-center gap-2 px-3 py-2 border border-warmgray-200 rounded-xl text-sm focus-within:ring-2 focus-within:ring-kin-500 focus-within:border-transparent">
                                    <Mail size={14} className="text-warmgray-400 flex-shrink-0" />
                                    <input
                                        type="email"
                                        value={externalEmail}
                                        onChange={e => setExternalEmail(e.target.value)}
                                        placeholder="Add external email..."
                                        className="flex-1 border-0 p-0 text-sm focus:ring-0 placeholder-warmgray-400"
                                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addExternalParticipant(); } }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    onClick={addExternalParticipant}
                                    className="px-3 py-2 bg-warmgray-100 text-warmgray-600 rounded-xl text-xs font-medium hover:bg-warmgray-200 transition-colors"
                                >
                                    Add
                                </button>
                            </div>
                            {/* External participants list */}
                            {participants.filter(p => !p.uid).length > 0 && (
                                <div className="flex gap-2 flex-wrap mt-2">
                                    {participants.filter(p => !p.uid).map(p => (
                                        <div
                                            key={p.email}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-700 rounded-full text-xs font-medium"
                                        >
                                            <Mail size={12} />
                                            {p.email}
                                            <button type="button" onClick={() => removeParticipant(p.email)} className="ml-0.5 hover:text-red-500">
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ─── Visibility ─── */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Eye size={16} className="text-warmgray-400" />
                            <p className="text-sm font-medium text-warmgray-700">Who can see this?</p>
                        </div>
                        <div className="relative">
                            <button
                                type="button"
                                onClick={() => setShowVisDropdown(!showVisDropdown)}
                                className="w-full flex items-center justify-between px-3 py-2.5 border border-warmgray-200 rounded-xl text-sm hover:border-warmgray-300 transition-colors"
                            >
                                <div className="flex items-center gap-2">
                                    <selectedVis.icon size={16} className="text-warmgray-500" />
                                    <span className="text-warmgray-800 font-medium">{selectedVis.label}</span>
                                    <span className="text-warmgray-400 text-xs">— {selectedVis.desc}</span>
                                </div>
                                <ChevronDown size={16} className={`text-warmgray-400 transition-transform ${showVisDropdown ? 'rotate-180' : ''}`} />
                            </button>
                            {showVisDropdown && (
                                <div className="absolute z-10 w-full mt-1 bg-white border border-warmgray-200 rounded-xl shadow-lg overflow-hidden">
                                    {VISIBILITY_OPTIONS.map(opt => (
                                        <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => { setVisibility(opt.value); setShowVisDropdown(false); }}
                                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-warmgray-50 transition-colors ${visibility === opt.value ? 'bg-kin-50' : ''}`}
                                        >
                                            <opt.icon size={16} className={visibility === opt.value ? 'text-kin-500' : 'text-warmgray-400'} />
                                            <div>
                                                <p className={`text-sm font-medium ${visibility === opt.value ? 'text-kin-700' : 'text-warmgray-800'}`}>{opt.label}</p>
                                                <p className="text-xs text-warmgray-400">{opt.desc}</p>
                                            </div>
                                            {visibility === opt.value && <Check size={16} className="ml-auto text-kin-500" />}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {/* Custom visibility — member picker */}
                        {visibility === 'custom' && members.length > 0 && (
                            <div className="flex gap-2 flex-wrap mt-2 pl-1">
                                {members.map(m => {
                                    const selected = visibleTo.includes(m.uid);
                                    const displayName = m.name || m.email?.split('@')[0] || 'User';
                                    return (
                                        <button
                                            key={m.uid}
                                            type="button"
                                            onClick={() => toggleVisibleTo(m.uid)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                selected
                                                    ? 'bg-kin-100 text-kin-700 ring-1 ring-kin-300'
                                                    : 'bg-warmgray-100 text-warmgray-600 hover:bg-warmgray-200'
                                            }`}
                                        >
                                            {selected ? <Eye size={12} /> : <EyeOff size={12} />}
                                            {displayName}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ─── Google Calendar Export Toggle ─── */}
                    {googleConnected && event?.source !== 'google' && (
                        <div className="flex items-center justify-between py-2 px-1">
                            <div className="flex items-center gap-2.5">
                                <GoogleCalIcon size={18} />
                                <div>
                                    <p className="text-sm font-medium text-warmgray-700">Add to Google Calendar</p>
                                    <p className="text-[11px] text-warmgray-400">
                                        {participants.filter(p => p.email).length > 0
                                            ? `Participants will get Google invite emails`
                                            : `Syncs to your Google Calendar`}
                                    </p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setExportToGoogle(!exportToGoogle)}
                                className={`relative w-11 h-6 rounded-full transition-colors ${exportToGoogle ? 'bg-blue-500' : 'bg-warmgray-300'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${exportToGoogle ? 'translate-x-5' : 'translate-x-0'}`} />
                            </button>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-2">
                        <button
                            type="submit"
                            className="flex-1 py-3 bg-kin-500 text-white rounded-xl font-semibold hover:bg-kin-600 active:bg-kin-700 transition-colors"
                        >
                            {event ? 'Save Changes' : 'Add Event'}
                        </button>
                        {event && onDelete && (
                            <button
                                type="button"
                                onClick={onDelete}
                                className="p-3 text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                                title="Delete event"
                            >
                                <Trash2 size={20} />
                            </button>
                        )}
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Event Detail Sheet ───
interface EventDetailProps {
    event: CalendarEvent;
    members: RoomMember[];
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
}

const RSVP_LABELS: Record<string, { label: string; color: string }> = {
    accepted: { label: 'Accepted', color: 'text-green-600' },
    declined: { label: 'Declined', color: 'text-red-500' },
    tentative: { label: 'Maybe', color: 'text-amber-600' },
    needsAction: { label: 'Pending', color: 'text-warmgray-400' },
};

function EventDetailSheet({ event, members, onEdit, onDelete, onClose }: EventDetailProps) {
    // Combine participants and legacy assignedTo
    const eventParticipants: EventParticipant[] = event.participants?.length
        ? event.participants
        : (event.assignedTo || []).map(uid => {
            const m = members.find(mb => mb.uid === uid);
            if (m) return memberToParticipant(m);
            return { uid, email: '', name: 'User' };
        });

    const visLabel = VISIBILITY_OPTIONS.find(v => v.value === (event.visibility || 'everyone'));

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
             onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up"
                onClick={e => e.stopPropagation()}
            >
                {/* Color bar */}
                <div className="h-2 rounded-t-2xl" style={{ backgroundColor: event.color }} />

                <div className="px-5 py-4">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                            <h3 className="text-xl font-bold text-warmgray-900">{event.title}</h3>
                            <p className="text-sm text-warmgray-500 mt-1">
                                {new Date(event.date + 'T00:00:00').toLocaleDateString('en-US', {
                                    weekday: 'long',
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric',
                                })}
                            </p>
                            {!event.allDay && event.startTime && (
                                <p className="text-sm text-warmgray-500 flex items-center gap-1 mt-1">
                                    <Clock size={14} />
                                    {formatTime12(event.startTime)}
                                    {event.endTime && ` – ${formatTime12(event.endTime)}`}
                                </p>
                            )}
                        </div>
                        <button onClick={onClose} className="p-1 rounded-full hover:bg-warmgray-100 transition-colors">
                            <X size={20} className="text-warmgray-400" />
                        </button>
                    </div>

                    {event.description && (
                        <p className="text-sm text-warmgray-700 mt-3 leading-relaxed">{event.description}</p>
                    )}

                    {/* Participants */}
                    {eventParticipants.length > 0 && (
                        <div className="mt-4">
                            <p className="text-xs text-warmgray-400 uppercase tracking-wide mb-2">Participants</p>
                            <div className="space-y-1.5">
                                {eventParticipants.map((p, i) => {
                                    const rsvp = RSVP_LABELS[p.rsvp || 'needsAction'];
                                    return (
                                        <div key={p.email || i} className="flex items-center gap-2.5 bg-warmgray-50 rounded-xl px-3 py-2">
                                            <div
                                                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                                                style={{ backgroundColor: event.color }}
                                            >
                                                {(p.name || p.email)?.[0]?.toUpperCase()}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-medium text-warmgray-800 truncate">
                                                    {p.name || p.email?.split('@')[0]}
                                                </p>
                                                {!p.uid && (
                                                    <p className="text-[10px] text-warmgray-400 truncate">{p.email}</p>
                                                )}
                                            </div>
                                            <span className={`text-[10px] font-medium ${rsvp.color}`}>{rsvp.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Visibility badge */}
                    {event.visibility && event.visibility !== 'everyone' && visLabel && (
                        <div className="mt-3 flex items-center gap-1.5 text-xs text-warmgray-500">
                            <visLabel.icon size={13} />
                            <span>{visLabel.desc}</span>
                        </div>
                    )}

                    {/* Source badge */}
                    {event.source === 'google' && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 rounded-full text-xs font-medium">
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                            Google Calendar
                        </div>
                    )}

                    <div className="flex items-center gap-3 mt-6">
                        <button
                            onClick={onEdit}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-warmgray-100 text-warmgray-700 rounded-xl font-medium hover:bg-warmgray-200 transition-colors"
                        >
                            <Edit3 size={16} /> Edit
                        </button>
                        <button
                            onClick={onDelete}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-xl font-medium hover:bg-red-100 transition-colors"
                        >
                            <Trash2 size={16} /> Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Click outside helper ───
function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
    useEffect(() => {
        const listener = (e: MouseEvent) => {
            if (!ref.current || ref.current.contains(e.target as Node)) return;
            handler();
        };
        document.addEventListener('mousedown', listener);
        return () => document.removeEventListener('mousedown', listener);
    }, [ref, handler]);
}

// ─── Main Calendar Component ───
export default function EventTab({ roomId, members = [] }: EventTabProps) {
    const today = new Date();
    const [currentYear, setCurrentYear] = useState(today.getFullYear());
    const [currentMonth, setCurrentMonth] = useState(today.getMonth());
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [showForm, setShowForm] = useState(false);
    const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
    const [viewingEvent, setViewingEvent] = useState<CalendarEvent | null>(null);
    const [view, setView] = useState<'month' | 'agenda'>('month');

    // Google Calendar state
    const [gcalConnected, setGcalConnected] = useState(false);
    const [gcalEmail, setGcalEmail] = useState('');
    const [gcalSyncing, setGcalSyncing] = useState(false);
    const [gcalSyncResult, setGcalSyncResult] = useState<string | null>(null);
    const [showGcalMenu, setShowGcalMenu] = useState(false);
    const gcalMenuRef = useRef<HTMLDivElement>(null);
    useClickOutside(gcalMenuRef, () => setShowGcalMenu(false));

    const currentUserId = auth.currentUser?.uid || '';

    // Check Google Calendar connection status
    useEffect(() => {
        if (!currentUserId) return;
        fetch(`/api/google/status?uid=${currentUserId}`)
            .then(r => r.json())
            .then(data => {
                setGcalConnected(data.connected);
                setGcalEmail(data.email || '');
            })
            .catch(() => {});
    }, [currentUserId]);

    // Handle ?gcal=connected query param (after OAuth callback)
    useEffect(() => {
        if (typeof window === 'undefined') return;
        const params = new URLSearchParams(window.location.search);
        if (params.get('gcal') === 'connected') {
            setGcalConnected(true);
            setGcalSyncResult('Google Calendar connected! Syncing...');
            // Auto-sync after connecting
            handleGcalSync();
            // Clean up URL
            const url = new URL(window.location.href);
            url.searchParams.delete('gcal');
            url.searchParams.delete('tab');
            window.history.replaceState({}, '', url.pathname);
        }
    }, []);

    // Subscribe to events
    useEffect(() => {
        if (!roomId) return;
        const unsub = subscribeToEvents(roomId, setEvents);
        return () => unsub();
    }, [roomId]);

    // Filter events by visibility for current user
    const visibleEvents = useMemo(() => {
        if (!currentUserId) return events;
        return events.filter(ev => canUserSeeEvent(ev, currentUserId));
    }, [events, currentUserId]);

    // Navigation
    const goToPrevMonth = () => {
        if (currentMonth === 0) {
            setCurrentMonth(11);
            setCurrentYear(y => y - 1);
        } else {
            setCurrentMonth(m => m - 1);
        }
    };

    const goToNextMonth = () => {
        if (currentMonth === 11) {
            setCurrentMonth(0);
            setCurrentYear(y => y + 1);
        } else {
            setCurrentMonth(m => m + 1);
        }
    };

    const goToToday = () => {
        setCurrentYear(today.getFullYear());
        setCurrentMonth(today.getMonth());
    };

    // Calendar grid computation
    const calendarDays = useMemo(() => {
        const daysInMonth = getDaysInMonth(currentYear, currentMonth);
        const firstDay = getFirstDayOfMonth(currentYear, currentMonth);
        const days: { day: number; isCurrentMonth: boolean; dateStr: string }[] = [];

        // Previous month padding
        const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
        const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
        const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);
        for (let i = firstDay - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            days.push({ day: d, isCurrentMonth: false, dateStr: formatDate(prevYear, prevMonth, d) });
        }

        // Current month
        for (let d = 1; d <= daysInMonth; d++) {
            days.push({ day: d, isCurrentMonth: true, dateStr: formatDate(currentYear, currentMonth, d) });
        }

        // Next month padding
        const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
        const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
        const remaining = 42 - days.length; // always show 6 rows
        for (let d = 1; d <= remaining; d++) {
            days.push({ day: d, isCurrentMonth: false, dateStr: formatDate(nextYear, nextMonth, d) });
        }

        return days;
    }, [currentYear, currentMonth]);

    // Group visible events by date
    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        visibleEvents.forEach(ev => {
            if (!map[ev.date]) map[ev.date] = [];
            map[ev.date].push(ev);
        });
        // Sort events within each date
        Object.values(map).forEach(arr =>
            arr.sort((a, b) => {
                if (a.allDay && !b.allDay) return -1;
                if (!a.allDay && b.allDay) return 1;
                return (a.startTime || '').localeCompare(b.startTime || '');
            })
        );
        return map;
    }, [visibleEvents]);

    // Events for selected date in agenda/day view
    const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

    // Upcoming events for agenda view
    const upcomingEvents = useMemo(() => {
        const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
        return visibleEvents
            .filter(ev => ev.date >= todayStr)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
    }, [visibleEvents]);

    // ─── Google Calendar Handlers ───
    const handleGcalConnect = () => {
        if (!currentUserId) return;
        window.location.href = `/api/google/auth?uid=${currentUserId}&roomId=${roomId}`;
    };

    const handleGcalDisconnect = async () => {
        if (!confirm('Disconnect Google Calendar? Events already imported will remain.')) return;
        try {
            await fetch('/api/google/disconnect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUserId }),
            });
            setGcalConnected(false);
            setGcalEmail('');
            setShowGcalMenu(false);
            setGcalSyncResult('Google Calendar disconnected');
            setTimeout(() => setGcalSyncResult(null), 3000);
        } catch {}
    };

    const handleGcalSync = async () => {
        if (!currentUserId || !roomId) return;
        setGcalSyncing(true);
        setGcalSyncResult(null);
        try {
            const res = await fetch('/api/google/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUserId, roomId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            const parts = [];
            if (data.imported) parts.push(`${data.imported} imported`);
            if (data.updated) parts.push(`${data.updated} updated`);
            if (data.removed) parts.push(`${data.removed} removed`);
            setGcalSyncResult(parts.length ? `Synced: ${parts.join(', ')}` : 'Already up to date');
        } catch (err: any) {
            setGcalSyncResult(`Sync failed: ${err.message}`);
        } finally {
            setGcalSyncing(false);
            setTimeout(() => setGcalSyncResult(null), 5000);
        }
    };

    const handleExportToGoogle = async (eventId: string) => {
        if (!currentUserId || !roomId) return;
        try {
            const res = await fetch('/api/google/export', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: currentUserId, roomId, eventId }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
        } catch (err: any) {
            console.error('Export to Google failed:', err);
        }
    };

    // Handlers
    const handleSaveEvent = async (eventData: CalendarEventInput, exportToGoogle?: boolean) => {
        try {
            if (editingEvent) {
                await updateCalendarEvent(roomId, editingEvent.id, eventData);
                if (exportToGoogle && gcalConnected) {
                    await handleExportToGoogle(editingEvent.id);
                }
            } else {
                const newEventId = await addCalendarEvent(roomId, eventData);
                if (exportToGoogle && gcalConnected && newEventId) {
                    await handleExportToGoogle(newEventId);
                }
            }
            setShowForm(false);
            setEditingEvent(null);
        } catch (err: any) {
            console.error('Failed to save event:', err);
            alert(`Failed to save event: ${err.message || 'Unknown error'}`);
        }
    };

    const handleDeleteEvent = async (eventId: string) => {
        if (confirm('Delete this event?')) {
            try {
                await deleteEvent(roomId, eventId);
                setViewingEvent(null);
                setEditingEvent(null);
                setShowForm(false);
            } catch (err: any) {
                console.error('Failed to delete event:', err);
                alert(`Failed to delete event: ${err.message || 'Unknown error'}`);
            }
        }
    };

    const handleDayClick = (dateStr: string) => {
        setSelectedDate(dateStr);
    };

    const handleDayDoubleClick = (dateStr: string) => {
        setSelectedDate(dateStr);
        setEditingEvent(null);
        setShowForm(true);
    };

    return (
        <div className="h-full flex flex-col">
            {/* ─── Sync result toast ─── */}
            {gcalSyncResult && (
                <div className="mx-1 mb-2 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg flex items-center gap-2 animate-fade-in">
                    <GoogleCalIcon size={14} />
                    {gcalSyncResult}
                    <button onClick={() => setGcalSyncResult(null)} className="ml-auto text-blue-400 hover:text-blue-600">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* ─── Calendar Header ─── */}
            <div className="flex items-center justify-between px-1 mb-4">
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-warmgray-900">
                        {MONTH_NAMES[currentMonth]} {currentYear}
                    </h2>
                    <button
                        onClick={goToToday}
                        className="ml-2 px-2.5 py-1 text-xs font-medium text-kin-600 bg-kin-50 rounded-lg hover:bg-kin-100 transition-colors"
                    >
                        Today
                    </button>
                </div>

                <div className="flex items-center gap-1">
                    {/* Google Calendar Button */}
                    <div className="relative mr-1" ref={gcalMenuRef}>
                        {gcalConnected ? (
                            <>
                                <button
                                    onClick={() => setShowGcalMenu(!showGcalMenu)}
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-medium hover:bg-blue-100 transition-colors"
                                    title={`Connected: ${gcalEmail}`}
                                >
                                    <GoogleCalIcon size={14} />
                                    <span className="hidden sm:inline">Synced</span>
                                    {gcalSyncing && <Loader2 size={12} className="animate-spin" />}
                                </button>
                                {showGcalMenu && (
                                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-warmgray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                                        <div className="px-3 py-2.5 border-b border-warmgray-100">
                                            <p className="text-xs text-warmgray-400">Connected as</p>
                                            <p className="text-sm font-medium text-warmgray-800 truncate">{gcalEmail}</p>
                                        </div>
                                        <button
                                            onClick={() => { setShowGcalMenu(false); handleGcalSync(); }}
                                            disabled={gcalSyncing}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-warmgray-700 hover:bg-warmgray-50 transition-colors disabled:opacity-50"
                                        >
                                            <RefreshCw size={15} className={gcalSyncing ? 'animate-spin' : ''} />
                                            {gcalSyncing ? 'Syncing...' : 'Sync now'}
                                        </button>
                                        <button
                                            onClick={handleGcalDisconnect}
                                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                                        >
                                            <Unlink size={15} />
                                            Disconnect
                                        </button>
                                    </div>
                                )}
                            </>
                        ) : (
                            <button
                                onClick={handleGcalConnect}
                                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-warmgray-100 text-warmgray-600 rounded-lg text-xs font-medium hover:bg-warmgray-200 transition-colors"
                                title="Connect Google Calendar"
                            >
                                <GoogleCalIcon size={14} />
                                <span className="hidden sm:inline">Connect</span>
                            </button>
                        )}
                    </div>

                    {/* View Toggle */}
                    <div className="flex bg-warmgray-100 rounded-lg p-0.5 mr-2">
                        <button
                            onClick={() => setView('month')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'month' ? 'bg-white shadow-sm text-warmgray-900' : 'text-warmgray-500'}`}
                        >
                            Month
                        </button>
                        <button
                            onClick={() => setView('agenda')}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${view === 'agenda' ? 'bg-white shadow-sm text-warmgray-900' : 'text-warmgray-500'}`}
                        >
                            Agenda
                        </button>
                    </div>

                    <button onClick={goToPrevMonth} className="p-1.5 rounded-lg hover:bg-warmgray-100 transition-colors">
                        <ChevronLeft size={18} className="text-warmgray-600" />
                    </button>
                    <button onClick={goToNextMonth} className="p-1.5 rounded-lg hover:bg-warmgray-100 transition-colors">
                        <ChevronRight size={18} className="text-warmgray-600" />
                    </button>
                    <button
                        onClick={() => { setEditingEvent(null); setShowForm(true); }}
                        className="ml-1 p-1.5 bg-kin-500 text-white rounded-lg hover:bg-kin-600 active:bg-kin-700 transition-colors"
                    >
                        <Plus size={18} />
                    </button>
                </div>
            </div>

            {view === 'month' ? (
                <>
                    {/* ─── Month Grid ─── */}
                    {/* Day headers */}
                    <div className="grid grid-cols-7 mb-1">
                        {DAY_LABELS.map((label, i) => (
                            <div key={label + i} className="text-center text-xs font-semibold text-warmgray-400 uppercase tracking-wider py-2">
                                <span className="hidden sm:inline">{label}</span>
                                <span className="sm:hidden">{DAY_LABELS_SHORT[i]}</span>
                            </div>
                        ))}
                    </div>

                    {/* Day cells */}
                    <div className="grid grid-cols-7 flex-1 border-t border-l border-warmgray-100">
                        {calendarDays.map((cell, idx) => {
                            const dayEvents = eventsByDate[cell.dateStr] || [];
                            const isTodayCell = cell.isCurrentMonth && isToday(currentYear, currentMonth, cell.day);
                            const isSelected = cell.dateStr === selectedDate;

                            return (
                                <div
                                    key={idx}
                                    onClick={() => handleDayClick(cell.dateStr)}
                                    onDoubleClick={() => handleDayDoubleClick(cell.dateStr)}
                                    className={`
                                        min-h-[70px] sm:min-h-[90px] border-r border-b border-warmgray-100 p-1 cursor-pointer transition-colors relative
                                        ${!cell.isCurrentMonth ? 'bg-warmgray-50/50' : 'bg-white hover:bg-kin-50/30'}
                                        ${isSelected ? 'bg-kin-50 ring-1 ring-inset ring-kin-200' : ''}
                                    `}
                                >
                                    {/* Day number */}
                                    <div className={`
                                        text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5
                                        ${!cell.isCurrentMonth ? 'text-warmgray-300' : 'text-warmgray-700'}
                                        ${isTodayCell ? 'bg-kin-500 text-white font-bold' : ''}
                                    `}>
                                        {cell.day}
                                    </div>

                                    {/* Event dots / chips */}
                                    <div className="space-y-0.5 overflow-hidden">
                                        {dayEvents.slice(0, 3).map(ev => (
                                            <div
                                                key={ev.id}
                                                onClick={e => { e.stopPropagation(); setViewingEvent(ev); }}
                                                className="flex items-center gap-0.5 truncate text-[10px] sm:text-xs leading-tight px-1.5 py-0.5 rounded-md font-medium cursor-pointer hover:opacity-80 transition-opacity"
                                                style={{
                                                    backgroundColor: ev.color + '20',
                                                    color: ev.color,
                                                    borderLeft: `3px solid ${ev.color}`,
                                                }}
                                            >
                                                {ev.source === 'google' && <GoogleCalIcon size={10} className="flex-shrink-0" />}
                                                <span className="truncate">{ev.title}</span>
                                            </div>
                                        ))}
                                        {dayEvents.length > 3 && (
                                            <div className="text-[10px] text-warmgray-400 font-medium pl-1">
                                                +{dayEvents.length - 3} more
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* ─── Selected Day Event List ─── */}
                    {selectedDate && (
                        <div className="mt-4 border-t border-warmgray-100 pt-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-sm font-semibold text-warmgray-700">
                                    {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', {
                                        weekday: 'long', month: 'short', day: 'numeric',
                                    })}
                                </h3>
                                <button
                                    onClick={() => { setEditingEvent(null); setShowForm(true); }}
                                    className="text-xs font-medium text-kin-600 hover:text-kin-700 flex items-center gap-1"
                                >
                                    <Plus size={14} /> Add Event
                                </button>
                            </div>
                            {selectedDateEvents.length === 0 ? (
                                <p className="text-sm text-warmgray-400 italic">No events</p>
                            ) : (
                                <div className="space-y-2">
                                    {selectedDateEvents.map(ev => (
                                        <div
                                            key={ev.id}
                                            onClick={() => setViewingEvent(ev)}
                                            className="flex items-center gap-3 p-3 bg-warmgray-50 rounded-xl cursor-pointer hover:bg-warmgray-100 transition-colors"
                                        >
                                            <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-warmgray-900 truncate">{ev.title}</p>
                                                <p className="text-xs text-warmgray-500">
                                                    {ev.allDay ? 'All day' : `${formatTime12(ev.startTime || '')}${ev.endTime ? ` – ${formatTime12(ev.endTime)}` : ''}`}
                                                </p>
                                            </div>
                                            <ChevronRight size={16} className="text-warmgray-300 flex-shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                /* ─── Agenda View ─── */
                <div className="flex-1 overflow-y-auto">
                    {upcomingEvents.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-warmgray-400">
                            <Calendar size={48} className="mb-3 opacity-50" />
                            <p className="text-sm font-medium">No upcoming events</p>
                            <button
                                onClick={() => { setEditingEvent(null); setShowForm(true); }}
                                className="mt-3 text-sm text-kin-600 font-medium hover:text-kin-700"
                            >
                                Create one
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-1">
                            {(() => {
                                let lastDate = '';
                                return upcomingEvents.map(ev => {
                                    const showDateHeader = ev.date !== lastDate;
                                    lastDate = ev.date;
                                    const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
                                    const isEventToday = ev.date === todayStr;

                                    return (
                                        <div key={ev.id}>
                                            {showDateHeader && (
                                                <div className={`flex items-center gap-2 px-1 pt-4 pb-2 ${isEventToday ? 'text-kin-600' : 'text-warmgray-500'}`}>
                                                    <span className="text-sm font-bold">
                                                        {isEventToday ? 'Today' : new Date(ev.date + 'T00:00:00').toLocaleDateString('en-US', {
                                                            weekday: 'short', month: 'short', day: 'numeric',
                                                        })}
                                                    </span>
                                                    <div className="flex-1 h-px bg-warmgray-200" />
                                                </div>
                                            )}
                                            <div
                                                onClick={() => setViewingEvent(ev)}
                                                className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:bg-warmgray-50 transition-colors"
                                            >
                                                <div className="w-1 h-10 rounded-full flex-shrink-0" style={{ backgroundColor: ev.color }} />
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-semibold text-warmgray-900 truncate">{ev.title}</p>
                                                    <p className="text-xs text-warmgray-500">
                                                        {ev.allDay ? 'All day' : `${formatTime12(ev.startTime || '')}${ev.endTime ? ` – ${formatTime12(ev.endTime)}` : ''}`}
                                                    </p>
                                                </div>
                                                {(() => {
                                                    const pList: EventParticipant[] = ev.participants?.length
                                                        ? ev.participants
                                                        : (ev.assignedTo || []).map(uid => {
                                                            const m = members.find(mb => mb.uid === uid);
                                                            if (m) return memberToParticipant(m);
                                                            return { uid, email: '', name: 'User' } as EventParticipant;
                                                        });
                                                    if (!pList.length) return null;
                                                    return (
                                                        <div className="flex -space-x-1 flex-shrink-0">
                                                            {pList.slice(0, 3).map((p, i) => (
                                                                <div
                                                                    key={p.email || i}
                                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white"
                                                                    style={{ backgroundColor: ev.color }}
                                                                    title={p.name || p.email}
                                                                >
                                                                    {(p.name || p.email)?.[0]?.toUpperCase() || '?'}
                                                                </div>
                                                            ))}
                                                            {pList.length > 3 && (
                                                                <div className="w-6 h-6 rounded-full flex items-center justify-center bg-warmgray-200 text-warmgray-600 text-[10px] font-bold border-2 border-white">
                                                                    +{pList.length - 3}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </div>
                                    );
                                });
                            })()}
                        </div>
                    )}
                </div>
            )}

            {/* ─── Modals ─── */}
            {showForm && (
                <EventFormModal
                    initialDate={selectedDate || formatDate(today.getFullYear(), today.getMonth(), today.getDate())}
                    event={editingEvent || undefined}
                    members={members}
                    googleConnected={gcalConnected}
                    onSave={handleSaveEvent}
                    onDelete={editingEvent ? () => handleDeleteEvent(editingEvent.id) : undefined}
                    onClose={() => { setShowForm(false); setEditingEvent(null); }}
                />
            )}

            {viewingEvent && !showForm && (
                <EventDetailSheet
                    event={viewingEvent}
                    members={members}
                    onEdit={() => { setEditingEvent(viewingEvent); setViewingEvent(null); setShowForm(true); }}
                    onDelete={() => handleDeleteEvent(viewingEvent.id)}
                    onClose={() => setViewingEvent(null)}
                />
            )}
        </div>
    );
}
