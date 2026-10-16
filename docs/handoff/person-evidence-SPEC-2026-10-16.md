# SPEC: 「人×発言×段」を嘘なく出す — 発言の証拠(SpeechEvidence)を人物モデルに持たせる

> 設計=Fable(claude-fable-5-1) / 地図・裏取り=司令塔(Claude) / 2026-10-16。地図: [person-evidence-MAP-2026-10-16.md](person-evidence-MAP-2026-10-16.md)。実装は【まだしていない】。
>
> ## 司令塔の裏取りで訂正・補足した点(Fable の記述より優先)
> 1. **訂正**: Fable は「`parseNicoadCommentText` は src/lib に存在しない」と書いたが誤り。`src/lib/parseGiftComment.js` に存在し、content-entry.js:16217(DOM 観測の祝演出)・popup-entry.js:349 が使う。ただし `ndgrChatRows.js`(NDGR 記録経路)は `parseGiftCommentText` しか import していない=広告お知らせ文(「◯◯さんが広告しました…pt」)が NDGR 経由で「発言」として記録されるかは【未確認】(未解決の質問3を参照)。
> 2. 確認済み: `venueSpeechCensusWiring.wiring.test.js:25` が `spoke: Number(data.count) > 0` を固定している(venueBar.js:2920)=v1 で同時更新が必要。`venueSeatsDiag.js:266-` に speechCensus のホワイトリストがある。`venueHoverParity.test.js`・`venueHoverFacts.test.js` は既存。
> 3. 確認済み: `mergeUserLaneAggregates` は recentTexts を落とす・`hydrateRosterFromCandidates` は候補の本文を読まない(地図 0b)。
> 4. 未確認のまま(実装時に確認): A3〜A6(下の assumption list)。

---

## 1. Problem Statement

会場(②)のホバーカードが「発言 1(たった今)・いま喋っている・ここで1回」と出すのにセリフが無い人がいる。実コードで確認した原因は2系統:

**(A) 発言していない人に発言が捏造される**
- 件数の下駄 `Math.max(1, …)`: `venueLaneMirrorSupply.js:154`・`venueSeats.js:879`(+ `collectVenueParticipants` の :142)・`venueLiveRoster.js:197,233`【確認】。「0」も「不明」も 1 になる。
- 時刻の下駄: 鏡セルに storage 候補が無いと `capturedAt = 鏡の発行時刻`(`venueLaneMirrorSupply.js:153`)【確認】→ 鏡が新しい限り「たった今」。
- 守りが段名だけ: `venueHoverCard.js:195-211,223` は `tier==='ad'|'gift'` のときだけ「発言」を隠す【確認】。v1620(`laneLinkTier.js:64-101`)がギフト/広告の支援者を `commentCount:0 / recentTexts:[]` のまま tier3(りんく)候補に追加する【確認・popup-entry.js:6520 で呼ばれている】→ 例外が効かず「発言1」。

**(B) 実際に発言した人の本文が経路で落ちる**
- `mergeUserLaneAggregates`(`venueIncrementalAggregate.js:78-104`)は新規 uid に `recentTexts` を載せず、マージでも持ち回さない【確認】。会場のチャンク経路は `aggregatedCandidates`(`venueBar.js:6090`)がこれになる【確認】。
- `hydrateRosterFromCandidates`(`venueLiveRoster.js:227-230`)は `lastText:''・recentTexts:[]` 固定【確認】。候補は `recentTexts`(最大5件)を持っている(`userLaneCandidatesFromStorage.js:196-206,235`)【確認】=コメントの前提が古い。

構造的真因: **人物モデルが「発言の証拠」を型として持たず、UI が段名の例外で嘘を抑えている**。段の定義が変わるたび(v1620)に同じ嘘が再発する。

---

## 2. Solution(地図 Q1〜Q8 への回答)

