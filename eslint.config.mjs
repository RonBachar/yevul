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
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.expo/**',
      '**/web-build/**',
      // תוצרי בנייה זמניים של wrangler dev/deploy. קוד שנוצר אוטומטית
      // ואינו שלנו, ו-`npm run lint` נכשל עליו ב-23 שגיאות ברגע שמריצים
      // את ה-Worker מקומית.
      '**/.wrangler/**',
      'docs/**',
    ],
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
  // סקריפטים של ה-Worker רצים ב-Node ולא ב-workerd, ולכן הגלובלים שלהם
  // אחרים. הבלוק הזה חייב לבוא **אחרי** הבלוק של backend/worker כדי
  // לדרוס אותו. הוא מצומצם ל-scripts בכוונה: קוד המוצר עצמו לא אמור
  // לראות את process, וברגע שהוא יראה אותו הלינט יפסיק להתריע.
  {
    files: ['backend/worker/scripts/**/*.ts'],
    ...tsBase,
    languageOptions: {
      ...tsBase.languageOptions,
      globals: { ...globals.node },
    },
  },
  {
    files: ['packages/**/*.ts'],
    ...tsBase,
    languageOptions: {
      ...tsBase.languageOptions,
      // packages/shared הוא קוד טהור בלי תלות בסביבה, ולכן אין כאן
      // globals.browser או globals.node. אלה היוצאים מן הכלל, וכולם
      // קיימים זהה בשלושת הסביבות (דפדפן, React Native, Worker):
      // Blob (attachReceipt מקבל אותו כטיפוס) והטיימרים (useDataFreshness
      // מתקתק כדי שתווית הטריות תזדקן על המסך). מוצהרים בנקודה במקום
      // לפתוח את כל סביבת הדפדפן ולאפשר בטעות document או window.
      globals: {
        Blob: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
      },
    },
  },
  {
    files: ['**/*.config.js', '**/babel.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  prettierConfig,
];
