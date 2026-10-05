# /live/ の良い部分を拡張(popup＝応援レーン / 会場 / 別窓)へ取り込む — 地図（wayfinder MAP）

> 作成: 2026-10-06 / 司令塔(Claude) / ユーザー要望「live から吸収できる良い部分はぜんぶとりこんでほしい」
> 棚卸し: Explore サブエージェントの報告を司令塔が実コードで抜き取り検証（spawnDot 742 / createMotionTrack 53 /
> laneBuckets 36 / venueLaneMirrorSupply.js:21 の段順 は一致）。行番号は 2026-10-06 時点（v0.1.1561）。
> 推測は「推測」「未確認」と明記。**コードは変更していない。**

## 1. 入口（利用者がどこで触れるか）

| 面 | 入口 | 実体 |
|---|---|---|
| ① popup（サイドパネル・ツールバー・watch ページ内 iframe） | `extension/popup.html` + `src/extension/popup-entry.js` | 応援レーン(4〜5段のアイコン列)・数字カード・公式値チップ・ユーザー別応援件数の帯(rank strip)・ギフト履歴 |
| ② 会場モード（watch ページに重ねる全画面） | `src/extension/venueBar.js` | 共有レンダラで①と同じ段組み DOM を描く（[[venue-equals-lane-same-layout]]） |
| ③ 別窓（live-view.html） | `src/extension/live-view-entry.js` | **popup.html を iframe で丸ごと埋める薄い入れ物**（同ファイル冒頭 1-18 行）。①に入れた変更はそのまま③に出る |
| 参考: Web 版 /live/ | `tsuioku-no-kirameki/live/index.html` + `src/extension/live-ranking-entry.js` | 拡張なしで見られるランキング。60 秒更新・本文非表示 |

## 2. /live/ 側の「良い部分」候補（棚卸し結果・利用者に見えるもの）

| # | 機能 | /live/ の実体（file:line） | 拡張①に同等物があるか | 取り込み候補の評価（司令塔） |
|---|---|---|---|---|
| A | **タイルの内訳バッジ**（🎁pt / 📣pt / 💬件 を人ごとに表示） | `live-ranking-entry.js:97-125` renderLanes、`liveLaneBuckets.js:36-76`、CSS `index.html:226-256` | **無い**。拡張のタイルは `src/lib/personTileDom.js:28-33` の `meta:{idLine,nameLine}` の 2 行だけ | ★最有力。応援者が主役(AGENTS §3.5)の原則に直結。データは拡張の手元にある（ギフト履歴・広告順位表・コメント件数） |
| B | **ギフト増分バッジ**（+N pt・次の取得まで残る・50/500/5000 で色段階） | `live-ranking-entry.js:118-121,148-161`、`liveGiftPulse.js:48-64,108-124`、閾値 `giftDeltaFallback.js:31-35`、CSS `index.html:245-246,322-328` | 会場は `computeGiftDelta`（`venueBar.js:338,3361`）で帳簿方式の差分を持つ。popup のタイルに「残るバッジ」は**未確認** | ★有力。閾値 `tierForGiftDeltaPoints` は共有 lib（giftDeltaFallback.js）に既にある＝正本を増やさずに済む |
| C | **熱いチップ**（直近増分でタイル拡大＋輪＋`+N件`・最大 3 回優先） | `liveMotion.js:143-148` tierForCommentDelta、`live-ranking-entry.js:764-771`、CSS `index.html:348-353` | 無い（拡張は「発話光」`.nlsb-seat` 系の一瞬の光はある＝[[venue-equals-lane-same-layout]] の吹き出し/発話光） | 有力。拡張はコメントが秒単位で届くので「直近 N 秒に喋った人」を段内で目立たせる方が自然（60 秒差分ではなく） |
| D | **コメント速度 `+N/分`** と実測 2 点の線形補間カウンタ | `liveMotion.js:53-104,135-139`、`live-ranking-entry.js:314-320,779-789` | 無い。公式値チップ「本家コメ」は値のみ（`src/lib/officialNicoStatsStripDigest.js`） | 速度表示は有力。補間は拡張では不要（実値が秒単位で来る） |
| E | **増えた行だけ光る**（初回は光らせない） | `liveRankingView.js:403-431` createRowChangeTracker、CSS `index.html:311-321` | 無い（rank strip `src/lib/topSupportRankStripLines.js:159-` は件数のみ） | 中。rank strip に 1 行で入る |
| F | **段見出しの人数 / 「ほか N 人」/ 匿名「N 人・上位 10」** | `live-ranking-entry.js:97-125`、`liveLaneBuckets.js:95-108` laneMoreText | 拡張の段見出しは**未確認**（`laneSceneEnvelope` 系に人数があるかは要確認） | 中〜高。会場の「表示48/素性58」問題(メモリ)と同じ数字を見出しに出すと誠実 |
| G | **視覚言語**（タイル 84px・丸 48px・点線枠＝識別絵・金銀銅の順位丸・pill ボタン・紺/オレンジ/生成り） | CSS `index.html:44-63`(tokens), `173-198`(順位丸), `227-232`(tile), `255-256`(点線) | popup の配色は `--nl-*` 系（`popup.html:52-` 付近）。順位丸は rank strip にあり（番号バッジ） | 中。トークンの寄せ方は Fable が決める（全面差し替えは禁物＝3 画面の CSS 位置依存の地雷あり） |
| H | **匿名の同名衝突に uid 断片** | `liveRankingView.js:250-273,283-288` | 拡張は `anonymousDisplayLabel`(nicoUserPage.js) の「匿名NNN」のみ。衝突解消は**無い**（changelog-archive.js:196 に /live/ 側の記録） | 低〜中。安い |
| I | **誠実な注記**（公開値/自前集計/推定 の区別・計測中・集計待ち） | `live-ranking-entry.js:211-220`、`index.html:286,463-473` | 一部あり（「取得中」「—」）。文言の統一は**未確認** | 低。文言だけ |
| J | **脈拍レーン**（コメント速度で応援者チップが流れる・240/分で縞） | `live-ranking-entry.js:328-332,742-775,790-803`、`liveMotion.js:121-131`、CSS `337-357` | 無い。拡張はコメント本文がリアルタイムで流れる（別機能） | 要判断。拡張では本文が見えるので重複気味。入れるなら「段の上の細い帯」として軽量に |
| K | X シェア（配信者名＋番組名だけ・`?lv=` 先頭固定・OGP） | `live-ranking-entry.js:79-83,325`、`xIntentUrl.js` | popup に「WEBサイトURLで共有」(changelog-archive.js:5743 付近)。X 直リンクは**未確認** | 低。`xIntentUrl.js` を import すれば 1 ボタン |
| L | ホバー直近発言カード / Kick 欄 / 配信横断一覧 / FAB / OGP | — | 拡張は本文を手元に持つ・単一配信・自前 UI | **取り込まない**（意味がない or 別物） |