### 核
`SpeechEvidence = { comments: number|null, lastAt: number|null, texts: readonly string[] }` を人物行(VenueRow)・参加者(participant)・ホバーデータの**必須フィールド `speech`** として持ち回す。
- `comments`: 実コメント行数。`null`=不明、`0`=数えた結果ゼロ、`n>0`=有り。
- `lastAt`: 最終**発言**時刻(ms)。発言の証拠が無ければ `null`(鏡の発行時刻・lastSeen・capturedAt を入れない)。
- `texts`: 本文(新しい順・最大 `RECENT_TEXT_KEEP`)。
- `hasSpeech(e) = (e.comments ?? 0) > 0 || e.texts.length > 0`。
- **UI は `hasSpeech` が偽なら「発言」「たった今」「いま喋っている」「ここで N 回」「セリフ」を一切出さない。段名は見ない。**

関所は純関数1本 `speechEvidence(input)`(正規化)で、3系統の行ビルダー(候補/名簿/鏡)はこれを通した `speech` を出す。`venueHoverFacts.resolveVenueHoverFacts` が「どの出所の speech を使うか」を既存の優先順(registered→roster→(新)mirrorCell)で1本に決め、`buildVenueHoverCardModel` は `speech` だけから発言の文言を作る。

### Q1 型の置き場所と3系統の通し方
- **新規 L0 `src/lib/speechEvidence.js`**(純関数・I/O なし)。`venueHoverFacts.js` の拡張にしない理由: あちらは「どの出所を採るか(優先順・混ぜない)」の正本、こちらは「何を発言の証拠と認めるか」の正本。責務を分け、`venueHoverFacts` が `speechEvidence` を**消費**する。
- 3系統の関所通過点(全て既存関数の出力に `speech` を1フィールド足すだけ):
  - 候補: `venueRowsFromUserLaneCandidates`(venueSeats.js:872)→ `speechEvidenceFromCandidate(c)`
  - 鏡: `venueRowsFromLaneMirror`(venueLaneMirrorSupply.js:128)→ cand があれば `FromCandidate(cand)`、無ければ `speechEvidenceFromMirrorCell(cell)`(`stats.c` と `recentTexts` だけ。`capturedAt` は使わない)
  - 名簿: `rosterToVenueRows`(venueLiveRoster.js:181)→ `speechEvidenceFromRoster(e)`
  - 合流: `collectVenueParticipants`(venueSeats.js:128)が `mergeSpeechEvidence` で持ち回す(個別列挙型なので明示追加)。`venueAvatar.js` はスプレッド保持(v0.1.1110)なので無変更。
- 機械テスト: 「`speech` を落とすと赤」の持ち回しテスト(§5)。

### Q2 下駄 `Math.max(1,…)` の扱い
- **MVP では触らない。** 表示は `speech` だけを見るので、下駄が残っていても嘘は出ない(=`venueHoverFacts.js` 冒頭「上流の下駄は表示の末端で吸収」の方針を、段名の例外ではなく型で実現する)。
- 「表示用の count」と「並び/VIP 用のスコア」は**この時点で分離される**: `participant.count`(preCount 由来)は `resolveVenueRegularScore`・`rankVenueContributors`・席順(`venueSeats.js:531-567`)の専用、`participant.speech` は表示専用。カードは `count` を発言の根拠に使わない。
- 下駄の撤去は後続版(v6・任意)。撤去すると支援者のみの人の score が約10→0(`0.55*log1p(1)/log1p(40)`)になり VIP 候補集合が変わりうる【推測】ため、実スナップショットで VIP キー集合の前後比較を機械で取ってからにする。理由が無ければやらない。

### Q3 時刻の下駄(鏡の fallbackAt)
- `capturedAt`(席順・X層同化・「在席」の根拠)は**従来どおり**鏡の発行時刻を使ってよい(「居る」の根拠として正しい)。
- `speech.lastAt` は候補の `_laneSortAt`(commentCount>0 のときのみ)/名簿の新フィールド `lastTextAt`/それ以外 `null`。鏡セルからは**時刻を作らない**。
- カードの相対時刻(`formatVenueHoverRelativeTime`)と「いま喋っている」(`venuePresenceNote`)は `speech.lastAt` だけから出す。発言の証拠が無い人に時刻は出ない(「広告(たった今)」も出さない。これも鏡時刻由来の嘘だった)。

