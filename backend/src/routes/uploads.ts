import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { env } from '../config.js';
import { auth, admin } from '../middleware/auth.js';
import { httpError } from '../utils/httpError.js';

const r = Router();
const extensions: Record<string, string> = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
};

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, path.resolve(env.UPLOAD_DIR)),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${extensions[file.mimetype] ?? '.img'}`)
});

const upload = multer({
    storage,
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
        if (!extensions[file.mimetype]) {
            cb(httpError(400, 'Choose a PNG, JPG, WEBP or GIF image.', 'INVALID_IMAGE_TYPE'));
            return;
        }
        cb(null, true);
    }
});

// Only authenticated administrators can add product images.
r.post('/product-image', auth, admin, (req, res, next) => {
    upload.single('image')(req, res, (error: unknown) => {
        if (error) {
            if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
                next(httpError(400, 'Please choose an image smaller than 3 MB.', 'IMAGE_TOO_LARGE'));
                return;
            }
            next(error);
            return;
        }

        if (!req.file) {
            next(httpError(400, 'Choose an image file to upload.', 'IMAGE_REQUIRED'));
            return;
        }

        // The product image column accepts URL/path references up to 500 characters,
        // not image bytes encoded as a base64 data URL.
        res.status(201).json({
            url: `${req.protocol}://${req.get('host')}/uploads/${encodeURIComponent(req.file.filename)}`
        });
    });
});

export default r;
