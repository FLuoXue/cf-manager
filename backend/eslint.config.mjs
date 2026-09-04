import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { commonRules, ignores } from '../eslint.shared.mjs';

export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  commonRules,
];
