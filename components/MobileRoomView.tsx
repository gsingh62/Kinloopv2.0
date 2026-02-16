// components/MobileRoomView.tsx — Mobile room view with room management
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';
import { ArrowLeft, Share2, Users, Copy, Check, ChevronDown, DoorOpen, Trash2, UserMinus } from 'lucide-react';

interface MobileRoomViewProps {
    roomName: string;
    members: any[];
    inviteCode?: string;
    children: React.ReactNode;
    onGetInviteCode?: () => void;
    isOwner?: boolean;
    onLeaveRoom?: () => void;
    onDeleteRoom?: () => void;
    onRemoveMember?: (uid: string) => void;
}

export default function MobileRoomView({
    roomName, members, inviteCode, children, onGetInviteCode,
    isOwner, onLeaveRoom, onDeleteRoom, onRemoveMember,
}: MobileRoomViewProps) {
    const [view, setView] = useState<'main' | 'members'>('main');
    const [showInvite, setShowInvite] = useState(false);
    const [copied, setCopied] = useState(false);
    const router = useRouter();
    const currentUser = auth.currentUser;

    const handleCopyCode = () => {
        if (inviteCode) {
            navigator.clipboard?.writeText(inviteCode).then(() => {
                setCopied(true); setTimeout(() => setCopied(false), 2000);
            }).catch(() => { if (onGetInviteCode) onGetInviteCode(); });
        }
    };

    return (
        <div className="min-h-screen bg-sand-50 ios-safe-top">
            {view === 'main' ? (
                <div className="flex flex-col h-screen">
                    <div className="px-4 py-3 border-b border-warmgray-100 bg-white/90 backdrop-blur-lg sticky top-0 z-40">
                        <div className="flex items-center justify-between">
                            <button onClick={() => router.push('/dashboard')} className="p-1.5 -ml-1 rounded-lg hover:bg-warmgray-100 transition-colors">
                                <ArrowLeft size={20} className="text-kin-500" />
                            </button>
                            <div className="flex-1 mx-3 text-center">
                                <button className="inline-flex items-center gap-1" onClick={() => setView('members')}>
                                    <span className="text-base font-bold text-warmgray-800">{roomName}</span>
                                    <ChevronDown size={14} className="text-warmgray-400" />
                                </button>
                                <p className="text-[11px] text-warmgray-400">{members.length} member{members.length !== 1 ? 's' : ''}</p>
                            </div>
                            <button onClick={() => setShowInvite(!showInvite)} className="p-1.5 -mr-1 rounded-lg hover:bg-warmgray-100 transition-colors">
                                <Share2 size={18} className="text-kin-500" />
                            </button>
                        </div>
                        {showInvite && inviteCode && (
                            <div className="mt-2 flex items-center gap-2 p-2.5 bg-kin-50 rounded-xl border border-kin-100">
                                <div className="flex-1">
                                    <p className="text-[10px] text-kin-400 font-medium uppercase tracking-wider">Invite Code</p>
                                    <p className="text-sm font-mono font-bold text-kin-700 tracking-widest">{inviteCode}</p>
                                </div>
                                <button onClick={handleCopyCode}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                        copied ? 'bg-sage-100 text-sage-600' : 'bg-kin-500 text-white hover:bg-kin-600'
                                    }`}>
                                    {copied ? <span className="flex items-center gap-1"><Check size={12} /> Copied</span> : <span className="flex items-center gap-1"><Copy size={12} /> Copy</span>}
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>
                </div>
            ) : (
                <div className="flex flex-col h-screen">
                    <div className="flex items-center px-4 py-3 border-b border-warmgray-100 bg-white/90 backdrop-blur-lg sticky top-0 z-40">
                        <button onClick={() => setView('main')} className="p-1.5 -ml-1 rounded-lg hover:bg-warmgray-100 transition-colors">
                            <ArrowLeft size={20} className="text-kin-500" />
                        </button>
                        <div className="ml-3 flex items-center gap-2">
                            <Users size={18} className="text-warmgray-600" />
                            <h2 className="text-base font-bold text-warmgray-800">Members</h2>
                            <span className="px-2 py-0.5 bg-kin-50 text-kin-600 text-xs font-semibold rounded-full">{members.length}</span>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4">
                        <div className="space-y-2">
                            {members.map((member) => (
                                <div key={member.uid} className="flex items-center gap-3 p-3 bg-white rounded-xl border border-warmgray-100 hover:border-warmgray-200 transition-colors">
                                    <div className="w-10 h-10 bg-kin-100 text-kin-600 rounded-full flex items-center justify-center text-base font-bold flex-shrink-0">
                                        {(member.name || member.email)?.[0]?.toUpperCase()}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-warmgray-800 truncate">{member.name || member.email?.split('@')[0]}</p>
                                        <p className="text-xs text-warmgray-400 truncate">{member.email}</p>
                                    </div>
                                    {member.uid === currentUser?.uid && (
                                        <span className="text-[10px] text-kin-500 font-medium bg-kin-50 px-2 py-0.5 rounded-full">You</span>
                                    )}
                                    {isOwner && member.uid !== currentUser?.uid && onRemoveMember && (
                                        <button onClick={() => onRemoveMember(member.uid)}
                                            className="p-2 text-warmgray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                            title="Remove member">
                                            <UserMinus size={16} />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* Room management actions */}
                        <div className="mt-6 space-y-2">
                            {onLeaveRoom && (
                                <button onClick={onLeaveRoom}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl text-sm font-medium text-amber-700 hover:bg-amber-100 transition-colors">
                                    <DoorOpen size={16} /> Leave Room
                                </button>
                            )}
                            {isOwner && onDeleteRoom && (
                                <button onClick={onDeleteRoom}
                                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm font-medium text-red-600 hover:bg-red-100 transition-colors">
                                    <Trash2 size={16} /> Delete Room
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
