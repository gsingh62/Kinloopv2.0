// components/ChatTab.tsx — Chat with attachments, read receipts and online presence
import { useEffect, useRef, useState } from 'react';
import EmojiPicker from 'emoji-picker-react';
import { auth } from '../lib/firebase';
import { Smile, Send, MessageCircle, CheckCheck, Check, Paperclip, Image as ImageIcon, FileText, X, Loader2, Download } from 'lucide-react';
import type { ReadReceipt, PresenceData } from '../lib/presenceUtils';
import type { MessageAttachment, RoomMember } from '../lib/firestoreUtils';

interface ChatTabProps {
    messages: any[];
    onSend: (content: string, attachments?: MessageAttachment[]) => void;
    readReceipts?: ReadReceipt[];
    presence?: PresenceData[];
    members?: RoomMember[];
    onMessagesViewed?: (lastMessageId: string) => void;
    roomId?: string;
}

interface PendingFile {
    file: File;
    previewUrl?: string;
    type: 'image' | 'file';
}

export default function ChatTab({ messages, onSend, readReceipts = [], presence = [], members = [], onMessagesViewed, roomId }: ChatTabProps) {
    const [newMessage, setNewMessage] = useState('');
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
    const [uploading, setUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const emojiRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const currentUid = auth.currentUser?.uid;
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (isInitialLoad.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
            if (messages.length > 0) isInitialLoad.current = false;
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages]);

    useEffect(() => {
        if (messages.length > 0 && onMessagesViewed) {
            const lastMsg = messages[messages.length - 1];
            if (lastMsg?.id) onMessagesViewed(lastMsg.id);
        }
    }, [messages, onMessagesViewed]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setShowEmojiPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        const newPending: PendingFile[] = files.map(file => {
            const isImage = file.type.startsWith('image/');
            return {
                file,
                previewUrl: isImage ? URL.createObjectURL(file) : undefined,
                type: isImage ? 'image' : 'file',
            };
        });
        setPendingFiles(prev => [...prev, ...newPending].slice(0, 5));
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removePendingFile = (index: number) => {
        setPendingFiles(prev => {
            const removed = prev[index];
            if (removed.previewUrl) URL.revokeObjectURL(removed.previewUrl);
            return prev.filter((_, i) => i !== index);
        });
    };

    const uploadFile = async (file: File): Promise<MessageAttachment> => {
        if (!roomId) throw new Error('Room ID is missing');
        if (!auth.currentUser) throw new Error('Please sign in first');

        const formData = new FormData();
        formData.append('file', file);
        formData.append('roomId', roomId);

        setUploadProgress(10);
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        setUploadProgress(80);

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || `Upload failed (${response.status})`);
        }

        const data = await response.json();
        setUploadProgress(100);

        return {
            type: data.type,
            url: data.url,
            name: data.name,
            size: data.size,
            mimeType: data.mimeType,
            storagePath: data.storagePath,
        };
    };

    const handleSend = async () => {
        const hasText = newMessage.trim().length > 0;
        const hasFiles = pendingFiles.length > 0;
        if (!hasText && !hasFiles) return;

        if (hasFiles) {
            setUploading(true);
            setUploadProgress(0);
            setUploadError(null);
            try {
                const attachments: MessageAttachment[] = [];
                for (const pf of pendingFiles) {
                    const att = await uploadFile(pf.file);
                    attachments.push(att);
                }
                onSend(newMessage.trim() || '', attachments);
                pendingFiles.forEach(pf => { if (pf.previewUrl) URL.revokeObjectURL(pf.previewUrl); });
                setPendingFiles([]);
            } catch (err: any) {
                console.error('Upload failed:', err);
                setUploadError(err.message || 'Upload failed. Check Firebase Storage rules.');
            } finally {
                setUploading(false);
                setUploadProgress(0);
            }
        } else {
            onSend(newMessage.trim());
        }
        setNewMessage('');
        setShowEmojiPicker(false);
        inputRef.current?.focus();
    };

    const formatFileSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

    function getMessageSeenStatus(messageId: string): 'sent' | 'seen' {
        const seenByOthers = readReceipts.filter(r => r.uid !== currentUid);
        const messageIdx = messages.findIndex(m => m.id === messageId);
        const hasBeenSeen = seenByOthers.some(r => {
            const theirIdx = messages.findIndex(m => m.id === r.lastReadMessageId);
            return theirIdx >= messageIdx;
        });
        return hasBeenSeen ? 'seen' : 'sent';
    }

    function getSeenByAtMessage(messageId: string): string[] {
        const names: string[] = [];
        for (const r of readReceipts) {
            if (r.uid === currentUid) continue;
            if (r.lastReadMessageId === messageId) names.push(r.name);
        }
        return names;
    }

    const onlineUids = new Set(presence.filter(p => p.isOnline).map(p => p.uid));

    // ─── Render attachment inside a message bubble ───
    const renderAttachments = (attachments: MessageAttachment[], isMe: boolean) => {
        if (!attachments || attachments.length === 0) return null;
        return (
            <div className="flex flex-col gap-1.5 mt-1">
                {attachments.map((att, i) => {
                    if (att.type === 'image') {
                        return (
                            <button key={i} onClick={() => setLightboxUrl(att.url)} className="block rounded-lg overflow-hidden max-w-[240px]">
                                <img src={att.url} alt={att.name} className="w-full rounded-lg" loading="lazy" />
                            </button>
                        );
                    }
                    return (
                        <a key={i} href={att.url} target="_blank" rel="noopener noreferrer"
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
                                isMe ? 'bg-white/20 text-white hover:bg-white/30' : 'bg-warmgray-50 text-warmgray-700 hover:bg-warmgray-100'
                            } transition-colors`}
                        >
                            <FileText size={16} className="flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{att.name}</p>
                                <p className={`${isMe ? 'text-white/70' : 'text-warmgray-400'}`}>{formatFileSize(att.size)}</p>
                            </div>
                            <Download size={14} className="flex-shrink-0" />
                        </a>
                    );
                })}
            </div>
        );
    };

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
                                    const hasAttachments = msg.attachments && msg.attachments.length > 0;
                                    const hasContent = msg.content && msg.content.trim();

                                    return (
                                        <div
                                            key={msg.id || mi}
                                            className={`${hasContent ? 'px-3.5 py-2' : hasAttachments ? 'p-1.5' : 'px-3.5 py-2'} text-sm leading-relaxed ${
                                                isMe
                                                    ? 'bg-gradient-to-r from-kin-500 to-kin-600 text-white'
                                                    : 'bg-white text-warmgray-800 border border-warmgray-100'
                                            } ${
                                                isMe
                                                    ? `${isFirst ? 'rounded-t-2xl rounded-bl-2xl' : 'rounded-l-2xl'} ${isLast ? 'rounded-b-2xl' : ''} ${!isFirst && !isLast ? 'rounded-bl-2xl' : ''} ${isFirst && isLast ? 'rounded-2xl' : ''}`
                                                    : `${isFirst ? 'rounded-t-2xl rounded-br-2xl' : 'rounded-r-2xl'} ${isLast ? 'rounded-b-2xl' : ''} ${!isFirst && !isLast ? 'rounded-br-2xl' : ''} ${isFirst && isLast ? 'rounded-2xl' : ''}`
                                            } ${mi > 0 ? 'mt-0.5' : ''} shadow-sm overflow-hidden`}
                                        >
                                            {hasContent && <span>{msg.content}</span>}
                                            {renderAttachments(msg.attachments, isMe)}
                                        </div>
                                    );
                                })}

                                <div className={`flex items-center gap-1 mt-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                    <span className="text-[10px] text-warmgray-400">{formatTime(lastMsg.createdAt)}</span>
                                    {isMe && seenStatus && (
                                        seenStatus === 'seen'
                                            ? <CheckCheck size={13} className="text-blue-500" />
                                            : <Check size={13} className="text-warmgray-400" />
                                    )}
                                </div>

                                {seenNames.length > 0 && (
                                    <div className={`flex items-center gap-1 px-1 ${isMe ? 'flex-row-reverse' : ''}`}>
                                        <span className="text-[9px] text-warmgray-400">Seen by {seenNames.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                <div ref={messagesEndRef} />
            </div>

            {/* Pending files preview */}
            {pendingFiles.length > 0 && (
                <div className="px-2 py-2 border-t border-warmgray-100 bg-warmgray-50">
                    <div className="flex gap-2 overflow-x-auto">
                        {pendingFiles.map((pf, i) => (
                            <div key={i} className="relative flex-shrink-0">
                                {pf.type === 'image' && pf.previewUrl ? (
                                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-warmgray-200">
                                        <img src={pf.previewUrl} alt="" className="w-full h-full object-cover" />
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-lg bg-warmgray-200 flex flex-col items-center justify-center p-1">
                                        <FileText size={16} className="text-warmgray-500 mb-0.5" />
                                        <span className="text-[8px] text-warmgray-500 truncate w-full text-center">{pf.file.name.split('.').pop()}</span>
                                    </div>
                                )}
                                <button
                                    onClick={() => removePendingFile(i)}
                                    className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-warmgray-600 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                                >
                                    <X size={10} />
                                </button>
                                <p className="text-[8px] text-warmgray-400 text-center mt-0.5 truncate w-16">{formatFileSize(pf.file.size)}</p>
                            </div>
                        ))}
                    </div>
                    {uploading && (
                        <div className="mt-2">
                            <div className="h-1.5 bg-warmgray-200 rounded-full overflow-hidden">
                                <div className="h-full bg-kin-500 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                            </div>
                            <p className="text-[10px] text-warmgray-400 mt-0.5">Uploading... {uploadProgress}%</p>
                        </div>
                    )}
                    {uploadError && (
                        <div className="mt-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
                            <p className="text-[11px] text-red-600">{uploadError}</p>
                            <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 ml-2"><X size={12} /></button>
                        </div>
                    )}
                </div>
            )}

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

                <input ref={fileInputRef} type="file" multiple accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" className="hidden" onChange={handleFileSelect} />

                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                        className={`p-2.5 rounded-xl transition-colors ${
                            showEmojiPicker ? 'bg-kin-50 text-kin-600' : 'text-warmgray-400 hover:text-warmgray-600 hover:bg-warmgray-100'
                        }`}
                    >
                        <Smile size={20} />
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="p-2.5 rounded-xl text-warmgray-400 hover:text-warmgray-600 hover:bg-warmgray-100 transition-colors disabled:opacity-40"
                        title="Attach file or photo"
                    >
                        <Paperclip size={20} />
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !uploading) handleSend(); }}
                        placeholder={pendingFiles.length > 0 ? 'Add a caption...' : 'Type a message...'}
                        className="flex-1 px-4 py-2.5 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400 transition-all"
                    />
                    <button
                        onClick={handleSend}
                        disabled={(!newMessage.trim() && pendingFiles.length === 0) || uploading}
                        className="p-2.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl hover:from-kin-600 hover:to-kin-700 disabled:opacity-40 transition-all"
                    >
                        {uploading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>

            {/* Image Lightbox */}
            {lightboxUrl && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
                    <button onClick={() => setLightboxUrl(null)} className="absolute top-4 right-4 p-2 text-white/60 hover:text-white bg-black/40 rounded-full z-10">
                        <X size={24} />
                    </button>
                    <img src={lightboxUrl} alt="Full size" className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg" onClick={(e) => e.stopPropagation()} />
                </div>
            )}
        </div>
    );
}
