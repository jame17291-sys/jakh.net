import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';

const router = Router();

const suggestionLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 3,
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    return ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'You can only submit 3 suggestions per day. Thank you!' },
});

router.post('/', suggestionLimiter, async (req: Request, res: Response) => {
  try {
    const { text, email } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return res.status(400).json({ error: 'Suggestion must be at least 5 characters' });
    }
    if (text.trim().length > 500) {
      return res.status(400).json({ error: 'Suggestion must be under 500 characters' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const rawIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
    const ipHash = crypto.createHash('sha256').update(rawIp).digest('hex');

    await prisma.suggestion.create({
      data: {
        text: text.trim(),
        email: email?.trim() || null,
        ipHash,
      },
    });

    res.json({ success: true });
  } catch (error) {
    console.error('[suggestions]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
