// pages/room/[roomId]/doc/[docId].tsx — Document Editor Page
import { useRouter } from 'next/router';
import { useEffect, useRef, useState } from 'react';
import { doc, getDoc, getDocs, collection } from 'firebase/firestore';
import { db, auth } from '../../../../lib/firebase';
import DocTab from '../../../../components/DocTab';
import { fetchDocContent, saveDoc, updateDocTitle } from '../../../../lib/firestoreUtils';
import { useIsMobileDevice } from '../../../../utils/isMobileDevice';
import { ArrowLeft } from 'lucide-react';

export default function DocEditorPage() {
    const router = useRouter();
    const { roomId, docId } = router.query;

    const [room, setRoom] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [initialContent, setInitialContent] = useState<string | null>(null);
    const [docTitle, setDocTitle] = useState('Untitled Document');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const isMobile = useIsMobileDevice();

    // Ref that always holds the latest editor HTML — updated by DocTab on every keystroke
    const latestHtmlRef = useRef('');

    // Called by DocTab on every editor update to keep ref in sync
    const handleContentChange = (html: string) => {
        latestHtmlRef.current = html;
    };

    useEffect(() => {
        if (!roomId || !docId) return;

        const fetchRoom = async () => {
            try {
                const docRef = doc(db, 'rooms', roomId as string);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    const roomData = docSnap.data();
                    setRoom(roomData);

                    if (roomData.memberIds?.length) {
                        const usersSnapshot = await getDocs(collection(db, 'users'));
                        const allUsers = usersSnapshot.docs.map(d => ({ uid: d.id, ...d.data() }));
                        const filtered = allUsers.filter(u => roomData.memberIds.includes(u.uid));
                        setMembers(filtered);
                    }
                }
            } catch (err) {
                console.error('Failed to fetch room:', err);
            }
        };

        fetchRoom();
    }, [roomId]);

    // One-time fetch — no subscription, no feedback loop
    useEffect(() => {
        if (!roomId || !docId) return;

        const load = async () => {
            try {
                const content = await fetchDocContent(roomId as string, docId as string);
                setInitialContent(content);
                latestHtmlRef.current = content;

                const docRef = doc(db, 'rooms', roomId as string, 'documents', docId as string);
                const snapshot = await getDoc(docRef);
                const data = snapshot.data();
                if (data?.title) setDocTitle(data.title);
            } catch (err) {
                console.error('Failed to load document:', err);
                setInitialContent('');
            }
            setLoading(false);
        };

        load();
    }, [roomId, docId]);

    // Save function — returns a promise so callers can await it
    const handleSave = async (html: string) => {
        if (typeof roomId === 'string' && typeof docId === 'string') {
            const uid = auth.currentUser?.uid || '';
            await saveDoc(roomId, docId, html, uid);
        }
    };

    const handleSaveAndExit = async () => {
        setSaving(true);
        await handleSave(latestHtmlRef.current);
        router.push(`/room/${roomId}`);
    };

    const handleTitleChange = (newTitle: string) => {
        setDocTitle(newTitle);
    };

    const handleTitleSave = () => {
        if (typeof roomId === 'string' && typeof docId === 'string') {
            updateDocTitle(roomId, docId, docTitle.trim() || 'Untitled Document');
        }
    };

    if (loading || initialContent === null) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin h-8 w-8 border-2 border-blue-600 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (isMobile) {
        return (
            <DocTab
                content={initialContent}
                setContent={handleContentChange}
                saveContent={handleSave}
                docId={docId as string}
                roomId={roomId as string}
                currentUser={auth.currentUser}
            />
        );
    }

    return (
        <div className="min-h-screen bg-white flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-4 px-5 py-3 border-b border-gray-200 bg-white sticky top-0 z-10">
                <button
                    onClick={() => router.push(`/room/${roomId}`)}
                    className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
                    title="Back to room"
                >
                    <ArrowLeft size={20} className="text-gray-600" />
                </button>

                <input
                    type="text"
                    className="text-lg font-semibold text-gray-900 border-0 border-b-2 border-transparent focus:border-blue-500 focus:outline-none bg-transparent flex-1 max-w-lg transition-colors"
                    value={docTitle}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    onBlur={handleTitleSave}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleTitleSave(); (e.target as HTMLInputElement).blur(); } }}
                    placeholder="Untitled Document"
                />

                <button
                    onClick={handleSaveAndExit}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors flex-shrink-0 disabled:opacity-70"
                >
                    {saving ? 'Saving...' : 'Save & Exit'}
                </button>
            </div>

            {/* Editor */}
            <div className="flex-1 flex min-h-0">
                <DocTab
                    content={initialContent}
                    setContent={handleContentChange}
                    saveContent={handleSave}
                    docId={docId as string}
                    roomId={roomId as string}
                    currentUser={auth.currentUser}
                />
            </div>
        </div>
    );
}
