import { useEffect, useState, useCallback, useRef } from 'react';
import { MessageCircle, ListPlus, X, Bell, BellRing } from 'lucide-react';

export interface ToastItem {
    id: string;
    type: 'chat' | 'list' | 'info';
    title: string;
    body: string;
    action?: { label: string; onClick: () => void };
}

interface ToastProps {
    toasts: ToastItem[];
    onDismiss: (id: string) => void;
}

const ICON_MAP = {
    chat: MessageCircle,
    list: ListPlus,
    info: Bell,
};

const COLOR_MAP = {
    chat: 'from-kin-500 to-kin-600',
    list: 'from-sage-500 to-sage-600',
    info: 'from-warmgray-500 to-warmgray-600',
};

// ─── Notification sound ───
let audioContext: AudioContext | null = null;
let notifSoundBuffer: AudioBuffer | null = null;
let soundLoading = false;

async function loadNotifSound() {
    if (notifSoundBuffer || soundLoading || typeof window === 'undefined') return;
    soundLoading = true;
    try {
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const resp = await fetch('/notification.wav');
        const buffer = await resp.arrayBuffer();
        notifSoundBuffer = await audioContext.decodeAudioData(buffer);
    } catch {
        // Sound not available, not critical
    } finally {
        soundLoading = false;
    }
}

export function playNotifSound() {
    if (typeof window === 'undefined') return;
    try {
        if (!audioContext || !notifSoundBuffer) {
            loadNotifSound();
            // Fallback: use a simple oscillator beep
            const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            osc.type = 'sine';
            gain.gain.value = 0.3;
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.3);
            return;
        }
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        const source = audioContext.createBufferSource();
        source.buffer = notifSoundBuffer;
        source.connect(audioContext.destination);
        source.start();
    } catch {
        // Sound not critical
    }
}

// Pre-load sound on first user interaction
if (typeof window !== 'undefined') {
    const loadOnce = () => {
        loadNotifSound();
        window.removeEventListener('click', loadOnce);
        window.removeEventListener('touchstart', loadOnce);
    };
    window.addEventListener('click', loadOnce, { passive: true });
    window.addEventListener('touchstart', loadOnce, { passive: true });
}

// ─── Toast Container ───
export function ToastContainer({ toasts, onDismiss }: ToastProps) {
    return (
        <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
            {toasts.map(toast => (
                <ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
            ))}
        </div>
    );
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: (id: string) => void }) {
    const [isExiting, setIsExiting] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => {
            setIsExiting(true);
            setTimeout(() => onDismiss(toast.id), 300);
        }, 4000);
        return () => clearTimeout(timer);
    }, [toast.id, onDismiss]);

    const Icon = ICON_MAP[toast.type];
    const gradient = COLOR_MAP[toast.type];

    return (
        <div
            className={`pointer-events-auto flex items-start gap-3 p-3 bg-white rounded-xl shadow-lg border border-warmgray-100 transition-all duration-300 ${
                isExiting ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0 animate-slide-in'
            }`}
        >
            <div className={`w-8 h-8 bg-gradient-to-br ${gradient} rounded-lg flex items-center justify-center flex-shrink-0`}>
                <Icon size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-warmgray-800 truncate">{toast.title}</p>
                <p className="text-xs text-warmgray-500 truncate">{toast.body}</p>
                {toast.action && (
                    <button
                        onClick={toast.action.onClick}
                        className="text-xs font-medium text-kin-600 hover:text-kin-700 mt-1"
                    >
                        {toast.action.label}
                    </button>
                )}
            </div>
            <button
                onClick={() => onDismiss(toast.id)}
                className="p-0.5 text-warmgray-300 hover:text-warmgray-500 flex-shrink-0"
            >
                <X size={14} />
            </button>
        </div>
    );
}

export function useToast() {
    const [toasts, setToasts] = useState<ToastItem[]>([]);
    const idCounter = useRef(0);

    const addToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
        const id = `toast-${Date.now()}-${idCounter.current++}`;
        setToasts(prev => [...prev.slice(-4), { ...toast, id }]);
        playNotifSound();
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, dismissToast };
}

/**
 * Send a system-level notification via the Service Worker.
 * This works on BOTH desktop and mobile (Android/iOS).
 * The old `new Notification()` constructor does NOT work on mobile.
 */
export async function sendBrowserNotification(title: string, body: string, tag?: string) {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    if (Notification.permission !== 'granted') return;

    try {
        const registration = await navigator.serviceWorker.ready;
        const uniqueTag = tag || ('kinloop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6));
        await registration.showNotification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: uniqueTag,
            renotify: true,
            vibrate: [200, 100, 200],
            silent: false,
            data: { url: window.location.pathname },
        });
    } catch {
        // Notification failed, not critical
    }
}