/live/ と拡張の**段の順が違う**（事実）: /live/ `['link','konta','gift','tanu']`（`liveLaneBuckets.js:8`）、拡張 `['link','gift','ad','konta','tanu']`（`venueLaneMirrorSupply.js:21`）。拡張側の順が正本（3 画面パリティ）。/live/ を拡張に寄せる話はこの地図の対象外。

## 3. 拡張側の受け皿（データが流れる順）

```
記録(content-entry) → chrome.storage.local(nls_cchunk_*/nls_gift_events_*/nls_koken_*/nls_nicoad_*)
  → popup-entry.js: userLaneCandidatesFromStorage(src/lib/userLaneCandidatesFromStorage.js:92)
      → enrichUserLaneAggregatesWithProfileAndDisplay(:259)  ← nickname/avatar 合成
      → 段分け(domain/lane/*) → paintStoryUserLaneDomFilled(src/lib/laneMirror.js) ← ★共有レンダラ(①②が同じ関数)
          → buildPersonTileEl(src/lib/personTileDom.js:53)  ← ★タイル 1 枚の DOM（ここに内訳バッジを足せば 3 画面に出る）
      → publishLaneMirror → nls_lane_mirror_v2_<lv>(src/lib/laneMirrorKey.js) → status/③が鏡として読む
  → paintOfficialNicoStatsStrip(popup-entry.js:9048) ← 公式値チップ(本家コメ等)。ここに `+N/分` を足す候補
  → renderTopSupportRankStrip(popup-entry.js:9668) ← ユーザー別応援件数の帯。E(光る)/H(衝突解消)の候補
会場(venueBar.js:5222) は同じ paintStoryUserLaneDomFilled を呼ぶ。別窓③は popup.html の iframe。
```

- popup の呼び出し 3 箇所: `popup-entry.js:6501 / 6671 / 6752`（通常描画・鏡からの復元・再描画）。
- ギフトの差分: 会場 `venueBar.js:338` `computeGiftDelta`（帳簿方式・決定論）。閾値 `src/lib/giftDeltaFallback.js:31-35`（/live/ と共有済み）。
- ★未確認: popup のタイルに「ギフト pt」「コメント件数」を渡す経路が既に集約行(aggregate)に載っているか（`userLaneCandidatesFromStorage` の集約行は count を持つ: `topSupportRankStripLines` が `r.count` を読む＝件数はある。pt は gift events/koken から別途）。

## 4. 既存の設計判断（壊してはいけない境界）

