// components/Layout.tsx
import { ReactNode } from 'react';

interface LayoutProps {
    children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
    return (
        <div className="min-h-screen flex flex-col">
            <header className="bg-white shadow p-4 text-xl font-semibold">KinLoop</header>
            <main className="flex-1 p-4">{children}</main>
            <footer className="bg-gray-100 text-center p-2 text-sm text-gray-500">
                © {new Date().getFullYear()} KinLoop
            </footer>
        </div>
    );
}
