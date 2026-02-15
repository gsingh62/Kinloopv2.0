// pages/index.tsx
import { useState } from 'react';
import { useRouter } from 'next/router';
import { login, signup, resetPassword } from '../lib/auth';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';
import type { UserCredential } from 'firebase/auth';
import ErrorBoundary from "../components/ErrorBoundary";

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');
    const [isLogin, setIsLogin] = useState(true);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showReset, setShowReset] = useState(false);
    const [resetStep, setResetStep] = useState<'email' | 'sent'>('email');
    const [resetEmail, setResetEmail] = useState('');
    const [resetLoading, setResetLoading] = useState(false);
    const [resetError, setResetError] = useState('');
    const router = useRouter();

    const openResetModal = () => {
        setShowReset(true);
        setResetStep('email');
        setResetEmail(email);
        setResetError('');
    };

    const handleSendResetEmail = async (e: React.FormEvent) => {
        e.preventDefault();
        setResetError('');
        setResetLoading(true);
        try {
            await resetPassword(resetEmail);
            setResetStep('sent');
        } catch (err: any) {
            switch (err.code) {
                case 'auth/invalid-email':
                    setResetError('Invalid email format.');
                    break;
                case 'auth/user-not-found':
                    setResetError('No account found with this email.');
                    break;
                default:
                    setResetError('Failed to send reset email. Please try again.');
            }
        } finally {
            setResetLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        let userCredential: UserCredential | null = null;

        try {
            if (isLogin) {
                userCredential = await login(email, password);
            } else {
                if (!fullName.trim()) {
                    setError('Please enter your full name.');
                    setLoading(false);
                    return;
                }
                userCredential = await signup(email, password, fullName);
            }
        } catch (err: any) {
            console.error('Auth error:', err);
            const code = err.code || '';
            switch (code) {
                case 'auth/invalid-email':
                    setError('Invalid email format.');
                    break;
                case 'auth/user-not-found':
                    setError('No user found with this email.');
                    break;
                case 'auth/wrong-password':
                    setError('Incorrect password.');
                    break;
                case 'auth/email-already-in-use':
                    setError('Email already in use.');
                    break;
                case 'auth/weak-password':
                    setError('Password should be at least 6 characters.');
                    break;
                case 'auth/invalid-credential':
                    setError('Invalid email or password.');
                    break;
                case 'auth/too-many-requests':
                    setError('Too many failed attempts. Please wait a moment and try again.');
                    break;
                case 'auth/network-request-failed':
                    setError('Network error. Please check your connection.');
                    break;
                default:
                    setError(`Login failed (${code || 'unknown'}): ${err.message || 'Please try again.'}`);
            }
            setLoading(false);
            return;
        }

        try {
            const userId = userCredential?.user?.uid;
            if (!userId) {
                router.push('/welcome');
                return;
            }

            const roomsRef = collection(db, 'rooms');
            const q = query(roomsRef, where('memberIds', 'array-contains', userId));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                router.push('/dashboard');
            } else {
                router.push('/welcome');
            }
        } catch (navError) {
            console.warn('Navigation query failed, going to welcome:', navError);
            router.push('/welcome');
        } finally {
            setLoading(false);
        }
    };

    return (
        <ErrorBoundary>
            <div className="min-h-screen w-full flex flex-col items-center justify-center bg-gradient-to-br from-kin-50 via-sand-50 to-kin-100 p-6">
                {/* Logo & Branding */}
                <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-kin-500 to-kin-600 rounded-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-kin-200/60 rotate-3 hover:rotate-0 transition-transform duration-300">
                        <svg viewBox="0 0 24 24" className="w-10 h-10 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                    </div>
                    <h1 className="text-3xl font-extrabold text-warmgray-800 tracking-tight">KinLoop</h1>
                    <p className="text-sm text-warmgray-500 mt-1.5 font-medium">Your family, always connected</p>
                </div>

                {/* Auth Card */}
                <div className="w-full max-w-sm bg-white/80 backdrop-blur-sm p-6 rounded-2xl shadow-xl shadow-kin-200/20 border border-kin-100/60">
                    <h2 className="text-xl font-bold text-center text-warmgray-800 mb-6">
                        {isLogin ? 'Welcome back' : 'Join the family'}
                    </h2>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div>
                                <input
                                    type="text"
                                    placeholder="Full Name"
                                    className="w-full px-4 py-3 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                    autoComplete="name"
                                />
                            </div>
                        )}
                        <div>
                            <input
                                type="email"
                                placeholder="Email"
                                className="w-full px-4 py-3 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                placeholder="Password"
                                className="w-full px-4 py-3 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete={isLogin ? 'current-password' : 'new-password'}
                            />
                        </div>

                        {isLogin && (
                            <div className="text-right -mt-1">
                                <button
                                    type="button"
                                    onClick={openResetModal}
                                    className="text-xs text-kin-500 font-medium hover:text-kin-700 transition-colors"
                                >
                                    Forgot password?
                                </button>
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
                                    {isLogin ? 'Logging in...' : 'Creating account...'}
                                </span>
                            ) : (
                                isLogin ? 'Log In' : 'Sign Up'
                            )}
                        </button>
                    </form>

                    <p className="text-sm text-center mt-5 text-warmgray-500">
                        {isLogin ? "Don't have an account?" : 'Already have an account?'}{' '}
                        <button
                            className="text-kin-500 font-semibold hover:text-kin-700 transition-colors"
                            onClick={() => { setIsLogin(!isLogin); setError(''); }}
                        >
                            {isLogin ? 'Sign Up' : 'Log In'}
                        </button>
                    </p>
                </div>

                {/* Tagline */}
                <p className="mt-6 text-xs text-warmgray-400 text-center">
                    Calendars, lists, chat & docs — all in one family space.
                </p>
            </div>

            {/* Password Reset Modal */}
            {showReset && (
                <div
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
                    onClick={() => setShowReset(false)}
                >
                    <div
                        className="w-full sm:max-w-sm bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl animate-slide-up"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="px-6 py-5">

                            {/* Step 1: Enter email */}
                            {resetStep === 'email' && (
                                <>
                                    <h3 className="text-lg font-bold text-warmgray-800 mb-1">Reset password</h3>
                                    <p className="text-sm text-warmgray-500 mb-5">
                                        Enter your email and we&apos;ll send you a link to reset your password.
                                    </p>
                                    <form onSubmit={handleSendResetEmail} className="space-y-4">
                                        <input
                                            type="email"
                                            placeholder="Email"
                                            value={resetEmail}
                                            onChange={e => setResetEmail(e.target.value)}
                                            required
                                            autoFocus
                                            className="w-full px-4 py-3 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent transition-all placeholder-warmgray-400"
                                        />
                                        {resetError && (
                                            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                                                <p className="text-red-600 text-sm">{resetError}</p>
                                            </div>
                                        )}
                                        <button
                                            type="submit"
                                            disabled={resetLoading}
                                            className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                                        >
                                            {resetLoading ? 'Sending...' : 'Send Reset Email'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowReset(false)}
                                            className="w-full py-2.5 text-sm text-warmgray-500 font-medium hover:text-warmgray-700 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                    </form>
                                </>
                            )}

                            {/* Step 2: Email sent — tap the link */}
                            {resetStep === 'sent' && (
                                <div className="text-center py-2">
                                    <div className="w-14 h-14 bg-kin-50 rounded-full flex items-center justify-center mx-auto mb-4">
                                        <svg className="w-7 h-7 text-kin-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <rect x="2" y="4" width="20" height="16" rx="2" />
                                            <path d="M22 7l-10 6L2 7" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-warmgray-800 mb-2">Check your email</h3>
                                    <p className="text-sm text-warmgray-500 mb-1">
                                        We sent a password reset link to
                                    </p>
                                    <p className="text-sm font-medium text-warmgray-700 mb-4">
                                        {resetEmail}
                                    </p>
                                    <div className="bg-kin-50/60 rounded-xl px-4 py-3 mb-5 text-left">
                                        <p className="text-xs text-warmgray-600 font-medium mb-2">How to reset:</p>
                                        <ol className="text-xs text-warmgray-500 space-y-1.5 list-decimal list-inside">
                                            <li>Open the email from KinLoop</li>
                                            <li>Tap the reset link in the email</li>
                                            <li>Set your new password on the page that opens</li>
                                            <li>Come back here and log in</li>
                                        </ol>
                                    </div>
                                    <p className="text-xs text-warmgray-400 mb-5">
                                        Don&apos;t see it? Check your spam folder.
                                    </p>
                                    <button
                                        onClick={() => { setShowReset(false); setPassword(''); }}
                                        className="w-full py-3 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl font-semibold hover:from-kin-600 hover:to-kin-700 transition-all"
                                    >
                                        Back to Login
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => { setResetStep('email'); setResetError(''); }}
                                        className="w-full py-2.5 mt-2 text-sm text-warmgray-500 font-medium hover:text-warmgray-700 transition-colors"
                                    >
                                        Resend email
                                    </button>
                                </div>
                            )}

                        </div>
                    </div>
                </div>
            )}
        </ErrorBoundary>
    );
}
