import type { NextApiRequest, NextApiResponse } from 'next';
import admin from 'firebase-admin';
import { IncomingForm, File } from 'formidable';
import fs from 'fs';

export const config = {
    api: { bodyParser: false },
};

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
        storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 });
        const { fields, files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        const roomId = Array.isArray(fields.roomId) ? fields.roomId[0] : fields.roomId;
        const file: File = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!roomId || !file) {
            return res.status(400).json({ error: 'roomId and file are required' });
        }

        const timestamp = Date.now();
        const safeName = (file.originalFilename || 'file').replace(/[^a-zA-Z0-9._-]/g, '_');
        const storagePath = `rooms/${roomId}/chat/${timestamp}_${safeName}`;

        const bucket = admin.storage().bucket();
        const fileBuffer = fs.readFileSync(file.filepath);
        const bucketFile = bucket.file(storagePath);

        await bucketFile.save(fileBuffer, {
            metadata: { contentType: file.mimetype || 'application/octet-stream' },
        });

        await bucketFile.makePublic();
        const url = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        // Clean up temp file
        try { fs.unlinkSync(file.filepath); } catch {}

        return res.status(200).json({
            url,
            storagePath,
            name: file.originalFilename || safeName,
            size: file.size || 0,
            mimeType: file.mimetype || '',
            type: (file.mimetype || '').startsWith('image/') ? 'image' : 'file',
        });
    } catch (err: any) {
        console.error('Upload error:', err);
        return res.status(500).json({ error: err.message || 'Upload failed' });
    }
}
