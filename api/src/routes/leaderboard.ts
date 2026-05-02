import { Router, Request, Response } from 'express';
import prisma from '../prisma';

const router = Router();

const POINTS: Record<string, number> = { easy: 1, medium: 2, hard: 3, 'very-advanced': 5 };

router.get('/', async (_req: Request, res: Response) => {
  try {
    // groupBy avoids loading every row into memory
    const grouped = await prisma.userProgress.groupBy({
      by: ['userId', 'status'],
      _count: { status: true },
      where: { status: { not: { startsWith: 'wrong-' } } },
    });

    const scoreMap: Record<string, number> = {};
    for (const g of grouped) {
      scoreMap[g.userId] = (scoreMap[g.userId] || 0) + (POINTS[g.status] || 0) * g._count.status;
    }

    const sorted = Object.entries(scoreMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20);

    if (!sorted.length) return res.json({ leaderboard: [] });

    const users = await prisma.user.findMany({
      where: { id: { in: sorted.map(([id]) => id) } },
      select: { id: true, username: true },
    });

    const nameMap = Object.fromEntries(users.map(u => [u.id, u.username]));

    const leaderboard = sorted.map(([userId, score], i) => ({
      rank: i + 1,
      username: nameMap[userId] || 'Unknown',
      score,
    }));

    res.json({ leaderboard });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
