// pages/dashboard.tsx — Warm sunset themed dashboard
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, query, where, getDocs, addDoc, serverTimestamp, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import MobileRoomList from '../components/MobileRoomList';
import { Plus, LogOut, Users, Link2, ChevronRight, X, Loader2 } from 'lucide-react';
import { nanoid } from 'nanoid';

export default function RoomsPage() {
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

    const fetchUserRooms = async (userId: string) => {
        const q = query(collection(db, 'rooms'), where('memberIds', 'array-contains', userId));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                setUser(currentUser);
                setRooms(await fetchUserRooms(currentUser.uid));
                setLoading(false);
            } else { router.push('/'); }
        });
        return () => unsubscribe();
    }, []);

    const handleLogout = async () => { await signOut(auth); router.push('/'); };

    const handleCreate = async () => {
        const u = auth.currentUser;
        if (!u || !roomName.trim()) return;
        setError(''); setSubmitting(true);
        try {
            const inviteCode = nanoid(6).toUpperCase();
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName.trim(), createdAt: serverTimestamp(), createdBy: u.uid, memberIds: [u.uid], inviteCode,
            });
            setRoomName(''); setShowCreate(false);
            router.push(`/room/${roomRef.id}`);
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
            setJoinCode(''); setShowJoin(false);
            router.push(`/room/${roomDoc.id}`);
        } catch { setError('Failed to join room'); }
        finally { setSubmitting(false); }
    };

    const getRoomColor = (name: string) => {
        const colors = [
            'bg-kin-500', 'bg-sage-400', 'bg-sand-400', 'bg-amber-500',
            'bg-rose-400', 'bg-violet-400', 'bg-cyan-500', 'bg-pink-400',
        ];
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
        <div className="min-h-screen bg-sand-50">
            <div className="md:hidden"><MobileRoomList /></div>

            <div className="hidden md:block">
                {/* Header */}
                <div className="bg-white border-b border-warmgray-200 sticky top-0 z-10">
                    <div className="max-w-5xl mx-auto px-6 py-3.5 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="w-9 h-9 bg-gradient-to-br from-kin-500 to-kin-600 rounded-xl flex items-center justify-center shadow-sm shadow-kin-200/50">
                                <svg viewBox="0 0 24 24" className="w-[18px] h-[18px] text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                                </svg>
                            </div>
                            <h1 className="text-xl font-bold text-warmgray-800">KinLoop</h1>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 bg-kin-100 rounded-full flex items-center justify-center">
                                    <span className="text-xs font-bold text-kin-600">{(user?.displayName || user?.email || 'U')[0].toUpperCase()}</span>
                                </div>
                                <span className="text-sm text-warmgray-500">{user?.displayName || user?.email?.split('@')[0]}</span>
                            </div>
                            <button onClick={handleLogout} className="p-2 text-warmgray-400 hover:text-kin-600 hover:bg-kin-50 rounded-lg transition-colors" title="Sign out">
                                <LogOut size={16} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="max-w-5xl mx-auto px-6 py-8">
                    <div className="flex items-center justify-between mb-6">
                        <h2 className="text-2xl font-bold text-warmgray-800">Your Rooms</h2>
                        <div className="flex gap-2">
                            <button onClick={() => { setShowJoin(true); setShowCreate(false); setError(''); }}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-white text-warmgray-700 rounded-xl text-sm font-medium hover:bg-warmgray-50 transition-colors border border-warmgray-200 shadow-sm">
                                <Link2 size={15} /> Join Room
                            </button>
                            <button onClick={() => { setShowCreate(true); setShowJoin(false); setError(''); }}
                                className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-sm shadow-kin-200/40">
                                <Plus size={15} /> New Room
                            </button>
                        </div>
                    </div>

                    {/* Inline Create/Join Forms */}
                    {showCreate && (
                        <div className="mb-6 p-5 bg-kin-50 border border-kin-200 rounded-2xl max-w-lg">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold text-kin-700">Create New Room</span>
                                <button onClick={() => setShowCreate(false)} className="text-kin-300 hover:text-kin-500"><X size={16} /></button>
                            </div>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Enter room name..."
                                    className="flex-1 px-3 py-2.5 bg-white border border-kin-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                                    value={roomName} onChange={e => setRoomName(e.target.value)} autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleCreate(); }} />
                                <button onClick={handleCreate} disabled={!roomName.trim() || submitting}
                                    className="px-5 py-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center gap-1.5">
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
                                </button>
                            </div>
                            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                        </div>
                    )}
                    {showJoin && (
                        <div className="mb-6 p-5 bg-warmgray-50 border border-warmgray-200 rounded-2xl max-w-lg">
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-sm font-semibold text-warmgray-700">Join with Invite Code</span>
                                <button onClick={() => setShowJoin(false)} className="text-warmgray-400 hover:text-warmgray-600"><X size={16} /></button>
                            </div>
                            <div className="flex gap-2">
                                <input type="text" placeholder="Enter invite code..."
                                    className="flex-1 px-3 py-2.5 bg-white border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400 uppercase tracking-wider font-mono"
                                    value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} autoFocus
                                    onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }} />
                                <button onClick={handleJoin} disabled={!joinCode.trim() || submitting}
                                    className="px-5 py-2.5 bg-warmgray-800 text-white rounded-xl text-sm font-medium hover:bg-warmgray-900 disabled:opacity-50 transition-colors flex items-center gap-1.5">
                                    {submitting ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Join
                                </button>
                            </div>
                            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                        </div>
                    )}

                    {rooms.length === 0 ? (
                        <div className="text-center py-20">
                            <div className="w-16 h-16 bg-kin-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                                <Users size={32} className="text-kin-300" />
                            </div>
                            <h3 className="text-lg font-semibold text-warmgray-800 mb-1">No rooms yet</h3>
                            <p className="text-sm text-warmgray-500 mb-6">Create a room to start collaborating with your family</p>
                            <button onClick={() => { setShowCreate(true); setError(''); }}
                                className="px-6 py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-md shadow-kin-200/40">
                                Create Your First Room
                            </button>
                        </div>
                    ) : (
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                            {rooms.map((room: any) => (
                                <button key={room.id}
                                    className="bg-white p-5 rounded-2xl border border-warmgray-100 shadow-sm hover:shadow-md hover:border-kin-200 cursor-pointer transition-all group text-left"
                                    onClick={() => router.push(`/room/${room.id}`)}>
                                    <div className="flex items-start justify-between mb-3">
                                        <div className={`w-11 h-11 ${getRoomColor(room.name || '')} rounded-xl flex items-center justify-center transition-all`}>
                                            <span className="text-lg font-bold text-white">{room.name?.[0]?.toUpperCase() || 'R'}</span>
                                        </div>
                                        <ChevronRight size={16} className="text-warmgray-300 mt-1 group-hover:text-kin-400 transition-colors" />
                                    </div>
                                    <h2 className="text-base font-semibold text-warmgray-800 mb-0.5 truncate">{room.name}</h2>
                                    <p className="text-sm text-warmgray-400">{room.memberIds?.length || 0} member{room.memberIds?.length !== 1 ? 's' : ''}</p>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
