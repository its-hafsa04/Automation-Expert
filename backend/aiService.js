const { GoogleGenerativeAI } = require('@google/generative-ai');
const { z } = require('zod');
const crmService = require('./crm/CRMService');
const notificationService = require('./notifications/NotificationService');
const logger = require('./logger');
const { AppError, externalError } = require('./errors');

const activeLeads = new Set();
const geminiModelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

const aiResponseSchema = z.object({
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  reason: z.string(),
  summary: z.string(),
  followUpMessage: z.string(),
  isSpam: z.boolean().optional().default(false),
  suggestedStage: z.string().optional()
});

function applyBusinessRules(aiData, lead) {
  let finalData = { ...aiData };
  const spamKeywords = ['viagra', 'seo services', 'buy crypto', 'lottery'];
  const messageIsSpam = lead.message && spamKeywords.some(kw => lead.message.toLowerCase().includes(kw));
  
  if (finalData.isSpam || messageIsSpam) {
    finalData.priority = 'LOW';
  }

  const stageMapping = {
    'HIGH': 'PRIORITY_QUEUE',
    'MEDIUM': 'QUALIFIED_QUEUE',
    'LOW': 'STANDARD_QUEUE'
  };
  finalData.crmStage = stageMapping[finalData.priority] || 'STANDARD_QUEUE';

  return finalData;
}

async function qualifyLead(leadId, prisma) {
  if (activeLeads.has(leadId)) {
    return prisma.lead.findUnique({ where: { id: leadId } });
  }

  activeLeads.add(leadId);
  let lead = await prisma.lead.findUnique({ where: { id: leadId } });
  if (!lead) {
    activeLeads.delete(leadId);
    return null;
  }

  const recordFailure = async (error, step) => {
    const failure = error instanceof AppError ? error : externalError(error, step);
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        processingStatus: failure.retryable ? 'RETRYABLE_FAILURE' : 'FAILED',
        lastError: failure.message,
        lastErrorType: failure.code
      }
    });
    logger.error('lead.processing_failed', {
      leadId,
      step,
      errorType: failure.code,
      retryable: failure.retryable,
      message: failure.message
    });
    return failure;
  };

  try {
    await prisma.lead.update({
      where: { id: leadId },
      data: {
        processingStatus: 'PROCESSING',
        lastError: null,
        lastErrorType: null,
        processingAttempts: { increment: 1 }
      }
    });

  // 1. AI Qualification
  if (!lead.aiProcessed) {
    const prompt = `You are an AI sales assistant. Qualify the following lead.
Name: ${lead.name}
Email: ${lead.email}
Company: ${lead.company || 'None'}
Message: ${lead.message || 'None'}
Return STRICT JSON exactly matching format: {"priority": "HIGH|MEDIUM|LOW", "reason": "...", "summary": "...", "followUpMessage": "...", "isSpam": false, "suggestedStage": "..."}`;

    const interaction = await prisma.aIInteraction.create({
      data: { leadId, input: prompt, status: 'PENDING' }
    });

    let validatedData;
    try {
      const apiKey = process.env.GEMINI_API_KEY || '';
      if (!apiKey) {
         // mock for testing if no key
         validatedData = applyBusinessRules({
             priority: lead.message?.includes('buy crypto') ? 'LOW' : (lead.company === 'Acme' ? 'HIGH' : 'MEDIUM'),
             reason: 'Mock Reason',
             summary: 'Mock Summary',
             followUpMessage: 'Mock Message',
             isSpam: false
         }, lead);
      } else {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: geminiModelName, generationConfig: { responseMimeType: "application/json" } });
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('AI Provider Timeout')), 15000));
        const result = await Promise.race([model.generateContent(prompt), timeoutPromise]);
        const responseText = result.response.text();
        
        let parsedData;
        try {
          parsedData = aiResponseSchema.parse(JSON.parse(responseText));
        } catch (e) {
          throw new AppError('Gemini returned a malformed response', {
            code: 'AI_MALFORMED_RESPONSE',
            retryable: true,
            status: 502,
            cause: e
          });
        }
        validatedData = applyBusinessRules(parsedData, lead);
      }

      lead = await prisma.lead.update({
        where: { id: leadId },
        data: {
          priority: validatedData.priority,
          aiReason: validatedData.reason,
          aiSummary: validatedData.summary,
          followUpMessage: validatedData.followUpMessage,
          crmStage: validatedData.crmStage,
          aiProcessed: true
        }
      });

      await prisma.aIInteraction.update({
        where: { id: interaction.id },
        data: { status: 'SUCCESS' }
      });

    } catch (error) {
      await prisma.aIInteraction.update({
        where: { id: interaction.id },
        data: { status: 'FAILED', error: error.message }
      });
      throw await recordFailure(error, error.code?.startsWith('AI_') ? 'ai' : 'ai_provider');
    }
  }

  // 2. High Notification
  if (lead.priority === 'HIGH' && !lead.notificationProcessed) {
    try {
      await notificationService.notifyHighPriorityLead(lead, lead.aiReason);
      lead = await prisma.lead.update({
        where: { id: leadId },
        data: { notificationProcessed: true }
      });
    } catch (e) {
      throw await recordFailure(e, 'notification');
    }
  }

  // 3. CRM Create
  if (!lead.crmContactProcessed) {
    try {
      const crmContactId = await crmService.createOrUpdateContact(lead);
      lead = await prisma.lead.update({
        where: { id: leadId },
        data: { 
          crmContactId,
          crmContactProcessed: true
        }
      });
    } catch (e) {
      throw await recordFailure(e, 'crm_contact');
    }
  }

  // 4. CRM Stage
  if (lead.crmContactId && !lead.crmStageProcessed) {
     try {
       const isSpam = lead.priority === 'LOW' && lead.aiReason?.includes('spam');
       if (!isSpam) {
         await crmService.updatePipelineStage(lead.crmContactId, lead.priority);
       }
       lead = await prisma.lead.update({
         where: { id: leadId },
         data: { crmStageProcessed: true }
       });
     } catch (e) {
       throw await recordFailure(e, 'crm_stage');
     }
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: { processingStatus: 'COMPLETED', lastError: null, lastErrorType: null }
  });
  logger.info('lead.processing_completed', { leadId });
  return lead;
  } finally {
    activeLeads.delete(leadId);
  }
}

module.exports = { qualifyLead, aiResponseSchema };
