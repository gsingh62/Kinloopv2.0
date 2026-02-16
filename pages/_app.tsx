// pages/_app.tsx
import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useEffect } from 'react';
import ErrorBoundary from "../components/ErrorBoundary";

function MyApp({ Component, pageProps }: AppProps) {
    // Register service worker for PWA
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js').catch(() => {
                // Service worker registration failed — not critical
            });
        }
    }, []);

    // Subscribe to push notifications when a user is logged in
    useEffect(() => {
        let unsubscribe: (() => void) | undefined;
        async function setup() {
            const { auth } = await import('../lib/firebase');
            const { onAuthStateChanged } = await import('firebase/auth');
            const { subscribeToPush } = await import('../lib/pushUtils');
            unsubscribe = onAuthStateChanged(auth, (user) => {
                if (user) {
                    subscribeToPush();
                }
            });
        }
        setup();
        return () => { unsubscribe?.(); };
    }, []);

    return (
        <ErrorBoundary>
            <Head>
                <meta
                    name="viewport"
                    content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
                />
            </Head>
            <Component {...pageProps} />
        </ErrorBoundary>
    );
}

export default MyApp;