### Q4 広告/ギフトの支援者のカードに何を出すか
- MVP: 発言の語を出さず「広告」「ギフト」「会場に居る」+ 既存の `🎁N`・順位・presenceNote「ギフトを贈った」のみ(今ある値だけ・新規取得ゼロ)。
- v5(任意): 鏡セル `stats.g/stats.a`(=/live/ の `pts` と同じ公式 pt・`laneTileStats.js` が正本)をカードの統計行に `🎁1,200pt ・ 📣4,200pt` として出す。`advertiserName` 原文は鏡セルに無い(title のみ)ので対象外。
- /live/ 完全移植の入口として妥当か: **妥当**。/live/ の `LaneTile.hover`(`liveLaneBuckets.js:14`「コメント集計に居る人」)は本仕様の `hasSpeech` と同じ意味、`pts` は拡張の `stats` と同じ出所。人物モデルに `speech` と `stats` が揃えば、/live/ のタイルと拡張の行が同じ述語で語れる。

### Q5 本文の取得元を増やすか
- **(A) 拡張の記録だけ。(B) NDGR 遡りは採らない。**
- 理由: 会場の候補は `requireText:true`(`venueBar.js:6065`)で作られるので、`commentCount>0` なら本文は storage に必ず有る。本文が空になるのは**経路で落としているから**(B1/B2)であり、取得元の不足ではない。v3/v4 で経路を直し、状態速報の `欠け`(証拠ありなのに本文無し)が 0 になることを確認する。
- 再開条件: v4 出荷後も `欠け>0` が実機で残り、その人の storage 行に本文が無いと診断で確定したとき。そのときも「ホバーのたびに外部取得」は hot path 方針(recentTextRing.js 冒頭)に反するので、取得は記録経路側の問題として別お題にする。
- 法的整理(参考): 自端末の記録を本人に見せるのは公衆送信ではない。NDGR 再取得も同じ性質だが、不要な外部依存(§3.6)を増やすだけなので採らない。

### Q6 3画面パリティ
- 「発言 N」を出すホバーカードは**会場(venueBar.js)にしか無い**【確認: `buildVenueHoverCardModel` の import は venueBar.js のみ】。
- ①POP/③/④ のタイル3行目 `💬N` は `laneTileStats.js` の `positiveOrNull`(0→null)経由で、支援者のみの人(commentCount:0)には 💬 が付かない【確認】=嘘は出ていない。
- よって直す場所は人物行(`speech`)とカードの1か所で足りる。鏡の書式は変えない。

### Q7 移行・互換・フラグ・影運用
- 旧鏡(`stats`/`recentTexts` 無しのセル)→ `speech = {null, null, []}`(不明)→ カードは「会場に居る」。壊れない。
- 鏡に新フィールドを**足さない**(`laneMirrorContract.js` の消費者登録・`laneSceneContentHash`・`laneMirrorRecentTextsCarry.test.js` に影響なし)。
- フラグ `SPEECH_EVIDENCE_GATE_ENABLED`(speechEvidence.js)。false で `buildVenueHoverCardModel` は従来の段名ロジック(バイト同一)に戻る。v1 の持ち回し自体は additive なので常時有効。
- `laneImportShadow`(影運用・表示不変)は無関係。**I3 の前提への一歩か: Yes** — 会場行が /live/ の `hover` と同義の型を持つことで、将来の単一 view-model は `{identity, avatar, stats, speech}` を共通語彙にできる。I3 そのものは対象外。

### Q8 検証
- 状態速報「会場セリフ」行(`venueSpeechCensus.js`)に **`発言の嘘N`** を足す。定義: カードを開いたとき、`statLine` に「発言」を含むのに `hasSpeech(speech)` が偽。構造上 0 になるはずだが、**出力を測る**(意図ではなく結果を判定)。`lied>0` で 🔴。
- 「発言ありなのに空」(`emptyButSpoke`)の `spoke` を `Number(data.count)>0` から `hasSpeech(speech)` へ変更(=「発言の証拠ありなのに空」)。
- 機械判定: `npm run status:live --json` の `venueSeatsDiag.speechCensus.hoverLied === 0` かつ `missing === 0`、かつ `hoverOpened >= 1`(0件の緑は不合格)。reality-checker はこの3値で判定する。

