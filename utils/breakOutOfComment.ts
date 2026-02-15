// utils/breakOutOfComment.ts
import { Editor } from '@tiptap/react';

/**
 * Moves the cursor past a comment highlight mark.
 * With inclusive: false on the mark, this is mostly a safety fallback.
 */
export function breakOutOfCommentMark(editor: Editor, breakPosition: number) {
    if (!editor) return;

    // Move cursor to end of highlight
    editor.commands.setTextSelection({ from: breakPosition, to: breakPosition });

    // Explicitly unset the comment mark at this position
    editor.commands.unsetMark('commentHighlight');
}
