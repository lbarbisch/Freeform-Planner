import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'public'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'always'],
      'prefer-const': ['error', { destructuring: 'all' }],
    },
  },
  {
    // architectural boundary: the core is pure data + logic
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['three', 'three/*', 'react', 'react-dom', 'react/*'], message: 'src/core must not depend on rendering or UI libraries.' },
          { group: ['../*'], message: 'src/core must not import from outside src/core.' },
        ],
      }],
    },
  },
);
