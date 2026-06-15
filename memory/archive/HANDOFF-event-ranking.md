# 引き継ぎ: 参加配信者レーンの重複修正(完了・要コミット) + イベントスコア順位の実装(調査完了・未着手)

対象: ニコ生コメント記録/応援可視化 Chrome 拡張 `tsuioku-no-kirameki.com`。
作業ディレクトリ: `C:\Users\info\OneDrive\デスクトップ\Resilio\github\tsuioku-no-kirameki.com`
master の最新は v0.1.364。本作業ブランチで v0.1.366 に bump 済み。

ユーザーは疲労のため Claude(Opus) から Cursor に引き継ぎ。ユーザーの2つの要望:
1. **「被っています」** = 参加配信者レーンで同じ配信者が重複表示される → ✅ **修正完了（要コミット&PR）**
2. **「イベントランキング順にしてほしい」** = 視聴者数順でなく本来の💎pt(スコア)順で出してほしい → 🔬 **取得経路の調査完了・実装は未着手（下記 PR1〜PR4）**

---

## ⚠️ 最優先: まず未コミットの修正を確定させる（Resilio が巻き戻す前に）

このリポジトリは **Resilio Sync が編集中の追跡ファイルを数秒で別デバイス版に巻き戻す**癖がある（CRLF厳守・編集→即commit→push が鉄則）。下記ブランチに**未コミットの完成した修正**があるので、最初にコミット&PRすること。

### 現在のブランチ: `fix/event-participant-dedup`

`git status --short` の未コミット変更（すべて意図したもの）:
```
 M src/lib/eventParticipationProgramsApi.js       ← 重複排除ロジック本体
 M src/lib/eventParticipationProgramsApi.test.js  ← テスト3件追加
 M src/lib/changelog.js                           ← v0.1.366 エントリ追加
 M src/lib/changelog.test.js                      ← 先頭バージョン 0.1.365→0.1.366
 M extension/manifest.json                        ← version 0.1.366
 M package.json                                   ← version 0.1.366
 M extension/dist/content.js                      ← build 済み（NL_BUILD_ID=0525-135818）
 M extension/dist/popup.js                        ← build 済み
?? HANDOFF-to-codex-opencode.md                   ← codex が作った無関係ファイル。コミットに含めない（削除可）
?? HANDOFF-event-ranking.md                       ← この引き継ぎ文書。コミットに含めない（削除可）
```

### やること
1. `HANDOFF-to-codex-opencode.md` と `HANDOFF-event-ranking.md` は**コミットに含めない**（`.git` 外の作業メモ。`git add` 時に明示的に src/extension/package.json/changelog だけ add する）。
2. `npm run verify` と `npm run verify:bump` を実行して全緑を確認（※後述の「検証で止まる問題」参照）。
3. コミット → push → PR 作成。コミットメッセージ末尾に必ず:
   ```
   Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
   ```
   PR body 末尾に:
   ```
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```
4. コミットメッセージ案: `fix(event-broadcasters): 参加配信者一覧で同一配信者の重複を解消 v0.1.366`

### ⚠️ 検証で止まる問題（重要）
Claude 環境では `npm run verify`（フル）や `npx vitest run`(フォアグラウンド)が**ハングして応答が返らない**事象が頻発した（ターミナル統合の問題と思われる）。Cursor では普通に動く可能性が高いが、止まる場合は:
- vitest を**単一ファイル指定**で: `npx vitest run src/lib/eventParticipationProgramsApi.test.js`
- または**バックグラウンド+ファイル出力**で: `npx vitest run ... > out.txt 2>&1` してから `out.txt` を読む
- push 前の lint は `npm run verify` に含まれる（test だけだと CI が lint で落ちる）

### 検証で確認済みのこと（Claude が実行済み）
- **unit: `eventParticipationProgramsApi.test.js` 24件全緑**（既存21 + 重複排除3件追加）。
- **e2e: `tests/e2e/event-broadcasters-lane.spec.js` 2件全緑**（実拡張ロードで実ブラウザ表示確認済み。`npm run build` 後 `npx playwright test event-broadcasters-lane`）。
- ※ Resilio 巻き戻しと検証ハングのため、Cursor 側でも `verify`/`verify:bump` を念のため再実行推奨。

---

## 修正1の中身（重複バグ）= 何を直したか

