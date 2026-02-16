// components/ChatTab.tsx — Chat with read receipts and online presence
import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { auth } from '../lib/firebase';
import { Smile, Send, MessageCircle, CheckCheck, Check } from 'lucide-react';
import type { ReadReceipt, PresenceData } from '../lib/presenceUtils';

interface ChatTabProps {
    messages: any[];
    onSend: (content: string) => void;
    readReceipts?: ReadReceipt[];
    presence?: PresenceData[];
    members?: { uid: string; name?: string; email?: string }[];
    onMessagesViewed?: (lastMessageId: string) => void;
}

export default function ChatTab({ messages, onSend, readReceipts = [], presence = [], members = [], onMessagesViewed }: ChatTabProps) {
    const [newMessage, setNewMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const emojiRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const currentUid = auth.currentUser?.uid;
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (isInitialLoad.current) {
            // First load: jump to bottom instantly (no visible scroll)
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
            if (messages.length > 0) isInitialLoad.current = false;
        } else {
            // New messages: smooth scroll
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    // Mark messages as read when viewing
    useEffect(() => {
        if (messages.length > 0 && onMessagesViewed) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.id) {
                onMessagesViewed(lastMsg.id);
            }
        }
    }, [messages, onMessagesViewed]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) {
                setShowEmojiPicker(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSend = () => {
        if (newMessage.trim()) {
            onSend(newMessage.trim());
            setNewMessage('');
            setShowEmojiPicker(false);
            inputRef.current?.focus();
        }
    };

    const groupedMessages = messages.reduce<any[]>((groups, msg, i) => {
        const prev = messages[i - 1];
        const isSameSender = prev && prev.senderId === msg.senderId;
        const isCloseInTime = prev && msg.createdAt?.toDate && prev.createdAt?.toDate &&
            (msg.createdAt.toDate().getTime() - prev.createdAt.toDate().getTime()) < 120000;
        if (isSameSender && isCloseInTime) {
            groups[groups.length - 1].messages.push(msg);
        } else {
            groups.push({ senderId: msg.senderId, senderEmail: msg.senderEmail, messages: [msg] });
        }
        return groups;
    }, []);

    const formatTime = (timestamp: any) => {
        if (!timestamp?.toDate) return '';
        const date = timestamp.toDate();
        const now = new Date();
        const isToday = date.toDateString() === now.toDateString();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = date.toDateString() === yesterday.toDateString();
        const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        if (isToday) return time;
        if (isYesterday) return `Yesterday ${time}`;
        return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`;
    };

    const getSenderName = (email: string) => email ? email.split('@')[0] : 'Unknown';
    const getSenderInitial = (email: string) => (email || 'U')[0].toUpperCase();
    const getSenderColor = (senderId: string) => {
        const colors = ['bg-kin-500', 'bg-sage-400', 'bg-sand-400', 'bg-amber-500', 'bg-rose-400', 'bg-violet-400', 'bg-cyan-500', 'bg-pink-400'];
        const hash = (senderId || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    // Compute who has seen each message
    function getSeenBy(messageId: string): string[] {
        return readReceipts
            .filter(r => r.lastReadMessageId === messageId && r.uid !== currentUid)
            .map(r => r.name);
    }

    // For the last message of each group from me, show seen status
    function getMessageSeenStatus(messageId: string): 'sent' | 'seen' {
        const seenByOthers = readReceipts.filter(r => r.uid !== currentUid);
        // Check if any other user has read up to or past this message
        const messageIdx = messages.findIndex(m => m.id === messageId);
        const hasBeenSeen = seenByOthers.some(r => {
            const theirIdx = messages.findIndex(m => m.id === r.lastReadMessageId);
            return theirIdx >= messageIdx;
        });
        return hasBeenSeen ? 'seen' : 'sent';
    }

    // Find which messages are the "latest read" point for each user
    function getSeenByAtMessage(messageId: string): string[] {
        const names: string[] = [];
        for (const r of readReceipts) {
            if (r.uid === currentUid) continue;
            if (r.lastReadMessageId === messageId) {
                names.push(r.name);
            }
        }
        return names;
    }

    // Online members
    const onlineUids = new Set(presence.filter(p => p.isOnline).map(p => p.uid));

    return (
        <div className="flex flex-col h-[calc(100vh-220px)] max-w-3xl mx-auto">
            {/* Online indicator bar */}
            {members.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 border-b border-warmgray-100 bg-white/80">
                    <div className="flex items-center -space-x-1.5">
                        {members.filter(m => m.uid !== currentUid).slice(0, 6).map(m => {
                            const isOnline = onlineUids.has(m.uid);
                            const name = m.name || m.email?.split('@')[0] || '?';
                            return (
                                <div key={m.uid} className="relative" title={`${name} — ${isOnline ? 'Online' : 'Offline'}`}>
                                    <div className={`w-7 h-7 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold ${
                                        isOnline ? 'bg-kin-100 text-kin-600' : 'bg-warmgray-100 text-warmgray-400'
                                    }`}>
                                        {name[0]?.toUpperCase()}
                                    </div>
                                    <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                        isOnline ? 'bg-green-400' : 'bg-warmgray-300'
                                    }`} />
                                </div>
                            );
                        })}
                    </div>
                    <span className="text-[11px] text-warmgray-400">
                        {(() => {
                            const onlineOthers = members.filter(m => m.uid !== currentUid && onlineUids.has(m.uid));
                            if (onlineOthers.length === 0) return 'No one else online';
                            const names = onlineOthers.map(m => m.name || m.email?.split('@')[0]).join(', ');
                            return `${names} online`;
                        })()}
                    </span>
                </div>
            )}

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-2 py-4 space-y-1">
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-14 h-14 bg-kin-50 rounded-2xl flex items-center justify-center mb-3">
                            <MessageCircle size={28} className="text-kin-300" />
                        </div>
                        <h3 className="text-base font-semibold text-warmgray-800 mb-1">No messages yet</h3>
                        <p className="text-sm text-warmgray-400">Start the conversation with your family</p>
                    </div>
                )}

                {groupedMessages.map((group, gi) => {
                    const isMe = group.senderId === currentUid;
                    const lastMsg = group.messages[group.messages.length - 1];
                    const seenNames = lastMsg?.id ? getSeenByAtMessage(lastMsg.id) : [];
                    const seenStatus = isMe && lastMsg?.id ? getMessageSeenStatus(lastMsg.id) : null;

                    return (
                        <div key={gi} className={`flex gap-2.5 mb-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                            {!isMe && (
                                <div className="relative flex-shrink-0 mt-auto">
                                    <div className={`w-8 h-8 ${getSenderColor(group.senderId)} rounded-full flex items-center justify-center`}>
                                        <span className="text-xs font-bold text-white">{getSenderInitial(group.senderEmail)}</span>
                                    </div>
                                    {onlineUids.has(group.senderId) && (
                                        <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-400 border-2 border-white" />
                                    )}
                                </div>
                            )}

                            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                {!isMe && (
                                    <span className="text-[11px] font-medium text-warmgray-400 mb-0.5 px-1">
                                        {getSenderName(group.senderEmail)}
                                    </span>
                                )}

                                {group.messages.map((msg: any, mi: number) => {
                                    const isFirst = mi === 0;
                                    const isLast = mi === group.messages.length - 1;
                                    return (
                                        <div
                                            key={msg.id || mi}
                                            className={`px-3.5 py-2 text-sm leading-relaxed ${
                                                isMe
                                                    ? 'bg-gradient-to-r from-kin-500 to-kin-600 text-white'
                                                    : 'bg-white text-warmgray-800 border border-warmgray-100'
                                            } ${
                                                isMe
                                                    ? `${isFirst ? 'rounded-t-2xl rounded-bl-2xl' : 'rounded-l-2xl'} ${isLast ? 'rounded-b-2xl' : ''} ${!isFirst && !isLast ? 'rounded-bl-2xl' : ''} ${isFirst && isLast ? 'rounded-2xl' : ''}`
                                                    : `${isFirst ? 'rounded-t-2xl rounded-br-2xl' : 'rounded-r-2xl'} ${isLast ? 'rounded-b-2xl' : ''} ${!isFirst && !isLast ? 'rounded-br-2xl' : ''} ${isFirst && isLast ? 'rounded-2xl' : ''}`
                                            } ${mi > 0 ? 'mt-0.5' : ''} shadow-sm`}
                                        >
                                            {msg.content}
                                        </div>
                                    );
                                })}

                                {/* Timestamp + seen status */}
                                <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[10px] text-warmgray-400">
                                        {formatTime(lastMsg.createdAt)}
                                    </span>
                                    {isMe && seenStatus && (
                                        seenStatus === 'seen'
                                            ? <CheckCheck size={13} className="text-blue-500" />
                                            : <Check size={13} className="text-warmgray-400" />
                                    )}
                                </div>

                                {/* Seen by names (under the last message in a group) */}
                                {seenNames.length > 0 && (
                                    <div className={`flex items-center gap-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <span className="text-[9px] text-warmgray-400">
                                            Seen by {seenNames.join(', ')}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="relative border-t border-warmgray-100 bg-white pt-3 pb-1 px-1">
                {showEmojiPicker && (
                    <div ref={emojiRef} className="absolute bottom-full left-0 mb-2 z-30">
                        <EmojiPicker
                            onEmojiClick={(emojiObject) => {
                                setNewMessage((prev) => prev + emojiObject.emoji);
                                setShowEmojiPicker(false);
                                inputRef.current?.focus();
                            }}
                            lazyLoadEmojis={true}
                            width={320}
                            height={380}
                        />
                    </div>
                )}

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-2.5 rounded-xl transition-colors ${
                            showEmojiPicker
                                ? 'bg-kin-50 text-kin-600'
                                : 'text-warmgray-400 hover:text-warmgray-600 hover:bg-warmgray-100'
                        }`}
                    >
                        <Smile size={20} />
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleSend(); }}
                        placeholder="Type a message..."
                        className="flex-1 px-4 py-2.5 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!newMessage.trim()}
                        className="p-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl hover:from-kin-600 hover:to-kin-700 disabled:opacity-40 transition-all"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </div>
        </div>
    );
}
