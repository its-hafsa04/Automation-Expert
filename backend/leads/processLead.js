const logger = require('../logger');

async function processLeadRequest({ prisma, body, idempotencyHeader, userId }) {
  let { name, email, company, message, idempotencyKey } = body;
  email = email.toLowerCase().trim();
  const key = idempotencyKey || idempotencyHeader;

  const { qualifyLead } = require('../aiService');

  let lead;

  if (key) {
    const existing = await prisma.lead.findUnique({
      where: { idempotencyKey: key }
    });
    if (existing) {
      logger.info('lead.duplicate', { leadId: existing.id, idempotencyKey: key });
      if (
        (existing.processingStatus !== 'FAILED' || Boolean(key)) &&
        (!existing.aiProcessed ||
          !existing.crmContactProcessed ||
          !existing.crmStageProcessed ||
          (existing.priority === 'HIGH' && !existing.notificationProcessed))
      ) {
        qualifyLead(existing.id, prisma).catch((err) => {
          logger.error('lead.retry_failed', { leadId: existing.id, message: err.message });
        });
      }
      return {
        status: 200,
        body: {
          message:
            existing.processingStatus === 'FAILED' ? 'Lead retry accepted' : 'Lead already processed',
          leadId: existing.id,
          processingStatus: existing.processingStatus,
          error: existing.lastError,
          errorType: existing.lastErrorType
        }
      };
    }
  } else {
    const recentLead = await prisma.lead.findFirst({
      where: {
        email,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });
    if (recentLead) {
      logger.info('lead.duplicate_email', { leadId: recentLead.id, email });
      if (
        recentLead.processingStatus !== 'FAILED' &&
        (!recentLead.aiProcessed ||
          !recentLead.crmContactProcessed ||
          !recentLead.crmStageProcessed ||
          (recentLead.priority === 'HIGH' && !recentLead.notificationProcessed))
      ) {
        qualifyLead(recentLead.id, prisma).catch((err) => {
          console.error('Retry background qualification failed', err.message);
        });
      }
      return {
        status: 200,
        body: { message: 'Lead recently processed', leadId: recentLead.id }
      };
    }
  }

  try {
    lead = await prisma.lead.create({
      data: {
        name,
        email,
        company,
        message,
        idempotencyKey: key || undefined,
        userId: userId || undefined
      }
    });
  } catch (error) {
    if (key && error.code === 'P2002') {
      const existing = await prisma.lead.findUnique({ where: { idempotencyKey: key } });
      if (existing) {
        logger.info('lead.duplicate_race', { leadId: existing.id, idempotencyKey: key });
        return {
          status: 200,
          body: {
            message: 'Lead already processed',
            leadId: existing.id,
            processingStatus: existing.processingStatus
          }
        };
      }
    }
    throw error;
  }

  logger.info('lead.created', { leadId: lead.id, userId: userId || null });

  qualifyLead(lead.id, prisma).catch((err) => {
    logger.error('lead.background_processing_failed', { leadId: lead.id, message: err.message });
  });

  return {
    status: 201,
    body: { message: 'Lead created successfully', leadId: lead.id }
  };
}

module.exports = { processLeadRequest };
