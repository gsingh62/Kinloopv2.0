// pages/room/[roomId].tsx
import { useRouter } from 'next/router';
import { useEffect, useState, useRef, useCallback } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, collection, getDocs, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../../lib/firebase';
import {
    subscribeToMessages,
    getLists,
    addListItem,
    deleteListItem,
    sendMessage,
    addEvent,
    getEvents,
    deleteEvent,
    saveDoc,
    subscribeToDoc,
    subscribeToRecipes,
    type Recipe,
} from '../../lib/firestoreUtils';
import ChatTab from '../../components/ChatTab';
import ListTab from '../../components/ListTab';
import DocTab from '../../components/DocTab';
import EventTab from '../../components/EventTab';
import PhotoTab from '../../components/PhotoTab';
import AIChatTab from '../../components/AIChatTab';
import RecipesTab from '../../components/RecipesTab';
import RoomLayout from '../../components/RoomLayout';
import { ToastContainer, useToast, sendBrowserNotification } from '../../components/Toast';
import { nanoid } from 'nanoid';
import DocsList from "../../components/DocsList";
import MobileRoomView from '../../components/MobileRoomView';
import {useIsMobileDevice} from "../../utils/isMobileDevice";
import { Calendar, CheckSquare, MessageCircle, FileText, Image, Sparkles, ChefHat } from 'lucide-react';

