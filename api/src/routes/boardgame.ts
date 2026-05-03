import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';

const router = Router();
const prisma = new PrismaClient();

const scoreLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  keyGenerator: (req) =>
    (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
    req.socket.remoteAddress ||
    'unknown',
});

const ScoreSchema = z.object({
  username: z.string().min(1).max(32),
  game: z.enum(['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy']),
  score: z.number().int().min(0),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// POST /api/boardgame/score
router.post('/score', scoreLimiter, async (req: Request, res: Response) => {
  const parsed = ScoreSchema.safeParse(req.body);
  if (!parsed.success)
    return res.status(400).json({ error: 'Invalid score data', details: parsed.error.flatten() });

  const { username, game, score, metadata } = parsed.data;

  let userId: string | null = null;
  const token = req.cookies?.jakh_token;
  if (token) {
    try {
      const jwt = await import('jsonwebtoken');
      const secret = process.env.JWT_SECRET;
      if (!secret) throw new Error('No JWT_SECRET');
      const payload = jwt.default.verify(token, secret) as { userId: string };
      userId = payload.userId;
    } catch { /* guest */ }
  }

  const entry = await prisma.boardGameScore.create({
    data: { userId, username, game, score, metadata: (metadata ?? {}) as Prisma.InputJsonValue },
  });

  res.status(201).json({ id: entry.id, rank: await getRank(game, score) });
});

// GET /api/boardgame/leaderboard?game=chess&limit=20
router.get('/leaderboard', async (req: Request, res: Response) => {
  const game = req.query.game as string;
  if (!['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy'].includes(game))
    return res.status(400).json({ error: 'Invalid game' });
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  const orderBy = game === 'mastermind'
    ? { score: 'asc' as const }
    : { score: 'desc' as const };

  const rows = await prisma.boardGameScore.findMany({
    where: { game },
    orderBy,
    take: limit,
    select: { id: true, username: true, score: true, metadata: true, createdAt: true },
  });

  res.json({ game, leaderboard: rows.map((r, i) => ({ rank: i + 1, ...r })) });
});

// GET /api/boardgame/rank?game=chess&score=150
router.get('/rank', async (req: Request, res: Response) => {
  const game = req.query.game as string;
  const score = Number(req.query.score);
  if (!['chess', 'mastermind', 'go', 'reversi', 'codenames', 'catan', 'backgammon', 'set', 'hanabi', 'diplomacy'].includes(game) || isNaN(score))
    return res.status(400).json({ error: 'Invalid params' });
  res.json({ rank: await getRank(game, score) });
});

async function getRank(game: string, score: number): Promise<number> {
  const better =
    game === 'mastermind' ? { score: { lt: score } } : { score: { gt: score } };
  const count = await prisma.boardGameScore.count({ where: { game, ...better } });
  return count + 1;
}

export default router;
