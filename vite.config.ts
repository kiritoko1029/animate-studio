import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { voidPlugin } from 'void';

export default defineConfig(({ mode }) => ({
  plugins: [mode === 'cloudflare' && voidPlugin(), react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
}));
