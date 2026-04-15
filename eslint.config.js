import js from '@eslint/js';
import globals from 'globals';

const browserChrome = {
  ...globals.browser,
  chrome: 'readonly'
};

export default [
  { ignores: ['extension/dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserChrome,
        Node: 'readonly',
        // scripts/build.mjs が esbuild --define で popup-entry.js に注入するビルド時刻
        NL_BUILD_ID: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['extension/background.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...browserChrome }
    }
  },
  {
    files: ['**/*.test.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...browserChrome,
        ...globals.node,
        describe: 'readonly',
        it: 'readonly',
        expect: 'readonly',
        vi: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['playwright.config.js', 'scripts/**/*.mjs', 'tests/e2e/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.browser,
        chrome: 'readonly',
        Node: 'readonly'
      }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    files: ['tools/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: { ...globals.node }
    },
    rules: {
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  }
];
