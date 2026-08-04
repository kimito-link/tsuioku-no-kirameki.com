# Codex実装指示: 会場=①POP完全一致 Patch A+B(設計確定済み・実装のみ)

あなたは実装担当。設計判断は済んでいる(変更・再設計は禁止)。疑問が出たら設計正本に従い、正本に無い判断はコメントで TODO を残して先に進む(fail-closed)。

## まず読む(この順・全部リポ内)

1. `HANDOFF-venue-exact-copy-IMPL.md`(着手手順・完了判定・実在パス一覧)
2. `memory/reference_venue_exact_copy_SYNTHESIS.md`(設計正本・A〜G。特に C-2/C-3/C-5/G)
3. `AGENTS.md` §12.5(version bump 3点同期)— あなたは自動で読んでいるはず

## 前提

- ブランチ: `feat/venue-lane-mirror-parity`(現行 v0.1.1125)。このブランチ上にコミットを積む。**push はしない**(司令塔が reality-checker 後に push する)。
- 検証は `npm run verify:cc` **のみ**(素の `npm run verify` はハングする)。失敗時は `.artifacts/verify-cc.log` を読む。
- 1パッチ=1コミット=1bump(package.json / extension/manifest.json / src/lib/changelog.js の3点同期。`npm run verify:bump` が verify:cc に含まれる)。
- TDD: 各ステップ「テストを先に書く→赤→実装→緑」。既存テストの改変は配線追加分のみ。

## Patch A(v0.1.1126): ①「詳しい状況」診断パネルを会場に完全一致で出す

1. `src/lib/storyDiagMirrorKey.js` 新設:
   `export const KEY_STORY_DIAG_MIRROR = 'nls_story_diag_mirror_v1';`
2. 書き手(`src/extension/popup-entry.js`): `renderStoryAvatarDiag()`(:7456)の末尾で、既存の鏡バンドル運び屋に同乗させる:
   `mergeAndScheduleFlush('storyDiag', { ...STORY_AVATAR_DIAG_STATE, liveId, capturedAt: Date.now() }, ...)`(呼び出しシグネチャは既存 publisher 群=publishLaneMirror 周辺の実物に合わせる)。`INLINE_PASSIVE` なら書かない(他 publisher と同型ガード)。**新しい chrome.storage.local.set を作らない**(既存 flush の同一 set に同乗)。
3. 配線: `src/lib/mirrorBundle.js` のセクション定義と `src/lib/mirrorBundleFlushScheduler.js` の `SECTION_TO_LEGACY_KEY` に `storyDiag → KEY_STORY_DIAG_MIRROR` を追加。既存の wiring テスト網に載せる(配線忘れ=CI赤になること)。
4. 読み手(`src/extension/venueBar.js`):
   - 開時 catch-up read(:4706 付近)の `chrome.storage.local.get(KEY_LANE_MIRROR)` を `get([KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR])` へ(read 回数は増やさない)。
   - `handleStorageChange`(:5003 付近)に `changes[KEY_STORY_DIAG_MIRROR]` の newValue 直採用ブロックを1つ追加。
   - 段 stack の下・ロビーの上に `nlsb-story-diag` パネル div を新設。描画は `buildStoryAvatarDiagHtml(snap)` + `buildStoryAvatarDiagVerboseHtml(snap)`(`src/lib/storyAvatarDiagLine.js` の既存純関数。**会場側で数字の計算は1つもしない**)。会場側で足すのはヘッダ1行「①の診断(◯秒前)」のみ(capturedAt との差を分/秒で)。
   - diff-skip: popup の `storyAvatarDiagLastRenderSig`(:7462-7474)と同じ sig 比較方式。innerHTML 書き換えは sig 変化時のみ。
   - liveId が会場の対象配信と不一致、または未着: パネル非表示(または前回描画保持+静的テキスト1行「①と同期待ち」)。**スピナー/skeleton/opacity アニメ/ローディング表示は実装禁止**。
5. 計器: venueSeatsDiag に `storyDiagMirror: { present, ageSec }` の2フィールドを追加し、**`src/lib/statusFastDiagLite.js` の passthrough に必ず通す**(通さないと状態速報のコピペに永久に出ない)。wiring 断言テストも追加(v0.1.1125 の hostMoveDiag lite 断言と同型)。
6. ローディング禁止ガード: `venueBar.js` に `loading|spinner|skeleton` の新規出現が無いことを断言する軽テスト(既存の無関係ヒットがあれば許可リスト方式)。
7. 新規テスト最低4本: (a) mirrorBundle 配線 (b) lite passthrough (c) パネル diff-skip(同一 snap で innerHTML 不変) (d) liveId 不一致で非表示。
8. bump v0.1.1126(changelog はユーザー向け日本語: 「会場モードに①の『詳しい状況』診断がそのまま出るようになりました(N秒前の①の数字の転写・会場側では何も計算しません)」の趣旨)→ verify:cc 全緑 → commit。

## Patch B(v0.1.1127): グリッドのフッター/ガイドを①と同一化

1. `src/extension/venueBar.js` :4235 付近の `paintStoryUserLaneDomFilled` 呼び出しを変更:
   - **mirror モード時のみ** `recordedCommentRowsTotal` / `totalCandidates` 相当の引数を `seating.participantCount` 由来から `lanePaintSnap.pickedLength` / `lanePaintSnap.totalCandidates`(=①が書いた数)へ差し替え。fallback モードは従来値のまま(①の数を騙らない)。
   - `guides:` をモジュール定数 `VENUE_LANE_GUIDES_EXACT_COPY = true` で制御(mirror モード時 true・fallback は false のまま)。
2. guide 要素の CSS が LANE_CSS_SYNC 区間(venueBar.js:971〜)に揃っているか確認し、欠けていれば同区間に追記(①の見た目とバイト同一の HTML が崩れないこと)。
3. テスト: mirror モードで paint に渡る数値が鏡の pickedLength/totalCandidates になる unit(fallback は従来値のままの対照も)。
4. bump v0.1.1127。**changelog と commit メッセージに必ず明記**: 「v0.1.1120 で除去した会場のキャラ案内帯・フッターを、①との完全一致のため意図的に復活(定数 VENUE_LANE_GUIDES_EXACT_COPY 1行で元に戻せます)。実機レビューで判断してください」→ verify:cc 全緑 → commit。

## やらないこと(禁止)

- Patch C(wrapTileEl の isConnected 修正)= 実配信の実測(unexplained.sampleKeys)待ち。触らない。
- `git push` / `npm run copy:ext` / master マージ / 拡張リロード案内 = 司令塔の仕事。
- `#nls-inline-popup-host` / iframe / content-entry.js の host 管理・360ms tick = 一切触らない(ちかちか調査中の聖域)。
- 鏡に HTML 文字列を載せる(R-1 違反)。数値+短文字列のみ。
- KEY_LIVEVIEW_PUBLISH_PAYLOAD 系(12s min-gap)に触る。
- 未コミットの別件 WIP `src/lib/avCue*.js` に触る。

## 完了報告(最後に出力すること)

- コミットSHA×2(A/B)と各 verify:cc の結果(全9段緑か)
- 新規/変更ファイル一覧
- 設計正本から外れた点・TODO を残した点(あれば)
