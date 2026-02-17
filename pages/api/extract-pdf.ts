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

        const dataBuffer = fs.readFileSync(file.filepath);
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(dataBuffer);

        // Clean up temp file
        try { fs.unlinkSync(file.filepath); } catch {}

        const text = (data.text || '').trim().slice(0, 15000);
        if (!text) {
            return res.status(200).json({ text: '', error: 'No text found — this may be a scanned/image PDF.' });
        }

        return res.status(200).json({
            text,
            pages: data.numpages,
            filename: file.originalFilename || 'document.pdf',
        });
    } catch (err: any) {
        console.error('PDF extraction error:', err);
        return res.status(500).json({ error: err.message || 'Failed to parse PDF' });
    }
}
