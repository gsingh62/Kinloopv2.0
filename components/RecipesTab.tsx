import { useState } from 'react';
import {
    ChefHat, Heart, Clock, Users as UsersIcon, BookOpen, Trash2,
    CheckCircle2, Circle, ExternalLink, Sparkles,
} from 'lucide-react';
import {
    type Recipe,
    toggleRecipeFavorite,
    deleteRecipe,
    updateRecipeCompletedSteps,
} from '../lib/firestoreUtils';

interface RecipesTabProps {
    roomId: string;
    recipes: Recipe[];
    onAskAI: (prompt: string) => void;
}

export default function RecipesTab({ roomId, recipes, onAskAI }: RecipesTabProps) {
    const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
    const [filter, setFilter] = useState<'all' | 'favorites'>('all');

    const filtered = filter === 'favorites'
        ? recipes.filter(r => r.isFavorite)
        : recipes;

    const selected = filtered.find(r => r.id === selectedRecipeId) || null;

    return (
        <div className="max-w-4xl mx-auto">
            {recipes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-16 h-16 bg-gradient-to-br from-orange-100 to-amber-100 rounded-2xl flex items-center justify-center mb-4">
                        <ChefHat size={32} className="text-orange-500" />
                    </div>
                    <h3 className="text-base font-semibold text-warmgray-800 mb-1">No recipes yet</h3>
                    <p className="text-sm text-warmgray-400 text-center mb-4 max-w-xs">
                        Ask KinLoop AI to extract a recipe from any URL, or save your own favorites.
                    </p>
                    <button
                        onClick={() => onAskAI('Can you extract the recipe from this URL? ')}
                        className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-violet-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-violet-600 hover:to-kin-700 transition-all"
                    >
                        <Sparkles size={16} />
                        Ask AI to add a recipe
                    </button>
                </div>
            ) : selected ? (
                <RecipeDetailView
                    recipe={selected}
                    roomId={roomId}
                    onBack={() => setSelectedRecipeId(null)}
                    onAskAI={onAskAI}
                />
            ) : (
                <>
                    {/* Filter bar */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex bg-warmgray-100 rounded-xl p-1">
                            <button
                                onClick={() => setFilter('all')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    filter === 'all' ? 'bg-white text-warmgray-800 shadow-sm' : 'text-warmgray-500'
                                }`}
                            >
                                All ({recipes.length})
                            </button>
                            <button
                                onClick={() => setFilter('favorites')}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                                    filter === 'favorites' ? 'bg-white text-warmgray-800 shadow-sm' : 'text-warmgray-500'
                                }`}
                            >
                                <span className="flex items-center gap-1">
                                    <Heart size={12} className="text-red-500" />
                                    Favorites ({recipes.filter(r => r.isFavorite).length})
                                </span>
                            </button>
                        </div>
                        <div className="flex-1" />
                        <button
                            onClick={() => onAskAI('Can you extract the recipe from this URL? ')}
                            className="flex items-center gap-1.5 px-3 py-2 bg-violet-50 border border-violet-200 rounded-xl text-xs text-violet-700 font-medium hover:bg-violet-100 transition-all"
                        >
                            <Sparkles size={13} />
                            Add via AI
                        </button>
                    </div>

                    {/* Recipe grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {filtered.map(recipe => (
                            <RecipeListCard
                                key={recipe.id}
                                recipe={recipe}
                                roomId={roomId}
                                onClick={() => setSelectedRecipeId(recipe.id)}
                            />
                        ))}
                    </div>

                    {/* AI suggestion */}
                    {recipes.filter(r => r.isFavorite).length >= 2 && (
                        <div className="mt-6 p-4 bg-gradient-to-r from-violet-50 to-kin-50 rounded-2xl border border-violet-100">
                            <p className="text-sm text-warmgray-600 mb-2">
                                Not sure what to cook? Let AI help you decide!
                            </p>
                            <button
                                onClick={() => onAskAI('Help me choose what to cook from my favorite recipes. Consider variety and what might be quick to make.')}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-violet-200 rounded-xl text-xs font-medium text-violet-700 hover:bg-violet-50 transition-all"
                            >
                                <Sparkles size={14} />
                                Help me pick a recipe
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function RecipeListCard({
    recipe,
    roomId,
    onClick,
}: {
    recipe: Recipe;
    roomId: string;
    onClick: () => void;
}) {
    const stepsCompleted = recipe.completedSteps?.length || 0;
    const totalSteps = recipe.steps?.length || 0;
    const progress = totalSteps > 0 ? Math.round((stepsCompleted / totalSteps) * 100) : 0;

    const handleFavToggle = async (e: React.MouseEvent) => {
        e.stopPropagation();
        await toggleRecipeFavorite(roomId, recipe.id, recipe.isFavorite);
    };

    return (
        <button
            onClick={onClick}
            className="text-left bg-white border border-warmgray-200 rounded-2xl p-4 hover:border-orange-300 hover:shadow-sm transition-all group"
        >
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    <ChefHat size={16} className="text-orange-500" />
                    <h4 className="font-semibold text-sm text-warmgray-800 group-hover:text-orange-700 transition-colors">
                        {recipe.title}
                    </h4>
                </div>
                <button onClick={handleFavToggle} className="p-1 rounded-full hover:bg-orange-50">
                    <Heart
                        size={14}
                        className={recipe.isFavorite ? 'text-red-500 fill-red-500' : 'text-warmgray-300'}
                    />
                </button>
            </div>

            <div className="flex gap-2 text-[11px] text-warmgray-500 mb-2">
                {recipe.cookTime && <span className="flex items-center gap-1"><Clock size={10} />{recipe.cookTime}</span>}
                {recipe.servings && <span className="flex items-center gap-1"><UsersIcon size={10} />{recipe.servings}</span>}
                <span>{recipe.ingredients?.length || 0} ingredients</span>
            </div>

            {totalSteps > 0 && (
                <div className="flex items-center gap-2">
                    <div className="flex-1 h-1 bg-warmgray-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all"
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                    <span className="text-[10px] text-warmgray-400 font-medium">{stepsCompleted}/{totalSteps}</span>
                </div>
            )}
        </button>
    );
}

function RecipeDetailView({
    recipe,
    roomId,
    onBack,
    onAskAI,
}: {
    recipe: Recipe;
    roomId: string;
    onBack: () => void;
    onAskAI: (prompt: string) => void;
}) {
    const [completedSteps, setCompletedSteps] = useState<number[]>(recipe.completedSteps || []);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    const toggleStep = async (idx: number) => {
        const next = completedSteps.includes(idx)
            ? completedSteps.filter(s => s !== idx)
            : [...completedSteps, idx];
        setCompletedSteps(next);
        await updateRecipeCompletedSteps(roomId, recipe.id, next);
    };

    const handleDelete = async () => {
        await deleteRecipe(roomId, recipe.id);
        onBack();
    };

    const handleFav = async () => {
        await toggleRecipeFavorite(roomId, recipe.id, recipe.isFavorite);
    };

    const progress = recipe.steps.length > 0
        ? Math.round((completedSteps.length / recipe.steps.length) * 100)
        : 0;

    return (
        <div>
            {/* Back button */}
            <button
                onClick={onBack}
                className="flex items-center gap-1 text-sm text-warmgray-500 hover:text-warmgray-700 mb-4 transition-colors"
            >
                ← All recipes
            </button>

            {/* Header */}
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 rounded-2xl p-5 mb-4 border border-orange-100">
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-warmgray-800 flex items-center gap-2">
                            <ChefHat size={20} className="text-orange-500" />
                            {recipe.title}
                        </h2>
                        <div className="flex gap-3 mt-2 text-xs text-warmgray-500">
                            {recipe.prepTime && <span className="flex items-center gap-1"><Clock size={12} /> Prep: {recipe.prepTime}</span>}
                            {recipe.cookTime && <span className="flex items-center gap-1"><Clock size={12} /> Cook: {recipe.cookTime}</span>}
                            {recipe.servings && <span className="flex items-center gap-1"><UsersIcon size={12} /> {recipe.servings}</span>}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={handleFav} className="p-2 rounded-xl bg-white border border-warmgray-200 hover:bg-red-50 transition-colors">
                            <Heart size={16} className={recipe.isFavorite ? 'text-red-500 fill-red-500' : 'text-warmgray-400'} />
                        </button>
                        {recipe.url && (
                            <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="p-2 rounded-xl bg-white border border-warmgray-200 hover:bg-warmgray-50 transition-colors">
                                <ExternalLink size={16} className="text-warmgray-400" />
                            </a>
                        )}
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="p-2 rounded-xl bg-white border border-warmgray-200 hover:bg-red-50 transition-colors"
                        >
                            <Trash2 size={16} className="text-warmgray-400" />
                        </button>
                    </div>
                </div>

                {/* Quick actions */}
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={() => onAskAI(`Create a shopping list with all the ingredients from "${recipe.title}"`)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-warmgray-200 rounded-xl text-xs font-medium text-warmgray-700 hover:border-sage-300 transition-all"
                    >
                        <Sparkles size={13} className="text-violet-500" />
                        Create shopping list
                    </button>
                    <button
                        onClick={() => onAskAI(`Schedule time to cook "${recipe.title}" this weekend`)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white border border-warmgray-200 rounded-xl text-xs font-medium text-warmgray-700 hover:border-sky-300 transition-all"
                    >
                        <Sparkles size={13} className="text-violet-500" />
                        Schedule cooking time
                    </button>
                </div>
            </div>

            {showDeleteConfirm && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between">
                    <span className="text-sm text-red-700">Delete this recipe?</span>
                    <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1 bg-white border border-warmgray-200 rounded-lg text-xs">Cancel</button>
                        <button onClick={handleDelete} className="px-3 py-1 bg-red-500 text-white rounded-lg text-xs">Delete</button>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Ingredients */}
                <div className="bg-white border border-warmgray-200 rounded-2xl p-4">
                    <h3 className="text-xs font-semibold text-warmgray-500 uppercase tracking-wide mb-3">
                        Ingredients ({recipe.ingredients.length})
                    </h3>
                    <div className="space-y-1.5">
                        {recipe.ingredients.map((ing, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm text-warmgray-700">
                                <span className="text-warmgray-300 mt-0.5">•</span>
                                <span>{ing}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Steps */}
                <div className="md:col-span-2 bg-white border border-warmgray-200 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-semibold text-warmgray-500 uppercase tracking-wide">
                            Steps ({recipe.steps.length})
                        </h3>
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-warmgray-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-green-400 to-emerald-500 rounded-full transition-all duration-300"
                                    style={{ width: `${progress}%` }}
                                />
                            </div>
                            <span className="text-[11px] text-warmgray-500 font-medium">{progress}%</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        {recipe.steps.map((step, idx) => {
                            const isDone = completedSteps.includes(idx);
                            return (
                                <button
                                    key={idx}
                                    onClick={() => toggleStep(idx)}
                                    className={`flex gap-3 w-full text-left p-3 rounded-xl transition-all text-sm ${
                                        isDone
                                            ? 'bg-green-50 text-warmgray-400'
                                            : 'bg-warmgray-50 text-warmgray-700 hover:bg-warmgray-100'
                                    }`}
                                >
                                    {isDone
                                        ? <CheckCircle2 size={18} className="text-green-500 flex-shrink-0 mt-0.5" />
                                        : <Circle size={18} className="text-warmgray-300 flex-shrink-0 mt-0.5" />
                                    }
                                    <div>
                                        <span className="font-semibold text-warmgray-500 mr-1">Step {idx + 1}.</span>
                                        <span className={isDone ? 'line-through' : ''}>{step}</span>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    {completedSteps.length === recipe.steps.length && recipe.steps.length > 0 && (
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-xl text-center">
                            <p className="text-sm font-medium text-green-700">All steps completed! Enjoy your meal! 🎉</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
