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
      // app/dist/** は Web版(app.tsuioku-no-kirameki.com)の esbuild minified 出力。
      'app/dist/**',
      'node_modules/**',
      '.claude/**',
      // .artifacts/** は verify ログ・調査用展開物（asar 展開した第三者 minified
      // バンドル等）の作業用スクラッチ置き場。git-ignore 済みだが lint 対象だと
      // 展開した minified コードで数千 error になるため除外する。
      '.artifacts/**',
      'build/**',
      'test-results/**',
      'playwright-report/**',
      // v0.1.602: ユーザーがバックアップ zip を展開する作業用フォルダ。
      // 中の dist は minified 出力のため lint 対象にすると 2400+ errors になる。
      '新しいフォルダー/**',
      '新しいフォルダー */**'
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
        NL_BUILD_ID: 'readonly',
        // esbuild --define で注入する dev フラグ（本番 false / dev watch true）。
        NL_DEV_HOTRELOAD: 'readonly',
        // status の「スマホへ送信」用に esbuild --define で注入するアップロード設定
        //（.env から。未設定時は空文字 → ボタン無効）。
        NL_STATUS_INGEST_KEY: 'readonly',
        NL_STATUS_VIEW_TOKEN: 'readonly',
        NL_STATUS_APP_ORIGIN: 'readonly'
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
    // max-lines ラチェット: 巨大entryがこれ以上成長しないよう現在値+εで上限固定。
    // 抽出が進んだら数値を下げること(増やすのは禁止)。
    files: ['src/extension/popup-entry.js'],
    rules: { 'max-lines': ['error', { max: 21171, skipBlankLines: false, skipComments: false }] }
  },
  {
    files: ['src/extension/content-entry.js'],
    rules: { 'max-lines': ['error', { max: 17267, skipBlankLines: false, skipComments: false }] }
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
    // Web版(app.tsuioku-no-kirameki.com)の閲覧ページ。chrome.* には依存しない純ブラウザ。
    files: ['app/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
    }
  },
  {
    // Vercel Serverless Function(Node 実行・process/fetch あり)。
    files: ['api/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, fetch: 'readonly' }
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      eqeqeq: ['error', 'smart'],
      'no-var': 'error',
      'prefer-const': ['error', { ignoreReadBeforeAssign: true }]
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
