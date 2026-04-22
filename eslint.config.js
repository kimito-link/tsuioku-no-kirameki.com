import js from '@eslint/js';
import globals from 'globals';

const browserChrome = {
  ...globals.browser,
  chrome: 'readonly'
};

export default [
  {
    /*
     * 以下は ESLint が lint してはならない生成物・ベンダ成果物。
     * build/** は CWS 提出用 ZIP のために一時 staging される submission-<ver>/dist/*.js を含む
     * （AGENTS.md §4 参照）。esbuild 由来の minified 出力のため、そのまま lint すると
     * no-unused-vars / no-empty などで 900+ エラーに膨れ、lint が CI ゲートとして機能しなくなる。
     *
     * test-results/** と playwright-report/** は Playwright の per-run 出力で、
     * .gitignore 側でも除外済み。念のため lint 対象からも外す。
     */
    ignores: [
      'extension/dist/**',
      'node_modules/**',
      '.claude/**',
      'build/**',
      'test-results/**',
      'playwright-report/**'
    ]
  },
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
