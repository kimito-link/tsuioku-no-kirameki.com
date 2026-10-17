# ゆっくりの反応 — 実装ハンドオフ(この1枚だけで着手できる)

> 設計: [yukkuri-react-DESIGN-2026-10-18.md](yukkuri-react-DESIGN-2026-10-18.md)(設計=Fable / 裏取り=司令塔 / 2026-10-18)。**実装は別チャット/別モデルで**。ここは「やる順番」と「合格の測り方」だけ。理由・捨てた案は設計書。

## 読む順
1. 設計書 §0・§1(実コードとの食い違い)・§9(地雷)
2. `src/extension/venueBar.js`(CRLF)の `launchGiftThrow`(:4503)と呼び出し5か所(:4776/:4793/:4839/:4893/:4950)、`startCharaLive({` 付近(talk:false)、`__nls_chara_cheer_probe__`
3. `src/lib/charaLiveController.js`(`cheer()`・tick・`cheerUntilMs`)・`charaLiveStage.js`(`charaLiveStageCss()`)・`charaLiveState.js`(`triggerCharaReaction`・`pickReactingChara`・`REACT_MIN_MS`)
4. 既存テスト: `charaLiveCheer.test.js`(`makeHarness` を流用)・`charaLiveCheerWiring.wiring.test.js`・`charaLiveFloatOnly.wiring.test.js`

## ユーザー回答を待つ点(既定で進めてよい)
1. 小額ギフト(1〜49pt)にも頷くか(既定: 全ギフト)
2. 500pt以上に「+1,200pt」バッジ(既定: 出す・v2)
3. 広告に反応させるか(既定: ギフトの1段下で小さく・v3)
4. 後回し候補の順(熱度で浮遊 / PICK UP 口パク / クラッカー)

## スコープ(版ごとに独立してマージ可能)
| 版 | 内容 | 変更の大きさ |
|---|---|---|
| **v1** | ギフトで**1人**が頷く(small/medium)。large/mega も v1 では nod(medium 相当) | controller に `onGiftThrown`・CSS・venueBar に1行+probe・テスト2本 |
| v2 | large/mega を3人弾み+`+N pt` バッジ(`cheer()` 内部を `startBurst(label)` に切り出し) | controller 内の整理+表の large/mega 行 |
| v3 | 広告を1段下で有効化(表の ad 行) | 表の ad 行 |
| v4 | 合算(cooldown 中の pt を `pendingPoints` に足し、明けの tick で tier を再判定して1回で出す) | controller のみ |
| v5 | 熱度で浮遊を大きく(`resolveCharaFloat` の係数) | charaLiveState の係数(実機で見える量を測ってから) |

**やらない**: 鏡 pulse を使う検知・popup からのメッセージ・吹き出し・200px の吹っ飛び・入場への反応・PICK UP の口パク(後回し)・クラッカー(後)・`talk:false` の解除。

## v1 の着手手順
1. `git checkout -b feat/chara-react-v1`(master から)。
2. 先にテストを書いて赤を確認(設計書 §6 の単体 ①②⑤⑥⑦⑧・配線)。
3. 実装:
   - `charaLiveController.js`: `onGiftThrown({kind,tier,points,speakerKey})`・`NOD_MIN_GAP_MS=2500`・`nodUntil`・tick の畳み込み・純関数 `resolveGiftReaction`。戻り値 API(`talk` と独立)。`points<=0` は何もしない。弾み中・`setVisible(false)`・`destroy()` 後は捨てる。
   - `charaLiveStage.js` の `charaLiveStageCss()`: `.nlcl-chara.is-nod`・`@keyframes nlcl-nod`/`nlcl-nod-medium`・reduced-motion で `animation:none`(**venueBar の VENUE_CSS には書かない**)。
   - `venueBar.js` の `launchGiftThrow` の `return true;` の直前に `if (proj.point > 0) { try { charaLive.onGiftThrown({...}) } catch {} }`(`maybeThrowArrivalFromSpeech` からは呼ばない)。`__nls_chara_react_probe__` を `__nls_chara_cheer_probe__` の隣に。
4. 実ブラウザ(headless・司令塔が自分で): 会場を開いて probe(small→`.is-nod` が1つ・900ms後に消える / large→`is-cheering`+badge)。本物の経路は `nls_gift_events_<lv>` に1要素 push(`handleNewGiftEvents`)。★`GIFT_DELTA_DEBOUNCE_MS=60s` に注意。退行確認: `__nls_chara_cheer_probe__(100)` が従来どおり動く・弾み中に small を打っても何も増えない。`npm run status:live` で CPU の前後比較。
5. 変異テスト: venueBar の1行を消す→配線テストが赤。`points:0` の弾きを消す→単体が赤。
6. bump 3点(`package.json` / `extension/manifest.json` / `src/lib/changelog.js` の summary 35字以内)+ `tsuioku-no-kirameki/index.html` の版数。`npm run verify:cc`。`git add` は `.html`・`scripts/`・新規テスト2本(`src/lib/charaLiveGiftReact.test.js`・`charaLiveGiftReact.wiring.test.js`)を含める。

## 機械的な完了判定
- `npm run verify:cc` OK(`deadSelectorRatchet.test.js` も緑のまま)。
- 実ブラウザの前後計測(跳ねの出る/消える・CPU)があり、合格条件を満たす。
- 各テストを壊す変異で赤を確認済み。
- PR 本文に「実機未確認: 更新+F5 後の見え方・跳ね量」を明記。**効いたかはユーザーの観察後に判断**。

## 地雷(詳細は設計書 §9)
CRLF(Edit は短い一致で) / Bash heredoc はバックスラッシュを壊す(編集スクリプトは Write の .cjs) / `charaLiveFloatOnly.wiring.test.js` は `startCharaLive({` の `talk: false` を見る(引数を足さない) / `charaLiveCheer.test.js` は `cheer()` の公開挙動を固定 / 入場 `proj.point===0` を弾く(venueBar 側と controller 側の両方) / 数値(跳ね量・ギャップ)は実機で見て微調整 / CPU 影響は測るまで「無い」と言わない。

## 要確認(着手時に実コードで確かめる)
`launchGiftThrow` の `return true;` の位置と `giftProjActive += 1;` の順 / `proj.point` が全 kind で数値か / headless で会場を動かす既存ハーネス(`scripts/perf-ab/common.mjs`・`scripts/audit/runtime-venue-audit.mjs`)での `nls_gift_events_<lv>` の形(`handleNewGiftEvents` が読む要素の形) / `__nls_chara_live_probe__` の有無(設計書の D-3 が参照)。
