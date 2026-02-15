// pages/welcome.tsx
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { auth } from '../lib/firebase';
import { logout } from '../lib/auth';
import { Plus, Link2, LogOut } from 'lucide-react';

export default function WelcomePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any>(null);

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(
            (firebaseUser) => {
                if (!firebaseUser) {
                    router.replace('/');
                } else {
                    setUser(firebaseUser);
                    setLoading(false);
                }
            },
            (err) => {
                console.error('[AuthState Error]', err);
                setError('Authentication check failed.');
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, [router]);

    const handleSignOut = async () => {
        await logout();
        router.push('/');
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-sand-50">
                <div className="animate-spin h-8 w-8 border-2 border-kin-500 border-t-transparent rounded-full" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-kin-50 text-kin-700">
                <p>{error}</p>
            </div>
        );
    }

    const displayName = user?.displayName || user?.email?.split('@')[0] || 'there';

    return (
        <div className="min-h-screen bg-gradient-to-br from-kin-50 via-sand-50 to-kin-100 relative flex items-center justify-center px-4">
            {/* Top right user info */}
            <div className="absolute top-4 right-4 flex items-center gap-3">
                <span className="text-sm text-warmgray-500">{user?.email}</span>
                <button
                    onClick={handleSignOut}
                    className="p-2 text-warmgray-400 hover:text-kin-600 hover:bg-kin-50 rounded-lg transition-colors"
                    title="Sign out"
                >
                    <LogOut size={16} />
                </button>
            </div>

            <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl shadow-kin-200/20 border border-kin-100/60 p-10 w-full max-w-md text-center">
                {/* Logo */}
                <div className="w-16 h-16 bg-gradient-to-br from-kin-500 to-kin-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-kin-200/50 rotate-3">
                    <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                </div>

                <h1 className="text-2xl font-extrabold text-warmgray-800 mb-2">
                    Welcome, {displayName}!
                </h1>
                <p className="text-warmgray-500 mb-8 text-sm">
                    Start by creating a family room or joining one with an invite code.
                </p>

                <div className="space-y-3">
                    <button
                        onClick={() => router.push('/create-room')}
                        className="w-full py-3.5 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 transition-all shadow-md shadow-kin-200/50 flex items-center justify-center gap-2"
                    >
                        <Plus size={18} />
                        Create a New Room
                    </button>
                    <button
                        onClick={() => router.push('/join-room')}
                        className="w-full py-3.5 bg-warmgray-100 text-warmgray-700 rounded-xl font-semibold hover:bg-warmgray-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <Link2 size={18} />
                        Join with Invite Code
                    </button>
                </div>
            </div>
        </div>
    );
}
