// components/ChatTab.tsx — Production-grade chat interface
import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { auth } from '../lib/firebase';
import { Smile, Send, MessageCircle } from 'lucide-react';

interface ChatTabProps {
    messages: any[];
    onSend: (content: string) => void;
}

export default function ChatTab({ messages, onSend }: ChatTabProps) {
    const [newMessage, setNewMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const currentUid = auth.currentUser?.uid;

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    // Close emoji picker on outside click
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

    // Group consecutive messages from same sender
    const groupedMessages = messages.reduce<any[]>((groups, msg, i) => {
        const prev = messages[i - 1];
        const isSameSender = prev && prev.senderId === msg.senderId;
        // Within 2 minutes
        const isCloseInTime = prev && msg.createdAt?.toDate && prev.createdAt?.toDate &&
            (msg.createdAt.toDate().getTime() - prev.createdAt.toDate().getTime()) < 120000;
        if (isSameSender && isCloseInTime) {
            groups[groups.length - 1].messages.push(msg);
        } else {
            groups.push({
                senderId: msg.senderId,
                senderEmail: msg.senderEmail,
                messages: [msg],
            });
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

    const getSenderName = (email: string) => {
        if (!email) return 'Unknown';
        return email.split('@')[0];
    };

    const getSenderInitial = (email: string) => {
        return (email || 'U')[0].toUpperCase();
    };

    const getSenderColor = (senderId: string) => {
        const colors = [
            'bg-kin-500', 'bg-sage-400', 'bg-sand-400', 'bg-amber-500',
            'bg-rose-400', 'bg-violet-400', 'bg-cyan-500', 'bg-pink-400',
        ];
        const hash = (senderId || '').split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
        return colors[hash % colors.length];
    };

    return (
        <div className="flex flex-col h-[calc(100vh-220px)] max-w-3xl mx-auto">
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
                    return (
                        <div key={gi} className={`flex gap-2.5 mb-3 ${isMe ? 'flex-row-reverse' : ''}`}>
                            {/* Avatar (only for others) */}
                            {!isMe && (
                                <div className={`w-8 h-8 ${getSenderColor(group.senderId)} rounded-full flex items-center justify-center flex-shrink-0 mt-auto`}>
                                    <span className="text-xs font-bold text-white">
                                        {getSenderInitial(group.senderEmail)}
                                    </span>
                                </div>
                            )}

                            <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} max-w-[75%]`}>
                                {/* Sender name (only for others) */}
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

                                {/* Timestamp on last message */}
                                {group.messages.length > 0 && (
                                    <span className={`text-[10px] text-warmgray-400 mt-1 px-1 ${isMe ? 'text-right' : ''}`}>
                                        {formatTime(group.messages[group.messages.length - 1].createdAt)}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="relative border-t border-warmgray-100 bg-white pt-3 pb-1 px-1">
                {/* Emoji Picker */}
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
