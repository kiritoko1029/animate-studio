import { nativeExportPlugin } from './scripts/native-export-plugin.ts';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { voidPlugin } from 'void';

export default defineConfig(({ mode }) => {
  // Void's direct deploy invokes Vite in production mode; Node builds opt out.
  const cloudflare = mode === 'cloudflare' || mode === 'production';
  return {
    plugins: [cloudflare && voidPlugin(), react(), tailwindcss(), nativeExportPlugin()],
    define: { 'import.meta.env.VITE_STUDIO_CLOUD': JSON.stringify(cloudflare) },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  };
});
