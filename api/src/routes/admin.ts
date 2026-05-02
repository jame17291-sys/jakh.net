import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET!;
const DATA_DIR = process.env.DATA_DIR || '/var/www/jakh.net/data';

const SLUG_RE = /^[a-z0-9-]+$/;
function safeSlug(slug: string): string | null {
  return SLUG_RE.test(slug) ? slug : null;
}

interface AuthRequest extends Request {
  adminUserId?: string;
  adminRole?: string;
}

const requireAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = req.cookies.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; sessionId: string };
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.currentSessionId !== payload.sessionId) {
      return res.status(401).json({ error: 'Session expired' });
    }
    if (user.role !== 'ADMIN' && user.role !== 'OWNER') return res.status(403).json({ error: 'Forbidden' });
    req.adminUserId = user.id;
    req.adminRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(requireAdmin as any);

// ── Overview ──────────────────────────────────────────────────────────────────

router.get('/overview', async (req: AuthRequest, res: Response) => {
  try {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(todayStart.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const [
      totalUsers, newUsersToday, newUsersThisWeek, newUsersThisMonth,
      activeUsers24h, totalEvents, eventsToday,
      topCategories, recentSignups,
      totalSolves, totalFavorites,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.user.count({ where: { createdAt: { gte: weekStart } } }),
      prisma.user.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.user.count({ where: { lastLoginAt: { gte: last24h } } }),
      prisma.pageAnalytics.count(),
      prisma.pageAnalytics.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.pageAnalytics.groupBy({
        by: ['pageSlug'],
        _sum: { timeSpent: true },
        _count: { pageSlug: true },
        orderBy: { _sum: { timeSpent: 'desc' } },
        take: 5,
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: { id: true, username: true, email: true, country: true, createdAt: true, role: true },
      }),
      prisma.userProgress.count(),
      prisma.userFavorite.count(),
    ]);

    res.json({
      totalUsers, newUsersToday, newUsersThisWeek, newUsersThisMonth, activeUsers24h,
      totalEvents, eventsToday, totalSolves, totalFavorites,
      topCategories: topCategories.map(c => ({
        slug: c.pageSlug,
        totalMinutes: Math.round((c._sum.timeSpent || 0) / 60),
        sessions: c._count.pageSlug,
      })),
      recentSignups,
    });
  } catch (err) {
    console.error('[Admin Overview]', err);
    res.status(500).json({ error: 'Failed to load overview' });
  }
});

// ── Users ─────────────────────────────────────────────────────────────────────

router.get('/users', async (req: Request, res: Response) => {
  try {
    const search = String(req.query.search || '').trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const filter = String(req.query.filter || '');
    const limit = 20;
    const skip = (page - 1) * limit;

    let where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' as const } },
        { email: { contains: search, mode: 'insensitive' as const } },
      ];
    }
    if (filter === 'admins') where.role = { in: ['ADMIN', 'OWNER'] };
    if (filter === 'banned') where.isBanned = true;

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where, orderBy: { createdAt: 'desc' }, skip, take: limit,
        include: { _count: { select: { progress: true, favorites: true } } },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map(u => ({
        id: u.id, username: u.username, email: u.email, role: u.role,
        isBanned: u.isBanned, country: u.country,
        createdAt: u.createdAt, lastLoginAt: u.lastLoginAt,
        progressCount: u._count.progress, favoritesCount: u._count.favorites,
      })),
      total, page, pages: Math.ceil(total / limit),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load users' });
  }
});

router.patch('/users/:id/role', async (req: AuthRequest, res: Response) => {
  try {
    const { role } = req.body;
    if (!['ADMIN', 'USER'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'OWNER') return res.status(403).json({ error: 'Cannot change OWNER role' });
    if (req.adminRole !== 'OWNER' && target.role === 'ADMIN') {
      return res.status(403).json({ error: 'Only OWNER can demote admins' });
    }

    const updated = await prisma.user.update({ where: { id: req.params.id }, data: { role } });
    res.json({ success: true, role: updated.role });
  } catch {
    res.status(500).json({ error: 'Failed to update role' });
  }
});

router.patch('/users/:id/ban', async (req: AuthRequest, res: Response) => {
  try {
    const { banned } = req.body;
    if (typeof banned !== 'boolean') return res.status(400).json({ error: 'Invalid request' });

    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'OWNER') return res.status(403).json({ error: 'Cannot ban OWNER' });
    if (req.params.id === req.adminUserId) return res.status(400).json({ error: 'Cannot ban yourself' });

    await prisma.user.update({ where: { id: req.params.id }, data: { isBanned: banned, currentSessionId: banned ? null : undefined } });
    res.json({ success: true, isBanned: banned });
  } catch {
    res.status(500).json({ error: 'Failed to update ban status' });
  }
});

