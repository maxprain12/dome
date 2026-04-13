// @ts-check
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  // Ignore non-renderer directories
  {
    ignores: [
      'dist/**',
      'electron/**',
      'scripts/**',
      'public/**',
      'node_modules/**',
      'release/**',
      'build/**',
    ],
  },

  // TypeScript rules (recommended — catches real bugs, not stylistic issues)
  ...tseslint.configs.recommended,

  // React Hooks rules
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // Warn on any but don't block — the codebase has some legitimate uses
      '@typescript-eslint/no-explicit-any': 'warn',

      // Allow unused vars prefixed with _ (common pattern for intentional ignores)
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Allow require() in .cjs files (electron main process — but we exclude electron/ above)
      '@typescript-eslint/no-require-imports': 'error',
    },
  },
);
