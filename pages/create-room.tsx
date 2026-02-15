// pages/create-room.tsx — Warm sunset themed
import { useState } from 'react';
import { useRouter } from 'next/router';
import { auth, db } from '../lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { ArrowLeft, Plus, Loader2 } from 'lucide-react';

export default function CreateRoomPage() {
    const [roomName, setRoomName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleCreateRoom = async () => {
        if (!roomName.trim()) return;
        setError(''); setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) throw new Error('Not authenticated');
            const inviteCode = nanoid(6).toUpperCase();
            const roomRef = await addDoc(collection(db, 'rooms'), {
                name: roomName.trim(), ownerId: user.uid, inviteCode, createdAt: serverTimestamp(), memberIds: [user.uid],
            });
            router.push(`/room/${roomRef.id}`);
        } catch (err: any) { setError(err.message || 'Failed to create room'); }
        finally { setLoading(false); }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-kin-50 via-sand-50 to-kin-100 px-4">
            <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg border border-kin-100/60 p-8 w-full max-w-md">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={() => router.push('/dashboard')} className="p-1.5 rounded-lg hover:bg-warmgray-100 transition-colors">
                        <ArrowLeft size={18} className="text-warmgray-500" />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-kin-500 to-kin-600 rounded-lg flex items-center justify-center shadow-sm">
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold text-warmgray-800">Create a Room</h2>
                    </div>
                </div>
                <p className="text-sm text-warmgray-500 mb-5">Give your family room a name. You can invite members using an invite code once the room is created.</p>
                <label className="block text-xs font-semibold text-warmgray-500 uppercase tracking-wider mb-1.5">Room Name</label>
                <input type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                    placeholder="e.g. The Smiths, Family HQ"
                    className="w-full border border-warmgray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 mb-4 transition-all"
                    autoFocus onKeyDown={e => { if (e.key === 'Enter') handleCreateRoom(); }} />
                {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}
                <button onClick={handleCreateRoom} disabled={!roomName.trim() || loading}
                    className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-md shadow-kin-200/40">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                    {loading ? 'Creating...' : 'Create Room'}
                </button>
            </div>
        </div>
    );
}
