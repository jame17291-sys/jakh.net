import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import prisma from '../prisma';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set. Refusing to start insecurely.');
  process.exit(1);
}

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please try again in 15 minutes' },
});

const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/;

function validateRegistration(username: string, password: string): string | null {
  if (!username || !password) return 'Username and password are required';
  if (!USERNAME_RE.test(username)) return 'Username must be 3–20 characters: letters, numbers, underscore only';
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (password.length > 128) return 'Password too long';
  return null;
}

router.post('/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password, email } = req.body;

    const validationError = validateRegistration(username, password);
    if (validationError) return res.status(400).json({ error: validationError });

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    const existingUser = await prisma.user.findFirst({
      where: { OR: [{ username }, { email: email || undefined }] }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const sessionId = uuidv4();

    const user = await prisma.user.create({
      data: { username, password: hashedPassword, email: email || null, currentSessionId: sessionId }
    });

    const token = jwt.sign({ userId: user.id, sessionId }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    console.error('[register]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Invalid input' });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check ban BEFORE the expensive bcrypt hash comparison
    if (user.isBanned) {
      return res.status(403).json({ error: 'This account has been suspended' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }


    const sessionId = uuidv4();
    await prisma.user.update({ where: { id: user.id }, data: { currentSessionId: sessionId, lastLoginAt: new Date() } });

    const token = jwt.sign({ userId: user.id, sessionId }, JWT_SECRET, { expiresIn: '7d' });

    res.cookie('auth_token', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (error) {
    console.error('[login]', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('auth_token', { httpOnly: true, secure: true, sameSite: 'strict' });
  res.json({ message: 'Logged out successfully' });
});

export default router;
