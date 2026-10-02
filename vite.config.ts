import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { execSync } from 'child_process';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { requireNativeUrl } from './src/services/nativeConfig';

function getCommitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7);
  }
  if (process.env.VITE_COMMIT_SHA) {
    return process.env.VITE_COMMIT_SHA.slice(0, 7);
  }
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch {
    return 'dev';
  }
}

function versionJsonPlugin(commit: string, builtAt: string, version: string): Plugin {
  return {
    name: 'version-json-plugin',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: JSON.stringify({ commit, builtAt, version }, null, 2),
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const nativeBuild = mode === 'native';
  if (nativeBuild) {
    const env = loadEnv(mode, process.cwd(), 'VITE_');
    requireNativeUrl(env.VITE_API_URL, 'https:', 'VITE_API_URL');
    requireNativeUrl(env.VITE_WS_URL, 'wss:', 'VITE_WS_URL');
  }

  const commitSha = getCommitSha();
  const buildTime = new Date().toISOString();
  const appVersion = process.env.npm_package_version || '1.0.0';

  return {
    define: {
      __COMMIT_SHA__: JSON.stringify(commitSha),
      __BUILD_TIME__: JSON.stringify(buildTime),
      __APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      react(),
      tailwindcss(),
      versionJsonPlugin(commitSha, buildTime, appVersion),
      !nativeBuild && VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        devOptions: {
          enabled: false,
        },
        // Workbox globPatterns already covers these files; listing them again adds
        // duplicate precache entries with different revision/cache keys.
        includeAssets: [],
        includeManifestIcons: false,
        manifest: {
          name: 'Mobile Shop POS & ERP',
          short_name: 'Mobile Shop',
          description: 'Mobile Shop POS & ERP — Профессиональная система автоматизации и учета магазина электроники',
          lang: 'ru',
          theme_color: '#0F1219',
          background_color: '#0B0E14',
          display: 'standalone',
          orientation: 'portrait',
          start_url: '/',
          scope: '/',
          id: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any'
            },
            {
              src: '/maskable-icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,ttf}'],
          // Preserve offline access to every existing page. Exclude on-demand deps and version.json from precache.
          globIgnores: ['**/exceljs*.js', '**/ScannerModal*.js', '**/version.json'],
          runtimeCaching: [
            // Cache static assets with CacheFirst
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            // The version endpoint must NEVER be cached by the Service Worker (Requirement 10)
            {
              urlPattern: /\/version\.json$/i,
              handler: 'NetworkOnly',
            },
            // Financial and inventory API responses must never come from a stale
            // service-worker cache. Offline UI assets remain available, but live
            // business data requires the server.
            {
              urlPattern: /\/api\/.*/i,
              handler: 'NetworkOnly',
            },
            // WebSocket endpoint
            {
              urlPattern: /\/ws.*/i,
              handler: 'NetworkOnly',
            }
          ]
        }
      })
    ],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: true,
          ws: true,
        },
        '/ws': {
          target: 'ws://127.0.0.1:3001',
          ws: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
