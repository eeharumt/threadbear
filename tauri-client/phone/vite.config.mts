import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The app's screens, bundled into it on Windows and Android (tauri.conf.json).
// They use the website's logic and the Convex API from the rest of the repo,
// so the repo's own node_modules serve both. VITE_CONVEX_URL, if set, is the
// server a website sign-in link pairs with; the Mac's pairing code names its own.
export default defineConfig({
  root: import.meta.dirname,
  envDir: '../..',
  plugins: [react()],
  build: { outDir: 'dist', emptyOutDir: true },
  server: { port: 5182, fs: { allow: ['../..'] } },
});
