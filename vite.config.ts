import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works both locally and from a GitHub Pages sub-path.
  base: './',
  server: {
    open: true
  }
});