---

## 3. User Stories

| # | 状況 | 期待 |
|---|---|---|
| S1 | 広告 4,200pt の広告主(コメント無し)がりんく段に居る。ホバー | 「名前 / 広告 / 🎁… / ギフトを贈った(該当時) / ID」。「発言」「たった今」「いま喋っている」「ここで1回」「セリフ」は出ない |
| S2 | ギフトだけの人(gift 段) | 同上。「ギフト」ラベル・🎁N・「ギフトを贈った」 |
| S3 | 会場を開く**前**に3回発言した人(storage のみ・名簿は hydrate) | 「発言 3(N分前)」+本文(v4 後は名簿から/v1-3 は鏡セルの3件から) |
| S4 | 開いた**後**に発言した人(touchRoster) | 「発言 N(たった今)・いま喋っている」+本文。従来どおり |
| S5 | 鏡が古い(stale 帯)で候補に居ない人(鏡のみ・stats.c あり) | 「発言 N」(時刻は出ない=時刻不明は黙る)+鏡の本文3件 |
| S6 | 鏡のみ・stats.c も texts も無い(旧鏡/支援者のみ) | 「会場に居る」。数も時刻も言わない |
| S7 | 読み込み中(集計前・鏡未着) | 席なし→`resolveVenueHoverFacts` が none→「会場に居る」。発言は出ない |
| S8 | storage 読み失敗/タイムアウト(aggregate 失敗) | 名簿/鏡の証拠だけで描く。失敗で 0 を捏造しない(`comments:null`) |
| S9 | 同じ人が link と gift の両段に居る | 席は uid 先勝ちで1つ。証拠があれば gift 段でも「発言 N」+本文を出す(段名で隠さない) |
| S10 | 匿名(`a:` uid)で発言した人 | 「匿名NNN」+「発言 N」+本文。扱いは本登録と同一(presenceNote の差別禁止テスト維持) |
| S11 | 配信者本人 | 候補から除外(userLaneCandidatesFromStorage :134)=席に居ない。変更なし |
| S12 | ③別窓(status)/④純Web/①POP | ホバーカード無し。💬 は stats 由来で不変 |
| S13 | フラグ off | v2 以前と文言バイト同一 |
| S14 | 旧データ(名簿に `lastTextAt` 無し・候補に `recentTexts` 無し) | `FromRoster`/`FromCandidate` は欠落を不明として扱い落ちない |

---

## 4. Implementation Decisions

### 4.1 新規 `src/lib/speechEvidence.js`(L0・純関数)
```
/** @typedef {{ comments: number|null, lastAt: number|null, texts: readonly string[] }} SpeechEvidence */
export const SPEECH_EVIDENCE_GATE_ENABLED = true;           // v2 で参照。false=カードは旧ロジック
export const SPEECH_UNKNOWN: SpeechEvidence                  // frozen {null,null,[]}
export function speechEvidence(input: { comments?: unknown, lastAt?: unknown, texts?: unknown }): SpeechEvidence
export function hasSpeech(e: SpeechEvidence|null|undefined): boolean
export function mergeSpeechEvidence(older: SpeechEvidence, newer: SpeechEvidence): SpeechEvidence
export function speechEvidenceFromCandidate(c: { commentCount?, _laneSortAt?, recentTexts? }): SpeechEvidence
export function speechEvidenceFromMirrorCell(cell: { stats?: { c? }, recentTexts? }): SpeechEvidence
export function speechEvidenceFromRoster(e: { commentCount?, lastTextAt?, lastSeen?, recentTexts? }): SpeechEvidence
```
規則(全部 `speechEvidence` の中):
- `comments`: 有限数→`max(0,floor)`、それ以外→`null`。**`Math.max(1,…)` をこのファイルに書かない**(変異テストで固定)。
- `lastAt`: 有限かつ >0 → floor、それ以外 `null`。
- `texts`: 非空文字列のみ・空白正規化・先頭 `RECENT_TEXT_KEEP` 件(`recentTextRing.js` の定数を使う)。
- **texts から件数を捏造しない**(`comments:null` のまま)。`comments===0 && texts.length>0` の矛盾は `comments=null`(不明)へ倒す。
- `mergeSpeechEvidence`: comments は両方 null→null、片方以上既知→既知の和(`collectVenueParticipants` の preCount 加算と同じ意味)。lastAt は null-safe max。texts は newer の非空を優先、無ければ older。
- `FromCandidate`: `comments=commentCount(有限なら)`、`lastAt = comments>0 ? _laneSortAt : null`、texts=recentTexts。
- `FromMirrorCell`: `comments = stats.c(>0 の数) ?? null`、`lastAt=null`、texts=recentTexts。**capturedAt を受け取らない**。
- `FromRoster`: `comments=commentCount`、`lastAt = lastTextAt ?? (comments>0 ? lastSeen : null)`、texts=recentTexts。