// ─── Enable Notifications Banner ───
export function NotificationBanner() {
    const [mode, setMode] = useState<'hidden' | 'unsupported' | 'denied' | 'enable' | 'granted'>('hidden');
    const [enabling, setEnabling] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
            setMode('unsupported');
            return;
        }
        const perm = Notification.permission;
        if (perm === 'default') {
            setMode('enable');
        } else if (perm === 'granted') {
            setMode('granted');
        } else {
            setMode('denied');
        }
    }, []);

    const handleEnable = async () => {
        setEnabling(true);
        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const { subscribeToPush } = await import('../lib/pushUtils');
                subscribeToPush();
                setMode('granted');
            } else {
                setMode('hidden');
            }
        } catch {
            setMode('hidden');
        } finally {
            setEnabling(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setTestResult(null);
        try {
            const { subscribeToPushWithStatus } = await import('../lib/pushUtils');
            const result = await subscribeToPushWithStatus();
            setTestResult(result);
        } catch (err: any) {
            setTestResult(`Refresh error: ${err.message}`);
        } finally {
            setRefreshing(false);
        }
    };

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const { auth } = await import('../lib/firebase');
            const user = auth.currentUser;
            if (!user) {
                setTestResult('Not logged in');
                return;
            }

            // First refresh subscription synchronously
            const { subscribeToPushWithStatus } = await import('../lib/pushUtils');
            const subResult = await subscribeToPushWithStatus();
            if (subResult.startsWith('error')) {
                setTestResult(`Subscribe: ${subResult}`);
                setTesting(false);
                return;
            }

            // Check subscription status
            const checkRes = await fetch('/api/push-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, action: 'check' }),
            });
            const checkData = await checkRes.json();

            if (checkData.subscriptionCount === 0) {
                setTestResult('No push subscription found. Try: refresh then test again.');
                return;
            }

            // Send test push
            const testRes = await fetch('/api/push-test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, action: 'test' }),
            });
            const testData = await testRes.json();

            if (testData.sent > 0) {
                setTestResult(`Sent! (${testData.sent}/${testData.total} endpoints)`);
            } else {
                const failDetails = testData.results?.map((r: any) =>
                    r.status === 'failed' ? `${r.statusCode}: ${r.message?.slice(0, 40)}` : r.status
                ).join(', ') || 'unknown';
                setTestResult(`Failed: ${failDetails}`);
            }
        } catch (err: any) {
            setTestResult(`Error: ${err.message?.slice(0, 50)}`);
        } finally {
            setTesting(false);
        }
    };

    if (mode === 'hidden' || dismissed) return null;

    // Unsupported browser
    if (mode === 'unsupported') {
        return (
            <div className="mx-auto max-w-3xl mb-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs">
                    <Bell size={14} className="text-amber-500 flex-shrink-0" />
                    <span className="text-amber-700">Push notifications are not supported in this browser. Use Chrome on Android or Safari on iPhone for notifications.</span>
                    <button onClick={() => setDismissed(true)} className="p-0.5 text-warmgray-300 hover:text-warmgray-500 flex-shrink-0">
                        <X size={14} />
                    </button>
                </div>
            </div>
        );
    }

    // Permission denied
    if (mode === 'denied') {
        return (
            <div className="mx-auto max-w-3xl mb-3">
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs">
                    <Bell size={14} className="text-red-400 flex-shrink-0" />
                    <span className="text-red-700">Notifications are blocked. Go to your browser settings to allow notifications for this site, then reload.</span>
                    <button onClick={() => setDismissed(true)} className="p-0.5 text-warmgray-300 hover:text-warmgray-500 flex-shrink-0">
                        <X size={14} />
                    </button>
                </div>
            </div>
        );
    }

    // Permission not yet requested
    if (mode === 'enable') {
        return (
            <div className="mx-auto max-w-3xl mb-4 animate-slide-in">
                <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-kin-50 to-amber-50 border border-kin-200 rounded-xl shadow-sm">
                    <div className="w-10 h-10 bg-gradient-to-br from-kin-500 to-kin-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <BellRing size={20} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-warmgray-800">Enable Notifications</p>
                        <p className="text-xs text-warmgray-500">Get notified even when the app is closed.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => setDismissed(true)} className="text-xs text-warmgray-400 hover:text-warmgray-600 px-2 py-1.5">Later</button>
                        <button onClick={handleEnable} disabled={enabling}
                            className="px-4 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-semibold hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all shadow-sm">
                            {enabling ? 'Enabling...' : 'Enable'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // mode === 'granted' — show compact tools
    return (
        <div className="mx-auto max-w-3xl mb-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-warmgray-50 border border-warmgray-200 rounded-xl text-xs">
                <Bell size={14} className="text-green-500 flex-shrink-0" />
                <span className="text-warmgray-500 flex-shrink-0">Notifications on</span>
                <div className="flex-1" />
                <button onClick={handleRefresh} disabled={refreshing}
                    className="px-2.5 py-1 bg-warmgray-200 hover:bg-warmgray-300 text-warmgray-600 rounded-md transition-colors disabled:opacity-50">
                    {refreshing ? 'Refreshing...' : 'Refresh'}
                </button>
                <button onClick={handleTest} disabled={testing}
                    className="px-2.5 py-1 bg-kin-100 hover:bg-kin-200 text-kin-700 rounded-md transition-colors disabled:opacity-50">
                    {testing ? 'Sending...' : 'Test'}
                </button>
                <button onClick={() => setDismissed(true)} className="p-0.5 text-warmgray-300 hover:text-warmgray-500">
                    <X size={14} />
                </button>
            </div>
            {testResult && (
                <p className={`text-[11px] mt-1 px-2 ${testResult.includes('Sent') || testResult.includes('refreshed') ? 'text-green-600' : 'text-amber-600'}`}>
                    {testResult}
                </p>
            )}
        </div>
    );
}
