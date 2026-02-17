import type { NextApiRequest, NextApiResponse } from 'next';
import { IncomingForm, File } from 'formidable';
import fs from 'fs';

export const config = {
    api: { bodyParser: false },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const form = new IncomingForm({ maxFileSize: 20 * 1024 * 1024 });
        const { files } = await new Promise<{ fields: any; files: any }>((resolve, reject) => {
            form.parse(req, (err, fields, files) => {
                if (err) reject(err);
                else resolve({ fields, files });
            });
        });

        const file: File = Array.isArray(files.file) ? files.file[0] : files.file;
        if (!file) return res.status(400).json({ error: 'No file provided' });

        const buffer = fs.readFileSync(file.filepath);
        try { fs.unlinkSync(file.filepath); } catch {}

        const { extractText } = await import('unpdf');
        const uint8 = new Uint8Array(buffer);
        const result = await extractText(uint8);

        // result.text is an array of strings (one per page)
        const allText = Array.isArray(result.text) ? result.text.join('\n') : String(result.text || '');
        const totalPages = result.totalPages || 0;
        const trimmed = allText.trim().slice(0, 15000);
        if (!trimmed) {
            return res.status(200).json({ text: '', pages: totalPages, error: 'No text found — this may be a scanned/image PDF.' });
        }

        return res.status(200).json({
            text: trimmed,
            pages: totalPages,
            filename: file.originalFilename || 'document.pdf',
        });
    } catch (err: any) {
        console.error('PDF extraction error:', err);
        return res.status(500).json({ error: err.message || 'Failed to parse PDF' });
    }
}
