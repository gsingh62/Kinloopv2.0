// components/ListTab.tsx — Lists with traditional + enhanced chore board
import {
    collection, doc, onSnapshot, addDoc, deleteDoc, updateDoc,
    query, orderBy, getDocs, serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useEffect, useState, useRef, useCallback } from 'react';
import {
    Plus, Trash2, ChevronDown, CheckCircle2, Circle, ListTodo,
    MoreHorizontal, Pencil, X, Loader2, Archive, ClipboardList,
    List, User, Clock, CalendarPlus, UserPlus, UserMinus, GripVertical, Palette,
} from 'lucide-react';
import { addCalendarEvent } from '../lib/firestoreUtils';
import {
    DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors,
    DragOverlay, DragStartEvent, DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Chore Icon Detection ───
const CHORE_ICONS: [RegExp, string][] = [
    [/dish|plate|bowl|cup|kitchen|sink/i, '🍽️'],
    [/laundry|wash|clothes|fold|iron/i, '🧺'],
    [/trash|garbage|recycle|bin|waste/i, '🗑️'],
    [/sweep|mop|floor|vacuum|clean/i, '🧹'],
    [/wipe|scrub|bathroom|toilet|shower/i, '🧽'],
    [/cook|dinner|lunch|breakfast|meal|food/i, '🍳'],
    [/grocery|shop|store|buy|market/i, '🛒'],
    [/dog|cat|pet|walk|feed.*pet|litter/i, '🐾'],
    [/garden|water|plant|lawn|mow|yard/i, '🌿'],
    [/bed|sheet|pillow|bedroom/i, '🛏️'],
    [/car|drive|gas|oil|tire/i, '🚗'],
    [/fix|repair|tool|build|hang/i, '🔧'],
    [/mail|package|deliver|letter/i, '📦'],
    [/organize|sort|tidy|declutter/i, '📐'],
    [/homework|study|school|read/i, '📚'],
    [/dust|polish|furniture/i, '✨'],
    [/baby|diaper|kid|child/i, '👶'],
    [/medicine|pill|doctor|health/i, '💊'],
    [/call|phone|email|contact/i, '📞'],
    [/pay|bill|bank|money/i, '💳'],
];

function getChoreIcon(content: string): string {
    for (const [pattern, icon] of CHORE_ICONS) {
        if (pattern.test(content)) return icon;
    }
    return '🏠';
}

// ─── Color Palette ───
const CHORE_COLORS = [
    { id: 'default', bg: 'bg-white', border: 'border-warmgray-100', label: 'Default' },
    { id: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', label: 'Blue' },
    { id: 'green', bg: 'bg-emerald-50', border: 'border-emerald-200', label: 'Green' },
    { id: 'amber', bg: 'bg-amber-50', border: 'border-amber-200', label: 'Amber' },
    { id: 'rose', bg: 'bg-rose-50', border: 'border-rose-200', label: 'Rose' },
    { id: 'violet', bg: 'bg-violet-50', border: 'border-violet-200', label: 'Violet' },
    { id: 'cyan', bg: 'bg-cyan-50', border: 'border-cyan-200', label: 'Cyan' },
    { id: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', label: 'Orange' },
];

const COLOR_DOT_CLASSES: Record<string, string> = {
    default: 'bg-warmgray-300',
    blue: 'bg-blue-400',
    green: 'bg-emerald-400',
    amber: 'bg-amber-400',
    rose: 'bg-rose-400',
    violet: 'bg-violet-400',
    cyan: 'bg-cyan-400',
    orange: 'bg-orange-400',
};

function getColorClasses(colorId?: string) {
    return CHORE_COLORS.find(c => c.id === colorId) || CHORE_COLORS[0];
}

// ─── Success Sound ───
let audioCtx: AudioContext | null = null;
function playSuccessSound() {
    try {
        if (!audioCtx) audioCtx = new AudioContext();
        const ctx = audioCtx;
        const now = ctx.currentTime;

        // Two-note ascending chime
        [523.25, 659.25].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.3, now + i * 0.12);
            gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
            osc.connect(gain).connect(ctx.destination);
            osc.start(now + i * 0.12);
            osc.stop(now + i * 0.12 + 0.4);
        });
    } catch {}
}

// ─── Interfaces ───
interface ListTabProps {
    roomId: string | null;
    roomName?: string;
    members?: { uid: string; name?: string; email?: string }[];
    onAddItem?: (text: string) => void;
    onDeleteItem?: (itemId: string) => void;
    onActivity?: (activity: { type: string; detail: string }) => void;
}

