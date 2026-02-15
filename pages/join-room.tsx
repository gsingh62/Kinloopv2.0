// pages/join-room.tsx — Warm sunset themed
import { useState } from 'react';
import { useRouter } from 'next/router';
import { db, auth } from '../lib/firebase';
import { collection, getDocs, query, where, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { ArrowLeft, Link2, Loader2 } from 'lucide-react';

export default function JoinRoom() {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const router = useRouter();

    const handleJoin = async () => {
        if (!code.trim()) return;
        setError(''); setLoading(true);
        try {
            const user = auth.currentUser;
            if (!user) { setError('Please log in first.'); setLoading(false); return; }
            const q = query(collection(db, 'rooms'), where('inviteCode', '==', code.trim().toUpperCase()));
            const snapshot = await getDocs(q);
            if (snapshot.empty) { setError('No room found with that invite code. Please double-check and try again.'); setLoading(false); return; }
            const roomDoc = snapshot.docs[0];
            const memberIds = roomDoc.data().memberIds || [];
            if (!memberIds.includes(user.uid)) {
                await updateDoc(doc(db, 'rooms', roomDoc.id), { memberIds: arrayUnion(user.uid) });
            }
            router.push(`/room/${roomDoc.id}`);
        } catch { setError('Something went wrong. Please try again.'); }
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
                        <h2 className="text-lg font-bold text-warmgray-800">Join a Room</h2>
                    </div>
                </div>
                <p className="text-sm text-warmgray-500 mb-5">Enter the invite code shared by your family member to join their room.</p>
                <label className="block text-xs font-semibold text-warmgray-500 uppercase tracking-wider mb-1.5">Invite Code</label>
                <input type="text" placeholder="e.g. AB3XK9"
                    className="w-full border border-warmgray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 mb-4 transition-all uppercase tracking-widest font-mono text-center text-lg"
                    value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleJoin(); }} />
                {error && <p className="text-sm text-red-500 bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}
                <button onClick={handleJoin} disabled={!code.trim() || loading}
                    className="w-full py-3 bg-warmgray-800 text-white rounded-xl text-sm font-medium hover:bg-warmgray-900 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />}
                    {loading ? 'Joining...' : 'Join Room'}
                </button>
            </div>
        </div>
    );
}
