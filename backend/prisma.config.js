const { defineConfig } = require('prisma/config');
require('dotenv').config();

const dbUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/lead_automation';

module.exports = defineConfig({
  datasource: {
    url: dbUrl,
  },
});
