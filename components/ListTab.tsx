// components/ListTab.tsx — Production-grade shared lists
import {
    collection,
    doc,
    onSnapshot,
    addDoc,
    deleteDoc,
    updateDoc,
    query,
    orderBy,
    getDocs,
    serverTimestamp,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useEffect, useState, useRef } from 'react';
import {
    Plus, Trash2, ChevronDown, CheckCircle2, Circle,
    ListTodo, MoreHorizontal, Pencil, X, Loader2,
} from 'lucide-react';

// Warm theme color mappings used throughout this component

interface ListTabProps {
    roomId: string | null;
    onAddItem?: (text: string) => void;
    onDeleteItem?: (itemId: string) => void;
}

export default function ListTab({ roomId }: ListTabProps) {
    const [lists, setLists] = useState<any[]>([]);
    const [selectedListId, setSelectedListId] = useState<string | null>(null);
    const [items, setItems] = useState<any[]>([]);
    const [newItem, setNewItem] = useState('');
    const [newListName, setNewListName] = useState('');
    const [showNewList, setShowNewList] = useState(false);
    const [showListMenu, setShowListMenu] = useState(false);
    const [creatingList, setCreatingList] = useState(false);
    const [addingItem, setAddingItem] = useState(false);
    const [editingListName, setEditingListName] = useState(false);
    const [editName, setEditName] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close menu on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowListMenu(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Load all lists
    useEffect(() => {
        if (!roomId) return;
        const q = collection(db, 'rooms', roomId, 'lists');
        const unsubscribe = onSnapshot(q, snapshot => {
            const listData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setLists(listData);
            if (!selectedListId && listData.length > 0) {
                setSelectedListId(listData[0].id);
            }
        });
        return () => unsubscribe();
    }, [roomId]);

    // Load items for selected list
    useEffect(() => {
        if (!roomId || !selectedListId) return;
        const q = query(
            collection(db, 'rooms', roomId, 'lists', selectedListId, 'items'),
            orderBy('createdAt')
        );
        const unsubscribe = onSnapshot(q, snapshot => {
            setItems(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsubscribe();
    }, [roomId, selectedListId]);

    const selectedList = lists.find(l => l.id === selectedListId);
    const completedCount = items.filter(i => i.completed).length;

    const handleAddItem = async () => {
        if (!newItem.trim() || !roomId || !selectedListId) return;
        setAddingItem(true);
        try {
            await addDoc(collection(db, 'rooms', roomId, 'lists', selectedListId, 'items'), {
                content: newItem.trim(),
                completed: false,
                createdAt: serverTimestamp(),
            });
            setNewItem('');
            inputRef.current?.focus();
        } catch (e) {
            console.error('Failed to add item:', e);
        } finally {
            setAddingItem(false);
        }
    };

    const handleToggleItem = async (item: any) => {
        if (!roomId || !selectedListId) return;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', item.id), {
            completed: !item.completed,
        });
    };

    const handleDeleteItem = async (itemId: string) => {
        if (!roomId || !selectedListId) return;
        await deleteDoc(doc(db, 'rooms', roomId, 'lists', selectedListId, 'items', itemId));
    };

    const handleAddList = async () => {
        if (!newListName.trim() || !roomId) return;
        setCreatingList(true);
        try {
            const docRef = await addDoc(collection(db, 'rooms', roomId, 'lists'), {
                name: newListName.trim(),
                createdAt: serverTimestamp(),
            });
            setSelectedListId(docRef.id);
            setNewListName('');
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
            const itemsSnapshot = await getDocs(
                collection(db, 'rooms', roomId, 'lists', selectedListId, 'items')
            );
            await Promise.all(
                itemsSnapshot.docs.map(d =>
                    deleteDoc(doc(db, 'rooms', roomId!, 'lists', selectedListId!, 'items', d.id))
                )
            );
            await deleteDoc(doc(db, 'rooms', roomId, 'lists', selectedListId));
            setSelectedListId(null);
        } catch (e) {
            console.error('Failed to delete list:', e);
        }
    };

    const handleRenameList = async () => {
        if (!roomId || !selectedListId || !editName.trim()) return;
        await updateDoc(doc(db, 'rooms', roomId, 'lists', selectedListId), {
            name: editName.trim(),
        });
        setEditingListName(false);
        setShowListMenu(false);
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* List Selector Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    {lists.length > 0 ? (
                        editingListName ? (
                            <div className="flex items-center gap-2 flex-1">
                                <input
                                    type="text"
                                    value={editName}
                                    onChange={e => setEditName(e.target.value)}
                                    className="flex-1 px-3 py-1.5 border border-kin-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500"
                                    autoFocus
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') handleRenameList();
                                        if (e.key === 'Escape') setEditingListName(false);
                                    }}
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
                                            {list.name}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown size={16} className="text-warmgray-400 pointer-events-none absolute right-0 top-1/2 -translate-y-1/2" />
                            </div>
                        )
                    ) : (
                        <h3 className="text-lg font-bold text-warmgray-800">Lists</h3>
                    )}
                </div>

                <div className="flex items-center gap-1.5">
                    {/* List menu */}
                    {selectedListId && (
                        <div className="relative" ref={menuRef}>
                            <button
                                onClick={() => setShowListMenu(!showListMenu)}
                                className="p-2 text-warmgray-400 hover:text-warmgray-600 hover:bg-warmgray-100 rounded-lg transition-colors"
                            >
                                <MoreHorizontal size={18} />
                            </button>
                            {showListMenu && (
                                <div className="absolute right-0 top-full mt-1 w-44 bg-white border border-warmgray-200 rounded-xl shadow-lg py-1 z-20">
                                    <button
                                        onClick={() => {
                                            setEditName(selectedList?.name || '');
                                            setEditingListName(true);
                                            setShowListMenu(false);
                                        }}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-warmgray-700 hover:bg-warmgray-50"
                                    >
                                        <Pencil size={14} /> Rename List
                                    </button>
                                    <button
                                        onClick={handleDeleteList}
                                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 size={14} /> Delete List
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* New list button */}
                    <button
                        onClick={() => setShowNewList(!showNewList)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-sm shadow-kin-200/40"
                    >
                        <Plus size={14} />
                        <span className="hidden sm:inline">New List</span>
                    </button>
                </div>
            </div>

            {/* New List Form */}
            {showNewList && (
                <div className="mb-4 p-3 bg-kin-50 border border-kin-200 rounded-xl">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="List name..."
                            className="flex-1 px-3 py-2 bg-white border border-kin-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                            value={newListName}
                            onChange={e => setNewListName(e.target.value)}
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleAddList(); }}
                        />
                        <button
                            onClick={handleAddList}
                            disabled={!newListName.trim() || creatingList}
                            className="px-4 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
                        >
                            {creatingList ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                            Create
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
                        <span className="text-xs font-medium text-warmgray-500">
                            {items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0}%
                        </span>
                    </div>
                    <div className="h-1.5 bg-warmgray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-kin-500 rounded-full transition-all duration-500"
                            style={{ width: `${items.length > 0 ? (completedCount / items.length) * 100 : 0}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Items */}
            {!selectedListId ? (
                <div className="text-center py-16">
                    <div className="w-14 h-14 bg-kin-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <ListTodo size={28} className="text-kin-300" />
                    </div>
                    <h3 className="text-base font-semibold text-warmgray-800 mb-1">No lists yet</h3>
                    <p className="text-sm text-warmgray-400 mb-4">Create a list to start organizing tasks</p>
                    <button
                        onClick={() => setShowNewList(true)}
                        className="px-5 py-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 transition-all"
                    >
                        Create Your First List
                    </button>
                </div>
            ) : (
                <>
                    <div className="space-y-1 mb-4">
                        {items.length === 0 && (
                            <div className="text-center py-10">
                                <Circle size={32} className="mx-auto mb-2 text-warmgray-200" />
                                <p className="text-sm text-warmgray-400">This list is empty. Add an item below.</p>
                            </div>
                        )}
                        {items.map(item => (
                            <div
                                key={item.id}
                                className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                                    item.completed ? 'bg-warmgray-50' : 'bg-white border border-warmgray-100 hover:border-warmgray-200 shadow-sm'
                                }`}
                            >
                                <button
                                    onClick={() => handleToggleItem(item)}
                                    className="flex-shrink-0 transition-colors"
                                >
                                    {item.completed ? (
                                        <CheckCircle2 size={20} className="text-sage-400" />
                                    ) : (
                                        <Circle size={20} className="text-warmgray-300 hover:text-kin-400" />
                                    )}
                                </button>
                                <span className={`flex-1 text-sm ${
                                    item.completed ? 'line-through text-warmgray-400' : 'text-warmgray-800'
                                }`}>
                                    {item.content}
                                </span>
                                <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1 text-warmgray-300 hover:text-kin-600 rounded transition-all"
                                >
                                    <Trash2 size={14} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Add Item */}
                    <div className="flex gap-2">
                        <div className="flex-1 relative">
                            <input
                                ref={inputRef}
                                type="text"
                                placeholder="Add a new item..."
                                className="w-full px-4 py-3 bg-white border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                                value={newItem}
                                onChange={(e) => setNewItem(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleAddItem();
                                    }
                                }}
                            />
                        </div>
                        <button
                            onClick={handleAddItem}
                            disabled={!newItem.trim() || addingItem}
                            className="px-4 py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5"
                        >
                            {addingItem ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                            <span className="hidden sm:inline">Add</span>
                        </button>
                    </div>
                </>
            )}
        </div>
    );
}
