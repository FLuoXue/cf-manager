import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import vue from 'eslint-plugin-vue';
import { commonRules, ignores } from '../eslint.shared.mjs';

export default [
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs['flat/recommended'],
  {
    // .vue 的 <script> 块必须用 TypeScript 解析器，否则 interface/类型注解会被当作 JS 报错
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: ['vue'],
      },
    },
  },
  commonRules,
];
