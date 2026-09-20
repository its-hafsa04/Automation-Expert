const express = require('express');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');
const { hashPassword, verifyPassword } = require('./password');
const { signAccessToken } = require('./tokens');
const { requireAuth } = require('./middleware');
const logger = require('../logger');

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(1).optional()
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required')
});

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('auth.rate_limited', { ip: req.ip });
    return res.status(429).json({ error: 'Too many attempts, try again later' });
  }
});

function createAuthRouter(prisma) {
  const router = express.Router();

  router.post('/register', authRateLimit, async (req, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
      }

      const email = parsed.data.email.toLowerCase().trim();
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await hashPassword(parsed.data.password);
      const user = await prisma.user.create({
        data: {
          email,
          password: passwordHash,
          name: parsed.data.name?.trim() || null
        },
        select: { id: true, email: true, name: true, createdAt: true }
      });

      const token = signAccessToken(user);
      logger.info('auth.registered', { userId: user.id });
      return res.status(201).json({ user, token });
    } catch (error) {
      logger.error('auth.register_failed', { message: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.post('/login', authRateLimit, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
      }

      const email = parsed.data.email.toLowerCase().trim();
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const valid = await verifyPassword(parsed.data.password, user.password);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid email or password' });
      }

      const safeUser = {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      };
      const token = signAccessToken(safeUser);
      logger.info('auth.login', { userId: user.id });
      return res.status(200).json({ user: safeUser, token });
    } catch (error) {
      logger.error('auth.login_failed', { message: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/me', requireAuth, async (req, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: { id: true, email: true, name: true, createdAt: true }
      });
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      return res.status(200).json({ user });
    } catch (error) {
      logger.error('auth.me_failed', { message: error.message });
      return res.status(500).json({ error: 'Internal server error' });
    }
  });

  return router;
}

module.exports = { createAuthRouter };
