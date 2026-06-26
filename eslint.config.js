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
        // esbuild --define で注入する release フラグ（NL_RELEASE=1 ビルドで true）。
        //   true のとき status の生診断JSON/全文共有ボタン/AI共有欄を隠す(v0.1.857)。
        NL_RELEASE: 'readonly',
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
    // v0.1.858: レポートプレビュー機能のロジックは新規モジュール(reportPreview*.js)へ抽出済み。
    //   popup 側に残るのは「import + paint ループでの呼び出し」の最小フック3行のみ=21025→21028。
    // 2026-06-25: countUniqueAvatarEntries を src/lib/avatarEntryCounts.js へ抽出=21028→21012 に下げ。
    // 2026-06-25: 北極星レーン鏡を純Webへ送る publishNorthStarMirror(chrome.storage I/O グルー=lib抽出不可)を
    //   追加=21012→21040(意図した機能追加・レビュー済み例外)。純関数 buildNorthStarMirrorSnapshot は lib 側。
    // 2026-06-26: 応援プレビュー(passive)の上段3カード退行修正=passive 専用の
    //   applyLightweightPanelSummaryCards 初回+onChanged 配線(INLINE_PASSIVE/lv 状態に依存=lib抽出不可の
    //   storage グルー)を追加=21040→21067(council/liveview-regression-SYNTHESIS.md・レビュー済み例外)。
    // 2026-06-26: 応援プレビュー(passive)で他レーンを出す修正=応援レーンを鏡(KEY_LANE_MIRROR)から描く
    //   applyLaneMirrorForPassive + getStoryUserLaneEls 切り出し + 北極星ギフト履歴を passive で畳む
    //   collapseNorthStarGiftHistoryLaneForPassive(DOM 参照+storage read グルー=lib抽出不可)を追加
    //   =21067→21150(council/liveview-all-lanes-SYNTHESIS.md・レビュー済み例外)。
    // 2026-06-26: 純Web /live-view を拡張内プレビューと同じ全レーンにする修正=広告ランキングも鏡に積むため
    //   publishNorthStarMirror をレーン合流式に変更(_northStarMirrorLanes バッファ+contribution/ad 部分 publish の
    //   合流。INLINE_PASSIVE/liveId 状態に依存する storage I/O グルー=lib抽出不可)+ refreshNorthStarAdRankingLane の
    //   filled/nicoadAPI 経路で adRanking publish 2行を追加=21150→21187
    //   (council/liveview-web-same-as-ext-SYNTHESIS.md・レビュー済み例外)。純関数 buildNorthStarMirrorSnapshot は lib 側。
    // 2026-06-26: 応援レーン描画の自己診断=renderStoryUserLane/applyLaneMirrorForPassive の入口/分岐/出口を
    //   _storyUserLaneRenderProbe に記録(DOM 参照+描画関数フックのグルー=lib抽出不可)+ countStoryUserLaneDomTiles
    //   + 診断JSON への storyUserLaneRenderProbe 露出を追加=21187→21271
    //   (council/lane-render-self-diag-SYNTHESIS.md・レビュー済み例外)。純データの build/format/cards は
    //   src/lib/storyUserLaneRenderProbe.js(test付き)に隔離済み。
    // 2026-06-26: 純Webでコメントが進む(第2段)=publishCommentTimelineMirror(displayEntries 最新N件を鏡に publish・
    //   INLINE_PASSIVE/min-gap/storage I/O グルー=lib抽出不可)+import を追加=21271→21312
    //   (council/liveview-wholesale-root-SYNTHESIS.md・レビュー済み例外)。純データ整形 buildCommentTimelineMirrorSnapshot は
    //   src/lib/commentTimelineMirror.js(test付き)に隔離済み。
    // 2026-06-27: 応援プレビュー(passive)を開いた瞬間の重さ解消(第1段)=passive で heavy comments 全件 IDB read を
    //   走らせない短絡(read を減らすだけ)+ティッカーを鏡から描く applyCommentTimelineMirrorForPassive(DOM 参照+
    //   storage read グルー=lib抽出不可)+初回/onChanged 配線+restoreCommentTimelineRows import を追加=21312→21385
    //   (council/liveview-open-heavy-SYNTHESIS.md・レビュー済み例外)。純データ復元 restoreCommentTimelineRows は
    //   src/lib/commentTimelineMirror.js(test付き)に隔離済み。
    files: ['src/extension/popup-entry.js'],
    rules: { 'max-lines': ['error', { max: 21385, skipBlankLines: false, skipComments: false }] }
  },
  {
    files: ['src/extension/content-entry.js'],
    rules: { 'max-lines': ['error', { max: 17267, skipBlankLines: false, skipComments: false }] }
  },
  {
    // extension/ 直下の素のスクリプト(esbuild を通さず同梱する .js)。background.js と
    //   status-guard.js(「何があっても開く」保険・v0.1.904)。dist/ の minified 出力とは別物で、
    //   人が書く非モジュールのブラウザ用スクリプト。chrome.* と browser globals を許す。
    files: ['extension/*.js'],
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
