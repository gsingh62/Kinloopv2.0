// components/DocTabMobile.tsx — Mobile document editor with inline comment bubbles
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useCallback, useEffect, useRef, useState } from 'react';
import Toolbar from './Toolbar';
import debounce from 'lodash.debounce';
import {
    collection,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    Timestamp,
    doc,
    getDoc,
    deleteDoc,
    updateDoc
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { CommentHighlight } from '../extensions/CommentHighlight';
import TextStyle from '@tiptap/extension-text-style';
import FontFamily from '@tiptap/extension-font-family';
import { useRouter } from 'next/router';
import { breakOutOfCommentMark } from '../utils/breakOutOfComment';
import { relativeTime } from '../utils/relativeTime';
import { Trash2, X, Pencil, MessageSquarePlus } from 'lucide-react';

function getAllCommentIdsInDoc(editor: any): string[] {
    const ids: string[] = [];
    editor?.state.doc.descendants((node: any) => {
        if (node.marks) {
            node.marks.forEach((mark: any) => {
                if (mark.type.name === 'commentHighlight' && mark.attrs.commentId) {
                    ids.push(mark.attrs.commentId);
                }
            });
        }
        return true;
    });
    return ids;
}

export default function DocTabMobile({ content, setContent, saveContent, roomId, docId, currentUser }: any) {
    const router = useRouter();
    const [selectedText, setSelectedText] = useState('');
    const [commentText, setCommentText] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [savedRange, setSavedRange] = useState<{ from: number; to: number } | null>(null);
    const [docTitle, setDocTitle] = useState('');
    const [isCommenting, setIsCommenting] = useState(false);
    const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
    const [showBubble, setShowBubble] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const [showSelectionBar, setShowSelectionBar] = useState(false);
    const [keyboardOffset, setKeyboardOffset] = useState(0);
    const suppressSaveRef = useRef(false);
    // Flag to prevent saves during remote content updates
    const isReceivingRemoteRef = useRef(false);
    // Track the last HTML we saved to Firestore (to detect remote vs self changes)
    const lastSavedHtmlRef = useRef(content);
    const editorContainerRef = useRef<HTMLDivElement>(null);

    const activeComment = activeCommentId ? comments.find((c: any) => c.id === activeCommentId) || null : null;

    // Track keyboard height via VisualViewport API
    useEffect(() => {
        const vv = typeof window !== 'undefined' ? window.visualViewport : null;
        if (!vv) return;
        const update = () => {
            // Difference between full window and visual viewport = keyboard height
            const kb = window.innerHeight - vv.height;
            setKeyboardOffset(kb > 50 ? kb : 0); // ignore tiny diffs
        };
        vv.addEventListener('resize', update);
        vv.addEventListener('scroll', update);
        update();
        return () => {
            vv.removeEventListener('resize', update);
            vv.removeEventListener('scroll', update);
        };
    }, []);

    const debouncedSave = useCallback(
        debounce((html: string) => {
            lastSavedHtmlRef.current = html;
            saveContent(html);
        }, 1500),
        [saveContent]
    );

    const editor = useEditor({
        immediatelyRender: false,
        extensions: [StarterKit, CommentHighlight, TextStyle, FontFamily],
        content,
        editorProps: {
            attributes: {
                class: 'prose max-w-none focus:outline-none min-h-[300px] p-4',
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
        onCreate: ({ editor }) => {
            const d = editor.state.doc;
            const endPos = d.content.size;
            editor.commands.setTextSelection(endPos);
            const resolved = d.resolve(Math.max(0, endPos - 1));
            const marksAtEnd = resolved.marks();
            const hasComment = marksAtEnd.some(mark => mark.type.name === 'commentHighlight');
            if (hasComment) {
                breakOutOfCommentMark(editor, endPos);
            }
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
                editor.commands.setTextSelection(maxPos);
            }

            setContent(remoteHtml);
        });
        return () => unsubscribe();
    }, [roomId, docId, editor, setContent]);

    // ─── Track text selection and show floating "Comment" bar ───
    useEffect(() => {
        if (!editor) return;
        const handleSelectionUpdate = () => {
            const { from, to } = editor.state.selection;
            if (from !== to && !isCommenting && !showBubble) {
                const text = editor.state.doc.textBetween(from, to);
                setSelectedText(text);
                setSavedRange({ from, to });
                setShowSelectionBar(true);
            } else if (from === to) {
                // Small delay so tapping "Comment" button doesn't immediately clear
                setTimeout(() => {
                    if (!isCommenting) {
                        setShowSelectionBar(false);
                    }
                }, 200);
            }
        };
        editor.on('selectionUpdate', handleSelectionUpdate);
        return () => { editor.off('selectionUpdate', handleSelectionUpdate); };
    }, [editor, isCommenting, showBubble]);

    // ─── Also detect selection via touch events (iOS Safari) ───
    useEffect(() => {
        if (!editor || !editorContainerRef.current) return;
        const el = editorContainerRef.current;
        const handleTouchEnd = () => {
            // Small delay to let iOS finalize the selection
            setTimeout(() => {
                if (!editor) return;
                const { from, to } = editor.state.selection;
                if (from !== to && !isCommenting && !showBubble) {
                    const text = editor.state.doc.textBetween(from, to);
                    setSelectedText(text);
                    setSavedRange({ from, to });
                    setShowSelectionBar(true);
                }
            }, 100);
        };
        el.addEventListener('touchend', handleTouchEnd, { passive: true });
        return () => el.removeEventListener('touchend', handleTouchEnd);
    }, [editor, isCommenting, showBubble]);

    // ─── Start commenting (uses saved range, NOT live selection) ───
    const handleStartComment = () => {
        if (!editor || !savedRange || !selectedText) return;
        setIsCommenting(true);
        setShowSelectionBar(false);
        // Blur editor to dismiss keyboard so comment input can take focus
        editor.commands.blur();
    };

    const handleAddComment = async () => {
        if (!commentText.trim() || !savedRange || !editor) return;
        const anchorText = editor.state.doc.textBetween(savedRange.from, savedRange.to);
        const docRef = await addDoc(collection(db, 'rooms', roomId, 'documents', docId, 'comments'), {
            authorId: currentUser.uid,
            authorName: currentUser.displayName || currentUser.email || 'Anonymous',
            content: commentText.trim(),
            createdAt: Timestamp.now(),
            anchorText,
            position: savedRange,
        });

        suppressSaveRef.current = true;
        editor.commands.setTextSelection({ from: savedRange.from, to: savedRange.to });
        editor.commands.setMark('commentHighlight', { commentId: docRef.id });
        breakOutOfCommentMark(editor, savedRange.to);

        const html = editor.getHTML();
        setContent(html);
        lastSavedHtmlRef.current = html;
        debouncedSave.cancel();
        await saveContent(html);

        setCommentText('');
        setSelectedText('');
        setSavedRange(null);
        setIsCommenting(false);
        setShowSelectionBar(false);
    };

    // ─── Subscribe to comments ───
    useEffect(() => {
        if (!roomId || !docId) return;
        const q = query(collection(db, 'rooms', roomId, 'documents', docId, 'comments'), orderBy('createdAt'));
        const unsubscribe = onSnapshot(q, snapshot => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
            setComments(docs);
        });
        const fetchTitle = async () => {
            const docRef = doc(db, 'rooms', roomId, 'documents', docId);
            const snap = await getDoc(docRef);
            if (snap.exists()) {
                const data = snap.data();
                if (data?.title) setDocTitle(data.title);
            }
        };
        fetchTitle();
        return () => unsubscribe();
    }, [roomId, docId]);

    // ─── Detect tap on comment highlight ───
    useEffect(() => {
        if (!editor || !comments.length) return;

        const handleClick = (event: Event) => {
            const target = event.target as HTMLElement;
            const commentSpan = target.closest?.('span[data-comment-id]') as HTMLElement | null;
            if (commentSpan) {
                const commentId = commentSpan.getAttribute('data-comment-id');
                const match = comments.find(c => c.id === commentId);
                if (match) {
                    // Blur editor FIRST to dismiss keyboard, then show bubble
                    editor.commands.blur();
                    setActiveCommentId(match.id);
                    setShowBubble(true);
                    setShowSelectionBar(false);
                    event.preventDefault();
                    event.stopPropagation();
                }
            }
        };

        const editorEl = editorContainerRef.current;
        if (editorEl) {
            editorEl.addEventListener('click', handleClick, true);
            return () => editorEl.removeEventListener('click', handleClick, true);
        }
    }, [editor, comments]);

    // ─── Clean up orphaned comments ───
    useEffect(() => {
        if (!editor || !comments.length) return;
        const checkRemovedComments = async () => {
            const presentIds = getAllCommentIdsInDoc(editor);
            const toDelete = comments.filter(comment => !presentIds.includes(comment.id));
            await Promise.all(
                toDelete.map(comment => deleteDoc(doc(db, 'rooms', roomId, 'documents', docId, 'comments', comment.id)))
            );
        };
        const debouncedCheck = debounce(checkRemovedComments, 3000);
        editor.on('update', debouncedCheck);
        return () => { editor.off('update', debouncedCheck); debouncedCheck.cancel(); };
    }, [editor, comments, roomId, docId]);

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
                debouncedSave.cancel();
                await saveContent(html);
            }
            setActiveCommentId(null);
            setShowBubble(false);
            setIsEditing(false);
        } catch (err) {
            console.error('Failed to delete comment:', err);
        }
    };

    const dismissBubble = () => {
        setShowBubble(false);
        setActiveCommentId(null);
        setIsEditing(false);
    };

    return (
        <div className="w-full h-[100dvh] flex flex-col bg-white overflow-hidden">
            {/* Top Bar */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b shadow-sm flex-shrink-0">
                <button onClick={() => router.push(`/room/${roomId}`)} className="text-blue-600 text-sm font-medium">&larr; Back</button>
                <button
                    onClick={async () => {
                        if (editor) {
                            await saveContent(editor.getHTML());
                        }
                        router.push(`/room/${roomId}`);
                    }}
                    className="text-sm text-blue-600 font-medium"
                >
                    Save & Exit
                </button>
            </div>

            {/* Editable Title */}
            <input
                className="text-lg font-semibold px-4 py-2 border-b w-full outline-none flex-shrink-0"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                onBlur={async () => {
                    if (docTitle.trim()) {
                        const ref = doc(db, 'rooms', roomId, 'documents', docId);
                        await updateDoc(ref, { title: docTitle.trim() });
                    }
                }}
                placeholder="Document Title"
            />

            {/* Toolbar */}
            <div className="flex-shrink-0 px-3 pt-2 overflow-x-auto">
                {editor && <Toolbar editor={editor} />}
            </div>

            {/* Editor — scrollable content area */}
            <div ref={editorContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden">
                <EditorContent editor={editor} className="border-0" />
            </div>

            {/* ─── Floating "Comment" bar when text is selected ─── */}
            {showSelectionBar && selectedText && !isCommenting && !showBubble && (
                <div
                    className="fixed left-3 right-3 z-50 animate-slide-up"
                    style={{ bottom: `${keyboardOffset + 12}px` }}
                >
                    <button
                        onTouchStart={(e) => { e.stopPropagation(); }}
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleStartComment(); }}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-200/50 text-sm font-semibold active:bg-blue-700 transition-colors"
                    >
                        <MessageSquarePlus size={16} />
                        Comment on &ldquo;{selectedText.length > 30 ? selectedText.substring(0, 30) + '...' : selectedText}&rdquo;
                    </button>
                </div>
            )}

            {/* ─── Comment Input Panel ─── */}
            {isCommenting && (
                <div className="fixed bottom-0 left-0 right-0 bg-white p-4 border-t z-50 shadow-lg pb-[calc(env(safe-area-inset-bottom)+16px)]">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-xs text-gray-500">
                            Comment on &ldquo;{selectedText.substring(0, 40)}{selectedText.length > 40 ? '...' : ''}&rdquo;
                        </p>
                        <button onClick={() => { setIsCommenting(false); setCommentText(''); }} className="text-gray-400">
                            <X size={16} />
                        </button>
                    </div>
                    <textarea
                        className="w-full border border-gray-200 p-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        placeholder="Write a comment..."
                        autoFocus
                        rows={2}
                    />
                    <button
                        className="w-full bg-blue-600 text-white py-2.5 rounded-lg mt-2 text-sm font-medium disabled:opacity-50"
                        onClick={handleAddComment}
                        disabled={!commentText.trim()}
                    >
                        Add Comment
                    </button>
                </div>
            )}

            {/* ─── Comment Bubble (shown when tapping a highlighted comment) ─── */}
            {showBubble && activeComment && !isCommenting && (
                <>
                    {/* Backdrop to prevent accidental editor taps */}
                    <div className="fixed inset-0 z-40" onClick={dismissBubble} />

                    <div className="fixed left-3 right-3 z-50 animate-slide-up"
                         style={{ bottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 16px)' }}
                    >
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                                        <span className="text-xs font-bold text-blue-700">
                                            {(activeComment.authorName || 'A').charAt(0).toUpperCase()}
                                        </span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-semibold text-gray-800 truncate">
                                            {activeComment.authorName || 'Anonymous'}
                                        </p>
                                        <p className="text-[11px] text-gray-400">
                                            {relativeTime(activeComment.createdAt?.toDate?.())}
                                            {' · '}
                                            {activeComment.createdAt?.toDate?.().toLocaleString?.() || ''}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={dismissBubble}
                                    className="p-1.5 rounded-full hover:bg-gray-200 transition-colors"
                                >
                                    <X size={16} className="text-gray-400" />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="px-4 py-3">
                                <p className="text-[11px] text-gray-400 italic mb-1.5">
                                    on &ldquo;{activeComment.anchorText?.substring(0, 50)}
                                    {(activeComment.anchorText?.length || 0) > 50 ? '...' : ''}&rdquo;
                                </p>
                                {isEditing ? (
                                    <div>
                                        <textarea
                                            className="w-full border border-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                                            value={editText}
                                            onChange={(e) => setEditText(e.target.value)}
                                            rows={3}
                                            autoFocus
                                        />
                                        <div className="flex justify-end gap-2 mt-2">
                                            <button className="px-3 py-1.5 text-xs text-gray-500" onClick={() => setIsEditing(false)}>
                                                Cancel
                                            </button>
                                            <button
                                                className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                                                disabled={!editText.trim()}
                                                onClick={handleEditComment}
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-800 leading-relaxed">{activeComment.content}</p>
                                )}
                            </div>

                            {/* Actions */}
                            <div className="flex justify-end gap-2 px-4 py-2 bg-gray-50 border-t border-gray-100">
                                {!isEditing && (
                                    <button
                                        onClick={() => { setIsEditing(true); setEditText(activeComment.content); }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                    >
                                        <Pencil size={12} /><span>Edit</span>
                                    </button>
                                )}
                                <button
                                    onClick={() => handleDeleteComment(activeComment.id)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 size={12} /><span>Delete</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
