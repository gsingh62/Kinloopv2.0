// components/PhotoTab.tsx — Photo sharing with albums, upload, grid, and lightbox
import { useEffect, useState, useRef, useCallback } from 'react';
import { auth } from '../lib/firebase';
import {
    PhotoMeta, Album,
    subscribeToPhotos, uploadPhoto, deletePhoto, compressImage,
    subscribeToAlbums, createAlbum, renameAlbum, deleteAlbum, movePhotoToAlbum,
} from '../lib/photoUtils';
import {
    X, Trash2, ChevronLeft, ChevronRight, ArrowLeft,
    Image as ImageIcon, Camera, Check, FolderPlus,
    MoreHorizontal, Pencil, FolderOpen,
} from 'lucide-react';

interface PhotoTabProps {
    roomId: string;
}

type UploadStage = 'idle' | 'optimizing' | 'uploading' | 'saving' | 'done';

export default function PhotoTab({ roomId }: PhotoTabProps) {
    const [photos, setPhotos] = useState<PhotoMeta[]>([]);
    const [albums, setAlbums] = useState<Album[]>([]);
    const [stage, setStage] = useState<UploadStage>('idle');
    const [progress, setProgress] = useState(0);
    const [caption, setCaption] = useState('');
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [error, setError] = useState('');
    const [uploadSizeLabel, setUploadSizeLabel] = useState('');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    // Album state
    const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null); // null = "All Photos"
    const [uploadAlbumId, setUploadAlbumId] = useState<string | undefined>(undefined);
    const [showCreateAlbum, setShowCreateAlbum] = useState(false);
    const [newAlbumName, setNewAlbumName] = useState('');
    const [creatingAlbum, setCreatingAlbum] = useState(false);
    const [albumMenuId, setAlbumMenuId] = useState<string | null>(null);
    const [renamingAlbumId, setRenamingAlbumId] = useState<string | null>(null);
    const [renameValue, setRenameValue] = useState('');

    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelUploadRef = useRef<(() => void) | null>(null);

    // Subscribe to photos & albums
    useEffect(() => {
        if (!roomId) return;
        const unsub1 = subscribeToPhotos(roomId, setPhotos);
        const unsub2 = subscribeToAlbums(roomId, setAlbums);
        return () => { unsub1(); unsub2(); };
    }, [roomId]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const resetUpload = useCallback(() => {
        setStage('idle');
        setProgress(0);
        setCaption('');
        setError('');
        setUploadSizeLabel('');
        setUploadAlbumId(selectedAlbumId || undefined);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [previewUrl, selectedAlbumId]);

    // ─── File Upload ───

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) { setError('Please select an image file'); return; }
        if (file.size > 20 * 1024 * 1024) { setError('Image must be under 20MB'); return; }

        const user = auth.currentUser;
        if (!user) { setError('Please log in first'); return; }

        setError('');
        const preview = URL.createObjectURL(file);
        setPreviewUrl(preview);

        setStage('optimizing');
        setProgress(20);
        setUploadSizeLabel(`Original: ${formatSize(file.size)}`);
        let optimized: File;
        try { optimized = await compressImage(file); } catch { optimized = file; }

        const label = optimized.size < file.size
            ? `${formatSize(file.size)} → ${formatSize(optimized.size)}`
            : formatSize(optimized.size);
        setUploadSizeLabel(label);
        setProgress(40);

        setStage('uploading');

        try {
            const cancel = uploadPhoto(
                roomId, optimized,
                { uid: user.uid, email: user.email || '', displayName: user.displayName },
                caption,
                uploadAlbumId || (selectedAlbumId || undefined),
                (pct) => setProgress(40 + Math.round(pct * 0.4)),
                () => { setStage('saving'); setProgress(85); },
                () => { setProgress(100); setStage('done'); setTimeout(() => resetUpload(), 800); },
                (err) => { setError(err.message || 'Upload failed'); setStage('idle'); }
            );
            cancelUploadRef.current = cancel;
        } catch (err: any) {
            setError(err.message || 'Upload failed');
            setStage('idle');
        }
    };

    const handleCancelUpload = () => {
        if (cancelUploadRef.current) cancelUploadRef.current();
        resetUpload();
    };

    // ─── Albums ───

    const handleCreateAlbum = async () => {
        if (!newAlbumName.trim()) return;
        const user = auth.currentUser;
        if (!user) return;
        setCreatingAlbum(true);
        try {
            await createAlbum(roomId, newAlbumName, {
                uid: user.uid, displayName: user.displayName, email: user.email,
            });
            setNewAlbumName('');
            setShowCreateAlbum(false);
        } catch (err: any) {
            setError(err.message || 'Failed to create album');
        }
        setCreatingAlbum(false);
    };

    const handleRenameAlbum = async (albumId: string) => {
        if (!renameValue.trim()) return;
        try {
            await renameAlbum(roomId, albumId, renameValue);
            setRenamingAlbumId(null);
            setRenameValue('');
        } catch (err: any) {
            setError(err.message || 'Failed to rename album');
        }
    };

    const handleDeleteAlbum = async (albumId: string) => {
        if (!confirm('Delete this album? Photos will be moved to "All Photos".')) return;
        try {
            await deleteAlbum(roomId, albumId);
            if (selectedAlbumId === albumId) setSelectedAlbumId(null);
            setAlbumMenuId(null);
        } catch (err: any) {
            setError(err.message || 'Failed to delete album');
        }
    };

    const handleDelete = async (photo: PhotoMeta) => {
        if (!confirm('Delete this photo?')) return;
        try {
            await deletePhoto(roomId, photo);
            if (lightboxIndex !== null) setLightboxIndex(null);
        } catch (err: any) {
            alert(`Failed to delete: ${err.message}`);
        }
    };

    // ─── Filtering ───

    const filteredPhotos = selectedAlbumId
        ? photos.filter(p => p.albumId === selectedAlbumId)
        : photos.filter(p => !p.albumId);

    const getAlbumPhotoCount = (albumId: string) => photos.filter(p => p.albumId === albumId).length;
    const getAlbumCover = (album: Album) => {
        if (album.coverUrl) return album.coverUrl;
        const first = photos.find(p => p.albumId === album.id);
        return first?.url;
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
        } catch { return ''; }
    };

    const isBusy = stage !== 'idle';
    const lightboxPhoto = lightboxIndex !== null ? filteredPhotos[lightboxIndex] : null;
    const selectedAlbum = albums.find(a => a.id === selectedAlbumId);

    const stageLabel = stage === 'optimizing' ? 'Optimizing...'
        : stage === 'uploading' ? 'Uploading...'
        : stage === 'saving' ? 'Saving...'
        : stage === 'done' ? 'Done!' : '';

    return (
        <div className="max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    {selectedAlbumId && (
                        <button
                            onClick={() => setSelectedAlbumId(null)}
                            className="p-1.5 -ml-1 rounded-lg hover:bg-warmgray-100 transition-colors"
                        >
                            <ArrowLeft size={18} className="text-warmgray-500" />
                        </button>
                    )}
                    <h2 className="text-lg font-bold text-warmgray-800">
                        {selectedAlbum ? selectedAlbum.name : 'Photos'}
                    </h2>
                    {selectedAlbum && (
                        <span className="text-xs text-warmgray-400 ml-1">
                            {filteredPhotos.length} photo{filteredPhotos.length !== 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileSelect}
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isBusy}
                        className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-lg text-xs font-medium hover:from-kin-600 hover:to-kin-700 disabled:opacity-50 transition-all shadow-sm shadow-kin-200/40"
                    >
                        <Camera size={14} />
                        <span className="hidden sm:inline">Add Photo</span>
                    </button>
                </div>
            </div>

            {/* Upload Progress */}
            {isBusy && previewUrl && (
                <div className="mb-4 flex items-center gap-3 p-3 bg-kin-50 border border-kin-200 rounded-xl">
                    <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-warmgray-100 relative">
                        <img src={previewUrl} alt="Uploading" className="w-full h-full object-cover" />
                        {stage === 'done' && (
                            <div className="absolute inset-0 bg-sage-500/80 flex items-center justify-center">
                                <Check size={20} className="text-white" />
                            </div>
                        )}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-medium text-warmgray-600">{stageLabel}</span>
                            <div className="flex items-center gap-2">
                                {uploadSizeLabel && (
                                    <span className="text-[10px] text-warmgray-400">{uploadSizeLabel}</span>
                                )}
                                <span className="text-xs font-semibold text-kin-600 tabular-nums w-8 text-right">
                                    {progress}%
                                </span>
                            </div>
                        </div>
                        <div className="h-2 bg-warmgray-100 rounded-full overflow-hidden">
                            <div
                                className={`h-full rounded-full ease-out ${stage === 'done' ? 'bg-sage-500' : 'bg-kin-500'}`}
                                style={{ width: `${progress}%`, transition: 'width 1.5s cubic-bezier(0.4, 0, 0.2, 1)' }}
                            />
                        </div>
                    </div>
                    {stage !== 'done' && (
                        <button onClick={handleCancelUpload} className="p-1.5 text-warmgray-400 hover:text-warmgray-600 transition-colors flex-shrink-0">
                            <X size={16} />
                        </button>
                    )}
                </div>
            )}

            {error && (
                <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-xs text-red-600">{error}</p>
                </div>
            )}

            {/* Albums Row — only when not inside an album */}
            {!selectedAlbumId && (
                <div className="mb-5">
                    <div className="flex items-center justify-between mb-2.5">
                        <h3 className="text-sm font-semibold text-warmgray-600">Albums</h3>
                        <button
                            onClick={() => setShowCreateAlbum(!showCreateAlbum)}
                            className="flex items-center gap-1 text-xs font-medium text-kin-500 hover:text-kin-700 transition-colors"
                        >
                            <FolderPlus size={14} />
                            <span>New Album</span>
                        </button>
                    </div>

                    {/* Create Album Inline Form */}
                    {showCreateAlbum && (
                        <div className="flex items-center gap-2 mb-3 p-2.5 bg-warmgray-50 rounded-xl border border-warmgray-200">
                            <input
                                type="text"
                                placeholder="Album name"
                                value={newAlbumName}
                                onChange={e => setNewAlbumName(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleCreateAlbum(); }}
                                className="flex-1 px-3 py-1.5 bg-white border border-warmgray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-kin-500 placeholder-warmgray-400"
                                autoFocus
                            />
                            <button
                                onClick={handleCreateAlbum}
                                disabled={!newAlbumName.trim() || creatingAlbum}
                                className="px-3 py-1.5 bg-kin-500 text-white rounded-lg text-xs font-medium hover:bg-kin-600 disabled:opacity-50 transition-colors"
                            >
                                {creatingAlbum ? 'Creating...' : 'Create'}
                            </button>
                            <button
                                onClick={() => { setShowCreateAlbum(false); setNewAlbumName(''); }}
                                className="p-1.5 text-warmgray-400 hover:text-warmgray-600 transition-colors"
                            >
                                <X size={14} />
                            </button>
                        </div>
                    )}

                    {/* Album Cards */}
                    {albums.length === 0 && !showCreateAlbum ? (
                        <p className="text-xs text-warmgray-400 italic">No albums yet. Create one to organize your photos.</p>
                    ) : (
                        <div className="flex gap-2.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
                            {albums.map(album => {
                                const cover = getAlbumCover(album);
                                const count = getAlbumPhotoCount(album.id);
                                return (
                                    <div
                                        key={album.id}
                                        className="flex-shrink-0 w-28 group relative"
                                    >
                                        {/* Rename inline */}
                                        {renamingAlbumId === album.id ? (
                                            <div className="mb-1">
                                                <input
                                                    type="text"
                                                    value={renameValue}
                                                    onChange={e => setRenameValue(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleRenameAlbum(album.id);
                                                        if (e.key === 'Escape') setRenamingAlbumId(null);
                                                    }}
                                                    onBlur={() => setRenamingAlbumId(null)}
                                                    className="w-full px-2 py-1 text-xs border border-kin-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-kin-500"
                                                    autoFocus
                                                />
                                            </div>
                                        ) : (
                                            <>
                                                <button
                                                    onClick={() => setSelectedAlbumId(album.id)}
                                                    className="w-28 h-28 rounded-xl overflow-hidden bg-warmgray-100 border-2 border-transparent hover:border-kin-300 transition-all"
                                                >
                                                    {cover ? (
                                                        <img src={cover} alt={album.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <FolderOpen size={28} className="text-warmgray-300" />
                                                        </div>
                                                    )}
                                                </button>
                                                <div className="mt-1.5 flex items-start justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-semibold text-warmgray-700 truncate">{album.name}</p>
                                                        <p className="text-[10px] text-warmgray-400">{count} photo{count !== 1 ? 's' : ''}</p>
                                                    </div>
                                                    <div className="relative">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); setAlbumMenuId(albumMenuId === album.id ? null : album.id); }}
                                                            className="p-0.5 text-warmgray-300 hover:text-warmgray-500 transition-colors opacity-0 group-hover:opacity-100"
                                                        >
                                                            <MoreHorizontal size={14} />
                                                        </button>
                                                        {albumMenuId === album.id && (
                                                            <div className="absolute right-0 top-5 z-20 w-28 bg-white border border-warmgray-200 rounded-lg shadow-lg py-1">
                                                                <button
                                                                    onClick={() => {
                                                                        setRenamingAlbumId(album.id);
                                                                        setRenameValue(album.name);
                                                                        setAlbumMenuId(null);
                                                                    }}
                                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-warmgray-600 hover:bg-warmgray-50 transition-colors"
                                                                >
                                                                    <Pencil size={12} /> Rename
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteAlbum(album.id)}
                                                                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <Trash2 size={12} /> Delete
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Photo Grid */}
            {filteredPhotos.length === 0 && !isBusy ? (
                <div className="text-center py-12">
                    <div className="w-14 h-14 bg-kin-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <ImageIcon size={28} className="text-kin-300" />
                    </div>
                    <h3 className="text-sm font-semibold text-warmgray-800 mb-1">
                        {selectedAlbumId ? 'This album is empty' : 'No photos yet'}
                    </h3>
                    <p className="text-xs text-warmgray-400 mb-4">
                        {selectedAlbumId ? 'Add photos to this album' : 'Share your family moments here'}
                    </p>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="px-4 py-2 bg-gradient-to-r from-kin-500 to-kin-600 text-white rounded-xl text-sm font-medium hover:from-kin-600 hover:to-kin-700 transition-all shadow-md shadow-kin-200/40"
                    >
                        Upload Photo
                    </button>
                </div>
            ) : filteredPhotos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 sm:gap-3">
                    {filteredPhotos.map((photo, idx) => (
                        <div
                            key={photo.id}
                            onClick={() => setLightboxIndex(idx)}
                            className="group relative aspect-square bg-warmgray-100 rounded-xl overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                        >
                            <img
                                src={photo.url}
                                alt={photo.caption || 'Family photo'}
                                className="w-full h-full object-cover"
                                loading="lazy"
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-2.5">
                                <p className="text-white text-xs font-medium truncate">{photo.uploadedByName}</p>
                                <p className="text-white/70 text-[10px]">{formatDate(photo.createdAt)}</p>
                            </div>
                            {photo.caption && (
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/40 backdrop-blur-sm rounded-full">
                                    <p className="text-white text-[10px] font-medium truncate max-w-[100px]">{photo.caption}</p>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            ) : null}

            {filteredPhotos.length > 0 && !selectedAlbumId && (
                <p className="text-xs text-warmgray-400 text-center mt-4">
                    {photos.length} photo{photos.length !== 1 ? 's' : ''} total
                </p>
            )}

            {/* Lightbox */}
            {lightboxPhoto && lightboxIndex !== null && (
                <div className="fixed inset-0 z-50 bg-black/95 flex flex-col" onClick={() => setLightboxIndex(null)}>
                    <div className="flex items-center justify-between px-4 py-3 bg-black/50" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-3 min-w-0">
                            <div className="w-8 h-8 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                                <span className="text-xs font-bold text-white">
                                    {lightboxPhoto.uploadedByName?.[0]?.toUpperCase() || '?'}
                                </span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-white truncate">{lightboxPhoto.uploadedByName}</p>
                                <p className="text-xs text-white/50">{formatDate(lightboxPhoto.createdAt)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-1">
                            {/* Move to album dropdown */}
                            {albums.length > 0 && (
                                <select
                                    value={lightboxPhoto.albumId || ''}
                                    onChange={async (e) => {
                                        const newAlbum = e.target.value || null;
                                        try {
                                            await movePhotoToAlbum(roomId, lightboxPhoto.id, newAlbum);
                                        } catch {}
                                    }}
                                    onClick={e => e.stopPropagation()}
                                    className="bg-white/10 text-white text-xs rounded-lg px-2 py-1.5 border border-white/20 focus:outline-none cursor-pointer"
                                >
                                    <option value="" className="text-warmgray-800">No album</option>
                                    {albums.map(a => (
                                        <option key={a.id} value={a.id} className="text-warmgray-800">{a.name}</option>
                                    ))}
                                </select>
                            )}
                            {lightboxPhoto.uploadedBy === auth.currentUser?.uid && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); handleDelete(lightboxPhoto); }}
                                    className="p-2 text-white/50 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors"
                                >
                                    <Trash2 size={18} />
                                </button>
                            )}
                            <button
                                onClick={() => setLightboxIndex(null)}
                                className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center justify-center px-4 relative" onClick={e => e.stopPropagation()}>
                        {lightboxIndex > 0 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex - 1); }}
                                className="absolute left-2 sm:left-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors z-10"
                            >
                                <ChevronLeft size={24} />
                            </button>
                        )}

                        <img
                            src={lightboxPhoto.url}
                            alt={lightboxPhoto.caption || 'Photo'}
                            className="max-w-full max-h-[calc(100vh-160px)] object-contain rounded-lg"
                            onClick={() => setLightboxIndex(null)}
                        />

                        {lightboxIndex < filteredPhotos.length - 1 && (
                            <button
                                onClick={(e) => { e.stopPropagation(); setLightboxIndex(lightboxIndex + 1); }}
                                className="absolute right-2 sm:right-4 p-2 bg-black/40 hover:bg-black/60 text-white rounded-full transition-colors z-10"
                            >
                                <ChevronRight size={24} />
                            </button>
                        )}
                    </div>

                    {lightboxPhoto.caption && (
                        <div className="px-4 py-3 bg-black/50 text-center" onClick={e => e.stopPropagation()}>
                            <p className="text-sm text-white/80">{lightboxPhoto.caption}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
