// @ts-check
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const MODULES = ['log', 'labs', 'consult', 'adm'];
const APPS = ['@nurion/api', '@nurion/worker', '@nurion/web'];

/** @param {{ group: string[], message: string }[]} patterns */
const restrictImports = (patterns) => ['error', { patterns }];

// CLAUDE.md rule 5: model names only come from env (LLM_MODEL_*). Tests may use literals.
const MODEL_NAME = '/^claude-(opus|sonnet|haiku|fable|instant|[0-9])/';

// The service-role Supabase client lives only in packages/db (ADR-0001).
const NO_DIRECT_SUPABASE = {
  group: ['@supabase/supabase-js'],
  message:
    'Use the clients from @nurion/db (withTenant / user client), never createClient directly.',
};

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/next-env.d.ts',
      'packages/db/src/database.types.ts',
      '.claude/**',
      'supabase/.temp/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.js',
            '*.mjs',
            '*.ts',
            'scripts/*.mjs',
            'apps/*/*.ts',
            'apps/*/*.mjs',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      // Async handlers without await are idiomatic in Fastify and BullMQ processors.
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/no-misused-promises': 'error',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      'no-restricted-syntax': [
        'error',
        {
          selector: `Literal[value=${MODEL_NAME}]`,
          message:
            'Never hardcode a model name. Use LLM_MODEL_AGENT, LLM_MODEL_FAST or LLM_MODEL_VISION.',
        },
        {
          selector: `TemplateElement[value.raw=${MODEL_NAME}]`,
          message:
            'Never hardcode a model name. Use LLM_MODEL_AGENT, LLM_MODEL_FAST or LLM_MODEL_VISION.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx', 'evals/**', 'supabase/tests/**'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.js', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**'],
    rules: { 'no-console': 'off' },
  },

  // ---- Package boundaries (ESCOPO §3, CLAUDE.md rule 10, ADR-0001) ----
  // One config object per package, so the restricted-import patterns are never overridden.
  ...MODULES.map((m) => ({
    files: [`packages/modules/${m}/**`],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: MODULES.filter((o) => o !== m).flatMap((o) => [
            `@nurion/module-${o}`,
            `@nurion/module-${o}/*`,
            `**/modules/${o}/**`,
            `../${o}`,
            `../${o}/**`,
          ]),
          message: 'A module never imports another module. Move shared logic to packages/core.',
        },
        {
          group: [...APPS, '@nurion/db', '@nurion/db/*'],
          message: 'Modules use packages/core only.',
        },
        NO_DIRECT_SUPABASE,
      ]),
    },
  })),
  {
    files: ['packages/core/**'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: ['@nurion/module-*', '**/modules/**'],
          message: 'The core never depends on a module.',
        },
        { group: APPS, message: 'Packages never import apps.' },
        NO_DIRECT_SUPABASE,
      ]),
    },
  },
  {
    files: ['packages/shared/**'],
    rules: {
      'no-restricted-imports': restrictImports([
        { group: ['@nurion/*'], message: 'packages/shared has no internal dependencies.' },
        NO_DIRECT_SUPABASE,
      ]),
    },
  },
  {
    files: ['packages/db/**'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: [
            '@nurion/core',
            '@nurion/core/*',
            '@nurion/module-*',
            '@nurion/whatsapp',
            ...APPS,
          ],
          message: 'packages/db only depends on packages/shared.',
        },
      ]),
    },
  },
  {
    files: ['packages/whatsapp/**'],
    rules: {
      'no-restricted-imports': restrictImports([
        {
          group: [
            '@nurion/core',
            '@nurion/core/*',
            '@nurion/module-*',
            '@nurion/db',
            '@nurion/db/*',
            ...APPS,
          ],
          message: 'packages/whatsapp only depends on packages/shared.',
        },
        NO_DIRECT_SUPABASE,
      ]),
    },
  },
  {
    files: ['apps/api/**', 'apps/worker/**'],
    rules: { 'no-restricted-imports': restrictImports([NO_DIRECT_SUPABASE]) },
  },

  // ---- Web app ----
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      // App Router only: there is no pages/ directory.
      '@next/next/no-html-link-for-pages': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'no-restricted-imports': restrictImports([
        {
          group: [
            '@nurion/core',
            '@nurion/core/*',
            '@nurion/module-*',
            '@nurion/whatsapp',
            'bullmq',
            '@anthropic-ai/sdk',
          ],
          message:
            'The panel reads Supabase with the user session and writes through apps/api (ADR-0002).',
        },
      ]),
    },
    settings: { next: { rootDir: 'apps/web' } },
  },
);
