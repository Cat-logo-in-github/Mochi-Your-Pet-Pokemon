import js from '@eslint/js';
import ts from 'typescript-eslint';
export default [
  {
    ignores: [
      '**/dist/**',
      'Run-Windows/**',
      'Browser-Extension/**',
      '**/node_modules/**',
      '**/public/downloads/**',
      '**/work/**',
      '**/src-tauri/target/**',
    ],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  {
    languageOptions: {
      globals: Object.fromEntries(
        [
          'chrome',
          'document',
          'window',
          'navigator',
          'console',
          'process',
          'Buffer',
          'URL',
          'setTimeout',
          'clearTimeout',
          'setInterval',
          'clearInterval',
          'fetch',
          'localStorage',
          'requestAnimationFrame',
          'cancelAnimationFrame',
          'crypto',
          'performance',
          'AbortController',
          'TextEncoder',
          'TextDecoder',
          'URLSearchParams',
          'HTMLAudioElement',
          'HTMLElement',
          'HTMLInputElement',
          'HTMLButtonElement',
          'Audio',
          'Blob',
          'FileReader',
          'Event',
          'CustomEvent',
          'MutationObserver',
          'getComputedStyle',
        ].map((x) => [x, 'readonly']),
      ),
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];
