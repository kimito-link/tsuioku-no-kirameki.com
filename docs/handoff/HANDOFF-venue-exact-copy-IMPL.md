# 実装ハンドオフ: 会場=①POP「アイコン列・グリッド・診断」完全一致(ローディング全面禁止)

> この1枚だけで着手できる。設計正本=memory/reference_venue_exact_copy_SYNTHESIS.md(Fable設計・司令塔裏取り済み・2026-07-11)。
> リポ=tsuioku-no-kirameki.com / ベースブランチ=feat/venue-lane-mirror-parity(v0.1.1125・未マージ) / 検証=`npm run verify:cc`(素のverifyはハング)。
> 1変更=1patch bump(package.json/extension/manifest.json/src/lib/changelog.js 三者一致)・reality-checker→commit直列・push報告に反映3手順併記。

## 読む順(これだけ)

1. memory/reference_venue_exact_copy_SYNTHESIS.md(設計正本・A〜G)
2. src/lib/mirrorBundleFlushScheduler.js(運び屋の作法=SECTION_TO_LEGACY_KEY)
3. src/extension/popup-entry.js の renderStoryAvatarDiag(:7456)と STORY_AVATAR_DIAG_STATE(:6220)
4. src/extension/venueBar.js の catch-up read(:4706)・handleStorageChange(:5003近傍)・paint呼び出し(:4235)

## スコープ = MVP(Patch A)だけ。B/Cは実機確認後の続編

**Patch A(v0.1.1126想定): ①「詳しい状況」診断パネルを会場に完全一致で出す**

1. `src/lib/storyDiagMirrorKey.js` 新設: `export const KEY_STORY_DIAG_MIRROR = 'nls_story_diag_mirror_v1';`
2. 書き手(popup-entry.js): renderStoryAvatarDiag() 末尾で `mergeAndScheduleFlush('storyDiag', { ...STORY_AVATAR_DIAG_STATE, liveId, capturedAt: Date.now() }, ...)`。INLINE_PASSIVE ガードは publishLaneMirror と同型に。**新しい set は作らない**(既存バンドルflushに同乗)。
3. 配線: src/lib/mirrorBundle.js のセクション定義+mirrorBundleFlushScheduler.js の SECTION_TO_LEGACY_KEY に `storyDiag → KEY_STORY_DIAG_MIRROR` を追加(既存 wiring テストが配線忘れを赤にする網に載せる)。
4. 読み手(venueBar.js):
   - catch-up read(:4706)を `get([KEY_LANE_MIRROR, KEY_STORY_DIAG_MIRROR])` に(read回数不変)。
   - handleStorageChange に KEY_STORY_DIAG_MIRROR の newValue 直採用ブロックを1つ。
   - 段stackの下(ロビーの上)に `nlsb-story-diag` パネル div。描画=`buildStoryAvatarDiagHtml(snap)`+`buildStoryAvatarDiagVerboseHtml(snap)`(storyAvatarDiagLine.js の純関数=①と同一出力)。会場側で足すのはヘッダ1行「①の診断(◯秒前)」のみ。
   - diff-skip: popup の storyAvatarDiagLastRenderSig(:7462-7474)と同じ sig 比較。innerHTML は sig 変化時のみ。
   - liveId 不一致 or 未着: 非表示 or 前回保持+静的1行「①と同期待ち」。**スピナー/skeleton/アニメは実装禁止**。
5. 計器: venueSeatsDiag に `storyDiagMirror: { present, ageSec }` を追加し、**statusFastDiagLite の passthrough に通す**(src/lib/statusFastDiagLite.js。通さないとコピペに永久に出ない=メモリ fastdiag-lite-is-the-printer-subset)。wiring 断言も追加。
6. ローディング禁止ガード: venueBar.js に `loading|spinner|skeleton` の新規出現を断言する軽テスト(既存の無関係箇所は許可リスト)。

**完了判定(機械的)**
- verify:cc 全9段緑。
- 新テスト: (a) mirrorBundle 配線 (b) lite passthrough (c) パネル diff-skip(同一snapで innerHTML 不変) (d) liveId 不一致で非表示。
- 実機: 会場を開くと「①の診断(N秒前)」パネルが出て、①POPの「詳しい状況」と同じ行が読める。状態速報の venueSeatsDiag.storyDiagMirror.present=true。
- ローディング: 会場開閉で ① にも会場にもローディング幕が出ない(hostMoveDiag.venueOpenMoves が増えない)。

## 続編(この順・各1patch)

- **Patch B**: フッター/ガイドの①同一化 — venueBar.js:4235 の paint 呼び出しで mirror モード時のみ `recordedCommentRowsTotal/totalCandidates = lanePaintSnap.pickedLength/.totalCandidates`+`guides: VENUE_LANE_GUIDES_EXACT_COPY(=true)`。**⚠ v0.1.1120(ガイド帯除去・ユーザー承認済み)を意図的に覆す** — push報告に明記しレビューを乞う。1行 revert 可。
- **Patch C**: 未説明の構造源(検証先行) — Patch A/B 後の実配信で状態速報の unexplained.sampleKeys / dom.missing を読み、DOM欠型なら venueBar.js wrapTileEl(:4248-4259)冒頭に `if (!node || !node.seat.isConnected) return tileEl;`+characterization テスト。

## 地雷(設計正本Gの要約)

- 新計器は lite passthrough 必須 / mirrorBundle 配線忘れは wiring テストで赤 / guides 復活は v1120 と衝突(明記) / 診断 HTML を鏡に載せない(R-1・数値のみ) / パネル churn は sig diff-skip / host・iframe には一切触れない(ちかちか誘発禁止) / reality-checker 並走中は commit しない。
- ちかちか調査(hostMoveDiag v0.1.1125・判定待ち)と独立に進められるが、会場開閉の実機確認時は venueOpenMoves も同時に読むこと。

## 実在パス一覧(転記元・裏取り済み)

- src/extension/popup-entry.js :768(import buildStoryAvatarDiagHtml)/ :6220(STORY_AVATAR_DIAG_STATE)/ :7456(renderStoryAvatarDiag)/ :7462-7474(sig diff-skip)
- src/extension/venueBar.js :4706(catch-up)/ :5003近傍(handleStorageChange)/ :4235(paint呼び出し)/ :4194-4198(席detach)/ :4248-4259(wrapTileEl)/ :971〜(LANE_CSS_SYNC)
- src/lib/mirrorBundleFlushScheduler.js(SECTION_TO_LEGACY_KEY)/ src/lib/mirrorBundle.js / src/lib/laneMirror.js(pickedLength/totalCandidates)/ src/lib/storyAvatarDiagLine.js / src/lib/statusFastDiagLite.js