export default function ListTab({ roomId, roomName, members = [], onActivity }: ListTabProps) {
    const [lists, setLists] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [newItem, setNewItem] = useState('');
    const [newListName, setNewListName] = useState('');
    const [newListType, setNewListType] = useState<'list' | 'choreboard'>('list');
    const [showNewList, setShowNewList] = useState(false);
    const [showListMenu, setShowListMenu] = useState(false);
    const [creatingList, setCreatingList] = useState(false);
    const [addingItem, setAddingItem] = useState(false);
    const [editingListName, setEditingListName] = useState(false);
    const [editName, setEditName] = useState('');
    const [choreTimeEstimate, setChoreTimeEstimate] = useState('');
    const [newChoreColor, setNewChoreColor] = useState('default');
    const [activeId, setActiveId] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
    );

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowListMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    useEffect(() => {
        if (!roomId) return;
        const q = collection(db, 'rooms', roomId, 'lists');
        const unsubscribe = onSnapshot(q, snapshot => {
            const listData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setLists(listData);
            if (!selectedListId && listData.length > 0) setSelectedListId(listData[0].id);
        });
        return () => unsubscribe();
    }, [roomId]);

    const itemCountRef = useRef<number | null>(null);
    const localActionRef = useRef(false);

    useEffect(() => {
        if (!roomId || !selectedListId) return;
        itemCountRef.current = null;
        const q = query(
            collection(db, 'rooms', roomId, 'lists', selectedListId, 'items'),
            orderBy('createdAt')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            const newItems = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const currentUid = auth.currentUser?.uid;
            if (itemCountRef.current !== null && !localActionRef.current && onActivity) {
                const diff = newItems.length - itemCountRef.current;
                if (diff > 0) {
                    const added = newItems.filter(
                        item => !(items.find(i => i.id === item.id)) && (item as any).createdBy && (item as any).createdBy !== currentUid
                    );
                    if (added.length > 0) {
                        const names = added.map(i => (i as any).content).join(', ');
                        onActivity({ type: 'add', detail: `${added.length} item${added.length > 1 ? 's' : ''} added: ${names}` });
                    }
                } else if (diff < 0) {
                    onActivity({ type: 'remove', detail: `${Math.abs(diff)} item${Math.abs(diff) > 1 ? 's' : ''} removed` });
                }
            }
            localActionRef.current = false;
            itemCountRef.current = newItems.length;
            setItems(newItems);
        });
        return () => unsubscribe();
    }, [roomId, selectedListId]);

    const selectedList = lists.find(l => l.id === selectedListId);
    const isChoreBoard = selectedList?.type === 'choreboard';
    const completedCount = items.filter(i => i.completed).length;
    const [archiving, setArchiving] = useState(false);

    const handleAddItem = async () => {
        if (!newItem.trim() || !roomId || !selectedListId) return;
        setAddingItem(true);
        localActionRef.current = true;
        const itemText = newItem.trim();
        try {
            const data: any = {
                content: itemText,
                completed: false,
                createdAt: serverTimestamp(),
                createdBy: auth.currentUser?.uid || '',
            };
            if (isChoreBoard) {
                data.assignedTo = '';
                data.assignedToName = '';
                data.timeEstimate = choreTimeEstimate ? parseInt(choreTimeEstimate) : 0;
                data.color = newChoreColor;
                data.sortOrder = items.length;
            }
            await addDoc(collection(db, 'rooms', roomId, 'lists', selectedListId, 'items'), data);
            setNewItem('');
            setChoreTimeEstimate('');
            setNewChoreColor('default');
            inputRef.current?.focus();
            const user = auth.currentUser;
            if (user) {
                const who = user.email?.split('@')[0] || 'Someone';
                const listLabel = selectedList?.name || 'a list';
                import('../lib/pushUtils').then(m => m.notifyRoomMembers(roomId!, user.uid, `${who} added to ${listLabel}`, itemText, `/room/${roomId}`));
            }
        } catch (e) {
            console.error('Failed to add item:', e);
        } finally {
            setAddingItem(false);
        }
    };

    const handleToggleItem = async (item: any) => {
        if (!roomId || !selectedListId) return;
        const willComplete = !item.completed;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', item.id), {
            completed: willComplete,
        });
        if (willComplete && isChoreBoard) playSuccessSound();
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!roomId || !selectedListId) return;
        localActionRef.current = true;
        const removedItem = items.find(i => i.id === itemId);
        await deleteDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId));
        const user = auth.currentUser;
        if (user && removedItem) {
            const who = user.email?.split('@')[0] || 'Someone';
            const listLabel = selectedList?.name || 'a list';
            import('../lib/pushUtils').then(m => m.notifyRoomMembers(roomId!, user.uid, `${who} removed from ${listLabel}`, (removedItem as any).content || 'an item', `/room/${roomId}`));
        }
    };

    const handleAssignChore = async (itemId: string, userId: string) => {
        if (!roomId || !selectedListId) return;
        const member = members.find(m => m.uid === userId);
        const name = member?.name || member?.email?.split('@')[0] || '';
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId), {
            assignedTo: userId,
            assignedToName: name,
        });
    };

    const handleUnassignChore = async (itemId: string) => {
        if (!roomId || !selectedListId) return;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId), {
            assignedTo: '',
            assignedToName: '',
        });
    };

    const handleTakeChore = async (itemId: string) => {
        const user = auth.currentUser;
        if (!user || !roomId || !selectedListId) return;
        const name = user.displayName || user.email?.split('@')[0] || '';
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId), {
            assignedTo: user.uid,
            assignedToName: name,
        });
    };

    const handleChangeColor = async (itemId: string, colorId: string) => {
        if (!roomId || !selectedListId) return;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId), { color: colorId });
    };

    const handleAddToCalendar = async (item: any) => {
        if (!roomId) return;
        const user = auth.currentUser;
        if (!user) return;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dateStr = tomorrow.toISOString().split('T')[0];
        const duration = item.timeEstimate || 30;
        await addCalendarEvent(roomId, {
            title: `🧹 ${item.content}`,
            date: dateStr,
            startTime: '10:00',
            endTime: `${Math.floor(10 + duration / 60)}:${String(duration % 60).padStart(2, '0')}`,
            description: `Chore from "${selectedList?.name || 'Chore Board'}"`,
            allDay: false,
            color: '#F59E0B',
            createdBy: user.uid,
        });
        alert(`Added "${item.content}" to calendar for tomorrow!`);
    };

    const handleAddList = async () => {
        if (!newListName.trim() || !roomId) return;
        setCreatingList(true);
        try {
            const docRef = await addDoc(collection(db, 'rooms', roomId, 'lists'), {
                name: newListName.trim(),
                type: newListType,
                createdAt: serverTimestamp(),
            });
            setSelectedListId(docRef.id);
            setNewListName('');
            setNewListType('list');
            setShowNewList(false);
        } catch (e) {
            console.error('Failed to create list:', e);
        } finally {
            setCreatingList(false);
        }
    };

    const handleDeleteList = async () => {
        if (!roomId || !selectedListId) return;
        const confirmed = confirm('Delete this list and all its items?');
        if (!confirmed) return;
        setShowListMenu(false);
        try {
            const itemsSnapshot = await getDocs(collection(db, 'rooms', roomId, 'lists', selectedListId, 'items'));
            await Promise.all(itemsSnapshot.docs.map(d => deleteDoc(doc(db, 'rooms', roomId!, 'lists', selectedListId!, 'items', d.id))));
            await deleteDoc(doc(db, 'rooms', roomId, 'lists', selectedListId));
            setSelectedListId(null);
        } catch (e) {
            console.error('Failed to delete list:', e);
        }
    };

    const handleRenameList = async () => {
        if (!roomId || !selectedListId || !editName.trim()) return;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId), { name: editName.trim() });
        setEditingListName(false);
        setShowListMenu(false);
    };

    const handleArchiveCompleted = async () => {
        if (!roomId || !selectedListId) return;
        const completedItems = items.filter(i => i.completed);
        if (completedItems.length === 0) return;
        const confirmed = confirm(`Remove ${completedItems.length} completed item${completedItems.length > 1 ? 's' : ''}?`);
        if (!confirmed) return;
        setArchiving(true);
        localActionRef.current = true;
        setShowListMenu(false);
        try {
            await Promise.all(completedItems.map(item => deleteDoc(doc(db, 'rooms', roomId!, 'lists', selectedListId!, 'items', item.id))));
        } catch (e) {
            console.error('Failed to archive items:', e);
        } finally {
            setArchiving(false);
        }
    };

    // ─── Drag & Drop handlers ───
    const handleDragStart = (event: DragStartEvent) => {
        setActiveId(event.active.id as string);
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        setActiveId(null);
        const { active, over } = event;
        if (!over || !roomId || !selectedListId) return;

        const draggedItem = items.find(i => i.id === active.id);
        if (!draggedItem) return;

        const overId = over.id as string;

        // Dropped onto a zone (unassigned, member uid, or done)
        if (overId.startsWith('zone-')) {
            const zone = overId.replace('zone-', '');
            if (zone === 'unassigned') {
                await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', draggedItem.id), {
                    assignedTo: '', assignedToName: '', completed: false,
                });
            } else if (zone === 'done') {
                await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', draggedItem.id), {
                    completed: true,
                });
                playSuccessSound();
            } else {
                const member = members.find(m => m.uid === zone);
                if (member) {
                    await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', draggedItem.id), {
                        assignedTo: zone,
                        assignedToName: member.name || member.email?.split('@')[0] || '',
                        completed: false,
                    });
                }
            }
        } else {
            // Dropped onto another item — take that item's assignment
            const targetItem = items.find(i => i.id === overId);
            if (targetItem && targetItem.id !== draggedItem.id) {
                if (targetItem.completed) {
                    await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', draggedItem.id), {
                        completed: true,
                    });
                    playSuccessSound();
                } else {
                    await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', draggedItem.id), {
                        assignedTo: targetItem.assignedTo || '',
                        assignedToName: targetItem.assignedToName || '',
                        completed: false,
                    });
                }
            }
        }
    };

    // Group chores by assignment for board view
    const unassignedChores = items.filter(i => !i.assignedTo && !i.completed);
    const assignedGroups: Record<string, any[]> = {};
    const doneChores = items.filter(i => i.completed);

    for (const item of items) {
        if (item.assignedTo && !item.completed) {
            if (!assignedGroups[item.assignedTo]) assignedGroups[item.assignedTo] = [];
            assignedGroups[item.assignedTo].push(item);
        }
    }

    const activeItem = activeId ? items.find(i => i.id === activeId) : null;
    const allItemIds = items.filter(i => !i.completed).map(i => i.id);

    return (
        <div className="max-w-2xl mx-auto">
            {/* List Selector Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {lists.length > 0 ? (
                        editingListName ? (
                            <div className="flex items-center gap-2 flex-1">
                                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                                    className="flex-1 px-3 py-1.5 border border-kin-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500"
                                    autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleRenameList(); if (e.key === 'Escape') setEditingListName(false); }}
                                />
                                <button onClick={handleRenameList} className="text-kin-600 text-xs font-medium">Save</button>
                                <button onClick={() => setEditingListName(false)} className="text-warmgray-400 text-xs">Cancel</button>
                            </div>
                        ) : (
                            <div className="relative flex items-center gap-2">
                                <select
                                    className="appearance-none bg-transparent text-lg font-bold text-warmgray-800 pr-7 cursor-pointer focus:outline-none"
                                    value={selectedListId || ''}
                                    onChange={(e) => setSelectedListId(e.target.value)}
                                >
                                    {lists.map(list => (
                                        <option key={list.id} value={list.id}>
                                            {list.type === 'choreboard' ? '📋 ' : ''}{list.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="text-warmgray-400 pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" />
                                {isChoreBoard && (
                                    <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full">Chore Board</span>
                                )}
                            </div>
                        )
                    ) : (
                        <h3 className="text-lg font-bold text-warmgray-800">Lists</h3>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {selectedListId && (
                        <div className="relative" ref={menuRef}>
                            <button onClick={() => setShowListMenu(!showListMenu)}
                                className="p-2 text-warmgray-400 hover:text-warmgray-600 hover:bg-warmgray-100 rounded-lg transition-colors">
                                <MoreHorizontal size={18} />
                            </button>
                            {showListMenu && (
                                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-warmgray-200 rounded-xl shadow-lg py-1 z-20">
                                    <button onClick={() => { setEditName(selectedList?.name || ''); setEditingListName(true); setShowListMenu(false); }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warmgray-700 hover:bg-warmgray-50">
                                        <Pencil size={14} /> Rename List
                                    </button>
                                    {completedCount > 0 && (
                                        <button onClick={handleArchiveCompleted} disabled={archiving}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warmgray-700 hover:bg-warmgray-50 disabled:opacity-50">
                                            <Archive size={14} /> {archiving ? 'Archiving...' : `Archive ${completedCount} completed`}
                                        </button>
                                    )}
                                    <div className="my-1 border-t border-warmgray-100" />
                                    <button onClick={handleDeleteList}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                        <Trash2 size={14} /> Delete List
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                    <button onClick={() => setShowNewList(!showNewList)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-sm shadow-kin-200/40">
                        <Plus size={14} /> <span className="hidden sm:inline">New List</span>
                    </button>
                </div>
            </div>

            {/* New List Form */}
            {showNewList && (
                <div className="mb-4 p-3 bg-kin-50 border border-kin-200 rounded-xl">
                    <div className="flex gap-2 mb-2">
                        <button onClick={() => setNewListType('list')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${newListType === 'list' ? 'bg-white border border-kin-300 text-kin-700 shadow-sm' : 'text-warmgray-500 hover:text-warmgray-700'}`}>
                            <List size={13} /> Traditional List
                        </button>
                        <button onClick={() => setNewListType('choreboard')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${newListType === 'choreboard' ? 'bg-white border border-amber-300 text-amber-700 shadow-sm' : 'text-warmgray-500 hover:text-warmgray-700'}`}>
                            <ClipboardList size={13} /> Chore Board
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <input type="text" placeholder={newListType === 'choreboard' ? 'Board name...' : 'List name...'}
                            className="flex-1 px-3 py-2 bg-white border border-kin-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                            value={newListName} onChange={e => setNewListName(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAddList(); }}
                        />
                        <button onClick={handleAddList} disabled={!newListName.trim() || creatingList}
                            className="px-4 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                            {creatingList ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                        </button>
                        <button onClick={() => { setShowNewList(false); setNewListName(''); }} className="p-2 text-warmgray-400 hover:text-warmgray-600">
                            <X size={16} />
                        </button>
                    </div>
                </div>
            )}

            {/* Progress bar */}
            {selectedListId && items.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs text-warmgray-400">{completedCount} of {items.length} completed</span>
                        <div className="flex items-center gap-2">
                            {completedCount > 0 && (
                                <button onClick={handleArchiveCompleted} disabled={archiving}
                                    className="flex items-center gap-1 text-[11px] text-warmgray-400 hover:text-kin-600 transition-colors disabled:opacity-50">
                                    <Archive size={12} /> {archiving ? 'Archiving...' : 'Archive completed'}
                                </button>
                            )}
                            <span className="text-xs font-medium text-warmgray-500">
                                {items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%
                            </span>
                        </div>
                    </div>
                    <div className="h-1.5 bg-warmgray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-kin-500 rounded-full transition-all duration-500"
                            style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }} />
                    </div>
                </div>
            )}

            {/* Content */}
            {!selectedListId ? (
                <div className="text-center py-16">
                    <div className="w-14 h-14 bg-kin-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <ListTodo size={28} className="text-kin-300" />
                    </div>
                    <h3 className="text-base font-semibold text-warmgray-800 mb-1">No lists yet</h3>
                    <p className="text-sm text-warmgray-400 mb-4">Create a list or chore board to get started</p>
                    <button onClick={() => setShowNewList(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 transition-all">
                        Create Your First List
                    </button>
                </div>
            ) : isChoreBoard ? (
                /* ═══ CHORE BOARD VIEW ═══ */
                <DndContext sensors={sensors} collisionDetection={closestCenter}
                    onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
                    <div>
                        {/* Unassigned section */}
                        <DroppableZone id="zone-unassigned" label="Unassigned" icon={<ClipboardList size={13} />} count={unassignedChores.length}>
                            <SortableContext items={unassignedChores.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                {unassignedChores.length === 0 && (
                                    <p className="text-xs text-warmgray-400 italic py-3 text-center">Drag chores here or add new ones below</p>
                                )}
                                {unassignedChores.map(item => (
                                    <SortableChoreCard key={item.id} item={item} members={members} roomId={roomId!}
                                        onToggle={() => handleToggleItem(item)}
                                        onDelete={() => handleDeleteItem(item.id)}
                                        onAssign={(uid) => handleAssignChore(item.id, uid)}
                                        onTake={() => handleTakeChore(item.id)}
                                        onAddToCalendar={() => handleAddToCalendar(item)}
                                        onChangeColor={(c) => handleChangeColor(item.id, c)}
                                    />
                                ))}
                            </SortableContext>
                        </DroppableZone>

                        {/* Per-member columns */}
                        {members.filter(m => m.uid !== '__none__').map(member => {
                            const uid = member.uid;
                            const chores = assignedGroups[uid] || [];
                            const name = member.name || member.email?.split('@')[0] || 'Unknown';
                            const initial = name[0]?.toUpperCase() || '?';
                            return (
                                <DroppableZone key={uid} id={`zone-${uid}`}
                                    label={name} count={chores.length}
                                    icon={
                                        <div className="w-5 h-5 bg-kin-100 text-kin-600 rounded-full flex items-center justify-center text-[10px] font-bold">
                                            {initial}
                                        </div>
                                    }>
                                    <SortableContext items={chores.map(i => i.id)} strategy={verticalListSortingStrategy}>
                                        {chores.length === 0 && (
                                            <p className="text-xs text-warmgray-400 italic py-3 text-center">Drag chores here to assign to {name}</p>
                                        )}
                                        {chores.map(item => (
                                            <SortableChoreCard key={item.id} item={item} members={members} roomId={roomId!}
                                                onToggle={() => handleToggleItem(item)}
                                                onDelete={() => handleDeleteItem(item.id)}
                                                onAssign={(uid) => handleAssignChore(item.id, uid)}
                                                onUnassign={() => handleUnassignChore(item.id)}
                                                onAddToCalendar={() => handleAddToCalendar(item)}
                                                onChangeColor={(c) => handleChangeColor(item.id, c)}
                                            />
                                        ))}
                                    </SortableContext>
                                </DroppableZone>
                            );
                        })}

                        {/* Done section */}
                        <DroppableZone id="zone-done" label="Done" icon={<CheckCircle2 size={13} className="text-green-500" />}
                            count={doneChores.length} className="border-green-200 bg-green-50/30">
                            {doneChores.map(item => (
                                <div key={item.id} className="group flex items-center gap-3 px-3 py-2 rounded-xl bg-green-50/50">
                                    <button onClick={() => handleToggleItem(item)}>
                                        <CheckCircle2 size={18} className="text-green-500" />
                                    </button>
                                    <span className="text-lg mr-1">{getChoreIcon(item.content)}</span>
                                    <span className="flex-1 text-sm line-through text-warmgray-400">{item.content}</span>
                                    {item.assignedToName && <span className="text-[10px] text-warmgray-400">{item.assignedToName}</span>}
                                    <button onClick={() => handleDeleteItem(item.id)} className="opacity-0 group-hover:opacity-100 p-1 text-warmgray-300 hover:text-red-500 rounded transition-all">
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            ))}
                            {doneChores.length === 0 && (
                                <p className="text-xs text-warmgray-400 italic py-3 text-center">Drag chores here to mark as done</p>
                            )}
                        </DroppableZone>

                        {/* Drag overlay */}
                        <DragOverlay>
                            {activeItem && (
                                <div className="opacity-90 shadow-xl rounded-xl">
                                    <ChoreCardContent item={activeItem} />
                                </div>
                            )}
                        </DragOverlay>
                    </div>

                    {/* Add chore */}
                    <div className="mt-4 space-y-2">
                        <div className="flex gap-2">
                            <div className="flex-1 flex gap-2">
                                <input ref={inputRef} type="text" placeholder="Add a chore..."
                                    className="flex-1 px-4 py-3 bg-white border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                                    value={newItem} onChange={(e) => setNewItem(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); } }}
                                />
                                <input type="number" placeholder="min" min="0" step="5"
                                    className="w-16 px-2 py-3 bg-white border border-warmgray-200 rounded-xl text-sm text-center focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                                    value={choreTimeEstimate} onChange={e => setChoreTimeEstimate(e.target.value)}
                                    title="Time estimate in minutes"
                                />
                            </div>
                            <button onClick={handleAddItem} disabled={!newItem.trim() || addingItem}
                                className="px-4 py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                                {addingItem ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                                <span className="hidden sm:inline">Add</span>
                            </button>
                        </div>
                        {/* Color picker for new chore */}
                        <div className="flex items-center gap-1.5 px-1">
                            <Palette size={12} className="text-warmgray-400" />
                            <span className="text-[10px] text-warmgray-400 mr-1">Color:</span>
                            {CHORE_COLORS.map(c => (
                                <button key={c.id} onClick={() => setNewChoreColor(c.id)}
                                    className={`w-5 h-5 rounded-full border-2 transition-all ${COLOR_DOT_CLASSES[c.id]} ${
                                        newChoreColor === c.id ? 'border-warmgray-800 scale-125' : 'border-transparent hover:scale-110'
                                    }`}
                                    title={c.label}
                                />
                            ))}
                        </div>
                    </div>
                </DndContext>
            ) : (
                /* ═══ TRADITIONAL LIST VIEW ═══ */
                <>
                    <div className="space-y-1 mb-4">
                        {items.length === 0 && (
                            <div className="text-center py-10">
                                <Circle size={32} className="mx-auto mb-2 text-warmgray-200" />
                                <p className="text-sm text-warmgray-400">This list is empty. Add an item below.</p>
                            </div>
                        )}
                        {items.map(item => (
                            <div key={item.id}
                                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                                    item.completed ? 'bg-warmgray-50' : 'bg-white border border-warmgray-100 hover:border-warmgray-200 shadow-sm'
                                }`}>
                                <button onClick={() => handleToggleItem(item)} className="flex-shrink-0 transition-colors">
                                    {item.completed ? <CheckCircle2 size={20} className="text-sage-400" /> : <Circle size={20} className="text-warmgray-300 hover:text-kin-400" />}
                                </button>
                                <span className={`flex-1 text-sm ${item.completed ? 'line-through text-warmgray-400' : 'text-warmgray-800'}`}>
                                    {item.content}
                                </span>
                                <button onClick={() => handleDeleteItem(item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-warmgray-300 hover:text-kin-600 rounded transition-all">
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>
                    <div className="flex gap-2">
                        <input ref={inputRef} type="text" placeholder="Add a new item..."
                            className="flex-1 px-4 py-3 bg-white border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                            value={newItem} onChange={(e) => setNewItem(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddItem(); } }}
                        />
                        <button onClick={handleAddItem} disabled={!newItem.trim() || addingItem}
                            className="px-4 py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                            {addingItem ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            <span className="hidden sm:inline">Add</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}

/* ═══ Droppable Zone ═══ */
function DroppableZone({ id, label, icon, count, className, children }: {
    id: string; label: string; icon: React.ReactNode; count: number;
    className?: string; children: React.ReactNode;
}) {
    const { setNodeRef, isOver } = useSortable({ id, data: { type: 'zone' } });
    return (
        <div ref={setNodeRef} className={`mb-4 p-3 rounded-2xl border-2 border-dashed transition-all ${
            isOver ? 'border-kin-400 bg-kin-50/50' : `border-warmgray-200 ${className || 'bg-warmgray-50/30'}`
        }`}>
            <h4 className="text-xs font-semibold text-warmgray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                {icon} {label} ({count})
            </h4>
            <div className="space-y-1.5 min-h-[20px]">
                {children}
            </div>
        </div>
    );
}

/* ═══ Sortable Chore Card ═══ */
function SortableChoreCard(props: {
    item: any; members: any[]; roomId: string;
    onToggle: () => void; onDelete: () => void;
    onAssign?: (uid: string) => void; onTake?: () => void;
    onUnassign?: () => void; onAddToCalendar: () => void;
    onChangeColor: (colorId: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.item.id });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
    };

    return (
        <div ref={setNodeRef} style={style}>
            <ChoreCard {...props} dragListeners={listeners} dragAttributes={attributes} />
        </div>
    );
}

/* ═══ Chore Card Content (for drag overlay) ═══ */
function ChoreCardContent({ item }: { item: any }) {
    const color = getColorClasses(item.color);
    return (
        <div className={`${color.bg} border ${color.border} rounded-xl p-3`}>
            <div className="flex items-center gap-2.5">
                <span className="text-xl">{getChoreIcon(item.content)}</span>
                <p className="text-sm text-warmgray-800 font-medium flex-1">{item.content}</p>
            </div>
        </div>
    );
}

/* ═══ Chore Card Component ═══ */
function ChoreCard({
    item, members, roomId, onToggle, onDelete, onAssign, onTake, onUnassign, onAddToCalendar, onChangeColor,
    dragListeners, dragAttributes,
}: {
    item: any;
    members: { uid: string; name?: string; email?: string }[];
    roomId: string;
    onToggle: () => void;
    onDelete: () => void;
    onAssign?: (uid: string) => void;
    onTake?: () => void;
    onUnassign?: () => void;
    onAddToCalendar: () => void;
    onChangeColor: (colorId: string) => void;
    dragListeners?: any;
    dragAttributes?: any;
}) {
    const [showAssign, setShowAssign] = useState(false);
    const [showColors, setShowColors] = useState(false);
    const currentUid = auth.currentUser?.uid;
    const color = getColorClasses(item.color);

    return (
        <div className={`${color.bg} border ${color.border} rounded-xl p-3 hover:shadow-md shadow-sm transition-all group`}>
            <div className="flex items-start gap-2">
                {/* Drag handle */}
                <button {...dragListeners} {...dragAttributes}
                    className="flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing text-warmgray-300 hover:text-warmgray-500 touch-none">
                    <GripVertical size={16} />
                </button>

                {/* Checkmark button */}
                <button onClick={onToggle} className="flex-shrink-0 mt-0.5 transition-transform hover:scale-110">
                    {item.completed
                        ? <CheckCircle2 size={22} className="text-green-500" />
                        : <div className="w-[22px] h-[22px] rounded-full border-2 border-warmgray-300 hover:border-kin-400 flex items-center justify-center transition-colors">
                            <div className="w-2.5 h-2.5 rounded-full bg-transparent group-hover:bg-kin-200 transition-colors" />
                          </div>
                    }
                </button>

                {/* Icon + Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-xl flex-shrink-0">{getChoreIcon(item.content)}</span>
                        <p className="text-sm text-warmgray-800 font-medium">{item.content}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.timeEstimate > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-warmgray-500 bg-warmgray-100/80 px-1.5 py-0.5 rounded-full">
                                <Clock size={10} /> {item.timeEstimate}min
                            </span>
                        )}
                        {item.assignedToName && (
                            <span className="flex items-center gap-0.5 text-[10px] text-kin-600 bg-kin-50 px-1.5 py-0.5 rounded-full">
                                <User size={10} /> {item.assignedToName}
                            </span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                    <button onClick={() => setShowColors(!showColors)} className="p-1 text-warmgray-400 hover:text-violet-600 rounded" title="Change color">
                        <Palette size={14} />
                    </button>
                    {!item.assignedTo && onTake && (
                        <button onClick={onTake} className="p-1 text-warmgray-400 hover:text-kin-600 rounded" title="Take this chore">
                            <UserPlus size={14} />
                        </button>
                    )}
                    {item.assignedTo && onUnassign && (
                        <button onClick={onUnassign} className="p-1 text-warmgray-400 hover:text-amber-600 rounded" title="Unassign">
                            <UserMinus size={14} />
                        </button>
                    )}
                    {onAssign && (
                        <button onClick={() => setShowAssign(!showAssign)} className="p-1 text-warmgray-400 hover:text-violet-600 rounded" title="Assign to...">
                            <User size={14} />
                        </button>
                    )}
                    <button onClick={onAddToCalendar} className="p-1 text-warmgray-400 hover:text-sky-600 rounded" title="Add to calendar">
                        <CalendarPlus size={14} />
                    </button>
                    <button onClick={onDelete} className="p-1 text-warmgray-300 hover:text-red-500 rounded">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Color picker */}
            {showColors && (
                <div className="mt-2 flex items-center gap-1.5 px-8">
                    {CHORE_COLORS.map(c => (
                        <button key={c.id} onClick={() => { onChangeColor(c.id); setShowColors(false); }}
                            className={`w-6 h-6 rounded-full border-2 transition-all ${COLOR_DOT_CLASSES[c.id]} ${
                                item.color === c.id ? 'border-warmgray-800 scale-125' : 'border-white hover:scale-110 shadow-sm'
                            }`}
                            title={c.label}
                        />
                    ))}
                </div>
            )}

            {/* Assign dropdown */}
            {showAssign && onAssign && (
                <div className="mt-2 p-2 bg-warmgray-50 rounded-lg border border-warmgray-200">
                    <p className="text-[10px] font-semibold text-warmgray-500 uppercase tracking-wide mb-1">Assign to</p>
                    <div className="space-y-1">
                        {members.map(m => (
                            <button key={m.uid}
                                onClick={() => { onAssign(m.uid); setShowAssign(false); }}
                                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs transition-all ${
                                    item.assignedTo === m.uid ? 'bg-kin-100 text-kin-700' : 'hover:bg-warmgray-100 text-warmgray-700'
                                }`}>
                                <div className="w-5 h-5 bg-kin-100 text-kin-600 rounded-full flex items-center justify-center text-[9px] font-bold">
                                    {(m.name || m.email || '?')[0].toUpperCase()}
                                </div>
                                {m.name || m.email?.split('@')[0]}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
