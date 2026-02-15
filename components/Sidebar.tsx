// components/Sidebar.tsx — Warm sunset themed sidebar
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../lib/firebase';
import {
    collection, addDoc, getDocs, query, where, updateDoc, doc, arrayUnion, serverTimestamp,
} from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { signOut } from 'firebase/auth';
import { Plus, Link2, LogOut, Search, Users, ChevronRight, X, Loader2 } from 'lucide-react';

export default function Sidebar({ currentRoomId }: { currentRoomId?: string }) {
    const [rooms, setRooms] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [showCreate, setShowCreate] = useState(false);
    const [showJoin, setShowJoin] = useState(false);
    const [roomName, setRoomName] = useState('');
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const router = useRouter();
    const user = auth.currentUser;

    const fetchRooms = async () => {
        if (!user) return;
        const q = query(collection(db, 'rooms'), where('memberIds', 'array-contains', user.uid));
        const snapshot = await getDocs(q);
        setRooms(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    };

    useEffect(() => { fetchRooms(); }, []);

    const filteredRooms = rooms.filter(r =>
        r.name?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleCreate = async () => {
        if (!user || !roomName.trim()) return;
        setError(''); setLoading(true);
        try {
            const inviteCode = nanoid(6).toUpperCase();
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName.trim(), createdAt: serverTimestamp(), memberIds: [user.uid], inviteCode,
            });
            setRoomName(''); setShowCreate(false);
            await fetchRooms();
            router.push(`/room/${roomRef.id}`);
        } catch { setError('Failed to create room'); }
        finally { setLoading(false); }
    };

    const handleJoin = async () => {
        if (!user || !code.trim()) return;
        setError(''); setLoading(true);
        try {
            const q = query(collection(db, 'rooms'), where('inviteCode', '==', code.trim().toUpperCase()));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { setError('No room found with that code'); setLoading(false); return; }
            const roomDoc = snapshot.docs[0];
            await updateDoc(doc(db, 'rooms', roomDoc.id), { memberIds: arrayUnion(user.uid) });
            setCode(''); setShowJoin(false);
            await fetchRooms();
            router.push(`/room/${roomDoc.id}`);
        } catch { setError('Failed to join room'); }
        finally { setLoading(false); }
    };

    const handleLogout = async () => { await signOut(auth); router.push('/'); };

    const getRoomColor = (name: string) => {
        const colors = [
            'bg-kin-500', 'bg-sage-400', 'bg-sand-400', 'bg-amber-500',
            'bg-rose-400', 'bg-violet-400', 'bg-cyan-500', 'bg-pink-400',
        ];
        const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    return (
        <aside className="w-64 bg-white border-r border-warmgray-200 flex flex-col h-screen">
            {/* Header */}
            <div className="px-4 py-4 border-b border-warmgray-100">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-gradient-to-br from-kin-500 to-kin-600 rounded-lg flex items-center justify-center shadow-sm shadow-kin-200/50">
                        <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </div>
                    <span className="text-lg font-bold text-warmgray-800">KinLoop</span>
                </div>
            </div>

            {/* Search */}
            <div className="px-3 pt-3 pb-1">
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgray-400" />
                    <input
                        type="text"
                        placeholder="Search rooms..."
                        className="w-full pl-8 pr-3 py-2 bg-warmgray-50 border border-warmgray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                </div>
            </div>

            {/* Action Buttons */}
            <div className="px-3 py-2 flex gap-2">
                <button
                    onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-sm shadow-kin-200/40"
                >
                    <Plus size={14} /> <span>New Room</span>
                </button>
                <button
                    onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-warmgray-100 text-warmgray-700 rounded-lg text-xs font-medium hover:bg-warmgray-200 transition-colors"
                >
                    <Link2 size={14} /> <span>Join</span>
                </button>
            </div>

            {/* Create Room Inline Form */}
            {showCreate && (
                <div className="mx-3 mb-2 p-3 bg-kin-50 border border-kin-200 rounded-xl animate-scale-in">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-kin-700">New Room</span>
                        <button onClick={() => setShowCreate(false)} className="text-kin-300 hover:text-kin-500"><X size={14} /></button>
                    </div>
                    <input
                        type="text" placeholder="Room name"
                        className="w-full px-3 py-2 bg-white border border-kin-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                        value={roomName} onChange={e => setRoomName(e.target.value)} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }}
                    />
                    {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
                    <button onClick={handleCreate} disabled={!roomName.trim() || loading}
                        className="w-full mt-2 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                        {loading ? 'Creating...' : 'Create Room'}
                    </button>
                </div>
            )}

            {/* Join Room Inline Form */}
            {showJoin && (
                <div className="mx-3 mb-2 p-3 bg-warmgray-50 border border-warmgray-200 rounded-xl animate-scale-in">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-warmgray-700">Join with Code</span>
                        <button onClick={() => setShowJoin(false)} className="text-warmgray-400 hover:text-warmgray-600"><X size={14} /></button>
                    </div>
                    <input
                        type="text" placeholder="Enter invite code"
                        className="w-full px-3 py-2 bg-white border border-warmgray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400 uppercase tracking-wider font-mono"
                        value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }}
                    />
                    {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
                    <button onClick={handleJoin} disabled={!code.trim() || loading}
                        className="w-full mt-2 py-2 bg-warmgray-800 text-white rounded-lg text-xs font-medium hover:bg-warmgray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
                        {loading ? 'Joining...' : 'Join Room'}
                    </button>
                </div>
            )}

            {/* Room List */}
            <div className="flex-1 overflow-y-auto px-3 py-1">
                <p className="text-[10px] font-semibold text-warmgray-400 uppercase tracking-wider px-2 mb-1.5">
                    Rooms ({filteredRooms.length})
                </p>
                {filteredRooms.length === 0 ? (
                    <div className="text-center py-8 px-4">
                        <Users size={24} className="mx-auto mb-2 text-warmgray-300" />
                        <p className="text-xs text-warmgray-400">
                            {searchQuery ? 'No rooms match your search' : 'No rooms yet — create or join one'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-0.5">
                        {filteredRooms.map(room => {
                            const isActive = currentRoomId === room.id;
                            return (
                                <button key={room.id} onClick={() => router.push(`/room/${room.id}`)}
                                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group ${
                                        isActive
                                            ? 'bg-kin-50 border border-kin-200'
                                            : 'hover:bg-warmgray-50 border border-transparent'
                                    }`}>
                                    <div className={`w-9 h-9 ${isActive ? 'bg-kin-500' : getRoomColor(room.name || '')} rounded-lg flex items-center justify-center flex-shrink-0 transition-colors`}>
                                        <span className="text-sm font-bold text-white">{room.name?.[0]?.toUpperCase() || 'R'}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm font-medium truncate ${isActive ? 'text-kin-700' : 'text-warmgray-800'}`}>{room.name}</p>
                                        <p className="text-[11px] text-warmgray-400">{room.memberIds?.length || 0} member{room.memberIds?.length !== 1 ? 's' : ''}</p>
                                    </div>
                                    <ChevronRight size={14} className={`flex-shrink-0 transition-colors ${isActive ? 'text-kin-400' : 'text-warmgray-300 group-hover:text-warmgray-400'}`} />
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* User Footer */}
            <div className="px-3 py-3 border-t border-warmgray-100 bg-warmgray-50/50">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 bg-kin-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-kin-600">{(user?.displayName || user?.email || 'U')[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-warmgray-800 truncate">{user?.displayName || user?.email?.split('@')[0]}</p>
                        <p className="text-[10px] text-warmgray-400 truncate">{user?.email}</p>
                    </div>
                    <button onClick={handleLogout} className="p-1.5 text-warmgray-400 hover:text-kin-600 hover:bg-kin-50 rounded-lg transition-colors" title="Sign out">
                        <LogOut size={14} />
                    </button>
                </div>
            </div>
        </aside>
    );
}
