import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

const DIFFICULTY_POINTS: Record<string, number> = {
  easy: 1, medium: 2, hard: 3, 'very-advanced': 5,
};

// ── Weekly challenge rotation ────────────────────────────
const CHALLENGE_THEMES = [
  { title: 'Science Sprint',   titleAr: 'سباق العلوم',       categories: ['biology', 'chemistry', 'science'] },
  { title: 'World Explorer',   titleAr: 'مستكشف العالم',      categories: ['geography', 'history', 'ancient-civilizations'] },
  { title: 'Tech Master',      titleAr: 'خبير التكنولوجيا',   categories: ['coding-and-design', 'software-and-computing', 'future-tech-and-energy'] },
  { title: 'Culture Quest',    titleAr: 'رحلة الثقافة',       categories: ['cinema-and-film-history', 'music-and-performing-arts', 'tv-shows-trivia'] },
  { title: 'Brain Gym',        titleAr: 'صالة العقول',        categories: ['math', 'classic-riddles', 'philosophy'] },
  { title: 'Nature Deep Dive', titleAr: 'الغوص في الطبيعة',  categories: ['animal-kingdom', 'environment-and-ecology', 'geology'] },
  { title: 'Mind & Society',   titleAr: 'العقل والمجتمع',     categories: ['psychology', 'social-sciences', 'relationship-questions'] },
  { title: 'Human Body',       titleAr: 'جسم الإنسان',        categories: ['medical-questions', 'pharmacy', 'physical-and-life-sciences'] },
];

