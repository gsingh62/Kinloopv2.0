// components/MobileRoomList.tsx — Warm sunset themed mobile room list
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, query, where, getDocs, orderBy, limit, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { Plus, Link2, LogOut, ChevronRight, Users, X, Loader2 } from 'lucide-react';
import { nanoid } from 'nanoid';

export default function MobileRoomList() {
    const router = useRouter();
    const [rooms, setRooms] = useState<any[]>([]);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showJoin, setShowJoin] = useState(false);
    const [roomName, setRoomName] = useState('');
    const [joinCode, setJoinCode] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const fetchRooms = async (uid: string) => {
        const q = query(collection(db, 'rooms'), where('memberIds', 'array-contains', uid));
        const snapshot = await getDocs(q);
        const roomsData = await Promise.all(
            snapshot.docs.map(async (d) => {
                const data = d.data();
                const messagesQuery = query(collection(db, 'rooms', d.id, 'messages'), orderBy('createdAt', 'desc'), limit(1));
                const messageSnapshot = await getDocs(messagesQuery);
                const lastMessage = messageSnapshot.docs[0]?.data();
                return {
                    id: d.id, name: data.name,
                    memberCount: data.memberIds?.length || 0,
                    lastMessage: lastMessage?.text || '',
                    timestamp: lastMessage?.createdAt?.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || '',
                };
            })
        );
        setRooms(roomsData);
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) { setUser(currentUser); await fetchRooms(currentUser.uid); setLoading(false); }
            else { router.push('/'); }
        });
        return () => unsubscribe();
    }, []);

    const handleCreate = async () => {
        const u = auth.currentUser;
        if (!u || !roomName.trim()) return;
        setError(''); setSubmitting(true);
        try {
            const inviteCode = nanoid(6).toUpperCase();
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName.trim(), createdAt: serverTimestamp(), memberIds: [u.uid], inviteCode,
            });
            setRoomName(''); setShowCreate(false); router.push(`/room/${roomRef.id}`);
        } catch { setError('Failed to create room'); }
        finally { setSubmitting(false); }
    };

    const handleJoin = async () => {
        const u = auth.currentUser;
        if (!u || !joinCode.trim()) return;
        setError(''); setSubmitting(true);
        try {
            const q = query(collection(db, 'rooms'), where('inviteCode', '==', joinCode.trim().toUpperCase()));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { setError('No room found with that code'); setSubmitting(false); return; }
            const roomDoc = snapshot.docs[0];
            await updateDoc(doc(db, 'rooms', roomDoc.id), { memberIds: arrayUnion(u.uid) });
            setJoinCode(''); setShowJoin(false); router.push(`/room/${roomDoc.id}`);
        } catch { setError('Failed to join room'); }
        finally { setSubmitting(false); }
    };

    const handleLogout = async () => { await signOut(auth); router.push('/'); };

    const getRoomColor = (name: string) => {
        const colors = ['bg-kin-500', 'bg-sage-400', 'bg-sand-400', 'bg-amber-500', 'bg-rose-400', 'bg-violet-400', 'bg-cyan-500', 'bg-pink-400'];
        const hash = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-sand-50">
                <div className="animate-spin h-8 w-8 border-2 border-kin-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sand-50 ios-safe-top">
            <div className="px-4 py-3 bg-white/90 backdrop-blur-lg border-b border-warmgray-100 sticky top-0 z-40">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-kin-500 to-kin-600 rounded-lg flex items-center justify-center shadow-sm">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                        </div>
                        <span className="text-lg font-bold text-warmgray-800">KinLoop</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <span className="text-xs text-warmgray-400 mr-1 hidden min-[380px]:inline">{user?.displayName || user?.email?.split('@')[0]}</span>
                        <button onClick={handleLogout} className="p-2 text-warmgray-400 hover:text-kin-600 hover:bg-kin-50 rounded-lg transition-colors" title="Sign out">
                            <LogOut size={16} />
                        </button>
                    </div>
                </div>
            </div>

            <div className="px-4 py-4">
                <div className="flex gap-2 mb-4">
                    <button onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-sm shadow-kin-200/40">
                        <Plus size={16} /> New Room
                    </button>
                    <button onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-3 bg-white text-warmgray-700 rounded-xl text-sm font-medium hover:bg-warmgray-50 transition-colors border border-warmgray-200 shadow-sm">
                        <Link2 size={16} /> Join Room
                    </button>
                </div>

                {showCreate && (
                    <div className="mb-4 p-4 bg-kin-50 border border-kin-200 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-kin-700">Create New Room</span>
                            <button onClick={() => setShowCreate(false)} className="text-kin-300 hover:text-kin-500"><X size={16} /></button>
                        </div>
                        <input type="text" placeholder="Room name"
                            className="w-full px-3 py-2.5 bg-white border border-kin-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                            value={roomName} onChange={e => setRoomName(e.target.value)} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
                        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                        <button onClick={handleCreate} disabled={!roomName.trim() || submitting}
                            className="w-full mt-3 py-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5">
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} {submitting ? 'Creating...' : 'Create Room'}
                        </button>
                    </div>
                )}

                {showJoin && (
                    <div className="mb-4 p-4 bg-warmgray-50 border border-warmgray-200 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-semibold text-warmgray-700">Join with Invite Code</span>
                            <button onClick={() => setShowJoin(false)} className="text-warmgray-400 hover:text-warmgray-600"><X size={16} /></button>
                        </div>
                        <input type="text" placeholder="Enter invite code"
                            className="w-full px-3 py-2.5 bg-white border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400 uppercase tracking-wider font-mono text-center"
                            value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} autoFocus onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }} />
                        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                        <button onClick={handleJoin} disabled={!joinCode.trim() || submitting}
                            className="w-full mt-3 py-2.5 bg-warmgray-800 text-white rounded-xl text-sm font-medium hover:bg-warmgray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                            {submitting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} {submitting ? 'Joining...' : 'Join Room'}
                        </button>
                    </div>
                )}

                <p className="text-xs font-semibold text-warmgray-400 uppercase tracking-wider mb-2">Your Rooms ({rooms.length})</p>

                {rooms.length === 0 ? (
                    <div className="text-center py-12">
                        <div className="w-16 h-16 bg-kin-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <Users size={28} className="text-kin-300" />
                        </div>
                        <h3 className="text-base font-semibold text-warmgray-800 mb-1">No rooms yet</h3>
                        <p className="text-sm text-warmgray-400">Create a room or join one with an invite code</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {rooms.map((room) => (
                            <button key={room.id} onClick={() => router.push(`/room/${room.id}`)}
                                className="w-full flex items-center gap-3 p-3.5 bg-white rounded-2xl border border-warmgray-100 shadow-sm hover:shadow-md hover:border-kin-200 transition-all text-left">
                                <div className={`w-11 h-11 ${getRoomColor(room.name || '')} rounded-xl flex items-center justify-center flex-shrink-0`}>
                                    <span className="text-base font-bold text-white">{room.name?.[0]?.toUpperCase() || 'R'}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-warmgray-800 truncate">{room.name}</p>
                                    {room.lastMessage ? (
                                        <p className="text-xs text-warmgray-400 truncate">{room.lastMessage}</p>
                                    ) : (
                                        <p className="text-xs text-warmgray-400">{room.memberCount} member{room.memberCount !== 1 ? 's' : ''}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                    {room.timestamp && <span className="text-[10px] text-warmgray-300">{room.timestamp}</span>}
                                    <ChevronRight size={14} className="text-warmgray-300" />
                                </div>
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
