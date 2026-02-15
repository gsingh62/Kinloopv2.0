// extensions/CommentHighlight.ts
import { Mark, mergeAttributes } from '@tiptap/core';

export const CommentHighlight = Mark.create({
    name: 'commentHighlight',

    // Higher priority than TextStyle (100) so our parseHTML rule
    // matches <span data-comment-id style="…"> BEFORE TextStyle can
    // consume it as a plain styled span.
    priority: 1001,

    // CRITICAL: prevents new text typed at the end of a comment from inheriting the highlight
    inclusive: false,

    addAttributes() {
        return {
            commentId: {
                default: null,
                // Explicit: read the DOM attribute we use in storage
                parseHTML: (element: HTMLElement) =>
                    element.getAttribute('data-comment-id'),
                // Explicit: write it back as a DOM attribute
                renderHTML: (attributes: Record<string, any>) => {
                    if (!attributes.commentId) return {};
                    return { 'data-comment-id': attributes.commentId };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'span[data-comment-id]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        // HTMLAttributes now already contains { 'data-comment-id': '…' }
        // from the attribute-level renderHTML above, so we just merge the
        // visual style on top.
        return [
            'span',
            mergeAttributes(HTMLAttributes, {
                style: 'background-color: #fde68a; border-radius: 2px; cursor: pointer; padding: 1px 0; box-decoration-break: clone; -webkit-box-decoration-break: clone;',
            }),
            0,
        ];
    },
});
