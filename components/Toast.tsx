import { useEffect, useState, useCallback, useRef } from 'react';
import { MessageCircle, ListPlus, X, Bell } from 'lucide-react';

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
    }, []);

    const dismissToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    return { toasts, addToast, dismissToast };
}

export function sendBrowserNotification(title: string, body: string) {
    if (typeof window === 'undefined') return;
    if (document.hasFocus()) return; // Don't show if app is focused
    if (Notification.permission !== 'granted') return;
    try {
        new Notification(title, {
            body,
            icon: '/icons/icon-192.png',
            badge: '/icons/icon-192.png',
            tag: 'kinloop-notif',
        });
    } catch {
        // Notification constructor can fail in some contexts
    }
}
