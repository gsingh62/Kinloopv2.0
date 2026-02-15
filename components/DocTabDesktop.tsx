// components/DocTabDesktop.tsx — Full-width editor with inline comment bubbles
import { useEditor, EditorContent, NodeViewWrapper } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { useCallback, useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';
import { ReactNodeViewRenderer } from '@tiptap/react';
import debounce from 'lodash.debounce';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    Timestamp,
    doc,
    deleteDoc,
    updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CommentHighlight } from '../extensions/CommentHighlight';
import { Trash2, Check, Loader2, X, Pencil, MessageSquarePlus } from 'lucide-react';
import { relativeTime } from '../utils/relativeTime';

// ─── Custom Image with resize ───
const CustomImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            src: { default: null },
            alt: { default: null },
            title: { default: null },
            width: { default: 'auto' },
            height: { default: 'auto' },
            caption: { default: '' },
        };
    },
    addNodeView() {
        return ReactNodeViewRenderer(ImageComponent);
    },
});

const ImageComponent = (props: any) => {
    const { node, updateAttributes } = props;
    const { src, alt, title, width, height, caption } = node.attrs;
    const containerRef = useRef<HTMLDivElement>(null);
    const [isResizing, setIsResizing] = useState(false);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isResizing && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const newWidth = e.clientX - rect.left;
                updateAttributes({ width: `${Math.max(50, newWidth)}px` });
            }
        };
        const stopResize = () => setIsResizing(false);
        if (isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', stopResize);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', stopResize);
        };
    }, [isResizing, updateAttributes]);

    return (
        <NodeViewWrapper className="my-4">
            <figure ref={containerRef} className="relative inline-block group">
                <img src={src} alt={alt} title={title} style={{ maxWidth: '100%', width, height }} contentEditable={false} className="border rounded-lg" />
                <div className="absolute bottom-1 right-1 w-4 h-4 bg-blue-500 rounded-sm cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity" onMouseDown={(e) => { e.preventDefault(); setIsResizing(true); }} />
                <figcaption className="text-sm italic text-center text-gray-500 mt-1">
                    <input className="w-full border-none bg-transparent text-center focus:outline-none text-sm" placeholder="Add a caption..." value={caption || ''} onChange={(e) => updateAttributes({ caption: e.target.value })} />
                </figcaption>
            </figure>
        </NodeViewWrapper>
    );
};

// ─── Types ───
interface Comment {
    id: string;
    authorId: string;
    authorName: string;
    content: string;
    createdAt: Timestamp;
    anchorText: string;
    position: { from: number; to: number };
}

interface DocTabDesktopProps {
    content: string;          // Initial content — loaded once, NOT a live-updating prop
    setContent: (html: string) => void;  // Callback to keep parent ref in sync
    saveContent: (html: string) => Promise<void>;
    roomId: string;
    docId: string;
    currentUser: any;
}

