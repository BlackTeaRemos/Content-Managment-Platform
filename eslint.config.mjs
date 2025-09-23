// ESLint v9 flat config
import       // Enforce blank lines before control statements
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'do', 'switch', 'try'] }
      ],
      // Prettier rules
      'prettier/prettier': 'error',eslint/js';
import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  {
    ignores: ['node_modules/**', 'cmp/**', 'dist/**', 'tmp-tests/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      // Enforce K&R (1TBS) brace style
      'brace-style': ['error', '1tbs', { allowSingleLine: false }],
      // For TS, use the TS-aware rule and disable core for TS files via overrides below
      '@typescript-eslint/brace-style': 'off',
      // Keep single-line non-block bodies beside the statement
      'nonblock-statement-body-position': ['error', 'beside'],
      // Require braces on all control statements
      curly: ['error', 'all'],
      // Enforce spaces around keywords
      'keyword-spacing': ['error', { before: true, after: true }],
      // Enforce blank lines before control statements
      'padding-line-between-statements': [
        'error',
        { blankLine: 'always', prev: '*', next: ['if', 'for', 'while', 'do', 'switch', 'try'] },
      ],
      // Enforce semicolons
      '@typescript-eslint/semi': ['error', 'always'],
      // Enforce trailing commas
      '@typescript-eslint/comma-dangle': ['error', 'always-multiline'],
      // Enforce no space before function parentheses
      '@typescript-eslint/space-before-function-paren': ['error', 'never', { 'anonymous': 'never', 'asyncArrow': 'never' }],
      // Prettier rules
      'prettier/prettier': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'brace-style': 'off',
      '@typescript-eslint/brace-style': ['error', '1tbs', { allowSingleLine: false }],
    },
  }
);
