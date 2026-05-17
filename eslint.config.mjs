import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import nPlugin from 'eslint-plugin-n'
import promisePlugin from 'eslint-plugin-promise'
import tseslint from 'typescript-eslint'

const nodeGlobals = {
  console: 'readonly',
  module: 'readonly',
  process: 'readonly',
  require: 'readonly'
}

const jestGlobals = {
  afterEach: 'readonly',
  beforeEach: 'readonly',
  describe: 'readonly',
  expect: 'readonly',
  jest: 'readonly',
  test: 'readonly'
}

export default [
  {
    ignores: ['node_modules/**', 'coverage/**']
  },
  {
    files: ['**/*.{js,cjs}'],
    ...js.configs.recommended,
    languageOptions: {
      globals: {
        ...nodeGlobals,
        ...jestGlobals
      },
      sourceType: 'commonjs'
    },
    rules: {
      semi: ['error', 'never']
    }
  },
  {
    files: ['**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      globals: nodeGlobals,
      sourceType: 'module'
    },
    rules: {
      semi: ['error', 'never']
    }
  },
  ...tseslint.configs.recommended.map(config => ({
    ...config,
    files: ['**/*.ts']
  })),
  {
    files: ['**/*.ts'],
    plugins: {
      import: importPlugin,
      n: nPlugin,
      promise: promisePlugin
    },
    languageOptions: {
      globals: nodeGlobals,
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    rules: {
      semi: ['error', 'never'],
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
]