router.delete('/users/:id', async (req: AuthRequest, res: Response) => {
  try {
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (req.params.id === req.adminUserId) return res.status(400).json({ error: 'Cannot delete your own account' });
    if (target.role === 'OWNER') return res.status(403).json({ error: 'Cannot delete OWNER account' });
    await prisma.user.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// User activity drill-down
router.get('/users/:id/activity', async (_req: Request, res: Response) => {
  try {
    const userId = _req.params.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true, role: true, country: true, createdAt: true, lastLoginAt: true, isBanned: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const [progress, favorites, analytics] = await Promise.all([
      prisma.userProgress.groupBy({ by: ['categoryId'], where: { userId }, _count: { categoryId: true } }),
      prisma.userFavorite.groupBy({ by: ['categoryId'], where: { userId }, _count: { categoryId: true } }),
      prisma.pageAnalytics.groupBy({
        by: ['pageSlug'], where: { userId },
        _sum: { timeSpent: true }, _count: { pageSlug: true },
        orderBy: { _sum: { timeSpent: 'desc' } }, take: 10,
      }),
    ]);

    res.json({
      user,
      solvesByCategory: progress.map(p => ({ category: p.categoryId, count: p._count.categoryId })),
      favoritesByCategory: favorites.map(f => ({ category: f.categoryId, count: f._count.categoryId })),
      timeByCategory: analytics.map(a => ({
        category: a.pageSlug,
        minutes: Math.round((a._sum.timeSpent || 0) / 60),
        sessions: a._count.pageSlug,
      })),
    });
  } catch {
    res.status(500).json({ error: 'Failed to load user activity' });
  }
});

// ── Analytics ─────────────────────────────────────────────────────────────────

router.get('/analytics', async (_req: Request, res: Response) => {
  try {
    const [categoryTime, countryStats, totalSessions, hardestRiddles] = await Promise.all([
      prisma.pageAnalytics.groupBy({
        by: ['pageSlug'],
        _sum: { timeSpent: true },
        _count: { pageSlug: true },
        orderBy: { _sum: { timeSpent: 'desc' } },
      }),
      prisma.pageAnalytics.groupBy({
        by: ['country'],
        _count: { country: true },
        orderBy: { _count: { country: 'desc' } },
        take: 20,
      }),
      prisma.pageAnalytics.count(),
      prisma.userProgress.groupBy({
        by: ['cardId', 'categoryId'],
        where: { status: { startsWith: 'wrong-' } },
        _count: { status: true },
        orderBy: { _count: { status: 'desc' } },
        take: 10,
      }),
    ]);

    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const dailyGroupsRaw = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt")::date::text AS date, COUNT(*) AS count
      FROM "PageAnalytics"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE_TRUNC('day', "createdAt")
    `;
    const dailyMap = Object.fromEntries(dailyGroupsRaw.map(g => [g.date, Number(g.count)]));
    const daily = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * 24 * 60 * 60 * 1000);
      const dateStr = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().split('T')[0];
      return { date: dateStr, count: dailyMap[dateStr] || 0 };
    });

    const totalTime = categoryTime.reduce((s, c) => s + (c._sum.timeSpent || 0), 0);
    const uniqueVisitorsResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(DISTINCT "userId") AS count FROM "PageAnalytics" WHERE "userId" IS NOT NULL
    `;
    const uniqueVisitors = { length: Number(uniqueVisitorsResult[0].count) };

    res.json({
      categoryTime: categoryTime.map(c => ({
        slug: c.pageSlug,
        totalMinutes: Math.round((c._sum.timeSpent || 0) / 60),
        sessions: c._count.pageSlug,
        percentage: totalSessions > 0 ? Math.round((c._count.pageSlug / totalSessions) * 100) : 0,
      })),
      countryStats: countryStats.map(c => ({
        country: c.country || 'Unknown',
        visits: c._count.country,
        percentage: totalSessions > 0 ? Math.round((c._count.country / totalSessions) * 100) : 0,
      })),
      daily: daily.reverse(),
      hardestRiddles: hardestRiddles.map(r => ({
        cardId: r.cardId,
        categoryId: r.categoryId,
        fails: r._count.status,
      })),
      summary: {
        totalSessions,
        uniqueVisitors: uniqueVisitors.length,
        avgMinutesPerSession: totalSessions > 0
          ? Math.round((totalTime / totalSessions / 60) * 10) / 10 : 0,
        totalHours: Math.round(totalTime / 3600),
      },
    });
  } catch (err) {
    console.error('[Admin Analytics]', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ── Content ───────────────────────────────────────────────────────────────────

router.get('/content', async (_req: Request, res: Response) => {
  try {
    const catalog = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'));
    const [solvesByCategory, favoritesByCategory] = await Promise.all([
      prisma.userProgress.groupBy({ by: ['categoryId'], _count: { categoryId: true } }),
      prisma.userFavorite.groupBy({ by: ['categoryId'], _count: { categoryId: true } }),
    ]);
    const solvesMap = Object.fromEntries(solvesByCategory.map(s => [s.categoryId, s._count.categoryId]));
    const favMap = Object.fromEntries(favoritesByCategory.map(f => [f.categoryId, f._count.categoryId]));
    res.json({
      categories: catalog.categories.map((cat: any) => ({
        ...cat,
        totalSolves: solvesMap[cat.slug] || 0,
        totalFavorites: favMap[cat.slug] || 0,
      })),
      site: catalog.site,
    });
  } catch {
    res.status(500).json({ error: 'Failed to read catalog' });
  }
});

router.get('/content/:slug', async (req: Request, res: Response) => {
  try {
    const slug = safeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid category slug' });
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });
    res.json(JSON.parse(fs.readFileSync(filePath, 'utf8')));
  } catch {
    res.status(500).json({ error: 'Failed to read category' });
  }
});

router.patch('/content/:slug/cards/:id', async (req: Request, res: Response) => {
  try {
    const slug = safeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid category slug' });
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const idx = data.cards.findIndex((c: any) => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Card not found' });
    const { id: _id, ...updates } = req.body;
    data.cards[idx] = { ...data.cards[idx], ...updates };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true, card: data.cards[idx] });
  } catch {
    res.status(500).json({ error: 'Failed to update card' });
  }
});

router.post('/content/:slug/cards', async (req: Request, res: Response) => {
  try {
    const slug = safeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid category slug' });
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const newCard = { id: `${slug}-${Date.now()}`, ...req.body };
    data.cards.push(newCard);
    data.count = data.cards.length;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    const catalogPath = path.join(DATA_DIR, 'catalog.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    const catIdx = catalog.categories.findIndex((c: any) => c.slug === slug);
    if (catIdx !== -1) {
      catalog.categories[catIdx].count = data.count;
      catalog.site.totalQuestions = catalog.categories.reduce((s: number, c: any) => s + (c.count || 0), 0);
      fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
    }
    res.json({ success: true, card: newCard });
  } catch {
    res.status(500).json({ error: 'Failed to add card' });
  }
});

router.delete('/content/:slug/cards/:id', async (req: Request, res: Response) => {
  try {
    const slug = safeSlug(req.params.slug);
    if (!slug) return res.status(400).json({ error: 'Invalid category slug' });
    const filePath = path.join(DATA_DIR, `${slug}.json`);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Category not found' });
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const before = data.cards.length;
    data.cards = data.cards.filter((c: any) => c.id !== req.params.id);
    if (data.cards.length === before) return res.status(404).json({ error: 'Card not found' });
    data.count = data.cards.length;
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to delete card' });
  }
});

// ── Settings ──────────────────────────────────────────────────────────────────

router.post('/settings/password', async (req: AuthRequest, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }
    const user = await prisma.user.findUnique({ where: { id: req.adminUserId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(401).json({ error: 'Current password is incorrect' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: req.adminUserId }, data: { password: hashed } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

router.post('/settings/revoke-sessions', async (req: AuthRequest, res: Response) => {
  try {
    await prisma.user.updateMany({
      where: { id: { not: req.adminUserId }, role: { not: 'OWNER' } },
      data: { currentSessionId: null },
    });
    res.json({ success: true, message: 'All other sessions revoked' });
  } catch {
    res.status(500).json({ error: 'Failed to revoke sessions' });
  }
});

// ── Suggestions ───────────────────────────────────────────────────────────────

router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const status = String(req.query.status || '');
    const where = status ? { status } : {};
    const suggestions = await prisma.suggestion.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    res.json({ suggestions });
  } catch {
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});

router.patch('/suggestions/:id/status', async (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const valid = ['new', 'reviewed', 'implemented', 'rejected'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'Invalid status' });
    const updated = await prisma.suggestion.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json({ success: true, status: updated.status });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
});

router.delete('/suggestions/:id', async (req: Request, res: Response) => {
  try {
    await prisma.suggestion.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (e: any) {
    if (e?.code === 'P2025') return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/export/users', async (_req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: { _count: { select: { progress: true, favorites: true } } },
    });
    const rows = ['ID,Username,Email,Role,Banned,Country,Joined,LastLogin,Solved,Favorites'];
    users.forEach(u => {
      rows.push([
        u.id, u.username, u.email || '', u.role, u.isBanned ? 'yes' : 'no',
        u.country || '', u.createdAt.toISOString(),
        u.lastLoginAt ? u.lastLoginAt.toISOString() : '',
        u._count.progress, u._count.favorites,
      ].join(','));
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="jakh-users.csv"');
    res.send(rows.join('\n'));
  } catch {
    res.status(500).json({ error: 'Export failed' });
  }
});

export default router;