function getCurrentWeekId(): string {
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const week = Math.ceil(((now.getTime() - yearStart.getTime()) / 86400000 + yearStart.getDay() + 1) / 7);
  return `${now.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function getCurrentChallenge() {
  const weekId = getCurrentWeekId();
  const weekNum = parseInt(weekId.split('-W')[1], 10);
  const theme = CHALLENGE_THEMES[weekNum % CHALLENGE_THEMES.length];

  const now = new Date();
  const daysToFriday = (5 - now.getDay() + 7) % 7 || 7;
  const endsAt = new Date(now);
  endsAt.setDate(now.getDate() + daysToFriday);
  endsAt.setHours(23, 59, 59, 999);

  return { weekId, ...theme, questionCount: 30, endsAt: endsAt.toISOString() };
}

function generateSlug(name: string): string {
  return name.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 30) || 'team';
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (await prisma.team.findUnique({ where: { slug } })) {
    slug = `${base}-${n++}`;
  }
  return slug;
}

// ── Auth middleware ──────────────────────────────────────
const authenticate = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    (req as any).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// ── Public: team profile ─────────────────────────────────
router.get('/profile/:teamId', async (req: Request, res: Response) => {
  const { teamId } = req.params;
  if (!/^[a-f0-9-]+$/.test(teamId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        members: {
          include: { user: { select: { id: true, username: true, createdAt: true } } },
          orderBy: { joinedAt: 'asc' },
        },
      },
    });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const memberIds = team.members.map(m => m.userId);

    const [allProgress, weeklyProgress] = await Promise.all([
      prisma.userProgress.findMany({ where: { userId: { in: memberIds } } }),
      prisma.teamChallengeProgress.findMany({
        where: { teamId, weekId: getCurrentWeekId() },
      }),
    ]);

    const memberScores: Record<string, number> = {};
    const memberSolved: Record<string, number> = {};
    for (const p of allProgress) {
      if (!p.status.startsWith('wrong-')) {
        memberScores[p.userId] = (memberScores[p.userId] || 0) + (DIFFICULTY_POINTS[p.status] || 1);
        memberSolved[p.userId] = (memberSolved[p.userId] || 0) + 1;
      }
    }

    // Recent activity: member joins (last 30d) + solves (last 7d, ≥5)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sevenDaysAgo  = new Date(Date.now() - 7  * 24 * 3600 * 1000);

    const recentProgress = await prisma.userProgress.findMany({
      where: { userId: { in: memberIds }, createdAt: { gte: sevenDaysAgo }, status: { not: { startsWith: 'wrong-' } } },
      select: { userId: true, createdAt: true },
    });
    const recentByUser: Record<string, number> = {};
    for (const p of recentProgress) recentByUser[p.userId] = (recentByUser[p.userId] || 0) + 1;

    const activity: any[] = [
      ...team.members
        .filter(m => m.joinedAt >= thirtyDaysAgo)
        .map(m => ({ type: 'member_joined', username: m.user.username, at: m.joinedAt })),
      ...Object.entries(recentByUser)
        .filter(([, c]) => c >= 3)
        .map(([uid, count]) => ({
          type: 'member_solved',
          username: team.members.find(m => m.userId === uid)?.user.username || 'Member',
          count,
          at: new Date(),
        })),
    ].sort((a: any, b: any) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 8);

    const challenge = getCurrentChallenge();

    res.json({
      id: team.id,
      name: team.name,
      slug: team.slug,
      bio: team.bio,
      tags: team.tags,
      captainId: team.captainId,
      score: team.score,
      battleWins: team.battleWins,
      battleTotal: team.battleTotal,
      createdAt: team.createdAt,
      members: team.members.map(m => ({
        userId: m.userId,
        username: m.user.username,
        role: m.role,
        joinedAt: m.joinedAt,
        score: memberScores[m.userId] || 0,
        solved: memberSolved[m.userId] || 0,
      })).sort((a, b) => b.score - a.score),
      totalSolved: Object.values(memberSolved).reduce((a, b) => a + b, 0),
      weeklyChallenge: {
        ...challenge,
        progress: weeklyProgress.map(p => ({ userId: p.userId, answered: p.answered, points: p.points })),
        totalAnswered: weeklyProgress.reduce((s, p) => s + p.answered, 0),
      },
      activity,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── All routes below require auth ─────────────────────────
router.use(authenticate);

// List my teams
router.get('/my-teams', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const userTeams = await prisma.userTeam.findMany({
      where: { userId },
      include: {
        team: {
          include: { members: { include: { user: { select: { username: true } } } } },
        },
      },
    });

    const challenge = getCurrentChallenge();
    const teamIds = userTeams.map(ut => ut.team.id);
    const weeklyProgress = await prisma.teamChallengeProgress.findMany({
      where: { teamId: { in: teamIds }, weekId: challenge.weekId },
    });

    const formattedTeams = userTeams.map(ut => ({
      id: ut.team.id,
      name: ut.team.name,
      slug: ut.team.slug,
      bio: ut.team.bio,
      tags: ut.team.tags,
      captainId: ut.team.captainId,
      score: ut.team.score,
      battleWins: ut.team.battleWins,
      battleTotal: ut.team.battleTotal,
      role: ut.role,
      members: ut.team.members.map(m => m.user.username),
      weeklyProgress: weeklyProgress.filter(p => p.teamId === ut.team.id),
    }));

    res.json(formattedTeams);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create team
router.post('/create', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Team name is required' });

    const slug = await uniqueSlug(generateSlug(name.trim()));
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        slug,
        captainId: userId,
        members: { create: { userId, role: 'captain' } },
      },
    });

    res.status(201).json({ success: true, teamId: team.id, slug: team.slug });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete team (captain only)
router.post('/delete', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.captainId !== userId) {
      const member = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId, teamId } } });
      if (!member || member.role !== 'captain') return res.status(403).json({ error: 'Only the captain can delete the team' });
    }

    await prisma.team.delete({ where: { id: teamId } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update team bio/tags (captain only)
router.patch('/:teamId', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { teamId } = req.params;
    if (!/^[a-f0-9-]+$/.test(teamId)) return res.status(400).json({ error: 'Invalid id' });

    const { bio, tags } = req.body;
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Team not found' });
    if (team.captainId !== userId) return res.status(403).json({ error: 'Captain only' });

    await prisma.team.update({
      where: { id: teamId },
      data: {
        bio: typeof bio === 'string' ? bio.slice(0, 200) : undefined,
        tags: Array.isArray(tags) ? tags.map(String).slice(0, 5) : undefined,
      },
    });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update team score
router.post('/score', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { teamId, points } = req.body;

    const membership = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId, teamId } } });
    if (!membership) return res.status(403).json({ error: 'Not a member of this team' });

    await prisma.team.update({ where: { id: teamId }, data: { score: { increment: points } } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add member by username
router.post('/add-member', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { teamId, username } = req.body;

    const membership = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId, teamId } } });
    if (!membership) return res.status(403).json({ error: 'Not a member of this team' });

    const targetUser = await prisma.user.findUnique({ where: { username } });
    if (!targetUser) return res.status(404).json({ error: 'User does not exist' });

    const existing = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId: targetUser.id, teamId } } });
    if (existing) return res.status(409).json({ error: 'User is already a member' });

    await prisma.userTeam.create({ data: { userId: targetUser.id, teamId } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Leave team
router.post('/leave', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { teamId } = req.body;
    if (!teamId) return res.status(400).json({ error: 'teamId required' });

    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return res.status(404).json({ error: 'Not found' });
    if (team.captainId === userId) return res.status(400).json({ error: 'Transfer captaincy before leaving' });

    await prisma.userTeam.delete({ where: { userId_teamId: { userId, teamId } } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current weekly challenge + my progress
router.get('/challenge/current', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const challenge = getCurrentChallenge();

    const userTeams = await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } });
    const teamIds = userTeams.map(t => t.teamId);

    const [allProgress, myProgress] = await Promise.all([
      prisma.teamChallengeProgress.findMany({ where: { weekId: challenge.weekId, teamId: { in: teamIds } } }),
      prisma.teamChallengeProgress.findFirst({ where: { weekId: challenge.weekId, userId } }),
    ]);

    // Get member usernames for each progress record's userId
    const memberIds = [...new Set(allProgress.map(p => p.userId))];
    const members = await prisma.user.findMany({
      where: { id: { in: memberIds } },
      select: { id: true, username: true },
    });
    const memberMap = Object.fromEntries(members.map(m => [m.id, m.username]));

    res.json({
      challenge,
      teamProgress: allProgress.map(p => ({
        teamId: p.teamId, userId: p.userId,
        username: memberMap[p.userId] || 'Member',
        answered: p.answered, points: p.points, lastActiveAt: p.lastActiveAt,
      })),
      myProgress: myProgress ? { answered: myProgress.answered, points: myProgress.points } : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Record challenge progress (called when marking a card correct in a challenge category)
router.post('/challenge/progress', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const { weekId, points = 100 } = req.body;
    if (!weekId || typeof weekId !== 'string') return res.status(400).json({ error: 'weekId required' });

    const safePoints = Math.min(500, Math.max(0, parseInt(String(points), 10) || 100));
    const userTeams = await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } });
    if (!userTeams.length) return res.json({ success: false, reason: 'no_team' });

    await Promise.all(userTeams.map(ut =>
      prisma.teamChallengeProgress.upsert({
        where: { teamId_userId_weekId: { teamId: ut.teamId, userId, weekId } },
        create: { teamId: ut.teamId, userId, weekId, answered: 1, points: safePoints },
        update: { answered: { increment: 1 }, points: { increment: safePoints }, lastActiveAt: new Date() },
      })
    ));

    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Send nudge to a teammate
router.post('/nudge', async (req: Request, res: Response) => {
  try {
    const fromUserId = (req as any).userId;
    const { teamId, toUserId } = req.body;
    if (!teamId || !toUserId) return res.status(400).json({ error: 'teamId and toUserId required' });
    if (fromUserId === toUserId) return res.status(400).json({ error: 'Cannot nudge yourself' });

    const [fromMember, toMember] = await Promise.all([
      prisma.userTeam.findUnique({ where: { userId_teamId: { userId: fromUserId, teamId } } }),
      prisma.userTeam.findUnique({ where: { userId_teamId: { userId: toUserId, teamId } } }),
    ]);
    if (!fromMember || !toMember) return res.status(403).json({ error: 'Both users must be team members' });

    const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
    const recent = await prisma.teamNudge.findFirst({
      where: { fromUserId, teamId, toUserId, createdAt: { gte: dayAgo } },
    });
    if (recent) return res.status(429).json({ error: 'Already nudged this member recently' });

    await prisma.teamNudge.create({ data: { fromUserId, toUserId, teamId } });
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get pending (unseen) nudges for the current user
router.get('/nudge/pending', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).userId;
    const nudges = await prisma.teamNudge.findMany({
      where: { toUserId: userId, seenAt: null },
      include: {
        from: { select: { username: true } },
        team: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    if (nudges.length > 0) {
      await prisma.teamNudge.updateMany({
        where: { toUserId: userId, seenAt: null },
        data: { seenAt: new Date() },
      });
    }

    res.json(nudges.map(n => ({
      id: n.id,
      from: n.from.username,
      team: n.team.name,
      teamId: n.teamId,
      at: n.createdAt,
    })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Team leaderboard (top teams by score)
router.get('/leaderboard', async (_req: Request, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { score: 'desc' },
      take: 20,
      select: { id: true, name: true, slug: true, score: true, battleWins: true, _count: { select: { members: true } } },
    });
    res.json(teams.map((t, i) => ({ rank: i + 1, ...t, memberCount: t._count.members })));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