1. **会場＝応援レーン＝別窓は並び・レイアウトまでそっくり同じ**（[[venue-equals-lane-same-layout]]・2026-07-03 ユーザー確定）。新しい見た目は**共有レンダラ/タイル DOM に 1 回入れる**。①だけ・②だけに入れない。
2. **コメント本文の自動表示・中継は却下**（council 5 体一致・2026-09-30・[[live-comment-body-display-rejected-2026-09-30]]）。これは /live/(公衆送信)の話で、拡張(本人の PC 内表示)は従来どおり本文を出してよい。混同しない。
3. **拡張のアイコン列の実装(3 秒 poll・2 段 paint・fillLaneTier)は /live/ へ移植しない**（live-gift-pulse-DESIGN D-5）。今回は逆方向（/live/ の見せ方→拡張）なので、この判断は直接は縛らないが、**ちらつきの歴史**（v1037〜1042 の 6 版・[[story-userlane-churn-filllanetier-v1039]]）が受け皿側にある。タイルの中身を増やすときは再描画の単位（タイル差し替えか、バッジ要素だけの更新か）を決める。
4. **匿名は「匿名NNN＋identicon」**（AGENTS §3.5）。v0.1.1558 で hashed 形も正本判定に入った。
5. **性能**: popup バンドル 1,365KB（過去最良 1,360・`improvementHistory.js` が番人）。サイドパネルは iframe で親と同一スレッド（[[sidepanel-black-root-cause-iframe-load-blocks-parent-2026-08-19]]）。常時アニメ（脈拍レーン等）は `prefers-reduced-motion` と「裏タブで止める」を必ず持つ。
6. **外部 API は落ちる前提**（AGENTS §3.6）: koken/nicoad が空でもタイルは出す。pt は無ければ出さない（0 を捏造しない）。
7. **max-lines ラチェット**: `popup-entry.js` 22,096 行（eslint.config.js:398）。ロジックは lib へ。

## 5. 変更すると壊れうる箇所

- `src/lib/personTileDom.js` の DOM 形（`.nlsb-seat` ラッパー・吹き出し/ギフト座標が `getBoundingClientRect` 測定に依存＝[[venue-equals-lane-same-layout]]）。タイルの高さが変わると会場の吹き出し位置がずれる可能性（未確認）。
- `laneSceneEnvelope*.test.js` / `laneMirror*` の reachability・パリティ wiring テスト群（lane mirror の形を変えると赤くなる設計）。鏡(`nls_lane_mirror_v2`)に新フィールドを足すなら additive に。
- `storyUserLaneChurn` 系テスト（タイルの差し替え頻度を固定している可能性・未確認）。
- popup.html のインライン CSS は 13k 行・カスケード位置依存（[[shared-css-extraction-keeps-cascade-position-2026-09-14]]）。トークン追加は末尾ではなく該当ブロック近くに。
- 公式値チップの digest は `officialNicoStatsStripDigest.test.js` が文字列を固定。
- `topSupportRankStripLines.test.js` が行モデルを固定。

## 6. 未確認（推測で埋めない）

- 拡張の段見出しに人数が出ているか／「ほか N 人」があるか。
- popup の集約行(aggregate)に人ごとの gift pt / ad pt が既に載っているか（件数は `count` がある）。
- タイル DOM に 3 行目（内訳）を足したときの会場の吹き出し座標への影響。
- /live/ の CSS トークンを popup に入れる際の衝突（`--nl-*` と `--navy/--orange` の対応）。
- X シェアが popup に既にあるか（「WEBサイトURLで共有」との関係）。

## 7. 実装前に決める必要がある質問（Fable が答える）

1. **取り込む集合の確定**: A〜K のうち何を採用し何を見送るか（理由つき）。特に J（脈拍レーン）は拡張で意味があるか。
2. **A の内訳バッジのデータ源**: タイルに出す pt/件数を「どこで合成するか」（`enrichUserLaneAggregatesWithProfileAndDisplay` に載せるか、描画時に別マップから引くか）。3 画面で同じ値になる保証の仕方。
3. **B/C の差分の基準**: /live/ は 60 秒取得の差分。拡張は秒単位。何を「直近」とするか（例: 直近 60 秒窓）、バッジがいつ消えるか。
4. **再描画の単位**: タイルを作り直さず、バッジ要素のテキスト/クラスだけ更新する設計にできるか（ちらつき防止）。
5. **段見出しの数字**: 「表示 N 人／素性 M 人」をどう出すか（会場の visibleSeats 間引きとの整合）。
6. **視覚トークン**: /live/ の配色・寸法をどこまで popup に寄せるか。会場（全画面）でタイル 84px/丸 48px は小さすぎないか（CSS 変数で寸法だけ可変にする既存方針）。
7. **版の分割**: 1 変更＝1 版の粒度で、どの順に出すか（データ無しで壊れないものから）。
8. **検証の定義**: 3 画面で同じ DOM が出ることをどのテスト/実機で確かめるか（`/nicolive-selfcheck` で popup と会場の lane mirror を比較）。

## 8. §6 の未確認を司令塔が解決したもの（2026-10-06 追記）
- 段見出しの人数: 拡張はフッター「いま N 件を表示中」「ほか M人」を持つ（`src/lib/laneMirror.js:34-35`、`totalCandidates`=素性が取れた候補総数(cap 前)、`:181-191`）。段ごとの人数見出しは**無い**（フッター合計のみ）。
- 集約行(aggregate)の項目: `nickname / avatarUrl / avatarObserved / count / giftCount? / recentTexts?`（`src/lib/userLaneCandidatesFromStorage.js:22-28`）。**pt は載っていない**（giftCount は投げた回数）。pt は `nls_gift_events_*`（giftEventStore）/ koken / nicoad の順位表から別途引く必要がある。
- X シェア: popup-entry.js / popup.html に `x.com/intent` / `xIntentUrl` は**無い**（grep 0 件）。`src/lib/xIntentUrl.js` は /live/ 専用。