### 4.2 行・参加者への持ち回し(v1)
- `venueSeats.js#venueRowsFromUserLaneCandidates`: 出力に `speech: speechEvidenceFromCandidate(c)`。
- `venueLaneMirrorSupply.js#venueRowsFromLaneMirror`: `speech: cand ? speechEvidenceFromCandidate(cand) : speechEvidenceFromMirrorCell(cell)`。既存の `recentTexts`/`capturedAt`/`preCount` は不変。
- `venueLiveRoster.js#rosterToVenueRows`: `speech: speechEvidenceFromRoster(e)`。
- `venueSeats.js#collectVenueParticipants`: 新規行で `speech: r.speech ?? SPEECH_UNKNOWN`、既存キーへの合流で `existing.speech = mergeSpeechEvidence(existing.speech, r.speech)`(新しい行が newer)。戻り値 typedef に `speech` 追加。
- `venueHoverFacts.js#resolveVenueHoverFacts(input)`: 入力に `mirrorCell?: { stats?, recentTexts? }` を追加(最下位)。戻り値に `speech: SpeechEvidence` を追加。registered は `registered.speech ?? SPEECH_UNKNOWN`、roster は `speechEvidenceFromRoster`、none は mirrorCell があれば `FromMirrorCell` 無ければ `SPEECH_UNKNOWN`。early-return 構造は維持(数も speech も混ぜない)。**既存の count/giftCount/lastAt/lastText/recentTexts の戻りは不変**。
- `venueBar.js`:
  - :5524 の `_hoverCardDataByEl.set` に `speech: participant.speech`。
  - `resolveSeatlessHoverData`(:2819): `resolveVenueHoverFacts({ registered:null, rosterEntry, mirrorCell: it })` とし、戻りに `speech: facts.speech` を追加。既存の「roster の texts が空なら鏡セルの texts」(:2862)は `speech.texts` にも同じ規則で適用(本文のみ・数は混ぜない)。
  - :2912 `buildVenueHoverCardModel({ ...data, … })` は data に speech が入るので変更なし。
  - 診断 :2917 `observeVenueSpeechHover`: `spoke: hasSpeech(data.speech)`、`saidSpeech: /発言/.test(model.statLine)` を追加。`isThrow` で除外していた分岐を外す(段で除外しない=嘘の計測漏れを作らない)。
- `venueSpeechCensus.js`: state.hover に `lied`、`liedSamples`(最大3)。`observeVenueSpeechHover` に `saidSpeech` を受け、`saidSpeech && !spoke` で `lied+=1`。`toVenueSpeechCensusDiag` の line に `発言の嘘N`、戻りに `hoverLied`、verdict に `lied>0 → warn`。
- `venueSeatsDiag.js` :266-(speechCensus のホワイトリスト)に `hoverLied` を追加(**足し忘れると状態速報に永久に出ない**=既存 wiring テストの型で固定)。

