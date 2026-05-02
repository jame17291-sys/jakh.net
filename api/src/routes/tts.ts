import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

const router = Router();

const ttsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 120,
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    return ip;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Audio limit reached. Try again in an hour.' },
});

router.get('/', ttsLimiter, async (req: Request, res: Response) => {
  try {
    const text = (req.query.text as string || '').trim();
    const lang = req.query.lang === 'ar' ? 'ar' : 'en';

    if (!text || text.length === 0) return res.status(400).end();
    if (text.length > 500) return res.status(400).end();

    const tl  = lang === 'ar' ? 'ar' : 'en-US';
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${tl}&client=gtx&ttsspeed=1.0`;

    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/',
      },
    });

    if (!upstream.ok) {
      console.error('[tts] upstream error', upstream.status);
      return res.status(502).end();
    }

    res.set('Content-Type', 'audio/mpeg');
    res.set('Cache-Control', 'public, max-age=86400');
    const buf = await upstream.arrayBuffer();
    res.send(Buffer.from(buf));
  } catch (err) {
    console.error('[tts]', err);
    res.status(500).end();
  }
});

export default router;
