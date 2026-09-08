import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  site: process.env.ADMIN_URL || 'http://localhost:3001',
  integrations: [react()],
  vite: { plugins: [tailwindcss()] },
});