export default function DocTabDesktop({ content, setContent, saveContent, roomId, docId, currentUser }: DocTabDesktopProps) {
    const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'idle'>('idle');
    const [selectedText, setSelectedText] = useState('');
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState<Comment[]>([]);
    const [savedRange, setSavedRange] = useState<{ from: number; to: number } | null>(null);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [bubblePos, setBubblePos] = useState<{ top: number; left: number } | null>(null);
    const [selectionBtnPos, setSelectionBtnPos] = useState<{ top: number; left: number } | null>(null);
    const [showCommentForm, setShowCommentForm] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const bubbleRef = useRef<HTMLDivElement>(null);
    const selectionBtnRef = useRef<HTMLDivElement>(null);
    // Flag to suppress debounced save when editor is being programmatically updated
    const suppressSaveRef = useRef(false);
    // Flag to prevent saves during remote content updates
    const isReceivingRemoteRef = useRef(false);
    // Track the last HTML we saved to Firestore (to detect remote vs self changes)
    const lastSavedHtmlRef = useRef(content);

    const activeComment = activeCommentId ? comments.find(c => c.id === activeCommentId) || null : null;

    const debouncedSave = useCallback(
        debounce((html: string) => {
            lastSavedHtmlRef.current = html;
            setSaveStatus('saving');
            saveContent(html);
            setTimeout(() => setSaveStatus('saved'), 600);
            setTimeout(() => setSaveStatus('idle'), 2500);
        }, 1500),
        [saveContent]
    );

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [
            StarterKit,
            CustomImage,
            CommentHighlight,
            TextStyle,
            FontFamily,
            Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-blue-600 underline cursor-pointer' } }),
        ],
        content,
        editorProps: {
            attributes: {
                class: 'prose prose-sm sm:prose max-w-none focus:outline-none min-h-[500px] p-5',
            },
        },
        onUpdate: ({ editor }) => {
            if (suppressSaveRef.current) {
                suppressSaveRef.current = false;
                return;
            }
            if (isReceivingRemoteRef.current) return;
            const html = editor.getHTML();
            setContent(html);
            debouncedSave(html);
        },
    });

    // ─── Real-time document sync ───
    useEffect(() => {
        if (!roomId || !docId || !editor) return;
        const docRef = doc(db, 'rooms', roomId, 'documents', docId);
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            const data = snapshot.data();
            if (!data?.content) return;
            const remoteHtml = data.content as string;

            // If this matches what we last saved, it's our own save — skip
            if (remoteHtml === lastSavedHtmlRef.current) return;

            // Remote change detected — update editor while preserving cursor
            lastSavedHtmlRef.current = remoteHtml;

            // Save cursor position
            const { from, to } = editor.state.selection;

            // Update content without triggering a save
            isReceivingRemoteRef.current = true;
            editor.commands.setContent(remoteHtml, false);
            isReceivingRemoteRef.current = false;

            // Restore cursor (clamp to new document size)
            const maxPos = editor.state.doc.content.size;
            try {
                editor.commands.setTextSelection({
                    from: Math.min(from, maxPos),
                    to: Math.min(to, maxPos),
                });
            } catch {
                // If position is invalid after content change, move to end
                editor.commands.setTextSelection(maxPos);
            }

            setContent(remoteHtml);
        });
        return () => unsubscribe();
    }, [roomId, docId, editor, setContent]);

    // Subscribe to comments
    useEffect(() => {
        if (!roomId || !docId) return;
        const q = query(collection(db, 'rooms', roomId, 'documents', docId, 'comments'), orderBy('createdAt'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as Omit<Comment, 'id'>) }));
            setComments(docs);
        });
        return () => unsubscribe();
    }, [roomId, docId]);

    // Clamp bubble to viewport
    const clampToViewport = (top: number, left: number, width: number, height: number) => {
        const pad = 12;
        const clampedLeft = Math.max(pad, Math.min(left, window.innerWidth - width - pad));
        let clampedTop = top;
        if (top + height > window.innerHeight - pad) clampedTop = top - height - 16;
        if (clampedTop < pad) clampedTop = pad;
        return { top: clampedTop, left: clampedLeft };
    };

    // Detect click on comment highlight
    useEffect(() => {
        if (!editor) return;
        const handleClick = (event: MouseEvent) => {
            const target = event.target as HTMLElement;
            if (bubbleRef.current && bubbleRef.current.contains(target)) return;
            if (selectionBtnRef.current && selectionBtnRef.current.contains(target)) return;

            const commentSpan = target.closest('span[data-comment-id]') as HTMLElement | null;
            if (commentSpan) {
                const commentId = commentSpan.getAttribute('data-comment-id');
                const match = comments.find(c => c.id === commentId);
                if (match) {
                    const rect = commentSpan.getBoundingClientRect();
                    const clamped = clampToViewport(rect.bottom + 8, rect.left + rect.width / 2 - 144, 288, 220);
                    setBubblePos(clamped);
                    setActiveCommentId(match.id);
                    setIsEditing(false);
                    setSelectionBtnPos(null);
                    setShowCommentForm(false);
                    setSelectedText('');
                    return;
                }
            }
            setActiveCommentId(null);
            setBubblePos(null);
            setIsEditing(false);
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [editor, comments]);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setActiveCommentId(null);
                setBubblePos(null);
                setSelectionBtnPos(null);
                setShowCommentForm(false);
                setIsEditing(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    // Clean up orphaned comments (only if editor has content loaded)
    useEffect(() => {
        if (!editor || !comments.length) return;
        const checkRemovedComments = async () => {
            const presentIds: string[] = [];
            editor.state.doc.descendants((node: any) => {
                node.marks?.forEach((mark: any) => {
                    if (mark.type.name === 'commentHighlight' && mark.attrs.commentId) {
                        presentIds.push(mark.attrs.commentId);
                    }
                });
                return true;
            });
            const toDelete = comments.filter(c => !presentIds.includes(c.id));
            await Promise.all(
                toDelete.map(c => deleteDoc(doc(db, 'rooms', roomId, 'documents', docId, 'comments', c.id)))
            );
        };
        const debouncedCheck = debounce(checkRemovedComments, 3000);
        editor.on('update', debouncedCheck);
        return () => { editor.off('update', debouncedCheck); debouncedCheck.cancel(); };
    }, [editor, comments, roomId, docId]);

    // Text selection → show "Comment" button
    const handleTextSelection = () => {
        if (!editor) return;
        const { from, to } = editor.state.selection;
        if (from !== to) {
            const selected = editor.state.doc.textBetween(from, to);
            setSelectedText(selected);
            setSavedRange({ from, to });
            const domSelection = window.getSelection();
            if (domSelection && domSelection.rangeCount > 0) {
                const range = domSelection.getRangeAt(0);
                const rect = range.getBoundingClientRect();
                const clamped = clampToViewport(rect.bottom + 6, rect.left + rect.width / 2 - 55, 110, 36);
                setSelectionBtnPos(clamped);
                setShowCommentForm(false);
            }
        } else {
            setSelectedText('');
            setSavedRange(null);
            setSelectionBtnPos(null);
            setShowCommentForm(false);
        }
    };

    const openCommentForm = () => {
        if (!selectionBtnPos) return;
        const clamped = clampToViewport(selectionBtnPos.top, selectionBtnPos.left - 89, 288, 180);
        setSelectionBtnPos(clamped);
        setShowCommentForm(true);
    };

    const handleAddComment = async () => {
        if (!commentText.trim() || !savedRange || !editor) return;
        const anchorText = editor.state.doc.textBetween(savedRange.from, savedRange.to);
        try {
            const docRef = await addDoc(collection(db, 'rooms', roomId, 'documents', docId, 'comments'), {
                authorId: currentUser?.uid || '',
                authorName: currentUser?.displayName || currentUser?.email || 'Anonymous',
                content: commentText.trim(),
                createdAt: Timestamp.now(),
                anchorText,
                position: savedRange,
            });
            suppressSaveRef.current = true;
            editor.commands.setTextSelection(savedRange);
            editor.commands.setMark('commentHighlight', { commentId: docRef.id });
            editor.commands.setTextSelection(savedRange.to);
            editor.commands.unsetMark('commentHighlight');

            const html = editor.getHTML();
            setContent(html);
            lastSavedHtmlRef.current = html;
            debouncedSave.cancel();
            await saveContent(html);
        } catch (err: any) {
            console.error('Failed to add comment:', err);
        }
        setCommentText('');
        setSelectedText('');
        setSavedRange(null);
        setSelectionBtnPos(null);
        setShowCommentForm(false);
    };

    const handleEditComment = async () => {
        if (!activeComment || !editText.trim()) return;
        try {
            const ref = doc(db, 'rooms', roomId, 'documents', docId, 'comments', activeComment.id);
            await updateDoc(ref, { content: editText.trim() });
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to edit comment:', err);
        }
    };

    const handleDeleteComment = async (commentId: string) => {
        try {
            await deleteDoc(doc(db, 'rooms', roomId, 'documents', docId, 'comments', commentId));
            if (editor) {
                suppressSaveRef.current = true;
                editor.state.doc.descendants((node: any, pos: number) => {
                    node.marks?.forEach((mark: any) => {
                        if (mark.type.name === 'commentHighlight' && mark.attrs.commentId === commentId) {
                            editor.commands.setTextSelection({ from: pos, to: pos + node.nodeSize });
                            editor.commands.unsetMark('commentHighlight');
                        }
                    });
                    return true;
                });
                const html = editor.getHTML();
                setContent(html);
                lastSavedHtmlRef.current = html;
                debouncedSave.cancel(); // Kill any pending auto-save that has stale HTML with the old mark
                await saveContent(html);
            }
            setActiveCommentId(null);
            setBubblePos(null);
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to delete comment:', err);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 w-full">
            {/* Save Status */}
            <div className="flex items-center justify-end px-4 py-1.5 border-b border-gray-100 bg-gray-50/50">
                <div className="flex items-center gap-1.5 text-xs text-gray-400">
                    {saveStatus === 'saving' && (<><Loader2 size={12} className="animate-spin" /><span>Saving...</span></>)}
                    {saveStatus === 'saved' && (<><Check size={12} className="text-green-500" /><span className="text-green-600">Saved</span></>)}
                    {saveStatus === 'idle' && <span>Auto-save enabled</span>}
                </div>
            </div>

            {/* Toolbar */}
            <div className="px-4 pt-3">
                {editor && <Toolbar editor={editor} />}
            </div>

            {/* Editor */}
            <div ref={editorWrapperRef} className="flex-1 overflow-y-auto px-4 pb-8" onMouseUp={handleTextSelection} onKeyUp={handleTextSelection}>
                <EditorContent editor={editor} className="min-h-[500px]" />
            </div>

            {/* Selection: "Comment" button → full form */}
            {selectionBtnPos && selectedText && !activeCommentId && (
                <div ref={selectionBtnRef} className="fixed z-[9999] animate-scale-in" style={{ top: selectionBtnPos.top, left: selectionBtnPos.left }} onMouseDown={(e) => e.stopPropagation()}>
                    {!showCommentForm ? (
                        <button onClick={openCommentForm} className="flex items-center gap-1.5 px-3 py-2 bg-white rounded-lg shadow-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                            <MessageSquarePlus size={14} className="text-blue-600" />
                            <span>Comment</span>
                        </button>
                    ) : (
                        <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-3 w-72">
                            <p className="text-xs text-gray-500 mb-1.5">Comment on:</p>
                            <p className="text-xs text-gray-700 font-medium italic mb-2 line-clamp-2">&ldquo;{selectedText}&rdquo;</p>
                            <textarea className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none placeholder-gray-400" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Write a comment..." rows={2} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleAddComment(); } }} />
                            <div className="flex items-center justify-between mt-2">
                                <span className="text-[10px] text-gray-400">Cmd+Enter to submit</span>
                                <div className="flex gap-2">
                                    <button className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors" onClick={() => { setSelectionBtnPos(null); setShowCommentForm(false); setCommentText(''); }}>Cancel</button>
                                    <button className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors" disabled={!commentText.trim()} onClick={handleAddComment}>Comment</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Comment Bubble */}
            {activeComment && bubblePos && (
                <div ref={bubbleRef} className="fixed z-[9999] animate-scale-in" style={{ top: bubblePos.top, left: bubblePos.left }} onMouseDown={(e) => e.stopPropagation()}>
                    <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-72 overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                            <div className="flex items-center gap-2 min-w-0">
                                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                    <span className="text-xs font-semibold text-blue-700">{(activeComment.authorName || 'A').charAt(0).toUpperCase()}</span>
                                </div>
                                <span className="text-sm font-medium text-gray-800 truncate">{activeComment.authorName || 'Anonymous'}</span>
                            </div>
                            <button onClick={() => { setActiveCommentId(null); setBubblePos(null); setIsEditing(false); }} className="p-0.5 rounded hover:bg-gray-200 transition-colors flex-shrink-0">
                                <X size={14} className="text-gray-400" />
                            </button>
                        </div>
                        <div className="px-3 py-3">
                            <p className="text-[11px] text-gray-400 italic mb-2 line-clamp-1">on &ldquo;{activeComment.anchorText}&rdquo;</p>
                            {isEditing ? (
                                <div>
                                    <textarea className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none" value={editText} onChange={(e) => setEditText(e.target.value)} rows={3} autoFocus onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleEditComment(); } }} />
                                    <div className="flex items-center justify-between mt-2">
                                        <span className="text-[10px] text-gray-400">Cmd+Enter to save</span>
                                        <div className="flex gap-2">
                                            <button className="px-2.5 py-1 text-xs text-gray-500 hover:text-gray-700 transition-colors" onClick={() => setIsEditing(false)}>Cancel</button>
                                            <button className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors" disabled={!editText.trim()} onClick={handleEditComment}>Save</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm text-gray-800 leading-relaxed">{activeComment.content}</p>
                            )}
                        </div>
                        <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-t border-gray-100">
                            <div className="flex flex-col">
                                <span className="text-[11px] text-gray-500 font-medium">{relativeTime(activeComment.createdAt?.toDate?.())}</span>
                                <span className="text-[10px] text-gray-400">{activeComment.createdAt?.toDate?.().toLocaleString?.() || ''}</span>
                            </div>
                            <div className="flex items-center gap-1">
                                {!isEditing && (
                                    <button onClick={() => { setIsEditing(true); setEditText(activeComment.content); }} className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded-md transition-colors" title="Edit comment">
                                        <Pencil size={12} /><span>Edit</span>
                                    </button>
                                )}
                                <button onClick={() => handleDeleteComment(activeComment.id)} className="flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors" title="Delete comment">
                                    <Trash2 size={12} /><span>Delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