### 4.3 カードの関所化(v2・フラグ)
- `venueHoverCard.js#buildVenueHoverCardModel(input)`: 入力に `speech?: SpeechEvidence`。`SPEECH_EVIDENCE_GATE_ENABLED && input.speech` のとき:
  - `count := speech.comments`、`lastAt := speech.lastAt`、`recentTexts := speech.texts`、`lastText := speech.texts[0] ?? ''`(入力の count/lastAt/lastText/recentTexts は無視)。
  - statLine 先頭: `hasSpeech` → `comments>0 ? 発言 N(rel) : 発言あり(rel)`;否 → `tier==='ad' ? '広告' : tier==='gift' ? 'ギフト' : '会場に居る'`(**時刻なし**)。段名は「発言が無いときの呼び名」にだけ使う(発言の抑制には使わない)。
  - `isThrowTier` による本文抑制を撤廃(証拠があれば段に関わらず出す)。
  - presenceNote には `count: speech.comments`・`lastAt: speech.lastAt` を渡す。
  - それ以外(フラグ off/speech 無し): 現行コードをそのまま通す。
- `venueHoverCard.js:193` のコメント「count は最低1仕様」は書き換える(嘘の説明を残さない・§12.7)。

### 4.4 本文の持ち回し(v3・v4)
- v3 `venueIncrementalAggregate.js#mergeUserLaneAggregates`: 新規 uid で `recentTexts: toTexts(c.recentTexts)`、合流で `prev.recentTexts = mergeRecentTexts(incomingTexts, prev.recentTexts)`(incoming=新規 seq=新しい側を先頭)。`recentTextRing.js` に `mergeRecentTexts(newer, older, keep=RECENT_TEXT_KEEP)`(連続同一を畳み・上限)を追加。typedef `UserLaneCandidate` に `recentTexts?` 追加。
- v4 `venueLiveRoster.js`: `RosterEntry` に `lastTextAt: number`(additive)。`touchRoster` は `!isGift && text` のとき `lastTextAt = now`(新規・既存とも)。`hydrateRosterFromCandidates` は `recentTexts: toTexts(c.recentTexts)`・`lastText: recentTexts[0] ?? ''`・`lastTextAt: commentCount>0 ? lastSeen : 0`。:227-228 の誤ったコメントを直す。`commentCount` の `max(1,…)` は触らない(Q2)。

### 4.5 版の分割とロールバック
| 版 | 内容 | 戻し方 |
|---|---|---|
| v1 | speechEvidence.js + 行/参加者/facts/venueBar の持ち回し + census `発言の嘘` 計測(**表示不変**) | revert(additive) |
| v2 | カードの関所化(`SPEECH_EVIDENCE_GATE_ENABLED`) | フラグ false で旧文言 |
| v3 | merge が recentTexts を持ち回す | revert |
| v4 | hydrate/touchRoster の lastTextAt・本文 | revert |
| v5(任意) | 支援者カードに `🎁/📣 pt`(stats) | revert |
| v6(任意・要測定) | preCount 下駄の撤去 | 実測で VIP 集合差が出れば中止 |
MVP = v1+v2(嘘を止める)。v1 を先に出すのは「直す前に嘘の件数を測る」ため(基準値が取れる)。

---

## 5. Testing Decisions

**L0 単体(`*.test.js`)**
- `speechEvidence.test.js`
  - `comments: 0 と null を区別する(0=数えた結果・null=不明)`
  - `★texts から件数を捏造しない(texts 3件・comments null → null のまま)`
  - `comments 0 なのに texts がある矛盾は不明(null)へ倒す`
  - `lastAt: 発言の証拠が無ければ null(fromMirrorCell は capturedAt を受けても時刻を作らない)`
  - `fromCandidate: commentCount 0 → lastAt null / commentCount 3 → _laneSortAt`
  - `fromRoster: lastTextAt 優先・無ければ comments>0 のとき lastSeen・旧エントリ(lastTextAt 無し)でも落ちない`
  - `merge: 両方 null→null / 片方既知→和 / lastAt は max / texts は新しい行優先`
  - `hasSpeech: {null,null,[]} は偽・{0,…,[]} は偽・{null,null,['a']} は真`
  - 変異テスト `★このファイルに Math.max(1 を書いたら赤`(ソース文字列検査)
