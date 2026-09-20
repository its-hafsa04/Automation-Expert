const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const { z } = require('zod');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const logger = require('./logger');
const { createAuthRouter } = require('./auth/routes');
const { requireAuth } = require('./auth/middleware');
const { processLeadRequest } = require('./leads/processLead');
require('dotenv').config();

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lead_automation';
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

const prisma = createPrismaClient();
const app = express();

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth', createAuthRouter(prisma));

const webhookRateLimit = rateLimit({
  windowMs: Number(process.env.WEBHOOK_RATE_LIMIT_WINDOW_MS || 60_000),
  limit: Number(process.env.WEBHOOK_RATE_LIMIT_MAX || 60),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn('webhook.rate_limited', { ip: req.ip });
    return res.status(429).json({ error: 'Rate limit exceeded', retryable: true });
  }
});

const leadSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email address'),
  company: z.string().optional(),
  message: z.string().min(1, 'Message is required'),
  idempotencyKey: z.string().optional()
});

async function handleLeadIngest(req, res, { userId } = {}) {
  try {
    const parsed = leadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.issues });
    }

    const result = await processLeadRequest({
      prisma,
      body: parsed.data,
      idempotencyHeader: req.headers['x-idempotency-key'],
      userId
    });

    return res.status(result.status).json(result.body);
  } catch (error) {
    logger.error('webhook.failed', { message: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  }
}

app.post('/api/leads/webhook', webhookRateLimit, (req, res) => handleLeadIngest(req, res));

app.post('/api/leads', requireAuth, (req, res) => handleLeadIngest(req, res, { userId: req.user.id }));

app.get('/api/leads/:leadId/qualification', requireAuth, async (req, res) => {
  try {
    const lead = await prisma.lead.findUnique({
      where: { id: req.params.leadId },
      select: {
        id: true,
        priority: true,
        aiReason: true,
        aiSummary: true,
        followUpMessage: true,
        aiProcessed: true,
        notificationProcessed: true,
        crmContactProcessed: true,
        crmStageProcessed: true,
        processingStatus: true,
        lastError: true,
        lastErrorType: true,
        processingAttempts: true,
        userId: true
      }
    });

    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    return res.status(lead.processingStatus === 'FAILED' ? 422 : (lead.aiProcessed ? 200 : 202)).json(lead);
  } catch (error) {
    console.error('Error reading lead qualification status.');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

if (require.main === module) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

module.exports = { app, prisma };