export default function RoomPage() {
    const router = useRouter();
    const [room, setRoom] = useState<any>(null);
    const [activeTab, setActiveTab] = useState('lists');
    const [messages, setMessages] = useState<any[]>([]);
    const [lists, setLists] = useState<any[]>([]);
    const [events, setEvents] = useState<any[]>([]);
    const [docContent, setDocContent] = useState('<p>Start writing...</p>');
    const [members, setMembers] = useState<any[]>([]);
    const [inviteCode, setInviteCode] = useState('');
    const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
    const [documents, setDocuments] = useState<any[]>([]);
    const isMobile = useIsMobileDevice();

    // ─── Notification state ───
    const { toasts, addToast, dismissToast } = useToast();
    const [tabBadges, setTabBadges] = useState<Record<string, number>>({ chat: 0, lists: 0 });
    const msgCountRef = useRef<number | null>(null);
    const activeTabRef = useRef(activeTab);
    activeTabRef.current = activeTab;

    const roomId = typeof router.query.roomId === 'string' ? router.query.roomId : null;

    // Clear badge when switching to a tab (must be before useEffects that reference it)
    const handleTabSwitch = useCallback((tabId: string) => {
        setActiveTab(tabId);
        setTabBadges(b => ({ ...b, [tabId]: 0 }));
    }, []);

    useEffect(() => {
        if (!roomId) return;
        const docsRef = collection(db, 'rooms', roomId, 'documents');
        const unsubscribe = onSnapshot(docsRef, (snapshot) => {
            const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDocuments(docs);
            if (!selectedDocId && docs.length > 0) {
                setSelectedDocId(docs[0].id);
            }
        });
        return () => unsubscribe();
    }, [roomId]);

    useEffect(() => {
        if (!router.isReady || !roomId) return;
        const fetchRoom = async () => {
            const docRef = doc(db, 'rooms', roomId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                const data = docSnap.data();
                setRoom(data);
                if (data.inviteCode) {
                    const existing = data.inviteCode;
                    const upper = existing.toUpperCase();
                    if (existing !== upper) {
                        // Auto-fix mixed-case code to uppercase
                        await updateDoc(docRef, { inviteCode: upper });
                    }
                    setInviteCode(upper);
                } else {
                    const newInviteCode = nanoid(6).toUpperCase();
                    await updateDoc(docRef, { inviteCode: newInviteCode });
                    setInviteCode(newInviteCode);
                }
                const user = auth.currentUser;
                if (user && !data.memberIds?.includes(user.uid)) {
                    await updateDoc(docRef, { memberIds: arrayUnion(user.uid) });
                }
                if (data.memberIds?.length) {
                    const usersSnapshot = await getDocs(collection(db, 'users'));
                    const allUsers = usersSnapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
                    setMembers(allUsers.filter(u => data.memberIds.includes(u.uid)));
                }
            }
        };
        fetchRoom();
    }, [router.isReady, router.query, roomId]);

    useEffect(() => {
        if (!roomId) return;
        let unsubscribe: any;
        const setup = async () => { unsubscribe = await getEvents(roomId, setEvents); };
        setup();
        return () => { if (unsubscribe) unsubscribe(); };
    }, [roomId]);

    useEffect(() => {
        if (!roomId || !selectedDocId) return;
        const unsubscribe = subscribeToDoc(roomId, selectedDocId, setDocContent);
        return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
    }, [roomId, selectedDocId]);

    useEffect(() => {
        if (!roomId) return;
        const unsubscribe = subscribeToMessages(roomId, (newMessages) => {
            setMessages(prev => {
                const currentUid = auth.currentUser?.uid;
                if (msgCountRef.current !== null && newMessages.length > msgCountRef.current) {
                    const newOnes = newMessages.slice(msgCountRef.current);
                    for (const msg of newOnes) {
                        if (msg.senderId && msg.senderId !== currentUid) {
                            const senderName = msg.senderEmail?.split('@')[0] || 'Someone';
                            const preview = msg.content?.length > 50 ? msg.content.slice(0, 50) + '...' : msg.content;

                            // Always show popup toast for messages from others
                            addToast({
                                type: 'chat',
                                title: `${senderName} sent a message`,
                                body: preview,
                                action: activeTabRef.current !== 'chat'
                                    ? { label: 'View', onClick: () => handleTabSwitch('chat') }
                                    : undefined,
                            });

                            if (activeTabRef.current !== 'chat') {
                                setTabBadges(b => ({ ...b, chat: b.chat + 1 }));
                            }
                            sendBrowserNotification(`${senderName} in KinLoop`, preview);
                        }
                    }
                }
                msgCountRef.current = newMessages.length;
                return newMessages;
            });
        });
        return () => unsubscribe();
    }, [roomId, addToast, handleTabSwitch]);

    useEffect(() => {
        if (!roomId) return;
        getLists(roomId, setLists);
    }, [roomId]);

    const handleAddEvent = async (title: string, date: string) => {
        if (typeof roomId !== 'string') return;
        await addEvent(roomId, title, date);
    };

    const handleDeleteEvent = async (eventId: string) => {
        if (typeof roomId !== 'string') return;
        await deleteEvent(roomId, eventId);
    };

    const handleAddListItem = async (text: string) => {
        if (!text.trim() || (typeof roomId !== 'string')) return;
        await addListItem(roomId, text);
    };

    const handleDeleteListItem = async (itemId: string) => {
        if (!itemId || (typeof roomId !== 'string')) return;
        await deleteListItem(roomId, itemId);
    };

    const handleSendMessage = async (content: string) => {
        if (!content.trim() || (typeof roomId !== 'string')) return;
        const user = auth.currentUser;
        if (!user) return;
        await sendMessage(roomId, content, user.uid, user.email || '');
        // Send push notification to other room members
        const senderName = user.email?.split('@')[0] || 'Someone';
        const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;
        import('../../lib/pushUtils').then(m => m.notifyRoomMembers(roomId as string, user!.uid, `${senderName} in ${room?.name || 'KinLoop'}`, preview, `/room/${roomId}`));
    };

    const handleGetInviteCode = () => {
        if (inviteCode) {
            navigator.clipboard?.writeText(inviteCode).then(() => {}).catch(() => {
                prompt('Copy this invite code:', inviteCode);
            });
        }
    };

    // Build a lightweight list summary for the AI context
    const [allLists, setAllLists] = useState<{id: string; name: string}[]>([]);
    const [recipes, setRecipes] = useState<Recipe[]>([]);
    useEffect(() => {
        if (!roomId) return;
        const unsub = onSnapshot(collection(db, 'rooms', roomId, 'lists'), (snap) => {
            setAllLists(snap.docs.map(d => ({ id: d.id, name: (d.data() as any).name || 'Untitled' })));
        });
        return () => unsub();
    }, [roomId]);

    useEffect(() => {
        if (!roomId) return;
        const unsub = subscribeToRecipes(roomId, setRecipes);
        return () => unsub();
    }, [roomId]);

    // List activity notification callback
    const handleListActivity = useCallback((activity: { type: string; detail: string }) => {
        if (activeTabRef.current !== 'lists') {
            addToast({
                type: 'list',
                title: 'List updated',
                body: activity.detail,
                action: { label: 'View', onClick: () => handleTabSwitch('lists') },
            });
            setTabBadges(b => ({ ...b, lists: b.lists + 1 }));
        }
        sendBrowserNotification('KinLoop - List updated', activity.detail);
    }, [addToast, handleTabSwitch]);

    // Navigate to AI tab with a pre-filled prompt from other tabs
    const [pendingAIPrompt, setPendingAIPrompt] = useState<string | null>(null);
    const handleAskAI = useCallback((prompt: string) => {
        setPendingAIPrompt(prompt);
        handleTabSwitch('ai');
    }, [handleTabSwitch]);

    const renderTabContent = () => {
        switch (activeTab) {
            case 'lists':
                return <ListTab roomId={roomId} roomName={room?.name} onAddItem={handleAddListItem} onDeleteItem={handleDeleteListItem} onActivity={handleListActivity} />;
            case 'chat':
                return <ChatTab messages={messages} onSend={handleSendMessage} />;
            case 'ai':
                return roomId ? <AIChatTab roomId={roomId} roomName={room?.name || ''} lists={allLists} events={events} documents={documents} recipes={recipes} /> : null;
            case 'recipes':
                return roomId ? <RecipesTab roomId={roomId} recipes={recipes} onAskAI={handleAskAI} /> : null;
            case 'events':
                return roomId ? <EventTab roomId={roomId} members={members} /> : null;
            case 'docs':
                return roomId ? <DocsList roomId={roomId} /> : null;
            case 'photos':
                return roomId ? <PhotoTab roomId={roomId} /> : null;
            default:
                return null;
        }
    };

    if (!room) return (
        <div className="min-h-screen flex items-center justify-center bg-sand-50">
            <div className="animate-spin h-8 w-8 border-2 border-kin-500 border-t-transparent rounded-full" />
        </div>
    );

    const tabs = [
        { id: 'lists', label: 'Lists', icon: CheckSquare },
        { id: 'events', label: 'Calendar', icon: Calendar },
        { id: 'chat', label: 'Chat', icon: MessageCircle },
        { id: 'ai', label: 'AI', icon: Sparkles },
        { id: 'recipes', label: 'Recipes', icon: ChefHat },
        { id: 'docs', label: 'Docs', icon: FileText },
        { id: 'photos', label: 'Photos', icon: Image },
    ];

    // ─── Desktop: segmented control at top ───
    const desktopTabBar = (
        <div className="flex bg-warmgray-100 rounded-xl p-1 mb-6">
            {tabs.map(tab => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const badge = tabBadges[tab.id] || 0;
                return (
                    <button
                        key={tab.id}
                        onClick={() => handleTabSwitch(tab.id)}
                        className={`relative flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                            isActive
                                ? 'bg-white text-kin-600 shadow-sm'
                                : 'text-warmgray-500 hover:text-warmgray-700'
                        }`}
                    >
                        <Icon size={16} />
                        <span>{tab.label}</span>
                        {badge > 0 && !isActive && (
                            <span className="absolute -top-0.5 right-1 min-w-[18px] h-[18px] bg-kin-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                                {badge > 9 ? '9+' : badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );

    // ─── Mobile: fixed bottom tab bar ───
    const mobileBottomNav = (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-lg border-t border-warmgray-200 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-1">
            <div className="flex items-center justify-around">
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    const badge = tabBadges[tab.id] || 0;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => handleTabSwitch(tab.id)}
                            className={`relative flex flex-col items-center justify-center py-1.5 px-2 min-w-[52px] rounded-lg transition-all ${
                                isActive
                                    ? 'text-kin-600'
                                    : 'text-warmgray-400'
                            }`}
                        >
                            <div className="relative">
                                <Icon size={20} strokeWidth={isActive ? 2.5 : 2} />
                                {badge > 0 && !isActive && (
                                    <span className="absolute -top-1.5 -right-2 min-w-[16px] h-[16px] bg-kin-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-0.5">
                                        {badge > 9 ? '9+' : badge}
                                    </span>
                                )}
                            </div>
                            <span className={`text-[10px] mt-0.5 ${isActive ? 'font-semibold' : 'font-medium'}`}>
                                {tab.label}
                            </span>
                            {isActive && (
                                <div className="w-1 h-1 rounded-full bg-kin-500 mt-0.5" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );

    // ─── Render ───
    return (
        <>
            <ToastContainer toasts={toasts} onDismiss={dismissToast} />
            {isMobile ? (
                <MobileRoomView roomName={room.name} members={members} inviteCode={inviteCode} onGetInviteCode={handleGetInviteCode}>
                    <div className="pb-20">
                        {renderTabContent()}
                    </div>
                    {mobileBottomNav}
                </MobileRoomView>
            ) : (
                <RoomLayout roomTitle={room.name} inviteCode={inviteCode} members={members} onGetInviteCode={handleGetInviteCode} showInviteButton>
                    {desktopTabBar}
                    {renderTabContent()}
                </RoomLayout>
            )}
        </>
    );
}