- `venueHoverCard.test.js` 追加
  - `★証拠が無い人には「発言」「たった今」「いま喋っている」「ここで1回」を出さない(tier=link でも)`
  - `証拠あり・件数不明 → 「発言あり」`
  - `tier=gift で証拠あり → 発言 N と本文を出す(段名で隠さない)`
  - `★鏡の capturedAt を lastAt に渡しても speech.lastAt が null なら時刻を出さない`
  - `フラグ off → 旧出力とバイト同一(既存ケース全件を speech 付きでも通す)`
- `venueHoverFacts.test.js` 追加
  - `speech も registered→roster→mirrorCell の順で1本(混ぜない)`
  - `★registered がある限り mirrorCell の stats.c を数に使わない`
- `venueLaneMirrorSupply.test.js` 追加: `cand 無しの鏡セル → speech {stats.c ?? null, null, recentTexts}` / `cand あり → 候補の値`
- `venueSeats.test.js` 追加: `collectVenueParticipants が speech を持ち回す(落とすと赤)` / `同キー合流で merge される`
- `venueLiveRoster.test.js` 追加: `rosterToVenueRows が speech を出す` / (v4)`hydrate が候補の recentTexts を読む` / `touchRoster は本文行で lastTextAt を更新しギフト行では更新しない`
- `venueIncrementalAggregate.test.js` 追加(v3): `merge が recentTexts を持ち回す(新規 seq が先頭・連続同一を畳む・上限 RECENT_TEXT_KEEP)`
- `venueSpeechCensus.test.js` 追加: `saidSpeech && !spoke → lied` / `line に 発言の嘘N` / `lied>0 で warn`

**持ち回し(毒)テスト** `venueRowSpeechCarry.test.js`: 3系統の行→`venueAvatar` enrich(スプレッド)→`collectVenueParticipants`→participant まで `speech` が同一(deep-equal)で届く。**結果が使われているか**まで固定(`buildVenueHoverCardModel({speech})` の statLine に反映)。

**配線(`*.wiring.test.js`)**
- `venueHoverCardSpeechEvidence.wiring.test.js`: venueBar が `speech: participant.speech` を登録 / seatless が `mirrorCell: it` を渡す / census 呼び出しが `spoke: hasSpeech(` と `saidSpeech:` を持つ / `isThrow` による census 除外が無い。
- `venueSpeechCensusWiring.wiring.test.js` :23-26 を新形へ更新(現行は `spoke: Number(data.count) > 0` を期待している=そのままだと赤)。`hoverLied` がホワイトリストと `buildAiShareFullText` を通る。

**パリティ** `venueHoverParity.test.js` 追加: 同じ人を「席あり(registered)/席なし(roster)/鏡のみ(mirrorCell)」の3経路で解決したとき `hasSpeech` の真偽と texts が一致(数は出所ごとに違ってよいが、**無いものが有るに化けない**)。`laneTilePresentation.parity.test.js` は DOM 不変なので変更なし。

**実機(状態速報・機械判定)**: `npm run status:live --json` → `venueSeatsDiag.speechCensus` の `hoverLied===0 && missing===0 && hoverOpened>=1`。v1 出荷時に基準値(嘘 N 件)を記録し、v2 で 0 を確認。0 件の緑・未観測(⚪)の緑は不合格(reality-checker に委任)。

---

## 6. Out of Scope
- I3(表示の全面切替・単一 view-model)/`laneImportShadow` の影→実表示化。
- VIP スコア・席順・`Math.max(1,…)` の撤去(v6 は任意・要測定)。
- NDGR 遡りによる本文取得(Q5)。記録経路(ctail/comments_/cchunk/csummary/IndexedDB)。
- 鏡の書式変更(新フィールド・`laneMirrorContract` 更新)。
- ①POP/③/④ へのホバーカード追加。`advertiserName` 原文の表示。
- `requireText:false` 経路(`personProfiles.js:127` が gift 以外を text 空でも +1 する点・`userRooms.aggregateCommentsByUser`)の commentCount 意味論の是正=別お題。
- 広告お知らせ文が「発言」として記録されているかの調査(未解決の質問3)。

---

