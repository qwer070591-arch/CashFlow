import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    projects: [
      { test: { name: 'server', include: ['server/tests/**/*.test.ts'], environment: 'node' } },
      { test: { name: 'client', include: ['client/tests/**/*.test.tsx'], environment: 'jsdom', setupFiles: ['client/tests/setup.ts'] } },
    ],
  },
});
