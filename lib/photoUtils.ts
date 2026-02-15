// lib/photoUtils.ts — Firebase Storage photo upload, albums & Firestore metadata
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import {
    collection, addDoc, deleteDoc, updateDoc, doc, query,
    orderBy, onSnapshot, serverTimestamp, where,
} from 'firebase/firestore';
import { storage, db } from './firebase';

// ─── Types ───

export interface PhotoMeta {
    id: string;
    url: string;
    caption: string;
    albumId?: string;
    uploadedBy: string;
    uploadedByEmail: string;
    uploadedByName: string;
    storagePath: string;
    createdAt: any;
}

export interface Album {
    id: string;
    name: string;
    coverUrl?: string;
    createdBy: string;
    createdByName: string;
    createdAt: any;
}

// ─── Image Compression ───

export async function compressImage(
    file: File,
    onStage?: (stage: 'skipped' | 'compressing' | 'done') => void,
): Promise<File> {
    const SKIP_THRESHOLD = 500 * 1024;
    const MAX_DIMENSION = 1440;

    if (file.size <= SKIP_THRESHOLD) {
        onStage?.('skipped');
        return file;
    }

    onStage?.('compressing');

    try {
        const bitmap = await createImageBitmap(file);
        const { width, height } = bitmap;

        let newW = width;
        let newH = height;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
            const ratio = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
            newW = Math.round(width * ratio);
            newH = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = newW;
        canvas.height = newH;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bitmap, 0, 0, newW, newH);
        bitmap.close();

        const testUrl = canvas.toDataURL('image/webp');
        const supportsWebP = testUrl.startsWith('data:image/webp');
        const mimeType = supportsWebP ? 'image/webp' : 'image/jpeg';
        const quality = 0.65;

        const blob: Blob = await new Promise((resolve) =>
            canvas.toBlob((b) => resolve(b!), mimeType, quality)
        );

        canvas.width = 0;
        canvas.height = 0;

        const ext = supportsWebP ? '.webp' : '.jpg';
        const optimizedName = file.name.replace(/\.[^.]+$/, ext);
        const result = new File([blob], optimizedName, { type: mimeType });

        onStage?.('done');
        return result;
    } catch {
        onStage?.('done');
        return file;
    }
}

// ─── Photo Upload ───

export function uploadPhoto(
    roomId: string,
    file: File,
    user: { uid: string; email: string; displayName?: string | null },
    caption: string,
    albumId: string | undefined,
    onProgress: (progress: number) => void,
    onBytesUploaded: () => void,
    onComplete: (photo: PhotoMeta) => void,
    onError: (error: Error) => void,
): () => void {
    const fileName = `${Date.now()}_${file.name}`;
    const storagePath = `rooms/${roomId}/photos/${fileName}`;
    const storageRef = ref(storage, storagePath);

    const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
    });

    uploadTask.on(
        'state_changed',
        (snapshot) => {
            const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
            onProgress(pct);
        },
        (error) => onError(error),
        async () => {
            onBytesUploaded();
            try {
                const url = await getDownloadURL(uploadTask.snapshot.ref);

                const photoData: any = {
                    url,
                    caption: caption.trim(),
                    uploadedBy: user.uid,
                    uploadedByEmail: user.email || '',
                    uploadedByName: user.displayName || user.email?.split('@')[0] || '',
                    storagePath,
                    createdAt: serverTimestamp(),
                };
                if (albumId) photoData.albumId = albumId;

                const photoDoc = await addDoc(collection(db, 'rooms', roomId, 'photos'), photoData);

                // Update album cover if this is the first photo
                if (albumId) {
                    updateDoc(doc(db, 'rooms', roomId, 'albums', albumId), {
                        coverUrl: url,
                    }).catch(() => {});
                }

                onComplete({
                    id: photoDoc.id,
                    url,
                    caption: caption.trim(),
                    albumId,
                    uploadedBy: user.uid,
                    uploadedByEmail: user.email || '',
                    uploadedByName: user.displayName || user.email?.split('@')[0] || '',
                    storagePath,
                    createdAt: new Date(),
                });
            } catch (error: any) {
                onError(error);
            }
        }
    );

    return () => uploadTask.cancel();
}

// ─── Photo Subscriptions ───

export function subscribeToPhotos(
    roomId: string,
    callback: (photos: PhotoMeta[]) => void,
) {
    const q = query(
        collection(db, 'rooms', roomId, 'photos'),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
        const photos = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
        })) as PhotoMeta[];
        callback(photos);
    });
}

export async function deletePhoto(roomId: string, photo: PhotoMeta): Promise<void> {
    try {
        const storageRef = ref(storage, photo.storagePath);
        await deleteObject(storageRef);
    } catch (e) {
        console.warn('Failed to delete storage file:', e);
    }
    await deleteDoc(doc(db, 'rooms', roomId, 'photos', photo.id));
}

export async function movePhotoToAlbum(
    roomId: string,
    photoId: string,
    albumId: string | null,
): Promise<void> {
    const photoRef = doc(db, 'rooms', roomId, 'photos', photoId);
    if (albumId) {
        await updateDoc(photoRef, { albumId });
    } else {
        await updateDoc(photoRef, { albumId: '' });
    }
}

// ─── Album CRUD ───

export function subscribeToAlbums(
    roomId: string,
    callback: (albums: Album[]) => void,
) {
    const q = query(
        collection(db, 'rooms', roomId, 'albums'),
        orderBy('createdAt', 'desc')
    );
    return onSnapshot(q, (snapshot) => {
        const albums = snapshot.docs.map(d => ({
            id: d.id,
            ...d.data(),
        })) as Album[];
        callback(albums);
    });
}

export async function createAlbum(
    roomId: string,
    name: string,
    user: { uid: string; displayName?: string | null; email?: string | null },
): Promise<string> {
    const albumDoc = await addDoc(collection(db, 'rooms', roomId, 'albums'), {
        name: name.trim(),
        createdBy: user.uid,
        createdByName: user.displayName || user.email?.split('@')[0] || '',
        createdAt: serverTimestamp(),
    });
    return albumDoc.id;
}

export async function renameAlbum(
    roomId: string,
    albumId: string,
    newName: string,
): Promise<void> {
    await updateDoc(doc(db, 'rooms', roomId, 'albums', albumId), {
        name: newName.trim(),
    });
}

export async function deleteAlbum(roomId: string, albumId: string): Promise<void> {
    await deleteDoc(doc(db, 'rooms', roomId, 'albums', albumId));
}