## 7. Further Notes(地雷)
- **個別列挙で作り直す関数**に `speech` を足し忘れると黙って消える: `venueRowsFromLaneMirror`・`venueRowsFromUserLaneCandidates`・`rosterToVenueRows`・`collectVenueParticipants`(新規行と合流の両方)・`resolveSeatlessHoverData` の戻り・`_hoverCardDataByEl.set`。持ち回しテストで固定する。`enrichUserLaneAggregatesWithProfileAndDisplay`/`venueAvatar` はスプレッドなので不要。
- `venueSeatsDiag.js` のホワイトリスト(:266-)に `hoverLied` を足さないと状態速報に出ない(2026-10-12 と同じ穴)。
- `venueSpeechCensusWiring.wiring.test.js` は venueBar のソース形を正規表現で固定している(:24-25)。v1 で必ず同時更新。
- hot path: ホバー時の `speechEvidenceFromRoster` は O(1)・storage 読みゼロ。paint 時の merge は行ごと O(1)。**storage read を増やさない**(recentTextRing.js 冒頭の方針)。
- `_hoverCardDataByEl` のキャッシュは uid 無しだけ(:2887)。speech を入れても uid ありは毎回解決される=「一度3回なら永遠に3回」は起きない。
- 名簿の `commentCount` は本文行のみ(venueBar の `touchRoster` 呼び出し2か所は `isGift` を渡さない【確認】)。`giftCount` は hydrate 由来のみ。
- `_laneSortAt` は候補の「本文ありの最終時刻」(venue は requireText:true)。popup-entry.js:5703/7844 にも `requireText: true` がある【確認: 行の存在のみ。呼び出し先の関数は未読=未確認】。
- CRLF・dist の日本語エスケープ・popup-entry.js の max-lines(本仕様は popup-entry.js を触らない)。
- カード文言の「嘘の説明コメント」(venueHoverCard.js:193)は実装と同時に書き換える(§12.7)。
- 教訓(会議/Fable の誤り): Fable は parseNicoadCommentText を「存在しない」と書いた。報告の事実は鵜呑みにせず grep で確認する。

---

## 未解決の質問
1. キリン本人は実際に本文を書いたか(ユーザー「分からない」)。v1 の census(`発言の嘘N`/`欠けN`)が A/B どちらかを1回で切り分ける。
2. 実機で支援者セルの tier が本当に `link` で会場に渡っているか(`laneTierByUid` の中身)=未確認。v1 の census サンプル(detail に tier を含める)で確認。
3. 広告お知らせ文(nicoad)が NDGR 記録経路(`ndgrChatRows.js`)で除外されていない(`parseGiftCommentText` のみ)→ 広告定型文が「発言」として記録される可能性。`parseNicoadCommentText` は存在するが DOM 観測(content-entry.js:16217)が使うだけで、記録の除外には使われていない【司令塔確認】。実データ未確認。別お題。
4. `comments===0 && texts.length>0` の矛盾を「不明」に倒す規則でよいか(代替: texts.length を下限にする=件数の捏造になりうるので本仕様は不採用)。
5. v2 で gift/ad 段の人に証拠があれば本文を出す(S9)=2026-07-31 の「投擲段は本文を出さない」判断の更新。ユーザー確認が要る。
6. 鏡セルに `c:0`(発言ゼロを明示)を運ぶか(現状 `positiveOrNull` で 0 は落ちる=不明扱い)。MVP は不要。

## 仕様に根拠がない断定(assumption list)
- A1. チャンク seq の昇順=時間順(append-only)。v3 の「incoming が新しい側」はこれに依存。
- A2. `preCount` 下駄撤去で VIP 集合が変わりうる(【推測】・数式から)。未測定。
- A3. 鏡 stale 帯で候補に居ない人は `stats.c` を持つことがある(鏡セルに stats が載る条件は popup 側 `attachLaneTileStats` の挙動に依存・未読)。
- A4. `venueHoverParity.test.js` の既存構造が「3経路の同一人物」を足せる形である(ファイル未読)。
- A5. `status:live --json` の出力に `venueSeatsDiag.speechCensus` がそのまま載る(`aiShareFullText` 経由の本文は確認済・JSON の経路は未読)。
- A6. popup 側候補(popup-entry.js:6507)の `commentCount` は `requireText:true` 集計由来=本文行数(5703/7844 の呼び出し先未読)。
