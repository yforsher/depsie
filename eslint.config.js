// @ts-check

import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist']),
  {
    files: ['**/*.{js,ts,tsx}'],
    extends: [js.configs.recommended, tseslint.configs.recommended, prettier],
  },
  {
    files: ['client/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
]);
