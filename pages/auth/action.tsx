// pages/auth/action.tsx — Custom Firebase Action Handler (branded reset page)
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { verifyResetCode, confirmReset } from '../../lib/auth';
import ErrorBoundary from '../../components/ErrorBoundary';
import { Eye, EyeOff } from 'lucide-react';

type ActionMode = 'resetPassword' | 'verifyEmail' | 'recoverEmail' | null;
type PageState = 'loading' | 'form' | 'success' | 'error';

export default function AuthActionPage() {
    const router = useRouter();
    const [mode, setMode] = useState<ActionMode>(null);
    const [oobCode, setOobCode] = useState('');
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [pageState, setPageState] = useState<PageState>('loading');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    // Parse URL params on mount
    useEffect(() => {
        if (!router.isReady) return;
        const { mode: m, oobCode: code } = router.query;
        const modeStr = typeof m === 'string' ? m : null;
        const codeStr = typeof code === 'string' ? code : '';

        setMode(modeStr as ActionMode);
        setOobCode(codeStr);

        if (modeStr === 'resetPassword' && codeStr) {
            verifyResetCode(codeStr)
                .then(userEmail => {
                    setEmail(userEmail);
                    setPageState('form');
                })
                .catch(() => {
                    setError('This password reset code is invalid or has expired. Please request a new one.');
                    setPageState('error');
                });
        } else {
            setError('Invalid action link.');
            setPageState('error');
        }
    }, [router.isReady, router.query]);

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (newPassword.length < 6) {
            setError('Password must be at least 6 characters.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        setLoading(true);
        try {
            await confirmReset(oobCode, newPassword);
            setPageState('success');
        } catch (err: any) {
            switch (err.code) {
                case 'auth/weak-password':
                    setError('Password is too weak. Use at least 6 characters.');
                    break;
                case 'auth/expired-action-code':
                    setError('This reset code has expired. Please request a new one.');
                    break;
                case 'auth/invalid-action-code':
                    setError('This reset code is invalid. It may have already been used.');
                    break;
                default:
                    setError('Failed to reset password. Please try again.');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <ErrorBoundary>
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-kin-50 via-sand-50 to-kin-100 p-6">
                {/* Logo */}
                <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-gradient-to-br from-kin-500 to-kin-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-kin-200/60">
                        <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-extrabold text-warmgray-800 tracking-tight">KinLoop</h1>
                </div>

                {/* Card */}
                <div className="w-full max-w-sm bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-xl shadow-kin-200/20 border border-kin-100/60">

                    {/* ─── Loading State ─── */}
                    {pageState === 'loading' && (
                        <div className="flex flex-col items-center py-8">
                            <div className="animate-spin h-8 w-8 border-2 border-kin-500 border-t-transparent rounded-full mb-4" />
                            <p className="text-sm text-warmgray-500">Verifying your reset code...</p>
                        </div>
                    )}

                    {/* ─── Reset Form ─── */}
                    {pageState === 'form' && (
                        <>
                            <div className="text-center mb-6">
                                <div className="w-12 h-12 bg-kin-50 rounded-full flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-6 h-6 text-kin-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                    </svg>
                                </div>
                                <h2 className="text-xl font-bold text-warmgray-800">Set new password</h2>
                                <p className="text-sm text-warmgray-500 mt-1">
                                    for <span className="font-medium text-warmgray-700">{email}</span>
                                </p>
                            </div>

                            <form onSubmit={handleResetPassword} className="space-y-4">
                                <div className="relative">
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="New password"
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        required
                                        autoFocus
                                        minLength={6}
                                        className="w-full px-4 py-3 pr-11 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-warmgray-400 hover:text-warmgray-600"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>

                                <div>
                                    <input
                                        type={showPassword ? 'text' : 'password'}
                                        placeholder="Confirm new password"
                                        value={confirmPassword}
                                        onChange={e => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        className="w-full px-4 py-3 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                    />
                                </div>

                                {/* Password strength hint */}
                                {newPassword.length > 0 && (
                                    <div className="flex items-center gap-2">
                                        <div className="flex gap-1 flex-1">
                                            {[1, 2, 3, 4].map(i => (
                                                <div
                                                    key={i}
                                                    className={`h-1 flex-1 rounded-full transition-colors ${
                                                        newPassword.length >= i * 3
                                                            ? newPassword.length >= 10
                                                                ? 'bg-sage-400'
                                                                : newPassword.length >= 6
                                                                    ? 'bg-sand-300'
                                                                    : 'bg-kin-400'
                                                            : 'bg-warmgray-200'
                                                    }`}
                                                />
                                            ))}
                                        </div>
                                        <span className={`text-xs font-medium ${
                                            newPassword.length >= 10
                                                ? 'text-sage-500'
                                                : newPassword.length >= 6
                                                    ? 'text-sand-500'
                                                    : 'text-kin-500'
                                        }`}>
                                            {newPassword.length >= 10 ? 'Strong' : newPassword.length >= 6 ? 'Good' : 'Too short'}
                                        </span>
                                    </div>
                                )}

                                {error && (
                                    <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                                        <p className="text-red-600 text-sm">{error}</p>
                                    </div>
                                )}

                                <button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 active:from-kin-700 active:to-kin-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-kin-200/50"
                                >
                                    {loading ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                            </svg>
                                            Updating password...
                                        </span>
                                    ) : (
                                        'Update Password'
                                    )}
                                </button>
                            </form>
                        </>
                    )}

                    {/* ─── Success State ─── */}
                    {pageState === 'success' && (
                        <div className="text-center py-4">
                            <div className="w-14 h-14 bg-sage-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-sage-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-warmgray-800 mb-1">Password updated!</h2>
                            <p className="text-sm text-warmgray-500 mb-6">
                                Your password has been changed successfully. You can now log in with your new password.
                            </p>
                            <button
                                onClick={() => router.push('/')}
                                className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 transition-all shadow-md shadow-kin-200/50"
                            >
                                Go to Login
                            </button>
                        </div>
                    )}

                    {/* ─── Error State ─── */}
                    {pageState === 'error' && (
                        <div className="text-center py-4">
                            <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                </svg>
                            </div>
                            <h2 className="text-xl font-bold text-warmgray-800 mb-1">Code expired</h2>
                            <p className="text-sm text-warmgray-500 mb-6">{error}</p>
                            <button
                                onClick={() => router.push('/')}
                                className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 transition-all shadow-md shadow-kin-200/50"
                            >
                                Back to Login
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="mt-6 text-xs text-warmgray-400 text-center">
                    Calendars, lists, chat & docs — all in one family space.
                </p>
            </div>
        </ErrorBoundary>
    );
}
