// 共享 ESLint 规则（被各子项目 eslint.config.mjs 引用，P1-7 CI 门禁）
// 原则：只把「能抓真实 bug」的规则设为 error；风格类（引号/分号/缩进等）全部关闭，
// 避免对存量代码产生海量噪声而把 CI 打红。warning 不会让 CI 失败，error 才会。
// 注意：本文件不 import 任何插件（插件由各子项目 config 加载），仅导出规则字符串对象，
// 以免 ESLint 从 root 解析插件失败。
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/public/**',
  '**/data/**',
  '**/coverage/**',
  '**/*.generated.ts',
  '**/version.ts',
  '**/scripts/**',
  '**/build.js',
  '**/*.config.js',
];

export const commonRules = {
  files: ['**/*.ts', '**/*.vue'],
  languageOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  rules: {
    // —— 风格类全关（避免存量噪声）——
    quotes: 'off',
    semi: 'off',
    indent: 'off',
    '@typescript-eslint/indent': 'off',
    '@typescript-eslint/semi': 'off',
    '@typescript-eslint/quotes': 'off',
    '@typescript-eslint/member-delimiter-style': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/no-namespace': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    'no-console': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
    // —— 真实 bug 级规则（error）——
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'warn',
    'prefer-const': 'error',
    'no-var': 'error',
    'no-duplicate-case': 'error',
    'no-fallthrough': 'error',
    'no-unreachable': 'error',
    'eqeqeq': ['error', 'smart'],
  },
};
