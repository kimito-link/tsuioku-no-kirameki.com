> ★配置先: `docs/handoff/live-comment-incremental-DESIGN.md`(Plan mode のためこのファイルに書いた。司令塔がそのまま移す)

- 設計: Fable(claude-fable-5-1) / 日付: 2026-09-15 / 行番号は HEAD=9525b87b の実ファイルで確認済み
- 上流: `~/.claude/plans/elegant-crunching-quokka.md`(第1版の計画・実測 #1〜#12)/ 司令塔の追加実測(本依頼文: 区画は新→古・`no` 単調欠落0・増分 2 区画 0.6 秒)
- 位置づけ: 第1版(v0.1.1511/1512・本番稼働中)に残った 3 点を **1 コミット・bump 0.1.1513** で解消する実装仕様

## 1. 目的
1. **問題1**: 19 配信中 14 が 1 配信 20 秒上限(`CRAWL_CAPS.elapsedMs`・`scripts/live-comment-tally.mjs:67`)で「直近ぶん」になる → **前回の高水位から先だけ読む増分集計**に変え、余った時間で未到達の古い側を掘り進める。
2. **問題2**: 匿名ラベル「匿名8」が同じ順位表に 2 人出る → **同一リスト内で衝突したときだけ uid 断片を添える**(正本 `anonymousDisplayLabel` は不変)。
3. **問題3**: WS 握手が来場者数を +1 する → **握手は残す(受容)**。コード変更なし・本書で closed。

## 2. 非目的
- `crawlNdgrBackward`(`src/lib/ndgrBackfillCrawl.js:466`)の改修(消費側で `gen.return()`)/ `crawlNdgrForward` の新設 / viewUri・audience_token・HLS URI の保存(第2段候補としても本書では非対象)/ `attachComments`(`api/live-ranking.js:387-417`)の変更 / 匿名ラベル正本の変更 / コメント本文・時刻の保存 / `vercel.json`・Secrets の変更 / 来場者数からの握手分の差し引き / `identifiedSupporters` への 💬 バッジ。

## 3. 決定事項(継承・蒸し返さない)
| # | 決定 | 出典 |
|---|---|---|
| A | 初回(状態なし)はその場でフル遡及。cap は残す(極端な長尺の保険) | ユーザー決定(本依頼文) |
| B | 高水位の鍵は `{ maxNo, maxVpos }` の 2 つ。`no` は匿名で欠落しうる(`ndgrDecode.js:273-283`) | 本依頼文 |
| C | 停止判定は「区画の**最古** no <= maxNo」(1 区画は重複取得して漏れを防ぐ)。区画は新→古(`ndgrBackfillCrawl.js:996-997`・`docs/reference_deterministic_backfill.md:50`) | 司令塔実測 |
| D | 二重計上防止は「高水位より新しい行だけ `add`」(uid→count の前回値に**足し直さない**) | 本依頼文 |
| E | 状態は新キー `live:comments:state`(性質で分ける前例 `api/live-ranking.js:30-38`)。viewUri は保存しない | ユーザー決定 |
| F | 状態の読み書きは API 経由(x-share-key)。Actions に Upstash 資格情報を置かない(現行どおり `live-ranking.yml:91-92` は `STATUS_INGEST_KEY` のみ) | 現行方針 |
| G | 匿名は件数順のまま・「匿名NNN」＋identicon が主識別。番号+断片は「呼び名」 | ユーザー決定 2026-09-14・AGENTS §3.5 |
| H | 問題3: 握手を残す。viewUri 保存による握手削減は採らない | ユーザー決定 |

## 4. 変更ファイルと差分の要点
| # | ファイル | lib 改修 | 差分 |
|---|---|---|---|
| 1 | `src/lib/liveCommentTally.js` | **あり(純関数・後方互換)** | (a) `createCommentTally(opts)` に `opts.seed?: { uids: Record<uid,{name,count,anon}>, comments: number }` を追加。`byUid`(81)を seed の挿入順で事前充填(=先着順を run 跨ぎで保つ)・`comments`(84)を seed 値から開始。`seenNo`(83)は空のまま(前回分は §5.2 の水位フィルタで弾く)。(b) `result()`(118-132)の戻りに `uids`(全員の `Record<uid,{name,count,anon}>`・挿入順)を追加(既存 4 キーは不変)。(c) 新規 export `rowsBeyondWater(rows, water)`(§5.2)と `waterOf(rows, prev)`(§5.3)。`TALLY_STATE_UIDS_MAX = 5000` を export |
| 2 | `src/lib/liveCommentTally.test.js` | — | §8.1 のケースを末尾に追加(既存 12 ケースは不変) |
| 3 | `scripts/live-comment-tally.mjs` | — | (a) `loadState()`: run 冒頭に `GET ${API_BASE}?state=comments`(x-share-key・30 秒 timeout)。鍵なし/非 200/parse 失敗は `null`(=全配信フル)。(b) `tallyOne(live, prev)`(189-257)を §6 の 2 フェーズに。(c) `COMPLETE_STOP_REASONS`(71)は不変。新しい消費側停止語 `reached_high_water` を追加(lib の enum には入れない)。(d) `runAll`(265-306)が `stateByLive` も返す。skipped/ng の配信は前回 state をそのまま持ち越す(§6-5)。(e) `payload`(345-355)に `state: { byLive }` を追加。総バイトが `STATE_MAX_BYTES`(§5.5)を超えたら uids の多い配信から `uids` を落とす(その配信は次 run フル)。(f) 1 行 JSON(358-370)に `incremental`(増分で済んだ配信数)・`dug`(古い側を掘った配信数)を追加。★state・ログに viewUri/token を入れない約束(15-18)は不変 |
| 4 | `api/live-ranking.js` | — | (a) `STATE_KEY = 'live:comments:state'`・`STATE_TTL_SECONDS = 6 * 60 * 60`(§5.5)を `COMMENTS_KEY`(38)の直後に。(b) `sanitizeStateEntry(v)`(§5.4)を `sanitizeCommentEntry`(349-377)の直後に。(c) POST 分岐(424-468): 502 ガード(448-451)の**後**、`SET COMMENTS_KEY`(465)に続けて `body.state.byLive` を検疫し `SET STATE_KEY … EX STATE_TTL_SECONDS`。state が無い/空なら **STATE_KEY を触らない**(前回 state を空で潰さない)。応答に `stateLives: n` を追加。(d) 405 判定(470-473)の**後・refresh 分岐(476)の前**に `GET && query.state === 'comments'`: x-share-key 照合(425-430 と同型・不一致 401)→ `GET STATE_KEY` → `{ ok:true, state: parsed|null }`。(e) `attachComments`・`sanitizeCommentEntry`・閲覧者向け GET は不変 |
| 5 | `src/lib/liveRankingView.js` | あり(純関数) | `commentRows`(215-241)の `return out` 直前に §5.6 の衝突解消を挿入。新規非 export ヘルパ `anonUidFragment(uid, len)`。import 追加なし |
| 6 | `src/lib/liveRankingView.test.js` | — | `commentRows` の describe(251-322)に §8.2 のケースを追加。既存 `:267`/`:310` の `/^匿名\d+$/` は**衝突なしフィクスチャなので緑のまま**(各 1 人)。書き換え不要 |
| 7 | `src/extension/live-ranking-entry.js` | — | `renderCommentCol`(156-165)の注記(163)を `c.partial ? '直近ぶんの集計です（古い側は順次さかのぼり中）' : ''` に文言だけ変更。`renderRows`(98-117)は不変(サフィックスは name に含まれる) |
| 8 | bump 3 点＋LP | — | `extension/manifest.json`・`package.json:3` → `0.1.1513`。`src/lib/changelog.js:19-27` の先頭に §5.8(★CRLF)。現在 20 版ちょうど → `node scripts/split-changelog.mjs` を **1 回**・実行後 `version: '` の件数が 20 であることを grep で検算。LP `tsuioku-no-kirameki/index.html` は `scripts/verify-bump.mjs:211-221` の正規表現 4 本が照合する箇所を個別置換 |
| 9 | 生成物 | — | `app/dist/live-ranking.js`(`npm run build`)・`docs/repo-tree-map.*`・`docs/feature-map/*`・`docs/site-health.md`・`docs/layer-map.html`・`src/lib/changelog-archive.js`。`scripts/repo-tree-map.mjs:142` の FEATURES 行は既存(担当ファイル不変なら追記不要) |

★`src/lib` 2 ファイルとも `window/document/fetch` を書かない。新規コードのコメントにも `capturedAt|persistedAt|measuredAt` を書かない(`timeAuthorityRegistry.test.js:11` の `TIME_FIELD_RE` が文字列検査)。state のフィールド名は `at` を使う(既存 `stored.at`・`api/live-ranking.js:454` と同じ語)。

## 5. 仕様の確定値
### 5.1 state の形(Redis `live:comments:state`・`api/` なので語の制約なし)
```json
{ "at": 1789400000000, "byLive": { "lv351386262": {
    "maxNo": 23134, "maxVpos": 412345, "minNo": 1, "minVpos": 120, "complete": true,
    "comments": 20303, "uids": { "143172392": { "name": "みち", "count": 42, "anon": false },
                                  "a:d8KyTJKlU_rTi7sC": { "name": "", "count": 30, "anon": true } },
    "runs": 7 } } }
```
- `maxNo/minNo`: この配信で数えた行の `commentNo` の最大/最小(数値化・`no` 無し行は無視)。`maxVpos/minVpos`: 同じく `vpos`(センチ秒・`ndgrChatRows.js:56`)の最大/最小(`no` の有無を問わず全行)。初回は `null` 起点。
- `complete`: いずれかの run の停止理由が `COMPLETE_STOP_REASONS`(`reached_start`/`backward_exhausted`)に入ったら `true`・以後変えない。`partial = !complete`。
- `uids`: **全員**(上位 10 ではない)。挿入順=先着順。`name` は `TALLY_NAME_MAX`(80)で切る。人数 > `TALLY_STATE_UIDS_MAX`(5000)なら state を書かず(=その配信は毎 run フル・cap で守られる)。
- サイズ見積(出典: 計画 実測 #5=68 分配信で数値 36 人・匿名 769 人): 匿名 1 人 `"a:<16字>":{"name":"","count":N,"anon":true}` ≈ 50B・数値 1 人 ≈ 45B+名前 → 1 配信 ≈ 40〜45KB・20 配信 ≈ 0.9MB(上限)。Vercel body 4.5MB(`docs/handoff/HANDOFF-liveview-copy.md:33`)には収まる。**Upstash 1 リクエスト上限は未確認**(計画「第2段」でも未確認)→ `STATE_MAX_BYTES = 1_000_000` で script 側が自衛(§4-3e)。
### 5.2 `rowsBeyondWater(rows, water)` → `NdgrMergeRow[]`(liveCommentTally.js)
`water = { maxNo, maxVpos, minNo, minVpos }`(各 `number|null`)。次のどれかを満たす行だけ返す: `no > maxNo` / `no < minNo` / (`no` 無し かつ `vpos > maxVpos`) / (`no` 無し かつ `vpos < minVpos`)。water が全部 null なら全行(初回)。`no` も `vpos` も無い行は**捨てる**(位置が決められない=二重計上の恐れ。初回のみ全行採用)。
### 5.3 `waterOf(rows, prev)` → `water`
prev と rows の min/max を畳む(null は「無い」)。`no` は `Number()` 有限のみ・`vpos` は `>= 0` の有限のみ(`minNoOf`/`minVposOf`・`ndgrBackfillCrawl.js:327-355` と同じ判定)。
### 5.4 `sanitizeStateEntry(v)`(api)
許可キーだけ作り直す: `maxNo/maxVpos/minNo/minVpos` は `nonNegInt`(338)または null、`complete` は `=== true`、`comments` は `nonNegInt`、`runs` は `nonNegInt`、`uids` は先頭 5000 件・uid は `str(k,64)`・`name` は `str(…, COMMENT_NAME_MAX)`・`count` は `nonNegInt`・`anon` は `=== true`。`uids` が object でなければ entry ごと捨てる。
### 5.5 定数
| 名前 | 値 | 根拠 |
|---|---|---|
| `STATE_TTL_SECONDS` | 21600(6h) | 配信が数時間続く(計画 実測 #11 は 18h を想定)。`COMMENTS_KEY` の 1h(`:52`)より長くしないと run 1 回の失敗で増分が切れる |
| `CRAWL_CAPS.elapsedMs` | 20_000(不変) | フェーズ A+B の合計。A が 0.6〜0.7 秒(司令塔実測)なら B に約 19 秒残る |
| `STATE_MAX_BYTES` | 1_000_000 | §5.1 の見積の上限側。Upstash 上限が未確認なので保守側 |
| `TALLY_STATE_UIDS_MAX` | 5000 | 本依頼文の例示値。50B×5000=250KB/配信の上限 |
| `ANON_FRAGMENT_LEN` | 4 | `compactNicoLaneUserId`(`nicoAnonymousDisplay.js:74`)の先頭 4 文字と同じ長さ |
### 5.6 匿名ラベルの衝突解消(`commentRows` 内・純関数)
1. `out` の `name` を全行で数える(数値 uid の本名も含めて数える=「匿名8」という本名の人との衝突も拾う)。
2. 2 回以上出る `name` を持つ**匿名行だけ** `name = `${label} ·${anonUidFragment(uid, 4)}``。`anonUidFragment` は `uid.replace(/^a:/i,'')` の先頭 `len` 文字(`[A-Za-z0-9_-]` 以外は除く)。空なら `uid` 全体の先頭 `len` 文字。
3. サフィックス後も同名が残れば `len` を 8 → 全体 と伸ばす(最大 3 段・それでも同じなら諦めて同名のまま=uid 同一はあり得ないので事実上到達しない)。
4. 数値 uid の同名は触らない(リンク・サムネで区別できる・AGENTS §3.5)。`title` 属性・`<span class="anon-sfx">`・CSS 追加は**しない**(描画側無改修)。`.nm`(`live/index.html:251`)の ellipsis は「匿名8 ·d8Ky」(全角 3+半角 7 ≈ 全角 6.5 字相当)で発動しない想定 → 720px 幅で実機確認(§8.4)。
### 5.7 問題3(closed・コード変更なし)
増分集計で握手後の巡回が 1 配信 0.6 秒程度に短縮され(司令塔実測)、握手 1 回のコスト(来場者 +1・計画 実測 2026-09-14 23:0x)だけが残る。これは受容する。viewUri 保存による握手削減は audience_token 由来の値をサーバに置くことになるため採らない(ユーザー決定)。viewUri が 77 分後も有効・過去 `at` でも引けた実測は将来の第2段の材料として計画に残す。
### 5.8 changelog 先頭(CRLF・summary 35 字以内)
`version: '0.1.1513'`, `date: '2026-09-15'`, `summary: 'コメント集計を増分にし匿名の重複名を解消'`(20 字), items: 「追憶のきらめき ランキング(/live/)のコメント集計が、前回数えた続きだけを読むようになりました。長い配信でも「直近ぶん」で止まりにくくなり、古い側も順次さかのぼります。」「同じ順位表に同じ『匿名NNN』が 2 人出たときだけ、区別のための短い記号を添えます。」

## 6. 状態遷移(1 配信・1 run)
```
prev = state.byLive[lv] (無ければ null)
┌ フェーズ A(常に): crawlNdgrBackward({viewBase, caps:{...CRAWL_CAPS}, programStartSec: beginTime})
│   各 yield v: rows = ndgrChatsToMergeRows(v.chats)
│     tally.add(rowsBeyondWater(rows, prev?.water ?? nulls)); water = waterOf(rows, water)
│     prev あり かつ v.minCommentNo != null かつ v.minCommentNo <= prev.maxNo
│       → stopA = 'reached_high_water'; await gen.return() (try/catch); break
│   done → stopA = stopReason(lib)
├ フェーズ B(prev あり かつ !prev.complete かつ stopA === 'reached_high_water' かつ 残り時間 > 3 秒):
│   crawlNdgrBackward({…, caps:{...CRAWL_CAPS, elapsedMs: 残り}, resumeFromVpos: prev.minVpos})
│   各 yield: 同じ add(rowsBeyondWater)・waterOf。done → stopB = stopReason(lib)
└ 結果: complete = prev?.complete || COMPLETE.has(stopA) || COMPLETE.has(stopB)
        entry.stopReason = stopB ?? stopA / partial = !complete / entry.mode = prev ? 'incremental' : 'full'
        state.byLive[lv] = { ...water, complete, comments: r.comments, uids: r.uids, runs: (prev?.runs||0)+1 }
```
1. **初回**(prev null): A のみ・フル遡及・cap に当たれば `complete:false`。tally seed なし。
2. **増分**(prev あり): A は新しい区画から始まり、`minCommentNo <= maxNo` の区画(=前回領域を含む)を 1 つ取り込んで止まる。その区画の重複は `rowsBeyondWater` が弾く。
3. **掘り下げ**(B): `resumeFromVpos`(`ndgrBackfillCrawl.js:460-462,481-486,597`)は「配信開始 + 前回最古 vpos の少し前」に seed して**古い側へ**進む既存機能(lib 無改修)。重なった区画は `no < minNo` フィルタで弾く。
4. `gen.return()` の安全性: lib に `try/finally` は無いが、先読み(`prefetch`・`:917-966`)は `fetchWithThrottle`(`:268-320`)が例外を握って `{bytes:null}` に畳むため、投げっぱなしでも unhandledRejection にならない。残る in-flight fetch は最大 `HTTP_TIMEOUT_MS`(8 秒)で終わる。**許容**(次 run は cap に守られる)。
5. **skipped/ng/crawl_error**: その配信の state は `prev` をそのまま持ち越す(進めなかっただけ・後退させない)。`crawl_error` でも A で取り込んだ分は entry に載せる(現行 234-239 の思想)が、state は **prev のまま**(途中で壊れた run の水位を信じない)。
6. **lives[] から消えた配信**: state に書かない(自然に消える)。**uids > 5000**: state に書かない(次 run はフル)。
7. **POST 失敗**: state も保存されない(同一 body)。次 run は前回 state から再増分(重複は水位で弾かれる)。

## 7. rollback
- 1 コミット `git revert`。`live:comments:state` は TTL 6h で消える。Secrets/workflow 変更なし。
- 部分 rollback: script の `loadState()` を `null` 固定にすれば全配信フル(第1版と同じ挙動)。API の `?state=` 分岐は残っても無害。
- 匿名サフィックスだけ戻す: §5.6 のブロックを外す(`commentRows` の他は不変)。

## 8. 検証手順
### 8.1 単体(`liveCommentTally.test.js` に追加)
`rowsBeyondWater`: 全 null → 全行 / `no>maxNo` のみ通す / `no<minNo` も通す / `no` 無し+`vpos>maxVpos` 通す・`vpos<=maxVpos` 弾く / `no` も `vpos` も無し → 弾く(water あり)・通す(water なし)。`waterOf`: null 起点から畳む・NaN/負 vpos を無視。`seed`: 前回 `{uids,comments}` を渡し 1 行足すと count+1・順位が先着順のまま・`result().uids` が全員を挿入順で返す・seed 無しは既存と同一(characterization)。ネガコン: seed の uid を再度 add しても `seenNo` は弾かない(=水位フィルタが必須である証拠)。
### 8.2 単体(`liveRankingView.test.js` に追加)
同じ「匿名NNN」の匿名 2 人 → 両方 `/^匿名\d{1,3} ·[A-Za-z0-9_-]{4}$/`・断片は uid 先頭 4 文字 / 匿名 1 人 → サフィックス無し(既存 267・310 と同契約) / 匿名 2 人で番号が違う → 無し / 数値 uid の本名が「匿名8」と匿名の「匿名8」→ 匿名側だけサフィックス・本名側不変 / 先頭 4 文字まで同じ uid 2 つ → 8 文字に伸びる。
### 8.3 ゲート順序
`npm run test:cc` → 新規ファイル無し(全て既存の変更)→ `npm run build` → `npm run tree-map && npm run feature-map && npm run site-health && npm run layer-map` → bump 3 点+LP 4 箇所 → `node scripts/split-changelog.mjs`(1 回)→ 版数検算 → `npm run verify:bump` → `npm run verify:cc`(`.artifacts/verify-cc.log`)→ `.agent/coord.md` を読んでから commit(1 コミット)。
### 8.4 ローカル dry-run
1. `STATUS_INGEST_KEY=<鍵> node scripts/live-comment-tally.mjs --dry-run --lv <放送中 lv>` を **2 回**続けて実行。1 回目: `mode:'full'`・stopReason が lib 語。★dry-run は POST しないので 2 回目も state 無し=フル。増分の確認は本番 1 回目の後に `--dry-run` で `mode:'incremental'`・`reasons.reached_high_water>=1`・`ms` が 1 秒級であることを見る。
2. stdout を `grep -E 'audience_token|viewUri|mpn\.live|wss://'` → 0 件。
3. `curl -H "x-share-key: $KEY" "$API?state=comments" | jq '.state.byLive | to_entries[0].value | del(.uids)'` で水位と `complete` を目視。鍵なしで 401。
### 8.5 本番
Actions `workflow_dispatch` を 2 回 → 2 回目の 1 行 JSON で `incremental >= 1`・`ms` が 1 回目より短い。`::warning::N 配信は上限に当たり…` の N が run を重ねるごとに減る(掘り下げが効いている証拠)。`/live/` を 1040px / 720px / モバイルで開き、匿名 2 人が同番号の配信があれば「匿名8 ·xxxx」が 1 行に収まり ellipsis が出ないこと。cron 3 回後に `commentsCapturedAt` が進み `refresh` ジョブが緑のまま。

## 9. 3視点への予備回答
- **実装者**「`gen.return()` で lib の内部状態は壊れないか」→ generator は yield で停止中に return を受けると完了状態になるだけ。lib に finally が無いので後始末も無い(§6-4)。**「seed で `seenNo` が空のまま二重計上しないか」**→ 前回分は水位フィルタが弾く。フィルタなしで seed を使うと二重計上する(ネガコン §8.1 で固定)。
- **テスター**「`no` が匿名で欠落する行の水位はどう保証するか」→ `vpos` 側の水位で判定(§5.2)。両方無い行は初回以外捨てる(数えない方が嘘より安全)。**「フェーズ B の初回区画重複」**→ `no < minNo` で弾く。`resumeFromVpos` を Node で回した実測は無い(§10)。
- **利用者**「『直近ぶん』が消えない配信がある」→ `complete` になるまで run ごとに約 19 秒ずつ古い側へ進む。注記の文言を「古い側は順次さかのぼり中」に変えて進行中だと分かるようにする(§4-7)。**「匿名の呼び名が変わった」**→ 衝突したときだけ・その順位表の中だけ。番号自体は不変(正本不変)。

## 10. 未確認事項
1. Upstash REST の 1 リクエスト本文上限(§5.1・`STATE_MAX_BYTES` で自衛)。
2. `resumeFromVpos` を Node/サーバ経路で回した実測(拡張の実機実績 v0.1.456 のみ)。B が `no_progress` を繰り返す場合は `complete:false` のまま害は無いが、時間を浪費する。1 行 JSON の `dug` と `reasons` で観測し、常態化なら B を定数で止める。
3. `no` の単調性・欠落 0 は 45 区画 1 配信の実測。匿名率の高い配信で `no` 欠落が出た場合の `vpos` 水位の効き(§5.2 で吸収する設計だが未実測)。
4. 「匿名8 ·d8Ky」の 720px 幅での見え方(§8.5 で実機確認)。
5. state 読み取りの GET が 1 本増えることによる run 時間への影響(30 秒 timeout 内・実測なし)。
