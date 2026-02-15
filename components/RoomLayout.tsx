// components/RoomLayout.tsx — Warm sunset themed layout with collapsible sidebar
import { ReactNode, useState, useEffect, useRef } from 'react';
import Sidebar from './Sidebar';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { useRouter } from 'next/router';
import { Copy, Check, LogOut, PanelLeftOpen, PanelLeftClose } from 'lucide-react';

interface RoomLayoutProps {
    children: ReactNode;
    roomTitle?: string;
    inviteCode?: string;
    members?: any[];
    onGetInviteCode?: () => void;
    showInviteButton?: boolean;
}

export default function RoomLayout({
    children, roomTitle, inviteCode, members = [], onGetInviteCode, showInviteButton = false,
}: RoomLayoutProps) {
    const router = useRouter();
    const user = auth.currentUser;
    const segments = router.asPath.split('/');
    const currentRoomId = segments.includes('room') ? segments[segments.indexOf('room') + 1]?.split('?')[0] : '';
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [copied, setCopied] = useState(false);

    const handleLogout = async () => { await signOut(auth); router.push('/'); };

    const handleCopyInvite = () => {
        if (inviteCode) {
            navigator.clipboard.writeText(inviteCode).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }).catch(() => { if (onGetInviteCode) onGetInviteCode(); });
        } else if (onGetInviteCode) { onGetInviteCode(); }
    };

    useEffect(() => {
        const handleRouteChange = () => { if (window.innerWidth < 768) setSidebarOpen(false); };
        router.events.on('routeChangeComplete', handleRouteChange);
        return () => router.events.off('routeChangeComplete', handleRouteChange);
    }, [router]);

    return (
        <div className="flex min-h-screen overflow-hidden bg-sand-50">
            {/* Desktop Sidebar — slide in/out */}
            <div className={`hidden md:block flex-shrink-0 transition-all duration-300 ease-in-out overflow-hidden ${sidebarOpen ? 'w-64' : 'w-0'}`}>
                <div className="w-64 h-full"><Sidebar currentRoomId={currentRoomId} /></div>
            </div>

            {/* Mobile Sidebar Overlay */}
            {sidebarOpen && (
                <div className="md:hidden fixed inset-0 z-50 flex">
                    <div className="w-72 bg-white shadow-2xl h-full overflow-y-auto"><Sidebar currentRoomId={currentRoomId} /></div>
                    <div className="flex-1 bg-black/30 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
                </div>
            )}

            {/* Main Content */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Top Bar */}
                <header className="flex items-center justify-between px-4 sm:px-5 py-2.5 bg-white border-b border-warmgray-200 sticky top-0 z-10">
                    <div className="flex items-center gap-2 min-w-0">
                        <button
                            onClick={() => setSidebarOpen(!sidebarOpen)}
                            className="p-2 rounded-lg hover:bg-warmgray-100 transition-colors text-warmgray-500 hover:text-warmgray-700"
                            title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
                        >
                            {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                        </button>
                        <h2 className="text-base font-bold text-warmgray-800 truncate">{roomTitle || 'Room'}</h2>
                        {members.length > 0 && (
                            <div className="hidden sm:flex items-center -space-x-1.5 ml-1.5">
                                {members.slice(0, 4).map((m: any, i: number) => (
                                    <div key={m.uid || i}
                                        className="w-6 h-6 rounded-full bg-kin-100 border-2 border-white flex items-center justify-center"
                                        title={m.name || m.email}>
                                        <span className="text-[9px] font-bold text-kin-600">{(m.name || m.email)?.[0]?.toUpperCase()}</span>
                                    </div>
                                ))}
                                {members.length > 4 && (
                                    <div className="w-6 h-6 rounded-full bg-warmgray-100 border-2 border-white flex items-center justify-center">
                                        <span className="text-[9px] font-medium text-warmgray-500">+{members.length - 4}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-1.5">
                        {showInviteButton && (
                            <button onClick={handleCopyInvite}
                                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    copied
                                        ? 'bg-sage-50 text-sage-600 border border-sage-200'
                                        : 'bg-warmgray-50 text-warmgray-600 hover:bg-warmgray-100 border border-warmgray-200'
                                }`}>
                                {copied ? (<><Check size={13} /><span>Copied!</span></>) : (
                                    <>
                                        <Copy size={13} />
                                        <span className="hidden sm:inline">Invite</span>
                                        {inviteCode && <span className="font-mono bg-white px-1.5 py-0.5 rounded text-[10px] border border-warmgray-100">{inviteCode}</span>}
                                    </>
                                )}
                            </button>
                        )}
                        <button onClick={handleLogout}
                            className="p-2 text-warmgray-400 hover:text-kin-600 hover:bg-kin-50 rounded-lg transition-colors" title="Sign out">
                            <LogOut size={15} />
                        </button>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">{children}</main>
            </div>
        </div>
    );
}
