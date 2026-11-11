import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://creative.vuphm.io.vn',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
});

