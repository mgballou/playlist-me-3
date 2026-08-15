import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import next from '@next/eslint-plugin-next';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/*.d.ts',
      '**/playwright-report/**',
      '**/test-results/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      'no-restricted-exports': ['error', { restrictDefaultExports: { direct: true } }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    },
  },

  {
    // Next.js resolves pages, layouts, route handlers and config through default exports.
    files: [
      '**/*.config.{js,ts,mjs}',
      'eslint.config.js',
      'apps/web/src/app/**/{page,layout,error,loading,not-found,route,template,default}.tsx',
      'apps/web/src/app/**/{page,layout,error,loading,not-found,route,template,default}.ts',
    ],
    rules: { 'no-restricted-exports': 'off' },
  },

  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': next },
    rules: {
      ...next.configs.recommended.rules,
      ...next.configs['core-web-vitals'].rules,
    },
  },

  {
    // The engine is pure. See docs/specs/2026-08-15-playlist-me-design.md §3.1 — time and
    // seeds enter as arguments at the boundary, which is what makes every engine test a
    // plain assertion and what makes a recipe plus a seed reproduce a playlist exactly.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: 'The engine takes time as an argument. See spec §3.1.',
        },
        {
          selector: "NewExpression[callee.name='Date']",
          message: 'The engine takes time as an argument. See spec §3.1.',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'The engine takes a seed as an argument. See spec §3.1.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pm/spotify', '@pm/spotify/*'],
              message:
                'core never imports the client. Dependencies flow web → spotify → core. See spec §4.',
            },
          ],
        },
      ],
    },
  },

  {
    // Engine tests run against fixtures so a data change cannot fail them. Spec §4.
    files: ['packages/core/test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@pm/spotify', '@pm/spotify/*'],
              message: 'Engine tests use test/fixtures/. See spec §8.',
            },
          ],
        },
      ],
    },
  },
);
