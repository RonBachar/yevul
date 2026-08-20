import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const tsBase = {
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
    },
  },
  plugins: {
    '@typescript-eslint': tseslint,
  },
  rules: {
    ...tseslint.configs.recommended.rules,
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
  },
};

export default [
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/.expo/**', '**/web-build/**', 'docs/**'],
  },
  js.configs.recommended,
  {
    files: ['frontend/web/**/*.{ts,tsx}'],
    ...tsBase,
    languageOptions: {
      ...tsBase.languageOptions,
      globals: { ...globals.browser },
    },
  },
  {
    files: ['frontend/mobile/**/*.{ts,tsx}'],
    ...tsBase,
    languageOptions: {
      ...tsBase.languageOptions,
      // require() is how React Native bundles static assets like fonts
      globals: { ...globals.node, __DEV__: 'readonly' },
    },
    rules: {
      ...tsBase.rules,
      '@typescript-eslint/no-require-imports': 'off',
    },
  },
  {
    files: ['backend/worker/**/*.ts'],
    ...tsBase,
    languageOptions: {
      ...tsBase.languageOptions,
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['packages/**/*.ts'],
    ...tsBase,
  },
  {
    files: ['**/*.config.js', '**/babel.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettierConfig,
];
