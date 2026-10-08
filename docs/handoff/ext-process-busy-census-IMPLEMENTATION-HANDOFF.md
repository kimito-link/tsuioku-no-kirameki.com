# 実装ハンドオフ: 拡張プロセスの忙しさを「ページを開かなくても」名指しし、削る(v0.1.1580〜)

設計正本 = `ext-process-busy-census-DESIGN.md`(Fable設計・司令塔裏取り済み)。この1枚で着手できる粒度に落とす。日付 2026-10-08。

## 0. 先に読む(5分)
1. `ext-process-busy-census-DESIGN.md`(A〜I。特に E=MVP・H=分岐表)
2. 過去の同系統: `council/status-heavy-open-SYNTHESIS.md` / `council/liveview-open-heavy-SYNTHESIS.md` / `docs/kb-web-perf-diagnosis.md`
3. MEMORY: 計器スパイラル(`instrument-spiral-25-versions-2026-08-06`)・「計器の価値は直したかで測る」。

## 1. 背景(1段落)
実機で拡張レンダラー(全拡張ページ共有)が CPU131%・1,470MB。拡張ビューは「Service Worker + 他9件」。popup 単独タブが読み込み中のまま真っ黒/status 重い/サイドパネル黒い縞。既存計器は「(拡張の外)」としか言わず(同期ラップ方式の構造的限界)、速報の「処理時間3%」は最後に書いた popup 1本の値(後勝ち)で犯人を測れていない。会議・司令塔の「onChanged 全文配信×ページ数」は測定(7ページ・疑似データ)で最大449msまでしか再現せず、実機131%は未再現。→ まず**インスタンス別に測れる常駐計器**を入れて犯人を名指しし、次版で必ず**削る**。

## 2. ブランチ
- 起点: **PR #289(fix/lane-guide-stable)が master にマージされた後の master**。未マージなら `fix/lane-guide-stable` から `feat/ext-busy-census` を切る(同じコードを含むため)。
- `git branch --show-current` を必ず確認(master で編集しない)。

## 3. 版の順序(1版1変更・TDD・変異テスト2件以上・verify:cc・reality-checker)
### v0.1.1580(MVP=測る版・これだけ)
- 新規: `src/lib/extDocBusyCensus.js`(純関数・≤400B要約・stale・bootCount)、`src/lib/extDocBusyCensusBoot.js`(副作用boot)。
- SW: `extension/background.js` に受信ハンドラ1つ(`NLS_DOC_CENSUS`)・`nls_ext_process_census_v1` を60秒に最大1回(同内容は書かない・10インスタンス×400B≈4KB)。
- 登録: `src/lib/selfWrittenStorageKeys.js` に `/^nls_ext_process_census_v\d+$/`、`src/lib/statusExtrasBatch.js` の `EXTRAS_BATCH_KEYS` に追加(read回数は増やさない)。+ **`nls_instant_push_diag_v1` も selfWritten に追加**(純診断・popup 自身が10秒ごとに書く自己フィードバックを止める。ただし別版の変更として扱うか、1580に含めるなら変更点をコミット本文に分けて書く)。
- 表示: status 速報に1ブロック(面別 busy 上位3・instanceId末尾4桁・docAge・カバー率・top section・heap%・bootCount・onChanged 上位3族)。サイドパネル overlay は**この版では入れない**。
- popup-entry.js の `_measuredSection`(`:608`)は lib 呼び出しに**置換して行数を減らす**(max-lines 上限に張付き)。
- 実機証拠: `/nicolive-ship` → ユーザーが拡張を更新 → 次の配信中に `npm run status:live --watch 60` を10分(**単独 popup タブは閉じて**取る)。合格=①面別 busy 上位がカバー率≥50%で出る ②heap≥70% ③bootCount≥3回/10分 ④計器自身の書き込み≤10回/10分、のいずれか1つを名指しできる。全面カバー率<30%なら main thread 外と確定(次は DevTools 切断で再サンプル+SW 区間計測)。
### v0.1.1581(必ず「削る」版)
- 表が犯人を出したら、その1件を潰す(DESIGN §H の分岐表)。出さなければ **④ MirrorWriteGate**(`laneMirrorPerLivePublish.js` に前回 hash/lid・`snap.contentHash` 不変かつ60秒未満なら set しない。60秒床は会場の鏡有効窓180秒を下回らない)。計器だけの版は2つ連続で出さない。
### v0.1.1582以降
- 表の次の1位を削る。会場の canvas/pollSpeech 間引きは content script 側の話(拡張プロセスの131%の内訳ではない)なので優先度低。即時プッシュの送信側重複排除/受信 O(N) Set は主因ではない(今日の約1,200行)=表が示したときだけ。

## 4. 守ること(機械で固める)
- コメント保存(記録)は読みも書きも変えない。wiring テストで `nls_ctail_/nls_comments_/nls_cchunk_/nls_csummary_` を import/参照しないことを固定。
- 鍵(storyLaneTierBodyKey / buildStoryUserLaneRenderSignature / laneSceneContentHash / venueLaneParityKey)に stats/pulse を入れない。popup に liveMotion.js を import しない。
- `selfWrittenStorageKeys` は every() 判定: 新キーの登録漏れ=全スロットルが外れる(v1344)。機械照合テストを足す。
- 診断書き込みの総量を増やさない: census は60秒に1回・≤4KB・自己検査(≤1回/60秒でなければ赤)。
- 過去に却下された手を使わない: read キャッシュ包み・並列 storage.get・毎 paint の全 DOM 鏡・Offscreen を write path に・fastDiag 間引き・IndexedDB 化・storage.session/BroadcastChannel/sendMessage への鏡の移行(DESIGN §F)。

## 5. 機械的な完了判定
- `npx vitest run <新規+関連>` / `npx tsc --noEmit -p .` / `npx eslint src --quiet` / 変異テスト(DESIGN §E の a・b・c)で狙った1件だけ赤→復元後に緑 / `npm run verify:cc` 緑 / `npm run check:improvement`(bundle-kb・cross-checked-claims の note) / reality-checker に独立検証(自己採点しない)。
- 出荷: `/nicolive-ship`(bump3点+LP鮮度・changelog 20版上限は split-changelog 後に archive を最小差分へ・improvement note・tree-map/feature-map/site-health 再生成・新規ファイルは `git add`)。コミット本文に「根治」を実機証拠なしに書かない。

## 6. 地雷(踏んだことのあるもの)
- Bash の heredoc 内のバックスラッシュ(`\\n` 等)は壊れる → Write/Edit ツールか Python ファイルで。改行が混在するファイル(venueBar.js・improvementHistory.js 等)は全体正規化せず、生のバイト列上で編集する(`git diff --stat --ignore-cr-at-eol` で余計な差分が無いこと確認)。
- popup-entry.js は max-lines 上限に張付き=増やさず lib へ出す。dist の日本語は `\uXXXX`。changelog summary は35字以内。`npm run tree-map` は `git add` の後(正順 `git add -A`→tree-map→`git add -A`)。
- 測定用 Chrome(chrome-devtools MCP)は別環境の headless で、このPCのプロセス一覧には出ない=CPU% は測れない。イベントループ遅れ(setInterval のずれ)で測る。拡張が「No extensions installed」になったら `install_extension` を再実行。
- 実機の Chrome へ `copy:ext` するのは視聴の切れ目に(新旧混在を避ける)。反映後は `npm run verify:deploy`。

## 7. 未確認(実機でしか分からない)
DESIGN §I 参照。特に「131%サンプル時に開いていた面の組と DevTools 接続の有無」「1,470MB の内訳」。MVP の表が最初の答えになる。