### 症状（ユーザー実機スクショ lv350606186 始球式イベ）
「同じイベントに参加中の配信者」レーンに、**同じ配信者が複数カードで重複**:
- 「この」が ①③⑦⑧（1186人/1077人/509人/469人）= 4枚
- 「太ももちゃん」が ②④⑤⑥（1165人/863人/854人/697人）= 4枚

### 真因
`participation-programs` API は「同じイベントに参加している**配信者の番組**」を返す。同一配信者が複数の番組（過去番組含む）でイベント参加していると、**番組(programId)単位で別行**になる。`src/lib/eventParticipationProgramsApi.js` の `normalizeEventParticipationResponse` は `programId` の重複しか除外せず、**同一 `programProviderId`（配信者）の重複を排除していなかった**。

### 修正（`normalizeEventParticipationResponse` 内）
`collected` 構築後・`sort` の前に**配信者単位の集約**を挿入:
- 集約キー = 記名(uid在り)は `u:<uid>`、非記名(channel/community で programProviderId が `ch...` 等の非数値)は表示名 `n:<lower(name)>`。
- 同一キーは **count(視聴者数 or コメント数)が最大の番組を代表**として残す（同値なら登場順が早い方=安定）。
- thumbnail/uid/programId/order も代表番組のものに揃える。
- `Map` で集約 → `Array.from(...).values()` → 視聴者数降順 sort → slice(max) → rank 振り直し。
- 純関数のまま・副作用なし・fail-soft 不変。

### 追加テスト3件
- 同一uidが4番組でも1件に集約・代表が最大視聴者数(1186)・代表programId(lv2)
- uid違いの同名は別配信者として2件残る（リンクも別々）
- 非記名(ch555)は表示名で集約・代表が最大視聴者数・リンク無し

---

## 修正2(未着手): イベントスコア順位(💎pt順)の取得 = 調査完了・実装は PR1〜PR4

ユーザーが本当に欲しいのは「視聴者数順」でなく**💎pt(スコア)順の本物のイベント順位**（スクショ2枚目: 1位ミュート💎432,295 / 2位この💎233,795 / 3位零羽こはね💎133,435 …）。**これは現状の participation-programs では取れない（API が rank/score を持たない・数値スケールも視聴者数と全く違う別ソース）。**

### 実機観測で確定した事実（Claude-in-Chrome で lv350606186 を観測）
- 💎pt順ランキングは **`RICH-IFRAME`（id, CSS-modules class `___content___Qwbpe`, 382×502px, `src="about:blank"`, sandbox/srcdoc無し）内**に描画される。
- このフレームは about:blank に見えて**実際は cross-origin の `audition.nicovideo.jp` document にナビゲートされている**（親から `iframe.contentWindow.document` は `SecurityError: Blocked` で確定）。
- richview の SSR HTML は**空シェル（"イベント" の約15文字のみ）**で、SPA がクライアント描画。よって `fetchOfficialEventBannerFromAuditionEmbed` の fetch+DOMParser 経路では取れない（実機で `data-nls-audition-fetch="empty"` を確認）。
- スコア供給API は richview iframe(audition origin)内で叩かれ、**親ページの network / `performance.getEntriesByType` / WebFetch / ブラウザ fetch のどこからも観測不能**（CORS・cross-origin iframe の壁・harness の navigate ドメイン制限の3方向で確認済み）。
- 親が持つイベント系APIは `api.live2.nicovideo.jp/api/v1/planning-event/participation-programs?planningEventId=<id>`（スコアを持たない名簿）のみ。

### ★突破口（codex 会議レビューで「YES・(a)より低リスク・webRequest不要」と確認済み）= 経路(e)
**manifest の content_scripts は `all_frames:true` + `match_about_blank:true` + `match_origin_as_fallback:true`** で `dist/content.js` を全フレームに注入。matches `https://*.nicovideo.jp/*` は **audition.nicovideo.jp も含む** → **richview iframe(audition origin)内にも content script が注入される**。
かつ既存の **cross-origin iframe → 親 postMessage リレー経路**が稼働中:
- `src/lib/giftSubAppRelayTrust.js` の `isTrustedGiftSubAppRelayMessage` は frameUrl host が `*.nicovideo.jp`（コメントに audition を明記）かつ origin一致なら信頼。
- `src/lib/iframeOfficialDomFromRelay.js` / `buildOfficialDomFromRelayEvent` が受信し storage 保存。
- content-entry.js は iframe 内でも `maybeStartGiftSubAppIframeRelay()` を `start()` と独立に起動（`start()` は iframe で skip されるが relay は走る）。audition/koken/nicoad/gift iframe から heartbeat 送信中。

