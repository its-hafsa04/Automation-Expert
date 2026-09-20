const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding data...');

  const lead1 = await prisma.lead.upsert({
    where: { idempotencyKey: 'seed_lead_1' },
    update: {},
    create: {
      name: 'Alice Johnson',
      email: 'alice.johnson@example.com',
      company: 'Tech Corp',
      message: 'Looking for automation tools.',
      priority: 'high',
      aiReason: 'High priority due to company size.',
      aiSummary: 'Interested in automation.',
      idempotencyKey: 'seed_lead_1',
      interactions: {
        create: [
          {
            input: 'How can you help with automation?',
            output: 'We provide various solutions...',
            status: 'completed',
            idempotencyKey: 'seed_interaction_1',
          },
        ],
      },
    },
  });

  const lead2 = await prisma.lead.upsert({
    where: { idempotencyKey: 'seed_lead_2' },
    update: {},
    create: {
      name: 'Bob Smith',
      email: 'bob.smith@example.com',
      company: 'Logistics LLC',
      priority: 'medium',
      idempotencyKey: 'seed_lead_2',
    },
  });

  console.log('Seed completed!', { lead1, lead2 });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
