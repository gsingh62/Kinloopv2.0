// pages/share.tsx — PWA Share Target handler
// Receives shared text/URLs from other apps and routes to AI assistant
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../lib/firebase';
import { Sparkles, Loader2, ChevronRight } from 'lucide-react';

export default function ShareTarget() {
    const router = useRouter();
    const [rooms, setRooms] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [sharedContent, setSharedContent] = useState('');

    useEffect(() => {
        if (!router.isReady) return;
        const { title, text, url } = router.query;
        const parts: string[] = [];
        if (title && typeof title === 'string') parts.push(title);
        if (text && typeof text === 'string') parts.push(text);
        if (url && typeof url === 'string') parts.push(url);
        setSharedContent(parts.join('\n'));
    }, [router.isReady, router.query]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) { router.push('/'); return; }
            const q = query(collection(db, 'rooms'), where('memberIds', 'array-contains', user.uid));
            const snapshot = await getDocs(q);
            const userRooms = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setRooms(userRooms);
            // Auto-navigate if only one room
            if (userRooms.length === 1 && sharedContent) {
                router.replace(`/room/${userRooms[0].id}?tab=ai&prompt=${encodeURIComponent(sharedContent)}`);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [sharedContent]);

    const handleSelectRoom = (roomId: string) => {
        router.push(`/room/${roomId}?tab=ai&prompt=${encodeURIComponent(sharedContent)}`);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-sand-50">
                <Loader2 size={32} className="animate-spin text-kin-500" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-sand-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-lg border border-warmgray-100 overflow-hidden">
                <div className="bg-gradient-to-r from-violet-50 to-kin-50 px-5 py-4 border-b border-warmgray-100">
                    <div className="flex items-center gap-2 mb-2">
                        <Sparkles size={18} className="text-violet-500" />
                        <h1 className="text-lg font-bold text-warmgray-800">Share to KinLoop</h1>
                    </div>
                    {sharedContent && (
                        <div className="p-3 bg-white/60 rounded-xl text-sm text-warmgray-600 max-h-32 overflow-y-auto">
                            {sharedContent}
                        </div>
                    )}
                </div>

                <div className="p-4">
                    <p className="text-sm text-warmgray-500 mb-3">Choose a room to send this to:</p>
                    <div className="space-y-2">
                        {rooms.map((room: any) => (
                            <button
                                key={room.id}
                                onClick={() => handleSelectRoom(room.id)}
                                className="w-full flex items-center justify-between p-3.5 bg-warmgray-50 hover:bg-kin-50 border border-warmgray-200 hover:border-kin-200 rounded-xl transition-all group"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-gradient-to-br from-kin-400 to-kin-600 rounded-xl flex items-center justify-center">
                                        <span className="text-sm font-bold text-white">{room.name?.[0]?.toUpperCase()}</span>
                                    </div>
                                    <div className="text-left">
                                        <p className="text-sm font-semibold text-warmgray-800">{room.name}</p>
                                        <p className="text-xs text-warmgray-400">{room.memberIds?.length || 0} members</p>
                                    </div>
                                </div>
                                <ChevronRight size={16} className="text-warmgray-300 group-hover:text-kin-400" />
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
