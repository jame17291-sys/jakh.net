import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'emergency-fallback-secret-change-me';

// Send time spent
router.post('/time', async (req: Request, res: Response) => {
  try {
    const token = req.cookies.auth_token;
    let userId = null;

    if (token) {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string, sessionId: string };
        userId = payload.userId;
      } catch (e) {}
    }

    const { pageSlug, timeSpent } = req.body;
    if (!pageSlug || typeof timeSpent !== 'number') {
      return res.status(400).json({ error: 'Invalid analytics payload' });
    }

    if (timeSpent >= 5 && timeSpent <= 7200) {
      // Save immediately with unknown country so the response is instant
      const record = await prisma.pageAnalytics.create({
        data: { userId, pageSlug, timeSpent, country: 'Unknown' }
      });

      // Geo-lookup runs AFTER response is sent — never blocks the client
      setImmediate(async () => {
        try {
          const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
          const geoResponse = await fetch(`http://ip-api.com/json/${ip}`);
          const geoData = await geoResponse.json() as any;
          if (geoData.status === 'success') {
            await prisma.pageAnalytics.update({
              where: { id: record.id },
              data: { country: geoData.country },
            });
          }
        } catch (geoErr) {
          console.error('Geo-lookup failed:', geoErr);
        }
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
