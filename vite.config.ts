import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' damit die App auch aus einem Unterordner (z. B. GitHub Pages) läuft
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
  },
});