→ **richview iframe 内の content script が同一オリジンとしてスコア順位 DOM を scrape し、postMessage で親にリレー**すれば、cross-origin の壁を回避して取れる。**webRequest 権限追加(=CWS審査リスク)は不要**。

### codex 推奨の実装 PR 分割（1候補1PR・pure 加法・実機実証）
- **PR1**: audition richview iframe 限定の**診断リレー**を追加。`frameUrl` が `/embedded/richview/live` の時だけ、`location.href`/`location.origin`/`document.readyState`/`bodyText length`/ランキング候補 selector 件数・class サンプルを **one-shot で親にリレー**。**raw本文を持たず安全に「content script が本当に注入されるか + DOM 概形」を観測**できる（=実装が観測手段を兼ねる）。
  - ⚠️ **最初の未確認点**: about:blank → cross-origin(audition) ナビゲート後のフレームに content script が実際に注入されるか。PR1 の診断で `giftSubAppRelayDiag.heartbeatsByFrameUrl` に `https://audition.nicovideo.jp/embedded/richview/live?...` が出れば注入されている証拠。出なければ経路(e)は不成立で別経路の再検討が必要。
- **PR2**: PR1 で得た実機 DOM 構造から `scrapeEventScoreRankingFromRichviewDom()` 純関数を作成 + fixture test。**配列順を順位扱いしない。`rank` と `score/point` 相当の明示フィールドが無ければ不採用**（誤値ゼロ）。
- **PR3**: 専用 message type / storage key を追加。既存 `nls_iframe_official_dom_<lv>` に混ぜず、例 `nls_event_score_ranking_<lv>` に保存。trust guard は `audition` かつ `/embedded/richview/live` かつ `content_id=現在lv` まで絞る。
- **PR4**: popup 表示を「**イベントランキング（💎スコア順）**」として接続。participation-programs の「視聴者数順」レーンと**混同しない文言**にする（誤値を順位と誤認させない）。

### fail-soft / 落とし穴（codex 指摘）
- 失敗・空・不一致・stale(lv/planningEventId 不一致)の応答は既存値を上書きしない。
- データ種別が増えるので privacy/CWS 文言の同期確認（ただし新権限は無し）。
- ⛔ **CWS 申請フローは回さない**（ユーザー明示の禁止事項。版bump は別物でOK）。

### 詳細な一次資料（メモリ）
Claude のメモリに観測の全詳細を記録済み:
`C:\Users\info\.claude\projects\C--Users-info-OneDrive--------Resilio-github-tsuioku-no-kirameki-com\memory\reference_event_participant_broadcaster_ranking_research.md`
（「🔬 第3弾『スコア順位ランキング（richview iframe内）』観測の決着」セクション）。
codex の経路(e)レビュー全文: `C:\Users\info\AppData\Local\Temp\codex-relay-out.md`

---

## 厳守ルール（ユーザーの durable な作業ルール）
- **承認を求めず自走**し結果のみ簡潔報告（ユーザー「どんどん進めて」明示）。
- **「直した」と言う前に実ブラウザ e2e で実証**（pure test 緑だけで報告しない）。`PW_HEADLESS=1 npx playwright test`。
- **Resilio が巻き戻す**: 編集→即commit→push。一時ファイルはリポ外(%TEMP%)。CRLF厳守。push前に dist が build で変わるので、ブランチ切替が dist で阻まれたら `git checkout -- extension/dist/` で破棄。
- **版bumpこまめに**（manifest/package/changelog.js/changelog.test.js 同期・summary≤35字・HTMLタグ禁止・先頭最大版・verify+verify:bump）。
- **codex 連携**: marketing*/broadcast*/yukkuri*/manga* は codex 縄張り。拡張本体は Cursor/Claude 縄張り。
- 拡張本体の content-entry.js（13.9k行）/ popup-entry.js は本体ロジック。注意して触る。
