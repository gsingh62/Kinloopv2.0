// pages/_document.tsx — Custom document with PWA + mobile viewport support
import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
    return (
        <Html lang="en">
            <Head>
                {/* PWA Manifest */}
                <link rel="manifest" href="/manifest.json" />

                {/* Theme color for browser chrome */}
                <meta name="theme-color" content="#E8725C" />

                {/* Apple PWA meta tags */}
                <meta name="apple-mobile-web-app-capable" content="yes" />
                <meta name="apple-mobile-web-app-status-bar-style" content="default" />
                <meta name="apple-mobile-web-app-title" content="KinLoop" />
                <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

                {/* Standard favicon */}
                <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
            </Head>
            <body>
                <Main />
                <NextScript />
            </body>
        </Html>
    );
}
