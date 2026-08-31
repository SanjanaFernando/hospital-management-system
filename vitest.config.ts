import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import path from 'path';

// export default defineConfig({
//   plugins: [react(), tsconfigPaths()],
//   test: {
//     globals: true,
//     environment: 'node',
//     setupFiles: ['./tests/setup.ts'],
//     coverage: {
//       provider: 'v8',
//       reporter: ['text', 'json', 'html'],
//       exclude: [
//         'node_modules/',
//         'tests/',
//         '.next/',
//         'dist/',
//       ],
//     },
//   },
//   resolve: {
//     alias: {
//       '@': path.resolve(__dirname, '.'),
//     },
//   },
// });
export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: [
      'node_modules/**',
      'e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '.next/',
        'dist/',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});