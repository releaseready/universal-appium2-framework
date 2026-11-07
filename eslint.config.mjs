import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'allure-results/**', 'apps/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
        $: 'readonly',
        $$: 'readonly',
        browser: 'readonly',
        driver: 'readonly',
        expect: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
);
