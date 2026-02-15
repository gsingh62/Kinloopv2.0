// components/DocsList.tsx — Production-grade document list
import { useEffect, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, Timestamp, orderBy, query } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { useRouter } from 'next/router';
import { Plus, FileText, Trash2, Search, Clock, ChevronRight } from 'lucide-react';

interface DocItem {
    id: string;
    title: string;
    content?: string;
    createdAt?: any;
    updatedAt?: any;
    createdBy?: string;
}

export default function DocsList({ roomId }: { roomId: string }) {
    const [docs, setDocs] = useState<DocItem[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const router = useRouter();

    // Real-time subscription
    useEffect(() => {
        if (!roomId) return;
        const q = query(collection(db, 'rooms', roomId, 'documents'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docsList = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DocItem));
            setDocs(docsList);
        });
        return () => unsubscribe();
    }, [roomId]);

    const handleCreateNewDoc = async () => {
        setCreating(true);
        try {
            const user = auth.currentUser;
            const newDoc = await addDoc(collection(db, 'rooms', roomId, 'documents'), {
                title: 'Untitled Document',
                content: '',
                createdAt: Timestamp.now(),
                updatedAt: Timestamp.now(),
                createdBy: user?.uid || '',
            });
            router.push(`/room/${roomId}/doc/${newDoc.id}`);
        } catch (err: any) {
            console.error('Failed to create document:', err);
            alert(`Failed to create document: ${err.message || 'Unknown error'}`);
        } finally {
            setCreating(false);
        }
    };

    const handleDeleteDoc = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        if (!confirm('Delete this document? This cannot be undone.')) return;
        setDeletingId(docId);
        try {
            await deleteDoc(doc(db, 'rooms', roomId, 'documents', docId));
        } catch (err: any) {
            console.error('Failed to delete document:', err);
            alert(`Failed to delete: ${err.message || 'Unknown error'}`);
        } finally {
            setDeletingId(null);
        }
    };

    const goToDoc = (docId: string) => {
        router.push(`/room/${roomId}/doc/${docId}`);
    };

    const formatDate = (timestamp: any): string => {
        if (!timestamp) return '';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const now = new Date();
            const diff = now.getTime() - date.getTime();
            const mins = Math.floor(diff / 60000);
            const hours = Math.floor(diff / 3600000);
            const days = Math.floor(diff / 86400000);

            if (mins < 1) return 'Just now';
            if (mins < 60) return `${mins}m ago`;
            if (hours < 24) return `${hours}h ago`;
            if (days < 7) return `${days}d ago`;
            return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        } catch {
            return '';
        }
    };

    const getPreview = (content?: string): string => {
        if (!content) return 'Empty document';
        // Strip HTML tags and get first 80 chars
        const text = content.replace(/<[^>]*>/g, '').trim();
        if (!text || text === 'Start writing...') return 'Empty document';
        return text.length > 80 ? text.substring(0, 80) + '...' : text;
    };

    const filteredDocs = searchQuery.trim()
        ? docs.filter(d =>
            d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            d.content?.replace(/<[^>]*>/g, '').toLowerCase().includes(searchQuery.toLowerCase())
        )
        : docs;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-warmgray-900">Documents</h2>
                <button
                    onClick={handleCreateNewDoc}
                    disabled={creating}
                    className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-colors"
                >
                    {creating ? (
                        <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                    ) : (
                        <Plus size={16} />
                    )}
                    New Doc
                </button>
            </div>

            {/* Search */}
            {docs.length > 3 && (
                <div className="relative mb-4">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-warmgray-400" />
                    <input
                        type="text"
                        placeholder="Search documents..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2.5 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 focus:border-transparent placeholder-warmgray-400"
                    />
                </div>
            )}

            {/* Document List */}
            {filteredDocs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-warmgray-400">
                    <FileText size={48} className="mb-3 opacity-50" />
                    {searchQuery ? (
                        <>
                            <p className="text-sm font-medium">No documents match "{searchQuery}"</p>
                            <button
                                onClick={() => setSearchQuery('')}
                                className="mt-2 text-sm text-kin-600 font-medium hover:text-kin-700"
                            >
                                Clear search
                            </button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-medium">No documents yet</p>
                            <button
                                onClick={handleCreateNewDoc}
                                className="mt-2 text-sm text-kin-600 font-medium hover:text-kin-700"
                            >
                                Create your first document
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="space-y-2">
                    {filteredDocs.map(d => (
                        <div
                            key={d.id}
                            onClick={() => goToDoc(d.id)}
                            className="group flex items-center gap-3 p-3.5 bg-white border border-warmgray-100 rounded-xl cursor-pointer hover:border-kin-100 hover:bg-kin-50/30 transition-all"
                        >
                            <div className="w-10 h-10 bg-kin-50 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-kin-100 transition-colors">
                                <FileText size={18} className="text-kin-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-warmgray-900 truncate">
                                    {d.title || 'Untitled'}
                                </p>
                                <div className="flex items-center gap-2 mt-0.5">
                                    {(d.updatedAt || d.createdAt) && (
                                        <span className="text-xs text-warmgray-400 flex items-center gap-1">
                                            <Clock size={10} />
                                            {formatDate(d.updatedAt || d.createdAt)}
                                        </span>
                                    )}
                                    <span className="text-xs text-warmgray-400 truncate">
                                        {getPreview(d.content)}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                    onClick={(e) => handleDeleteDoc(e, d.id)}
                                    disabled={deletingId === d.id}
                                    className="p-1.5 text-warmgray-300 hover:text-red-500 hover:bg-red-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                    title="Delete document"
                                >
                                    {deletingId === d.id ? (
                                        <div className="animate-spin h-4 w-4 border-2 border-red-400 border-t-transparent rounded-full" />
                                    ) : (
                                        <Trash2 size={15} />
                                    )}
                                </button>
                                <ChevronRight size={16} className="text-warmgray-300" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Count */}
            {docs.length > 0 && (
                <p className="text-xs text-warmgray-400 text-center mt-4">
                    {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
}
