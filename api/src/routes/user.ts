import { Router, Request, Response, NextFunction, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'emergency-fallback-secret-change-me';

interface AuthRequest extends Request {
  userId?: string;
  adminPrivileged?: boolean;
}

// Auth Middleware (Single Device Hardened)
const authenticate: RequestHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string, sessionId: string };
    
    // Crucial: Check if the sessionId matches the current active session in DB
    const user = await prisma.user.findUnique({
       where: { id: payload.userId },
       select: { currentSessionId: true, role: true }
    });

    if (!user || user.currentSessionId !== payload.sessionId) {
      res.clearCookie('auth_token');
      return res.status(401).json({ error: 'Session expired or logged in on another device' });
    }

    req.userId = payload.userId;
    req.adminPrivileged = user.role === 'ADMIN' || (payload as any).adminPrivileged; 
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Apply auth middleware to all user routes
router.use(authenticate as any);

// Get User Profile with Stats
router.get('/profile', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        progress: true,
        favorites: true,
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      avatar: user.avatar,
      stats: {
        solvedCount: user.progress.length,
        favoritesCount: user.favorites.length,
      },
      progress: user.progress,
      favorites: user.favorites,
    });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Toggle Favorite
router.post('/favorite', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { categoryId, cardId, action } = req.body;

    if (action === 'add') {
      await prisma.userFavorite.upsert({
        where: { userId_categoryId_cardId: { userId, categoryId, cardId } },
        update: {},
        create: { userId, categoryId, cardId }
      });
    } else {
      await prisma.userFavorite.deleteMany({
        where: { userId, categoryId, cardId }
      });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark / update a single card (used on every card tap — O(1) instead of O(n))
router.post('/progress', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { cardId, categoryId, status } = req.body;
    if (!cardId || !categoryId || !status) {
      return res.status(400).json({ error: 'cardId, categoryId and status are required' });
    }

    await prisma.userProgress.upsert({
      where: { userId_categoryId_cardId: { userId, categoryId, cardId } },
      update: { status },
      create: { userId, categoryId, cardId, status },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove a single card result
router.delete('/progress', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { cardId, categoryId } = req.query;
    if (!cardId || !categoryId) {
      return res.status(400).json({ error: 'cardId and categoryId are required' });
    }

    await prisma.userProgress.deleteMany({
      where: { userId, categoryId: String(categoryId), cardId: String(cardId) },
    });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Password
router.post('/password', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be 8–128 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET streak for current user
router.get('/streak', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const [allProgress, userRecord] = await Promise.all([
      prisma.userProgress.findMany({
        where: { userId },
        select: { createdAt: true, status: true },
      }),
      prisma.user.findUnique({
        where: { id: userId },
        select: { streakFreezeCount: true, streakFreezeHighest: true },
      }),
    ]);

    const correct = allProgress.filter(p => !p.status.startsWith('wrong-'));
    const freezeCount = userRecord?.streakFreezeCount ?? 0;
    if (!correct.length) return res.json({ streak: 0, freezeCount });

    const dateSet = new Set<string>();
    for (const p of correct) {
      dateSet.add(p.createdAt.toISOString().split('T')[0]);
    }
    const dates = [...dateSet].sort().reverse();

    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    if (dates[0] !== today && dates[0] !== yesterday) {
      return res.json({ streak: 0, freezeCount });
    }

    let streak = 0;
    let expected = dates[0];
    let freezesAvailable = freezeCount;
    let freezesUsed = 0;

    for (const date of dates) {
      if (date === expected) {
        streak++;
        const d = new Date(expected + 'T00:00:00Z');
        d.setUTCDate(d.getUTCDate() - 1);
        expected = d.toISOString().split('T')[0];
      } else {
        // Check if this is a bridgeable 1-day gap
        const gapDate = new Date(expected + 'T00:00:00Z');
        gapDate.setUTCDate(gapDate.getUTCDate() - 1);
        const dayBeforeStr = gapDate.toISOString().split('T')[0];

        if (date === dayBeforeStr && freezesAvailable > 0) {
          freezesAvailable--;
          freezesUsed++;
          streak += 2; // bridged day + current date
          const d = new Date(date + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() - 1);
          expected = d.toISOString().split('T')[0];
        } else {
          break;
        }
      }
    }

    // Award new freezes for crossing 7-day milestones
    const highest = userRecord?.streakFreezeHighest ?? 0;
    const newHighest = Math.max(highest, streak);
    const oldMilestones = Math.floor(highest / 7);
    const newMilestones = Math.floor(streak / 7);
    const newFreezesEarned = Math.max(0, newMilestones - oldMilestones);
    let finalFreezeCount = Math.max(0, freezeCount - freezesUsed);

    if (newFreezesEarned > 0 || freezesUsed > 0) {
      finalFreezeCount = Math.min(3, finalFreezeCount + newFreezesEarned);
      await prisma.user.update({
        where: { id: userId },
        data: { streakFreezeCount: finalFreezeCount, streakFreezeHighest: newHighest },
      });
    }

    res.json({ streak, freezeCount: finalFreezeCount });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});


// Update Avatar
router.put('/avatar', async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const { avatar } = req.body;
    if (typeof avatar !== 'string' || avatar.length > 10) {
      return res.status(400).json({ error: 'Invalid avatar' });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { avatar }
    });

    res.json({ success: true, avatar });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
