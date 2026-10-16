# 実装ハンドオフ: 発言の証拠(SpeechEvidence)— v1 から順に

> 読む順: [MAP](person-evidence-MAP-2026-10-16.md) → [SPEC](person-evidence-SPEC-2026-10-16.md)(冒頭の「司令塔の訂正」を先に)→ このファイル。実装は【まだしていない】。着手はユーザーの明示指示の後。

## スコープ
- **MVP = v1 + v2**(嘘を出さない)。v3/v4(本文の持ち回し)は同じお題の続き。v5/v6 は任意(v6 は実測で VIP 集合差が出たら中止)。
- やらないこと: 起動静穏窓・storage get 一括化・content-visibility・LOD・software canvas(却下済み)/記録経路/鏡の書式変更/I3/NDGR 遡り/①③④へのホバー追加。

## 着手手順(1版=1変更・ブランチ・TDD)
1. `git checkout -b feat/speech-evidence-v1`(master から)。`docs/handoff/person-evidence-SPEC-*.md` §4.1〜4.2 の関数シグネチャどおりに `src/lib/speechEvidence.js` を**テストから**書く(§5 の L0 単体)。
2. 持ち回し: venueSeats.js(`venueRowsFromUserLaneCandidates`・`collectVenueParticipants` の新規行と合流の両方)/venueLaneMirrorSupply.js(`venueRowsFromLaneMirror`)/venueLiveRoster.js(`rosterToVenueRows`)/venueHoverFacts.js(`mirrorCell` 入力・戻りに `speech`)/venueBar.js(`_hoverCardDataByEl.set`・`resolveSeatlessHoverData`・census 呼び出し)。**表示は変えない**(v1)。
3. census: venueSpeechCensus.js に `lied`/`hoverLied`・`発言の嘘N`、venueSeatsDiag.js のホワイトリスト(:266-)に `hoverLied`。**`venueSpeechCensusWiring.wiring.test.js:25`(`spoke: Number(data.count) > 0` を期待)を同時に更新**しないと赤。
4. 毒テスト `venueRowSpeechCarry.test.js`(3系統→venueAvatar enrich→collectVenueParticipants→participant まで speech が同一)と配線テスト。変異テスト: speechEvidence.js に `Math.max(1` を書いたら赤/持ち回しの1か所を消したら赤。
5. 版 bump 3点セット(manifest/package/changelog 先頭・summary 35字以内・LP の版数表記4か所)→ `npm run build` → `verify:bump` → `improvement:record` → `verify:cc`(changelog が20版を超えたら `node scripts/split-changelog.mjs`・版数を検算)→ PR。
6. 出荷後、**状態速報の基準値を記録**(`発言の嘘N`・`欠けN`・`hoverOpened`)。これが v2 の合格基準の「前」になる。
7. v2: `SPEECH_EVIDENCE_GATE_ENABLED` でカードを関所化(SPEC §4.3)。フラグ false で旧文言とバイト同一のテスト。

## 機械的な完了判定
- v1: テスト緑・`verify:cc` 緑・状態速報に `発言の嘘N` が出る(0 件の緑=未観測は不合格)。
- v2: `hoverLied===0 && missing===0 && hoverOpened>=1`(`npm run status:live --json` の `venueSeatsDiag.speechCensus`)。実機で支援者(広告/ギフトのみ)のカードに「発言」「たった今」が出ない。reality-checker に委任して判定する(自己採点しない)。

## 地雷(要点)
- 個別列挙で作り直す関数に `speech` を足し忘れると黙って消える(SPEC §7 の一覧)。
- popup-entry.js は触らない(max-lines)。dist の日本語は `\uXXXX`・CRLF で置換が空振り・changelog summary 35字。
- Fable の記述に誤りがあった(parseNicoadCommentText の有無)。SPEC の【確認】【報告】【未確認】の区別を信じ、実装前に該当箇所を grep で再確認する。
- **ユーザー確認が要る判断**: SPEC 未解決5(gift/ad 段の人に証拠があれば本文を出す=2026-07-31 の「投擲段は本文を出さない」の更新)。v2 に入る前に確認する。

## 実機の切り分け(v1 出荷後)
キリン本人が書いたかは census の `発言の嘘`(A=捏造)と `欠け`(B=本文の取りこぼし)の増減で分かる。B が残るなら v3/v4 を急ぐ。
