import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.CRM_URL || 'http://localhost:3002',
});
