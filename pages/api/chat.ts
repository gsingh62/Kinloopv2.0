import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

export const config = {
    api: {
        bodyParser: {
            sizeLimit: '10mb',
        },
    },
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are KinLoop AI, a warm and helpful family assistant built into the KinLoop app. You help family members manage their shared household by:

- Managing lists and chore boards (create, add items, delete items, delete entire lists, assign chores)
- Managing documents (create, edit, delete)
- Managing calendar events
- Planning trips, days, outings, and ideas
- Extracting recipes from URLs — saving them, creating shopping lists, scheduling cooking time
- Helping choose from saved favorite recipes
- Room management (leave room, remove members)
- Extracting events/dates from URLs (school calendars, event pages, bookings)
- Extracting events/dates from pasted text or PDF content (the app sends you extracted PDF text)
- Extracting chores from images (photos of whiteboards, chore charts, handwritten lists, etc.) and adding them in bulk to chore boards

PERSONALITY: You're friendly, concise, and practical — like a helpful family member. Use a warm tone but keep responses brief. Don't over-explain.

TOOL USAGE RULES:
- When the user wants to add items to a list, use add_items_to_list if they specify which list, or create_list if it's a new one.
- When creating a list, you can set type to "choreboard" for a chore board or "list" for a traditional list.
- When the user wants to remove items from a list, use delete_list_items.
- When the user wants to delete an entire list, use delete_list.
- When the user wants to assign a chore to someone, use assign_chore with the member's name.
- When the user wants to add a chore to their calendar, use add_chore_to_calendar.
- When the user shares a recipe URL, use fetch_recipe_from_url to extract the recipe. The result will contain "steps" (cooking instructions) and "ingredients". ALWAYS then call save_recipe with ALL the data — title, ingredients, steps, servings, prepTime, cookTime. The "steps" field from the fetch result maps directly to the "steps" parameter in save_recipe. Never omit steps. Then present the recipe nicely and offer to: (1) create a shopping list for ingredients, (2) schedule cooking time on the calendar.
- When the user wants to see their saved/favorite recipes, use get_favorite_recipes.
- When the user wants to plan cooking from favorites, help them pick a recipe, create a shopping list, and schedule it.
- When the user mentions dates/times for events, use add_event. Parse natural language dates relative to today.
- Events support participants (room members or external emails) and visibility settings.
- If the user specifies participants like "add Mom and Dad" or "invite john@example.com", include them in the participants array.
- If the user says "only I can see this" or "private event", set visibility to "private". If they say "only participants can see", set visibility to "participants".
- Default visibility is "everyone" (all room members can see the event).
- When the user wants to plan something (trip, day, party, etc.), use create_document to save the plan.
- When the user wants to edit a document, use modify_document.
- When the user wants to delete a document, use delete_document.
- When the user wants to leave a room, use leave_room. Confirm first.
- When the user wants to remove a member, use remove_member. Only the room owner can do this.
- If the user's request is ambiguous, ask a brief clarifying question instead of guessing.

DATE & EVENT EXTRACTION:
- When the user shares a URL and asks to find events/dates, use fetch_events_from_url. Parse the result to identify events.
- When the user uploads a PDF or text file, the content is provided in a hidden section marked "EXTRACTED CONTENT". Do NOT repeat or display the raw extracted text. Instead, parse it for dates/events.
- IMPORTANT: NEVER dump raw PDF/file text back to the user. Always parse it yourself and present a clean summary.
- After parsing events from a PDF, URL, or text: Present the events as a clean numbered proposal list (title + date). Then ask: "Would you like me to add all of these to your calendar, or would you like to pick specific ones?" Wait for the user's confirmation before calling add_event.
- Only call add_event AFTER the user confirms (says "yes", "add them all", "add 1, 3, 5", etc.).
- Parse dates intelligently — handle formats like "March 15", "3/15/2026", "Mar 15 2026", "15th March", relative dates like "next Tuesday", date ranges like "April 7-11" (create start event).
- For the school year context, infer the correct year (e.g., 2025-26 school year means Aug-Dec is 2025, Jan-Jun is 2026).

EVENT DELETION:
- When the user asks to delete calendar events, use delete_event with the event's Firestore ID from the room context.
- The room context includes events with their IDs, titles, and dates. Match the user's request to the correct event(s).
- If the user says "delete the last added events", "undo the calendar events", or similar, identify the relevant events from context and delete them.
- If the user asks to delete events by date range or title pattern, find all matching events from context and delete each one.
- Always confirm what you're deleting by listing the event titles before executing the deletions.

CHORE EXTRACTION FROM IMAGES:
- When the user uploads an image (photo of a whiteboard, chore chart, handwritten list, printed schedule, etc.) and asks to extract chores, analyze the image carefully.
- Identify all chore/task items visible in the image.
- Present the chores as a clean numbered list and ask which chore board to add them to (or offer to create a new one).
- IMPORTANT: Always propose the chores first and wait for user confirmation before adding them.
- After confirmation, use add_chores to bulk-add all chores at once to the specified chore board.
- If you can infer time estimates from the image or context (e.g. "quick", "30 min"), include them.
- If you can identify who chores are assigned to, include assignee info.

RECIPE PRESENTATION:
When presenting a recipe, format it beautifully with:
- Recipe name as a header
- Prep time, cook time, servings if available
- Numbered ingredients list
- Numbered step-by-step instructions
- Then ask: "Would you like me to: 1) Create a shopping list for the ingredients? 2) Schedule cooking time on your calendar? 3) Save this as a favorite?"

TODAY'S DATE: ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
        type: 'function',
        function: {
            name: 'add_items_to_list',
            description: 'Add one or more items to an existing list in the room.',
            parameters: {
                type: 'object',
                properties: {
                    listName: { type: 'string', description: 'Name of the existing list (case-insensitive match)' },
                    items: { type: 'array', items: { type: 'string' }, description: 'Items to add' },
                },
                required: ['listName', 'items'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_list',
            description: 'Create a new list or chore board with optional initial items.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name for the new list' },
                    items: { type: 'array', items: { type: 'string' }, description: 'Optional initial items' },
                    listType: { type: 'string', enum: ['list', 'choreboard'], description: 'Type of list: "list" for traditional, "choreboard" for chore board (default: list)' },
                },
                required: ['name'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_list_items',
            description: 'Delete specific items from a list by their content text.',
            parameters: {
                type: 'object',
                properties: {
                    listName: { type: 'string', description: 'Name of the list to remove items from' },
                    items: { type: 'array', items: { type: 'string' }, description: 'Item names to remove (case-insensitive match)' },
                },
                required: ['listName', 'items'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_list',
            description: 'Delete an entire list and all its items.',
            parameters: {
                type: 'object',
                properties: {
                    listName: { type: 'string', description: 'Name of the list to delete' },
                },
                required: ['listName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_event',
            description: 'Add a calendar event. Parse natural language dates and times. Can include participants and visibility settings.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Event title' },
                    date: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
                    startTime: { type: 'string', description: 'Start time in HH:mm 24h format (optional)' },
                    endTime: { type: 'string', description: 'End time in HH:mm 24h format (optional)' },
                    description: { type: 'string', description: 'Event description (optional)' },
                    allDay: { type: 'boolean', description: 'Whether all-day event (default true if no time)' },
                    participants: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                uid: { type: 'string', description: 'KinLoop user UID (if a room member)' },
                                email: { type: 'string', description: 'Email address' },
                                name: { type: 'string', description: 'Display name' },
                            },
                            required: ['email'],
                        },
                        description: 'Participants for this event — room members or external emails (optional)',
                    },
                    visibility: {
                        type: 'string',
                        enum: ['everyone', 'participants', 'private', 'custom'],
                        description: 'Who can see this event: everyone (default), participants only, private (creator only), or custom',
                    },
                },
                required: ['title', 'date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_event',
            description: 'Delete a calendar event by its ID. Use the event IDs from the room context. Can also match events by title and date if the user describes them.',
            parameters: {
                type: 'object',
                properties: {
                    eventId: { type: 'string', description: 'The Firestore document ID of the event to delete' },
                    title: { type: 'string', description: 'Title of the deleted event (for confirmation display)' },
                },
                required: ['eventId', 'title'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'create_document',
            description: 'Create a new document with rich text content (HTML).',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Document title' },
                    content: { type: 'string', description: 'Document content in simple HTML' },
                },
                required: ['title', 'content'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'modify_document',
            description: 'Modify an existing document by title. Replaces the content.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Title of the document to modify (case-insensitive match)' },
                    newContent: { type: 'string', description: 'New content in simple HTML' },
                    newTitle: { type: 'string', description: 'New title (optional, only if renaming)' },
                },
                required: ['title', 'newContent'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_document',
            description: 'Delete a document by title.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Title of the document to delete (case-insensitive match)' },
                },
                required: ['title'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'fetch_recipe_from_url',
            description: 'Fetch a recipe from a URL and extract ingredients and instructions. After fetching, use save_recipe to save it.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The recipe URL to fetch' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'save_recipe',
            description: 'Save a recipe to the room\'s recipe collection. Use after fetching a recipe from a URL, or when user wants to save a recipe as favorite.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Recipe name' },
                    url: { type: 'string', description: 'Source URL (optional)' },
                    ingredients: { type: 'array', items: { type: 'string' }, description: 'List of ingredients' },
                    steps: { type: 'array', items: { type: 'string' }, description: 'Cooking steps in order' },
                    servings: { type: 'string', description: 'Number of servings (optional)' },
                    prepTime: { type: 'string', description: 'Prep time (optional)' },
                    cookTime: { type: 'string', description: 'Cook time (optional)' },
                    isFavorite: { type: 'boolean', description: 'Whether to mark as favorite (default true)' },
                },
                required: ['title', 'ingredients', 'steps'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'get_favorite_recipes',
            description: 'Get the list of saved/favorite recipes in the room. Use when user wants to browse recipes, choose what to cook, or manage their recipe collection.',
            parameters: {
                type: 'object',
                properties: {},
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'toggle_recipe_favorite',
            description: 'Toggle a recipe\'s favorite status.',
            parameters: {
                type: 'object',
                properties: {
                    recipeTitle: { type: 'string', description: 'Title of the recipe to toggle (case-insensitive match)' },
                },
                required: ['recipeTitle'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'delete_recipe',
            description: 'Delete a saved recipe.',
            parameters: {
                type: 'object',
                properties: {
                    recipeTitle: { type: 'string', description: 'Title of the recipe to delete (case-insensitive match)' },
                },
                required: ['recipeTitle'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'assign_chore',
            description: 'Assign a chore from a chore board to a specific room member.',
            parameters: {
                type: 'object',
                properties: {
                    listName: { type: 'string', description: 'Name of the chore board' },
                    choreName: { type: 'string', description: 'Name/content of the chore to assign' },
                    memberName: { type: 'string', description: 'Name or email prefix of the member to assign to' },
                },
                required: ['listName', 'choreName', 'memberName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_chore_to_calendar',
            description: 'Add a chore to the calendar with a time estimate.',
            parameters: {
                type: 'object',
                properties: {
                    choreName: { type: 'string', description: 'Name of the chore' },
                    date: { type: 'string', description: 'Date in YYYY-MM-DD format' },
                    startTime: { type: 'string', description: 'Start time in HH:mm 24h format (optional)' },
                    durationMinutes: { type: 'number', description: 'Estimated duration in minutes (default 30)' },
                },
                required: ['choreName', 'date'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'add_chores',
            description: 'Bulk-add multiple chores to a chore board. Creates the board if it does not exist. Use after extracting chores from an image or text.',
            parameters: {
                type: 'object',
                properties: {
                    listName: { type: 'string', description: 'Name of the chore board to add chores to (creates if not found)' },
                    chores: {
                        type: 'array',
                        items: {
                            type: 'object',
                            properties: {
                                content: { type: 'string', description: 'The chore description' },
                                timeEstimate: { type: 'number', description: 'Estimated minutes to complete (optional)' },
                                assignee: { type: 'string', description: 'Name of person to assign to (optional, matched to room members)' },
                            },
                            required: ['content'],
                        },
                        description: 'Array of chores to add',
                    },
                },
                required: ['listName', 'chores'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'fetch_events_from_url',
            description: 'Fetch a webpage and extract event/date information from it. Use when a user shares a URL and wants to find dates, events, or schedules on that page.',
            parameters: {
                type: 'object',
                properties: {
                    url: { type: 'string', description: 'The URL to fetch and extract events from' },
                },
                required: ['url'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'leave_room',
            description: 'Leave the current room. The current user will be removed from the room members.',
            parameters: {
                type: 'object',
                properties: {
                    confirm: { type: 'boolean', description: 'Must be true to confirm leaving' },
                },
                required: ['confirm'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remove_member',
            description: 'Remove a member from the room. Only the room owner can do this.',
            parameters: {
                type: 'object',
                properties: {
                    memberName: { type: 'string', description: 'Name or email prefix of the member to remove' },
                },
                required: ['memberName'],
            },
        },
    },
];

function extractSteps(instructions: any): string[] {
    if (!instructions) return [];
    if (typeof instructions === 'string') return [instructions];
    if (!Array.isArray(instructions)) return [];

    const steps: string[] = [];
    for (const item of instructions) {
        if (typeof item === 'string') {
            steps.push(item);
        } else if (item?.text) {
            steps.push(item.text);
        } else if (item?.['@type'] === 'HowToSection' && Array.isArray(item.itemListElement)) {
            for (const subItem of item.itemListElement) {
                if (typeof subItem === 'string') steps.push(subItem);
                else if (subItem?.text) steps.push(subItem.text);
            }
        } else if (item?.['@type'] === 'HowToStep') {
            if (item.text) steps.push(item.text);
            else if (item.name) steps.push(item.name);
        }
    }
    return steps.filter(s => s && s.trim().length > 0);
}

async function fetchRecipeFromUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KinLoopBot/1.0)',
                'Accept': 'text/html',
            },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();

        const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatch) {
            for (const match of jsonLdMatch) {
                try {
                    const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                    const data = JSON.parse(jsonStr);
                    const recipe = Array.isArray(data)
                        ? data.find((d: any) => d['@type'] === 'Recipe')
                        : data['@type'] === 'Recipe'
                            ? data
                            : data['@graph']?.find?.((d: any) => d['@type'] === 'Recipe');
                    if (recipe) {
                        const steps = extractSteps(recipe.recipeInstructions);
                        return JSON.stringify({
                            name: recipe.name,
                            ingredients: recipe.recipeIngredient || [],
                            steps,
                            servings: recipe.recipeYield,
                            prepTime: recipe.prepTime,
                            cookTime: recipe.cookTime,
                            url,
                        });
                    }
                } catch { /* try next */ }
            }
        }

        const textContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 8000);

        return `Raw page text (no structured recipe data found, url: ${url}): ${textContent}`;
    } catch (error: any) {
        return `Error fetching URL: ${error.message}`;
    }
}

async function fetchEventsFromUrl(url: string): Promise<string> {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; KinLoopBot/1.0)',
                'Accept': 'text/html',
            },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const html = await response.text();

        // Try JSON-LD Event schema
        const events: any[] = [];
        const jsonLdMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
        if (jsonLdMatch) {
            for (const match of jsonLdMatch) {
                try {
                    const jsonStr = match.replace(/<script[^>]*>/, '').replace(/<\/script>/, '');
                    const data = JSON.parse(jsonStr);
                    const items = Array.isArray(data) ? data : data['@graph'] ? data['@graph'] : [data];
                    for (const item of items) {
                        if (item['@type'] === 'Event' || item['@type']?.includes?.('Event')) {
                            events.push({
                                name: item.name,
                                startDate: item.startDate,
                                endDate: item.endDate,
                                location: item.location?.name || item.location?.address || '',
                                description: item.description?.slice(0, 200) || '',
                            });
                        }
                    }
                } catch { /* try next */ }
            }
        }

        if (events.length > 0) {
            return JSON.stringify({ source: 'structured', url, events });
        }

        // Fallback: extract text for AI to parse
        const textContent = html
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000);

        return JSON.stringify({ source: 'raw_text', url, text: textContent });
    } catch (error: any) {
        return JSON.stringify({ error: `Failed to fetch URL: ${error.message}` });
    }
}

function processToolCalls(toolCalls: OpenAI.Chat.Completions.ChatCompletionMessageToolCall[]) {
    const actions: any[] = [];
    const toolResults: { tool_call_id: string; content: string }[] = [];

    for (const tc of toolCalls) {
        const args = JSON.parse(tc.function.arguments);
        const name = tc.function.name;

        switch (name) {
            case 'add_items_to_list':
                actions.push({ type: 'add_items_to_list', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Added ${args.items.length} items to "${args.listName}"` });
                break;
            case 'create_list':
                actions.push({ type: 'create_list', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Created list "${args.name}" with ${args.items?.length || 0} items` });
                break;
            case 'delete_list_items':
                actions.push({ type: 'delete_list_items', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Removed ${args.items.length} items from "${args.listName}"` });
                break;
            case 'delete_list':
                actions.push({ type: 'delete_list', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Deleted list "${args.listName}"` });
                break;
            case 'add_event':
                actions.push({ type: 'add_event', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Created event "${args.title}" on ${args.date}${args.startTime ? ` at ${args.startTime}` : ''}` });
                break;
            case 'delete_event':
                actions.push({ type: 'delete_event', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Deleted event "${args.title}" (id: ${args.eventId})` });
                break;
            case 'create_document':
                actions.push({ type: 'create_document', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Created document "${args.title}"` });
                break;
            case 'modify_document':
                actions.push({ type: 'modify_document', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Modified document "${args.title}"` });
                break;
            case 'delete_document':
                actions.push({ type: 'delete_document', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Deleted document "${args.title}"` });
                break;
            case 'save_recipe':
                actions.push({ type: 'save_recipe', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Saved recipe "${args.title}" with ${args.ingredients?.length || 0} ingredients and ${args.steps?.length || 0} steps` });
                break;
            case 'get_favorite_recipes':
                actions.push({ type: 'get_favorite_recipes' });
                toolResults.push({ tool_call_id: tc.id, content: 'Fetching favorite recipes... (client will provide data)' });
                break;
            case 'toggle_recipe_favorite':
                actions.push({ type: 'toggle_recipe_favorite', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Toggled favorite status for "${args.recipeTitle}"` });
                break;
            case 'delete_recipe':
                actions.push({ type: 'delete_recipe', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Deleted recipe "${args.recipeTitle}"` });
                break;
            case 'assign_chore':
                actions.push({ type: 'assign_chore', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Assigned "${args.choreName}" to ${args.memberName}` });
                break;
            case 'add_chore_to_calendar':
                actions.push({ type: 'add_chore_to_calendar', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Added "${args.choreName}" to calendar on ${args.date}` });
                break;
            case 'add_chores':
                actions.push({ type: 'add_chores', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Added ${args.chores?.length || 0} chores to "${args.listName}"` });
                break;
            case 'leave_room':
                actions.push({ type: 'leave_room', ...args });
                toolResults.push({ tool_call_id: tc.id, content: args.confirm ? 'Left the room' : 'Leaving cancelled' });
                break;
            case 'remove_member':
                actions.push({ type: 'remove_member', ...args });
                toolResults.push({ tool_call_id: tc.id, content: `Removed ${args.memberName} from the room` });
                break;
            default:
                toolResults.push({ tool_call_id: tc.id, content: 'Unknown tool' });
        }
    }

    return { actions, toolResults };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { messages, roomContext } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'messages array is required' });
    if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'OpenAI API key not configured' });

    const contextNote = roomContext
        ? `\n\nROOM CONTEXT:\n- Room: "${roomContext.roomName || 'Family Room'}"\n- Members: ${
            roomContext.members?.length ? roomContext.members.map((m: any) => `${m.name} (uid: ${m.uid}, email: ${m.email || 'unknown'})`).join(', ') : 'unknown'
        }\n- Available lists: ${
            roomContext.lists?.length ? roomContext.lists.map((l: any) => `"${l.name}" (id: ${l.id}, type: ${l.type || 'list'})`).join(', ') : 'none yet'
        }\n- Documents: ${
            roomContext.documents?.length ? roomContext.documents.map((d: any) => `"${d.title}" (id: ${d.id})`).join(', ') : 'none'
        }\n- Calendar events (with IDs for deletion): ${
            roomContext.events?.length ? roomContext.events.map((e: any) => `"${e.title}" on ${e.date} (id: ${e.id})`).join(', ') : 'none'
        }\n- Saved recipes: ${
            roomContext.recipes?.length ? roomContext.recipes.map((r: any) => `"${r.title}"${r.isFavorite ? ' ★' : ''}`).join(', ') : 'none'
        }`
        : '';

    const systemMessage = { role: 'system' as const, content: SYSTEM_PROMPT + contextNote };

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [systemMessage, ...messages],
            tools,
            tool_choice: 'auto',
            temperature: 0.7,
            max_tokens: 4000,
        });

        let assistantMessage = completion.choices[0].message;
        const allActions: any[] = [];

        // Handle up to 5 rounds of tool calls (more for bulk event extraction)
        let conversationMessages: any[] = [systemMessage, ...messages];
        for (let round = 0; round < 5; round++) {
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) break;

            conversationMessages.push(assistantMessage);

            // Separate async tools (fetches) from sync tools
            const asyncToolNames = ['fetch_recipe_from_url', 'fetch_events_from_url'];
            const asyncCalls = assistantMessage.tool_calls.filter(tc => asyncToolNames.includes(tc.function.name));
            const otherCalls = assistantMessage.tool_calls.filter(tc => !asyncToolNames.includes(tc.function.name));

            for (const ac of asyncCalls) {
                const args = JSON.parse(ac.function.arguments);
                let result: string;
                if (ac.function.name === 'fetch_recipe_from_url') {
                    result = await fetchRecipeFromUrl(args.url);
                } else {
                    result = await fetchEventsFromUrl(args.url);
                }
                conversationMessages.push({ role: 'tool', tool_call_id: ac.id, content: result });
            }

            if (otherCalls.length > 0) {
                const { actions, toolResults } = processToolCalls(otherCalls);
                allActions.push(...actions);
                for (const tr of toolResults) {
                    conversationMessages.push({ role: 'tool', tool_call_id: tr.tool_call_id, content: tr.content });
                }
            }

            const nextCompletion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: conversationMessages,
                tools,
                tool_choice: 'auto',
                temperature: 0.7,
                max_tokens: 4000,
            });

            assistantMessage = nextCompletion.choices[0].message;
        }

        return res.status(200).json({
            message: assistantMessage.content || '',
            actions: allActions,
        });
    } catch (error: any) {
        console.error('AI Chat error:', error);
        return res.status(500).json({ error: error.message || 'Failed to get AI response' });
    }
}
