# 実装ハンドオフ: /live/ 配信詳細モーダル

> この1枚だけで着手できます。設計の全文は同ディレクトリの
> [`live-detail-modal-DESIGN.md`](live-detail-modal-DESIGN.md) を必ず先に読んでください
> (このハンドオフは要約ではなく着手手順です)。

## 背景(1段落)

ユーザー要望「Chrome拡張の会場モードのような画面をWEBの`/live/`からも見たい」に対応する。
5体マルチLLM会議→Fable設計を経て、**新API・新ページを作らず、既存データを使ったモーダル**
という設計に確定した。実コード4ファイルを裏取り済み。

## スコープ(MVPのみ・これ以上広げない)

含む: トリガーボタン・`<dialog>`骨格・3ブロック描画(参加者/ランキング/コメント)・
バナー3状態(ok/missing/error)・×/Esc/背景クリックで閉じる・`pushState`/`popstate`によるURL同期・
60秒自動更新との共存・スマホでの縦スクロール表示。

含まない(後回し): モーダル内のホバー発言カード・モーダル内Xシェア・コメント全件化・
専用OGP・別ページ化。

## 読む順

1. [`live-detail-modal-DESIGN.md`](live-detail-modal-DESIGN.md) 全文(A〜G)
2. `src/extension/live-ranking-entry.js`(既存の`render`/`renderRows`/`renderCommentCol`/
   `renderHead`/`renderKnown`/`load`/`hideCard`/`createRowChangeTracker`/`PINNED_LV`の実装。
   設計書の行番号は目安、着手前に必ず`grep -n`で現在の行番号を取り直すこと)
3. `src/lib/liveRankingView.js`(`identifiedSupporters`/`identifiedSupportersByName`/
   `supporterRows`/`freshness`/`LIVE_ID_RE`)
4. `tsuioku-no-kirameki/live/index.html`(既存CSS変数`--bg`/`--ink`/`--line`/`--card`/
   `--navy`/`--navy-deep`/`--orange`/`--ink-sub`の実在確認、`.live`/`.known`/`.cols`/`.col`/
   `.tiles`/`ol.rank`のクラス構造)
5. `api/live-ranking.js`(`MAX_LIVES=20`・`COMMENT_RANKERS_MAX=10`・レスポンススキーマ)

## 着手手順(ブランチ+TDD)

```bash
git checkout master && git pull origin master
git checkout -b feat/live-detail-modal
```

1. **`src/lib/liveDetailView.js`を先に書く**(設計書§C-1のシグネチャどおり)。
   `liveDetailView.test.js`を同時に書き、設計書末尾のテストケース一覧を全部埋める。
   `npx vitest run src/lib/liveDetailView.test.js`で先に緑にする。
2. `tsuioku-no-kirameki/live/index.html`に`<dialog>`骨格(設計書§C-2)とCSS(§C-3)を追加。
   まだJSを繋がないのでこの時点では何も起きない(壊れないことを確認するだけ)。
3. `src/extension/live-ranking-entry.js`を設計書§C-4・§C-5の順で変更:
   - `renderRows`/`renderCommentCol`に第4引数`tr`を追加(デフォルト値で既存呼び出しは無変更)
   - `.stats-actions`にトリガーボタンを追加(`elDialog`nullガード必須)
   - `load()`の`.then`/`.catch`に1行ずつ追加
   - 新セクション(§C-5のコード)を追記
4. `npm run build`
5. 単体テスト全体: `npm run test:cc`
6. 実機検証(Claude Browserで、設計書「実装・検証の手順」の(a)〜(e)を1つずつ)。
   ローカルモックサーバー(`.claude/launch.json`があれば再利用、無ければ`live-preview-mock`
   相当を新規に作る)でも可。本番相当のレスポンス形(`gift.rankers`/`ad.ranking`/
   `comment.rankers`)を持つモックデータで確認すること。
7. `git add -A && npm run tree-map && git add -A`(設計書§G-12の順序を厳守)
8. `npm run site-health && npm run feature-map`
9. version bump: `extension/manifest.json`・`package.json`・`src/lib/changelog.js`
   (3点同期、`npm run verify:bump`で確認。changelog 20版超過なら
   `node scripts/split-changelog.mjs`)
10. `npm run verify:cc`が緑になるまで直す(improvement gate悪化はnote付きで許容、
    ただし正当な理由を明記すること)
11. commit → push → `gh pr create`

## 機械的な完了判定

- [ ] `npx vitest run src/lib/liveDetailView.test.js` 全緑
- [ ] `npm run test:cc` 全緑(既存テストの回帰なし)
- [ ] `npm run verify:cc` OK
- [ ] Claude Browserで実機確認(a)〜(e)全て通過(スクリーンショットを残す)
- [ ] `git diff --stat`で新規ファイルが`src/lib/liveDetailView.js`+テストの2つのみ
      (設計書の「新規ファイルは最小限」制約の機械チェック)

## 地雷(設計書§Gの再掲・最重要3つだけ)

1. **`elDialog`のnullガードを忘れない**(HTML/JSキャッシュずれで片方だけ新しい状態があり得る)
2. **`cancel`イベントではなく`close`イベントに処理を置く**(Chrome close watcherでcancelが
   飛ばないことがある)
3. **`safeDetailSync`/`safeDetailSyncError`は必ずtry/catchで包む**(漏れると`load()`の
   `.catch`に例外が伝播し、ページ全体が「読み込みに失敗」表示になる)

その他15項目は設計書§Gを参照。

## 転記元の実在パス一覧(司令塔が実在確認済み・2026-09-26)

- `src/extension/live-ranking-entry.js`: `renderKnown`(83行目)・`renderRows`(131行目)・
  `renderCommentCol`(194行目)・`renderHead`(212行目)・`PINNED_LV`(57行目)・`hideCard`(470行目)・
  `elRefreshBtns`(319行目)・`.stats-actions`(288-290行目)
  ★行番号は今後の改修で動く。実装前に必ず`grep -n`で取り直すこと。
- `api/live-ranking.js`: `COMMENT_RANKERS_MAX=10`(49行目)・`MAX_LIVES=20`(75行目)
- `vercel.json`: `/live/`のrewrite条件は`query.key==="lv"`のみ(`detail`パラメータは見ない、
  25行目付近)

## 次の一手

このハンドオフを読んだセッション(次チャット、または`codex-impl`等の別モデル)が、
上記「着手手順」の1から順に実装する。実装完了後は`/code-review`でレビューし、
Claude-in-Chromeまたは Claude Browserで実機確認してからPRを出す。
