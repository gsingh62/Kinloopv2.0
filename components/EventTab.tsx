// components/EventTab.tsx — Production-quality Shared Calendar
import { useState, useMemo, useCallback, useEffect } from 'react';
import { auth } from '../lib/firebase';
import {
    CalendarEvent,
    CalendarEventInput,
    subscribeToEvents,
    addCalendarEvent,
    updateCalendarEvent,
    deleteEvent,
} from '../lib/firestoreUtils';
import { ChevronLeft, ChevronRight, Plus, X, Clock, Trash2, Edit3, Users, Calendar } from 'lucide-react';

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
    members?: { uid: string; name?: string; email: string }[];
}

// ─── Event Form Modal ───
interface EventFormProps {
    initialDate?: string;
    event?: CalendarEvent;
    members: { uid: string; name?: string; email: string }[];
    onSave: (event: CalendarEventInput) => void;
    onDelete?: () => void;
    onClose: () => void;
}

function EventFormModal({ initialDate, event, members, onSave, onDelete, onClose }: EventFormProps) {
    const [title, setTitle] = useState(event?.title || '');
    const [date, setDate] = useState(event?.date || initialDate || '');
    const [allDay, setAllDay] = useState(event?.allDay ?? true);
    const [startTime, setStartTime] = useState(event?.startTime || '09:00');
    const [endTime, setEndTime] = useState(event?.endTime || '10:00');
    const [description, setDescription] = useState(event?.description || '');
    const [color, setColor] = useState(event?.color || EVENT_COLORS[0].value);
    const [assignedTo, setAssignedTo] = useState<string[]>(event?.assignedTo || []);

    const toggleAssigned = (uid: string) => {
        setAssignedTo(prev =>
            prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!title.trim() || !date) return;
        const user = auth.currentUser;
        if (!user) return;
        onSave({
            title: title.trim(),
            date,
            allDay,
            startTime: allDay ? undefined : startTime,
            endTime: allDay ? undefined : endTime,
            description: description.trim() || undefined,
            color,
            assignedTo: assignedTo.length > 0 ? assignedTo : undefined,
            createdBy: event?.createdBy || user.uid,
        });
    };

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

                    {/* Assign Members */}
                    {members.length > 0 && (
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <Users size={16} className="text-warmgray-400" />
                                <p className="text-sm font-medium text-warmgray-700">Assign to</p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                {members.map(m => {
                                    const selected = assignedTo.includes(m.uid);
                                    const displayName = m.name || m.email?.split('@')[0] || 'User';
                                    return (
                                        <button
                                            key={m.uid}
                                            type="button"
                                            onClick={() => toggleAssigned(m.uid)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                                                selected
                                                    ? 'bg-kin-100 text-kin-700 ring-1 ring-kin-300'
                                                    : 'bg-warmgray-100 text-warmgray-600 hover:bg-warmgray-200'
                                            }`}
                                        >
                                            {displayName}
                                        </button>
                                    );
                                })}
                            </div>
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
    members: { uid: string; name?: string; email: string }[];
    onEdit: () => void;
    onDelete: () => void;
    onClose: () => void;
}

function EventDetailSheet({ event, members, onEdit, onDelete, onClose }: EventDetailProps) {
    const assignedMembers = members.filter(m => event.assignedTo?.includes(m.uid));

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

                    {assignedMembers.length > 0 && (
                        <div className="mt-4">
                            <p className="text-xs text-warmgray-400 uppercase tracking-wide mb-2">Assigned to</p>
                            <div className="flex gap-2 flex-wrap">
                                {assignedMembers.map(m => (
                                    <div key={m.uid} className="flex items-center gap-2 bg-warmgray-50 rounded-full px-3 py-1.5">
                                        <div
                                            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                                            style={{ backgroundColor: event.color }}
                                        >
                                            {(m.name || m.email)?.[0]?.toUpperCase()}
                                        </div>
                                        <span className="text-xs text-warmgray-700 font-medium">
                                            {m.name || m.email?.split('@')[0]}
                                        </span>
                                    </div>
                                ))}
                            </div>
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

    // Subscribe to events
    useEffect(() => {
        if (!roomId) return;
        const unsub = subscribeToEvents(roomId, setEvents);
        return () => unsub();
    }, [roomId]);

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

    // Group events by date
    const eventsByDate = useMemo(() => {
        const map: Record<string, CalendarEvent[]> = {};
        events.forEach(ev => {
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
    }, [events]);

    // Events for selected date in agenda/day view
    const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : [];

    // Upcoming events for agenda view
    const upcomingEvents = useMemo(() => {
        const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
        return events
            .filter(ev => ev.date >= todayStr)
            .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
    }, [events]);

    // Handlers
    const handleSaveEvent = async (eventData: CalendarEventInput) => {
        try {
            if (editingEvent) {
                await updateCalendarEvent(roomId, editingEvent.id, eventData);
            } else {
                await addCalendarEvent(roomId, eventData);
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
                                                className="truncate text-[10px] sm:text-xs leading-tight px-1.5 py-0.5 rounded-md font-medium cursor-pointer hover:opacity-80 transition-opacity"
                                                style={{
                                                    backgroundColor: ev.color + '20',
                                                    color: ev.color,
                                                    borderLeft: `3px solid ${ev.color}`,
                                                }}
                                            >
                                                {ev.title}
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
                                                {ev.assignedTo && ev.assignedTo.length > 0 && (
                                                    <div className="flex -space-x-1">
                                                        {ev.assignedTo.slice(0, 3).map(uid => {
                                                            const m = members.find(mb => mb.uid === uid);
                                                            return (
                                                                <div
                                                                    key={uid}
                                                                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold border-2 border-white"
                                                                    style={{ backgroundColor: ev.color }}
                                                                >
                                                                    {(m?.name || m?.email)?.[0]?.toUpperCase() || '?'}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
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
