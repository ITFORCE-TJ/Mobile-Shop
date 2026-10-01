import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default defineConfig(async (env) => {
  const baseConfig = typeof viteConfig === 'function' ? await viteConfig(env) : viteConfig;
  return mergeConfig(baseConfig, {
    test: {
      exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/.git/**'],
    },
  });
});
