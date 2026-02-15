// components/Toolbar.tsx — Full-featured rich text editor toolbar
import { Editor } from '@tiptap/react';
import { useState } from 'react';
import {
    Bold, Italic, Strikethrough, Code,
    Heading1, Heading2, Heading3,
    List, ListOrdered, Quote,
    Undo2, Redo2, Minus, Link as LinkIcon, Unlink,
    Image as ImageIcon, Type,
} from 'lucide-react';

const FONT_FAMILIES = [
    { label: 'Default', value: '' },
    { label: 'Sans Serif', value: 'Inter, system-ui, sans-serif' },
    { label: 'Serif', value: 'Georgia, Times New Roman, serif' },
    { label: 'Mono', value: 'JetBrains Mono, Menlo, monospace' },
    { label: 'Helvetica', value: 'Helvetica Neue, Helvetica, Arial, sans-serif' },
    { label: 'Georgia', value: 'Georgia, serif' },
    { label: 'Garamond', value: 'Garamond, EB Garamond, serif' },
    { label: 'Comic Sans', value: 'Comic Sans MS, cursive' },
];

interface ToolbarProps {
    editor: Editor;
}

function ToolbarButton({
    onClick,
    isActive = false,
    disabled = false,
    title,
    children,
}: {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            title={title}
            className={`p-1.5 rounded-md transition-colors ${
                isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            } ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
        >
            {children}
        </button>
    );
}

function ToolbarDivider() {
    return <div className="w-px h-5 bg-gray-200 mx-0.5" />;
}

export default function Toolbar({ editor }: ToolbarProps) {
    const [showLinkInput, setShowLinkInput] = useState(false);
    const [linkUrl, setLinkUrl] = useState('');

    const insertImage = () => {
        const url = window.prompt('Enter image URL');
        if (!url) return;
        editor.chain().focus().setImage({ src: url }).run();
    };

    const handleSetLink = () => {
        if (!linkUrl.trim()) {
            editor.chain().focus().unsetLink().run();
            setShowLinkInput(false);
            setLinkUrl('');
            return;
        }
        const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`;
        editor.chain().focus().setLink({ href: url }).run();
        setShowLinkInput(false);
        setLinkUrl('');
    };

    const sz = 16;

    return (
        <div className="border-b border-gray-200 pb-2 mb-3 overflow-x-auto overflow-y-hidden -mx-1 px-1">
            <div className="flex items-center gap-0.5 flex-nowrap min-w-max">
                {/* Undo / Redo */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    title="Undo"
                >
                    <Undo2 size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    title="Redo"
                >
                    <Redo2 size={sz} />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Font Family */}
                <select
                    value={
                        FONT_FAMILIES.find(f => f.value && editor.isActive('textStyle', { fontFamily: f.value }))?.value || ''
                    }
                    onChange={(e) => {
                        const value = e.target.value;
                        if (value) {
                            editor.chain().focus().setFontFamily(value).run();
                        } else {
                            editor.chain().focus().unsetFontFamily().run();
                        }
                    }}
                    className="h-8 px-2 text-xs border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
                    title="Font Family"
                >
                    {FONT_FAMILIES.map(f => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value || 'inherit' }}>
                            {f.label}
                        </option>
                    ))}
                </select>

                <ToolbarDivider />

                {/* Text Formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold (Cmd+B)"
                >
                    <Bold size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic (Cmd+I)"
                >
                    <Italic size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <Strikethrough size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    isActive={editor.isActive('code')}
                    title="Inline Code"
                >
                    <Code size={sz} />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Headings */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    title="Heading 1"
                >
                    <Heading1 size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    title="Heading 2"
                >
                    <Heading2 size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    isActive={editor.isActive('heading', { level: 3 })}
                    title="Heading 3"
                >
                    <Heading3 size={sz} />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Lists & Block */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Quote"
                >
                    <Quote size={sz} />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Rule"
                >
                    <Minus size={sz} />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Link */}
                {editor.isActive('link') ? (
                    <ToolbarButton
                        onClick={() => editor.chain().focus().unsetLink().run()}
                        isActive={true}
                        title="Remove Link"
                    >
                        <Unlink size={sz} />
                    </ToolbarButton>
                ) : (
                    <ToolbarButton
                        onClick={() => {
                            const previousUrl = editor.getAttributes('link').href || '';
                            setLinkUrl(previousUrl);
                            setShowLinkInput(true);
                        }}
                        title="Add Link"
                    >
                        <LinkIcon size={sz} />
                    </ToolbarButton>
                )}

                {/* Image */}
                <ToolbarButton onClick={insertImage} title="Insert Image">
                    <ImageIcon size={sz} />
                </ToolbarButton>
            </div>

            {/* Link URL Input */}
            {showLinkInput && (
                <div className="flex items-center gap-2 mt-2 animate-fade-in">
                    <input
                        type="url"
                        placeholder="https://example.com"
                        value={linkUrl}
                        onChange={e => setLinkUrl(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSetLink(); } }}
                        autoFocus
                        className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <button
                        onClick={handleSetLink}
                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Apply
                    </button>
                    <button
                        onClick={() => { setShowLinkInput(false); setLinkUrl(''); }}
                        className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            )}
        </div>
    );
}
