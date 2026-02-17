import { useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import {
    collection, addDoc, serverTimestamp, query, orderBy, onSnapshot, doc, getDocs, deleteDoc, updateDoc,
} from 'firebase/firestore';
import {
    addCalendarEvent, deleteEvent, createDoc, deleteDocument, updateDocContent,
    deleteList as deleteListFn, deleteListItemsByContent,
    saveRecipe as saveRecipeFn, deleteRecipe as deleteRecipeFn,
    toggleRecipeFavorite, updateRecipeCompletedSteps,
    leaveRoom, removeMember, assignChore,
    type Recipe,
} from '../lib/firestoreUtils';
import { useRouter } from 'next/router';
import {
    Sparkles, Send, Loader2, ChefHat, ListPlus, CalendarPlus, FileText,
    AlertCircle, Trash2, PenLine, Heart, BookOpen, Clock, Users as UsersIcon,
    CheckCircle2, Circle, Star, DoorOpen, UserMinus, ClipboardList, User,
    Mic, MicOff, Paperclip, FileUp, X, Globe,
} from 'lucide-react';

interface AIChatTabProps {
    roomId: string;
    roomName: string;
    lists: { id: string; name: string; type?: string }[];
    events: { id: string; title: string; date: string }[];
    documents: { id: string; title?: string; [key: string]: any }[];
    recipes: Recipe[];
    members?: { uid: string; name?: string; email?: string }[];
}

interface AIMessage {
    id?: string;
    role: 'user' | 'assistant';
    content: string;
    actions?: any[];
    createdAt?: any;
}

function ActionBadge({ action }: { action: any }) {
    const iconMap: Record<string, any> = {
        create_list: { icon: ListPlus, color: 'sage', label: `Created list "${action.name}" with ${action.items?.length || 0} items` },
        add_items_to_list: { icon: ListPlus, color: 'sage', label: `Added ${action.items?.length} items to "${action.listName}"` },
        delete_list_items: { icon: Trash2, color: 'red', label: `Removed ${action.items?.length} items from "${action.listName}"` },
        delete_list: { icon: Trash2, color: 'red', label: `Deleted list "${action.listName}"` },
        add_event: { icon: CalendarPlus, color: 'sky', label: `Added "${action.title}" on ${action.date}` },
        delete_event: { icon: Trash2, color: 'red', label: `Deleted "${action.title}"` },
        create_document: { icon: FileText, color: 'amber', label: `Created doc "${action.title}"` },
        modify_document: { icon: PenLine, color: 'amber', label: `Modified doc "${action.title}"` },
        delete_document: { icon: Trash2, color: 'red', label: `Deleted doc "${action.title}"` },
        save_recipe: { icon: ChefHat, color: 'orange', label: `Saved recipe "${action.title}"` },
        toggle_recipe_favorite: { icon: Heart, color: 'pink', label: `Toggled favorite for "${action.recipeTitle}"` },
        delete_recipe: { icon: Trash2, color: 'red', label: `Deleted recipe "${action.recipeTitle}"` },
        get_favorite_recipes: { icon: BookOpen, color: 'violet', label: 'Loaded your recipes' },
        assign_chore: { icon: User, color: 'violet', label: `Assigned "${action.choreName}" to ${action.memberName}` },
        add_chore_to_calendar: { icon: CalendarPlus, color: 'sky', label: `Added "${action.choreName}" to calendar` },
        leave_room: { icon: DoorOpen, color: 'amber', label: 'Left the room' },
        remove_member: { icon: UserMinus, color: 'red', label: `Removed ${action.memberName}` },
        fetch_events_from_url: { icon: Globe, color: 'sky', label: `Extracted events from URL` },
    };

    const info = iconMap[action.type];
    if (!info) return null;

    const Icon = info.icon;
    const colors: Record<string, string> = {
        sage: 'bg-sage-50 border-sage-200 text-sage-700',
        red: 'bg-red-50 border-red-200 text-red-700',
        sky: 'bg-sky-50 border-sky-200 text-sky-700',
        amber: 'bg-amber-50 border-amber-200 text-amber-700',
        orange: 'bg-orange-50 border-orange-200 text-orange-700',
        pink: 'bg-pink-50 border-pink-200 text-pink-700',
        violet: 'bg-violet-50 border-violet-200 text-violet-700',
    };

    return (
        <div className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-xs ${colors[info.color] || colors.sage}`}>
            <Icon size={14} />
            <span>{info.label}</span>
        </div>
    );
}

function RecipeCard({
    recipe,
    roomId,
    onScheduleCook,
    onCreateShoppingList,
}: {
    recipe: Recipe;
    roomId: string;
    onScheduleCook: (recipe: Recipe) => void;
    onCreateShoppingList: (recipe: Recipe) => void;
}) {
    const [completedSteps, setCompletedSteps] = useState<number[]>(recipe.completedSteps || []);
    const [showSteps, setShowSteps] = useState(true);

    const toggleStep = async (idx: number) => {
        const next = completedSteps.includes(idx)
            ? completedSteps.filter(s => s !== idx)
            : [...completedSteps, idx];
        setCompletedSteps(next);
        try {
            await updateRecipeCompletedSteps(roomId, recipe.id, next);
        } catch (e) {
            console.error('Failed to update step:', e);
        }
    };

    const toggleFav = async () => {
        try {
            await toggleRecipeFavorite(roomId, recipe.id, recipe.isFavorite);
        } catch (e) {
            console.error('Failed to toggle favorite:', e);
        }
    };

    const progress = recipe.steps.length > 0
        ? Math.round((completedSteps.length / recipe.steps.length) * 100)
        : 0;

    const hasSteps = recipe.steps && recipe.steps.length > 0;

    return (
        <div className="bg-white border border-warmgray-200 rounded-2xl overflow-hidden shadow-sm max-w-sm">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 px-4 py-3 border-b border-warmgray-100">
                <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                        <ChefHat size={18} className="text-orange-500" />
                        <h4 className="font-semibold text-sm text-warmgray-800">{recipe.title}</h4>
                    </div>
                    <button onClick={toggleFav} className="p-1 rounded-full hover:bg-orange-100 transition-colors">
                        <Heart
                            size={16}
                            className={recipe.isFavorite ? 'text-red-500 fill-red-500' : 'text-warmgray-400'}
                        />
                    </button>
                </div>
                {/* Meta */}
                <div className="flex gap-3 mt-2 text-[11px] text-warmgray-500">
                    {recipe.prepTime && (
                        <span className="flex items-center gap-1"><Clock size={11} /> Prep: {recipe.prepTime}</span>
                    )}
                    {recipe.cookTime && (
                        <span className="flex items-center gap-1"><Clock size={11} /> Cook: {recipe.cookTime}</span>
                    )}
                    {recipe.servings && (
                        <span className="flex items-center gap-1"><UsersIcon size={11} /> {recipe.servings}</span>
                    )}
                </div>
            </div>

            {/* Ingredients preview */}
            <div className="px-4 py-3">
                <p className="text-[11px] font-semibold text-warmgray-500 uppercase tracking-wide mb-1.5">
                    Ingredients ({recipe.ingredients.length})
                </p>
                <div className="flex flex-wrap gap-1">
                    {recipe.ingredients.slice(0, 6).map((ing, i) => (
                        <span key={i} className="text-[11px] bg-warmgray-50 border border-warmgray-200 px-2 py-0.5 rounded-full text-warmgray-600">
                            {ing.length > 30 ? ing.slice(0, 30) + '...' : ing}
                        </span>
                    ))}
                    {recipe.ingredients.length > 6 && (
                        <span className="text-[11px] text-warmgray-400">+{recipe.ingredients.length - 6} more</span>
                    )}
                </div>
            </div>

            {/* Steps - shown by default if available, toggleable to collapse */}
            <div className="px-4 pb-2">
                {hasSteps ? (
                    <>
                        <button
                            onClick={() => setShowSteps(!showSteps)}
                            className="flex items-center gap-1.5 text-[12px] font-medium text-orange-600 hover:text-orange-700 transition-colors mb-2"
                        >
                            <BookOpen size={13} />
                            {showSteps ? 'Hide steps' : `Show ${recipe.steps.length} steps`}
                            {!showSteps && (
                                <span className="text-warmgray-400 font-normal ml-1">
                                    (tap each step to check it off)
                                </span>
                            )}
                        </button>

                        {showSteps && (
                            <div className="space-y-1.5">
                                {/* Progress bar */}
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="flex-1 h-1.5 bg-warmgray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-300"
                                            style={{ width: `${progress}%` }}
                                        />
                                    </div>
                                    <span className="text-[11px] text-warmgray-500 font-medium">
                                        {completedSteps.length}/{recipe.steps.length}
                                    </span>
                                </div>

                                {recipe.steps.map((step, idx) => {
                                    const isDone = completedSteps.includes(idx);
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() => toggleStep(idx)}
                                            className={`flex gap-2 w-full text-left p-2 rounded-lg transition-all text-xs ${
                                                isDone ? 'bg-green-50 text-warmgray-400' : 'bg-warmgray-50 text-warmgray-700 hover:bg-warmgray-100'
                                            }`}
                                        >
                                            {isDone
                                                ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
                                                : <Circle size={14} className="text-warmgray-300 flex-shrink-0 mt-0.5" />
                                            }
                                            <span className={isDone ? 'line-through' : ''}>
                                                <strong className="text-warmgray-500">Step {idx + 1}.</strong> {step}
                                            </span>
                                        </button>
                                    );
                                })}

                                {completedSteps.length === recipe.steps.length && (
                                    <div className="p-2 bg-green-50 border border-green-200 rounded-lg text-center text-xs text-green-700 font-medium">
                                        All done! Enjoy your meal!
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <p className="text-[11px] text-warmgray-400 italic">
                        No step-by-step instructions were found for this recipe. Check the Recipes tab for the full view, or ask AI to re-extract the recipe.
                    </p>
                )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 px-4 py-3 border-t border-warmgray-100 bg-warmgray-50/50">
                <button
                    onClick={() => onCreateShoppingList(recipe)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-warmgray-200 rounded-xl text-xs font-medium text-warmgray-700 hover:border-sage-300 hover:text-sage-700 transition-all"
                >
                    <ListPlus size={13} />
                    Shopping list
                </button>
                <button
                    onClick={() => onScheduleCook(recipe)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-white border border-warmgray-200 rounded-xl text-xs font-medium text-warmgray-700 hover:border-sky-300 hover:text-sky-700 transition-all"
                >
                    <CalendarPlus size={13} />
                    Schedule cook
                </button>
            </div>
        </div>
    );
}

const SUGGESTION_CHIPS = [
    { icon: ChefHat, label: 'Extract a recipe', prompt: 'Can you extract the recipe from this URL? ' },
    { icon: ListPlus, label: 'Add to list', prompt: 'Add these items to my grocery list: ' },
    { icon: ClipboardList, label: 'Create chore board', prompt: 'Create a chore board called ' },
    { icon: CalendarPlus, label: 'Add event', prompt: 'Add an event for ' },
    { icon: Globe, label: 'Events from URL', prompt: 'Extract all events and dates from this page: ' },
    { icon: FileUp, label: 'PDF to calendar', prompt: '' },
    { icon: FileText, label: 'Plan something', prompt: 'Help me plan ' },
    { icon: Star, label: 'My recipes', prompt: 'Show me my saved recipes and help me pick what to cook' },
];

export default function AIChatTab({ roomId, roomName, lists, events, documents, recipes, members = [] }: AIChatTabProps) {
    const router = useRouter();
    const [messages, setMessages] = useState<AIMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isListening, setIsListening] = useState(false);
    const [pdfExtracting, setPdfExtracting] = useState(false);
    const [pendingPdfName, setPendingPdfName] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recognitionRef = useRef<any>(null);
    const isInitialLoad = useRef(true);

    useEffect(() => {
        if (!roomId) return;
        const q = query(
            collection(db, 'rooms', roomId, 'aiMessages'),
            orderBy('createdAt', 'asc')
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(d => ({
                id: d.id,
                ...d.data(),
            } as AIMessage));
            setMessages(msgs);
        });
        return () => unsubscribe();
    }, [roomId]);

    useEffect(() => {
        if (isInitialLoad.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior });
            if (messages.length > 0) isInitialLoad.current = false;
        } else {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, isLoading]);

    // ─── Voice Recognition ───
    const toggleListening = () => {
        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError('Speech recognition is not supported in this browser. Try Chrome or Safari.');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        let finalTranscript = input;
        recognition.onresult = (event: any) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                if (event.results[i].isFinal) {
                    finalTranscript += (finalTranscript ? ' ' : '') + event.results[i][0].transcript;
                } else {
                    interim += event.results[i][0].transcript;
                }
            }
            setInput(finalTranscript + (interim ? ' ' + interim : ''));
        };
        recognition.onerror = () => setIsListening(false);
        recognition.onend = () => setIsListening(false);
        recognitionRef.current = recognition;
        recognition.start();
        setIsListening(true);
    };

    // ─── PDF Text Extraction (server-side) ───
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (fileInputRef.current) fileInputRef.current.value = '';

        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
            setPdfExtracting(true);
            setPendingPdfName(file.name);
            try {
                const formData = new FormData();
                formData.append('file', file);
                const response = await fetch('/api/extract-pdf', { method: 'POST', body: formData });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Failed to extract PDF');
                if (data.error) {
                    setError(data.error);
                } else if (!data.text) {
                    setError('Could not extract text from this PDF. It may be a scanned image.');
                } else {
                    const trimmed = data.text.slice(0, 12000);
                    // Auto-send to AI without showing raw text
                    await sendToAI(
                        `I uploaded a PDF "${file.name}" (${data.pages} pages). Please extract all events and dates and propose adding them to my calendar.`,
                        `[PDF content from ${file.name}]:\n${trimmed}`,
                    );
                }
            } catch (err: any) {
                setError(`Failed to read PDF: ${err.message}`);
            } finally {
                setPdfExtracting(false);
                setPendingPdfName(null);
            }
        } else if (file.type.startsWith('text/') || file.name.endsWith('.csv') || file.name.endsWith('.ics')) {
            const text = await file.text();
            const trimmed = text.trim().slice(0, 12000);
            await sendToAI(
                `I uploaded "${file.name}". Please extract all events and dates and propose adding them to my calendar.`,
                `[File content from ${file.name}]:\n${trimmed}`,
            );
        } else {
            setError('Please upload a PDF, text, or CSV file.');
        }
    };

    async function executeActions(actions: any[]) {
        const user = auth.currentUser;
        if (!user) return;

        for (const action of actions) {
            try {
                switch (action.type) {
                    case 'create_list': {
                        const listRef = await addDoc(collection(db, 'rooms', roomId, 'lists'), {
                            name: action.name,
                            type: action.listType || 'list',
                            createdAt: serverTimestamp(),
                        });
                        if (action.items?.length) {
                            for (const item of action.items) {
                                await addDoc(collection(db, 'rooms', roomId, 'lists', listRef.id, 'items'), {
                                    content: item,
                                    completed: false,
                                    createdAt: serverTimestamp(),
                                });
                            }
                        }
                        break;
                    }
                    case 'add_items_to_list': {
                        const matchedList = lists.find(
                            l => l.name.toLowerCase() === action.listName.toLowerCase()
                        );
                        if (matchedList) {
                            for (const item of action.items) {
                                await addDoc(
                                    collection(db, 'rooms', roomId, 'lists', matchedList.id, 'items'),
                                    { content: item, completed: false, createdAt: serverTimestamp() }
                                );
                            }
                        } else {
                            const listRef = await addDoc(collection(db, 'rooms', roomId, 'lists'), {
                                name: action.listName,
                                createdAt: serverTimestamp(),
                            });
                            for (const item of action.items) {
                                await addDoc(
                                    collection(db, 'rooms', roomId, 'lists', listRef.id, 'items'),
                                    { content: item, completed: false, createdAt: serverTimestamp() }
                                );
                            }
                        }
                        break;
                    }
                    case 'delete_list_items': {
                        const matched = lists.find(
                            l => l.name.toLowerCase() === action.listName.toLowerCase()
                        );
                        if (matched) {
                            await deleteListItemsByContent(roomId, matched.id, action.items);
                        }
                        break;
                    }
                    case 'delete_list': {
                        const matched = lists.find(
                            l => l.name.toLowerCase() === action.listName.toLowerCase()
                        );
                        if (matched) {
                            await deleteListFn(roomId, matched.id);
                        }
                        break;
                    }
                    case 'add_event': {
                        await addCalendarEvent(roomId, {
                            title: action.title,
                            date: action.date,
                            startTime: action.startTime,
                            endTime: action.endTime,
                            description: action.description,
                            allDay: action.allDay ?? !action.startTime,
                            color: '#3B82F6',
                            createdBy: user.uid,
                        });
                        break;
                    }
                    case 'delete_event': {
                        if (action.eventId) {
                            await deleteEvent(roomId, action.eventId);
                        }
                        break;
                    }
                    case 'create_document': {
                        await createDoc(roomId, action.title, action.content, user.uid);
                        break;
                    }
                    case 'modify_document': {
                        const matchedDoc = documents.find(
                            d => (d.title || '').toLowerCase() === action.title.toLowerCase()
                        );
                        if (matchedDoc) {
                            await updateDocContent(roomId, matchedDoc.id, action.newContent, action.newTitle);
                        }
                        break;
                    }
                    case 'delete_document': {
                        const matchedDoc = documents.find(
                            d => (d.title || '').toLowerCase() === action.title.toLowerCase()
                        );
                        if (matchedDoc) {
                            await deleteDocument(roomId, matchedDoc.id);
                        }
                        break;
                    }
                    case 'save_recipe': {
                        await saveRecipeFn(roomId, {
                            title: action.title,
                            url: action.url || '',
                            ingredients: action.ingredients || [],
                            steps: action.steps || [],
                            servings: action.servings,
                            prepTime: action.prepTime,
                            cookTime: action.cookTime,
                            isFavorite: action.isFavorite !== false,
                            createdBy: user.uid,
                        });
                        break;
                    }
                    case 'get_favorite_recipes': {
                        // Data is already in the recipes prop; no client action needed
                        break;
                    }
                    case 'toggle_recipe_favorite': {
                        const matchedRecipe = recipes.find(
                            r => r.title.toLowerCase() === action.recipeTitle.toLowerCase()
                        );
                        if (matchedRecipe) {
                            await toggleRecipeFavorite(roomId, matchedRecipe.id, matchedRecipe.isFavorite);
                        }
                        break;
                    }
                    case 'delete_recipe': {
                        const matchedRecipe = recipes.find(
                            r => r.title.toLowerCase() === action.recipeTitle.toLowerCase()
                        );
                        if (matchedRecipe) {
                            await deleteRecipeFn(roomId, matchedRecipe.id);
                        }
                        break;
                    }
                    case 'assign_chore': {
                        const matchedList = lists.find(l => l.name.toLowerCase() === action.listName.toLowerCase());
                        if (matchedList) {
                            const itemsSnap = await getDocs(collection(db, 'rooms', roomId, 'lists', matchedList.id, 'items'));
                            const matchedItem = itemsSnap.docs.find(d => {
                                const content = (d.data().content || '').toLowerCase();
                                return content.includes(action.choreName.toLowerCase());
                            });
                            if (matchedItem) {
                                const member = members.find(m => {
                                    const mName = (m.name || m.email?.split('@')[0] || '').toLowerCase();
                                    return mName.includes(action.memberName.toLowerCase());
                                });
                                if (member) {
                                    await assignChore(roomId, matchedList.id, matchedItem.id,
                                        member.uid, member.name || member.email?.split('@')[0] || '');
                                }
                            }
                        }
                        break;
                    }
                    case 'add_chore_to_calendar': {
                        const duration = action.durationMinutes || 30;
                        const startTime = action.startTime || '10:00';
                        const [h, m] = startTime.split(':').map(Number);
                        const endMinutes = h * 60 + m + duration;
                        const endTime = `${Math.floor(endMinutes / 60)}:${String(endMinutes % 60).padStart(2, '0')}`;
                        await addCalendarEvent(roomId, {
                            title: `🧹 ${action.choreName}`,
                            date: action.date,
                            startTime,
                            endTime,
                            allDay: false,
                            color: '#F59E0B',
                            createdBy: user.uid,
                        });
                        break;
                    }
                    case 'leave_room': {
                        if (action.confirm) {
                            await leaveRoom(roomId, user.uid);
                            router.push('/dashboard');
                        }
                        break;
                    }
                    case 'remove_member': {
                        const member = members.find(m => {
                            const mName = (m.name || m.email?.split('@')[0] || '').toLowerCase();
                            return mName.includes(action.memberName.toLowerCase());
                        });
                        if (member) {
                            await removeMember(roomId, member.uid);
                        }
                        break;
                    }
                }
            } catch (err) {
                console.error(`Failed to execute action ${action.type}:`, err);
            }
        }
    }

    function handleScheduleCook(recipe: Recipe) {
        setInput(`Schedule time to cook "${recipe.title}" this weekend`);
        inputRef.current?.focus();
    }

    function handleCreateShoppingList(recipe: Recipe) {
        setInput(`Create a shopping list with all the ingredients from "${recipe.title}"`);
        inputRef.current?.focus();
    }

    async function sendToAI(visibleMessage: string, hiddenContext?: string) {
        if (!visibleMessage.trim() || isLoading) return;

        setInput('');
        setError(null);

        // Show the visible message in chat
        await addDoc(collection(db, 'rooms', roomId, 'aiMessages'), {
            role: 'user',
            content: visibleMessage,
            createdAt: serverTimestamp(),
        });

        setIsLoading(true);

        // Build API message: visible message + hidden context if provided
        const apiContent = hiddenContext
            ? `${visibleMessage}\n\n--- EXTRACTED CONTENT (do not repeat this raw text back to the user) ---\n${hiddenContext}`
            : visibleMessage;

        try {
            const recentMessages = [...messages.slice(-20), { role: 'user' as const, content: apiContent }];
            const apiMessages = recentMessages.map(m => ({
                role: m.role,
                content: m.content,
            }));

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: apiMessages,
                    roomContext: {
                        roomName,
                        members: members.map(m => ({ uid: m.uid, name: m.name || m.email?.split('@')[0] || 'Unknown' })),
                        lists: lists.map(l => ({ id: l.id, name: l.name, type: l.type || 'list' })),
                        events: events.slice(0, 50).map(e => ({ id: e.id, title: e.title, date: e.date })),
                        documents: documents.map(d => ({ id: d.id, title: d.title || 'Untitled' })),
                        recipes: recipes.map(r => ({
                            id: r.id,
                            title: r.title,
                            isFavorite: r.isFavorite,
                            ingredients: r.ingredients?.length || 0,
                            steps: r.steps?.length || 0,
                        })),
                    },
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to get response');
            }

            if (data.actions?.length > 0) {
                await executeActions(data.actions);
            }

            await addDoc(collection(db, 'rooms', roomId, 'aiMessages'), {
                role: 'assistant',
                content: data.message,
                actions: data.actions || [],
                createdAt: serverTimestamp(),
            });
        } catch (err: any) {
            setError(err.message);
            await addDoc(collection(db, 'rooms', roomId, 'aiMessages'), {
                role: 'assistant',
                content: `Sorry, I ran into an issue: ${err.message}. Please try again.`,
                createdAt: serverTimestamp(),
            });
        } finally {
            setIsLoading(false);
            inputRef.current?.focus();
        }
    }

    async function handleSend() {
        const content = input.trim();
        if (!content) return;
        await sendToAI(content);
    }

    function handleChipClick(prompt: string) {
        if (prompt === '') {
            // PDF upload chip
            fileInputRef.current?.click();
            return;
        }
        setInput(prompt);
        inputRef.current?.focus();
    }

    function renderMessageContent(content: string) {
        const lines = content.split('\n');
        return lines.map((line, i) => {
            if (line.startsWith('### ')) {
                return <h4 key={i} className="font-semibold text-sm mt-2 mb-1">{line.replace('### ', '')}</h4>;
            }
            if (line.startsWith('## ')) {
                return <h3 key={i} className="font-bold text-sm mt-2 mb-1">{line.replace('## ', '')}</h3>;
            }
            if (line.startsWith('- ') || line.startsWith('• ')) {
                return <div key={i} className="flex gap-1.5 ml-1"><span className="text-warmgray-400">•</span><span>{line.replace(/^[-•]\s/, '')}</span></div>;
            }
            if (line.match(/^\d+\.\s/)) {
                return <div key={i} className="ml-1">{line}</div>;
            }
            if (line.startsWith('**') && line.endsWith('**')) {
                return <p key={i} className="font-semibold mt-1">{line.replace(/\*\*/g, '')}</p>;
            }
            if (line.trim() === '') {
                return <div key={i} className="h-2" />;
            }
            const parts = line.split(/(\*\*[^*]+\*\*)/g);
            return (
                <p key={i}>
                    {parts.map((part, j) =>
                        part.startsWith('**') && part.endsWith('**')
                            ? <strong key={j}>{part.replace(/\*\*/g, '')}</strong>
                            : part
                    )}
                </p>
            );
        });
    }

    // Check if any action in a message is a save_recipe to show recipe card
    function getRecipeFromActions(actions?: any[]): Recipe | null {
        if (!actions) return null;
        const saveAction = actions.find(a => a.type === 'save_recipe');
        if (!saveAction) return null;
        // Try to find the saved recipe in current recipes list
        const found = recipes.find(r => r.title.toLowerCase() === saveAction.title.toLowerCase());
        if (found) return found;
        // If not found yet (just saved), construct a temporary card
        return {
            id: 'temp-' + saveAction.title,
            title: saveAction.title,
            url: saveAction.url,
            ingredients: saveAction.ingredients || [],
            steps: saveAction.steps || [],
            servings: saveAction.servings,
            prepTime: saveAction.prepTime,
            cookTime: saveAction.cookTime,
            isFavorite: saveAction.isFavorite !== false,
            createdBy: auth.currentUser?.uid || '',
        };
    }

    return (
        <div className="flex flex-col h-[calc(100vh-220px)] max-w-3xl mx-auto">
            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-2 py-4 space-y-3">
                {messages.length === 0 && !isLoading && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="w-16 h-16 bg-gradient-to-br from-violet-100 to-kin-100 rounded-2xl flex items-center justify-center mb-4">
                            <Sparkles size={32} className="text-violet-500" />
                        </div>
                        <h3 className="text-base font-semibold text-warmgray-800 mb-1">KinLoop AI</h3>
                        <p className="text-sm text-warmgray-400 text-center mb-6 max-w-xs">
                            Your family assistant. I can manage lists, events, docs, extract recipes, and help plan your week.
                        </p>

                        {/* Saved recipes quick access */}
                        {recipes.filter(r => r.isFavorite).length > 0 && (
                            <div className="mb-4 w-full max-w-sm">
                                <p className="text-[11px] font-semibold text-warmgray-400 uppercase tracking-wide mb-2 text-center">
                                    Favorite Recipes
                                </p>
                                <div className="flex flex-wrap gap-1.5 justify-center">
                                    {recipes.filter(r => r.isFavorite).slice(0, 4).map(r => (
                                        <button
                                            key={r.id}
                                            onClick={() => handleChipClick(`Let's cook "${r.title}" — create a shopping list and schedule it`)}
                                            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-orange-50 border border-orange-200 rounded-xl text-[11px] text-orange-700 hover:bg-orange-100 transition-all"
                                        >
                                            <ChefHat size={12} />
                                            {r.title}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2 justify-center max-w-sm">
                            {SUGGESTION_CHIPS.map((chip, i) => {
                                const Icon = chip.icon;
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleChipClick(chip.prompt)}
                                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-warmgray-200 rounded-xl text-xs text-warmgray-600 hover:border-kin-300 hover:text-kin-600 hover:bg-kin-50 transition-all"
                                    >
                                        <Icon size={14} />
                                        {chip.label}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {messages.map((msg, i) => {
                    const isUser = msg.role === 'user';
                    const recipeCard = !isUser ? getRecipeFromActions(msg.actions) : null;
                    return (
                        <div key={msg.id || i} className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
                            {!isUser && (
                                <div className="w-8 h-8 bg-gradient-to-br from-violet-400 to-kin-500 rounded-full flex items-center justify-center flex-shrink-0 mt-auto">
                                    <Sparkles size={14} className="text-white" />
                                </div>
                            )}

                            <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-[85%] gap-1.5`}>
                                <div
                                    className={`px-3.5 py-2.5 text-sm leading-relaxed rounded-2xl shadow-sm ${
                                        isUser
                                            ? 'bg-gradient-to-r from-kin-500 to-kin-600 text-white'
                                            : 'bg-white text-warmgray-800 border border-warmgray-100'
                                    }`}
                                >
                                    {isUser ? msg.content : renderMessageContent(msg.content)}
                                </div>

                                {/* Recipe card */}
                                {recipeCard && (
                                    <RecipeCard
                                        recipe={recipeCard}
                                        roomId={roomId}
                                        onScheduleCook={handleScheduleCook}
                                        onCreateShoppingList={handleCreateShoppingList}
                                    />
                                )}

                                {/* Action badges */}
                                {msg.actions && msg.actions.length > 0 && (
                                    <div className="flex flex-col gap-1">
                                        {msg.actions
                                            .filter((a: any) => a.type !== 'save_recipe' && a.type !== 'get_favorite_recipes')
                                            .map((action: any, j: number) => (
                                                <ActionBadge key={j} action={action} />
                                            ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}

                {isLoading && (
                    <div className="flex gap-2.5">
                        <div className="w-8 h-8 bg-gradient-to-br from-violet-400 to-kin-500 rounded-full flex items-center justify-center flex-shrink-0">
                            <Sparkles size={14} className="text-white" />
                        </div>
                        <div className="px-4 py-3 bg-white border border-warmgray-100 rounded-2xl shadow-sm">
                            <div className="flex items-center gap-2 text-sm text-warmgray-400">
                                <Loader2 size={14} className="animate-spin" />
                                Thinking...
                            </div>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
                        <AlertCircle size={14} />
                        {error}
                    </div>
                )}

                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="border-t border-warmgray-100 bg-white pt-3 pb-1 px-1">
                {messages.length > 0 && messages.length < 4 && !isLoading && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                        {SUGGESTION_CHIPS.map((chip, i) => {
                            const Icon = chip.icon;
                            return (
                                <button
                                    key={i}
                                    onClick={() => handleChipClick(chip.prompt)}
                                    className="flex items-center gap-1 px-2 py-1 bg-warmgray-50 border border-warmgray-200 rounded-lg text-[11px] text-warmgray-500 hover:border-kin-300 hover:text-kin-600 transition-all"
                                >
                                    <Icon size={12} />
                                    {chip.label}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* PDF extraction indicator */}
                {pdfExtracting && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl">
                        <Loader2 size={14} className="animate-spin text-violet-500" />
                        <span className="text-xs text-violet-600">Extracting text from {pendingPdfName}...</span>
                    </div>
                )}

                {/* Listening indicator */}
                {isListening && (
                    <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-xl animate-pulse">
                        <Mic size={14} className="text-red-500" />
                        <span className="text-xs text-red-600">Listening... tap mic to stop</span>
                    </div>
                )}

                <input ref={fileInputRef} type="file" accept=".pdf,.txt,.csv,.ics" className="hidden" onChange={handleFileUpload} />

                <div className="flex items-center gap-1.5">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isLoading || pdfExtracting}
                        className="p-2.5 rounded-xl text-warmgray-400 hover:text-violet-600 hover:bg-violet-50 transition-colors disabled:opacity-40"
                        title="Upload PDF or text file"
                    >
                        <Paperclip size={18} />
                    </button>
                    <button
                        onClick={toggleListening}
                        disabled={isLoading}
                        className={`p-2.5 rounded-xl transition-colors ${
                            isListening
                                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                                : 'text-warmgray-400 hover:text-violet-600 hover:bg-violet-50'
                        } disabled:opacity-40`}
                        title={isListening ? 'Stop listening' : 'Voice input'}
                    >
                        {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                    </button>
                    <input
                        ref={inputRef}
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={isListening ? 'Speak now...' : 'Ask KinLoop AI anything...'}
                        disabled={isLoading}
                        className="flex-1 px-4 py-2.5 bg-warmgray-50 border border-warmgray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent placeholder-warmgray-400 transition-all disabled:opacity-50"
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || isLoading}
                        className="p-2.5 bg-gradient-to-r from-violet-500 to-kin-600 text-white rounded-xl hover:from-violet-600 hover:to-kin-700 disabled:opacity-40 transition-all"
                    >
                        {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                    </button>
                </div>
            </div>
        </div>
    );
}
