import type { NextApiRequest, NextApiResponse } from 'next';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const SYSTEM_PROMPT = `You are KinLoop AI, a warm and helpful family assistant built into the KinLoop app. You help family members manage their shared household by:

- Managing lists (create, add items, delete items, delete entire lists)
- Managing documents (create, edit, delete)
- Managing calendar events
- Planning trips, days, outings, and ideas
- Extracting recipes from URLs — saving them, creating shopping lists, scheduling cooking time
- Helping choose from saved favorite recipes

PERSONALITY: You're friendly, concise, and practical — like a helpful family member. Use a warm tone but keep responses brief. Don't over-explain.

TOOL USAGE RULES:
- When the user wants to add items to a list, use add_items_to_list if they specify which list, or create_list if it's a new one.
- When the user wants to remove items from a list, use delete_list_items.
- When the user wants to delete an entire list, use delete_list.
- When the user shares a recipe URL, use fetch_recipe_from_url to extract the recipe. The result will contain "steps" (cooking instructions) and "ingredients". ALWAYS then call save_recipe with ALL the data — title, ingredients, steps, servings, prepTime, cookTime. The "steps" field from the fetch result maps directly to the "steps" parameter in save_recipe. Never omit steps. Then present the recipe nicely and offer to: (1) create a shopping list for ingredients, (2) schedule cooking time on the calendar.
- When the user wants to see their saved/favorite recipes, use get_favorite_recipes.
- When the user wants to plan cooking from favorites, help them pick a recipe, create a shopping list, and schedule it.
- When the user mentions dates/times for events, use add_event. Parse natural language dates relative to today.
- When the user wants to plan something (trip, day, party, etc.), use create_document to save the plan.
- When the user wants to edit a document, use modify_document.
- When the user wants to delete a document, use delete_document.
- If the user's request is ambiguous, ask a brief clarifying question instead of guessing.

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
            description: 'Create a new list with optional initial items.',
            parameters: {
                type: 'object',
                properties: {
                    name: { type: 'string', description: 'Name for the new list' },
                    items: { type: 'array', items: { type: 'string' }, description: 'Optional initial items' },
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
            description: 'Add a calendar event. Parse natural language dates and times.',
            parameters: {
                type: 'object',
                properties: {
                    title: { type: 'string', description: 'Event title' },
                    date: { type: 'string', description: 'Event date in YYYY-MM-DD format' },
                    startTime: { type: 'string', description: 'Start time in HH:mm 24h format (optional)' },
                    endTime: { type: 'string', description: 'End time in HH:mm 24h format (optional)' },
                    description: { type: 'string', description: 'Event description (optional)' },
                    allDay: { type: 'boolean', description: 'Whether all-day event (default true if no time)' },
                },
                required: ['title', 'date'],
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
        ? `\n\nROOM CONTEXT:\n- Room: "${roomContext.roomName || 'Family Room'}"\n- Available lists: ${
            roomContext.lists?.length ? roomContext.lists.map((l: any) => `"${l.name}" (id: ${l.id})`).join(', ') : 'none yet'
        }\n- Documents: ${
            roomContext.documents?.length ? roomContext.documents.map((d: any) => `"${d.title}" (id: ${d.id})`).join(', ') : 'none'
        }\n- Upcoming events: ${
            roomContext.events?.length ? roomContext.events.slice(0, 5).map((e: any) => `"${e.title}" on ${e.date}`).join(', ') : 'none'
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
            max_tokens: 3000,
        });

        let assistantMessage = completion.choices[0].message;
        const allActions: any[] = [];

        // Handle up to 3 rounds of tool calls
        let conversationMessages: any[] = [systemMessage, ...messages];
        for (let round = 0; round < 3; round++) {
            if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) break;

            conversationMessages.push(assistantMessage);

            // Separate async tools (recipe fetch) from sync tools
            const recipeCalls = assistantMessage.tool_calls.filter(tc => tc.function.name === 'fetch_recipe_from_url');
            const otherCalls = assistantMessage.tool_calls.filter(tc => tc.function.name !== 'fetch_recipe_from_url');

            for (const rc of recipeCalls) {
                const args = JSON.parse(rc.function.arguments);
                const recipeData = await fetchRecipeFromUrl(args.url);
                conversationMessages.push({ role: 'tool', tool_call_id: rc.id, content: recipeData });
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
                max_tokens: 3000,
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
