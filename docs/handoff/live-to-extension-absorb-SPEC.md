# /live/ の良い部分を拡張(①応援レーン・②会場・③別窓)へ取り込む — 実装仕様(SPEC)

> 設計=Fable(claude-fable-5-1) / 地図・裏取り=司令塔(Claude) / 2026-10-06
> 地図: [live-to-extension-absorb-MAP.md](live-to-extension-absorb-MAP.md)
> 司令塔の裏取り: 本文が挙げる file:line(personTileDom.js:113-114 / renderStoryUserLaneDom.js:302,410,474,109 /
> laneMirror.js:107,239 / venueLaneMirrorSupply.js:125,139 / popup-entry.js:6401,6437,6446,6476,6618,7217,9049,11665 /
> storyUserLaneGuideHtml.js:19,94 / liveGiftPulse.js:71 / liveMotion.js:143 / venueBar.js:374,1159-1414 /
> adLanePicksFromRooms.js:116 / popup.html:11139,1436 / eslint max-lines 22,096・現在 21,516 / app/live-view.html は追跡)は
> すべて実コードと一致(2026-10-06・v0.1.1561)。
>
> **司令塔の裁定(Fable の「未解決の質問」への回答)**
> 1. 版 1564(識別絵の点線枠): **出す**(ユーザー要望は「ぜんぶ」。CSS 1 行・他版に依存されない)。
> 2. 広告段の uid 無し広告主に 📣pt: **出す**(公式が名前と pt を公開している・AGENTS §3.5)。
> 3. 版 1567 を②会場の上部バーにも: **今回は出さない**(会場上部の構成が未確認。Out of Scope に置く)。
> 4. ギフト増分の標本時刻: **koken storage の capturedAt**(推奨案)。司令塔が `readCardCapturedAtMs`(popup-entry.js:11002-)を読んで確認済み:
>    storage 値 `{capturedAt, rows}` の capturedAt(=koken 取得時刻・`nls_koken_api_contrib_<lv>` の実測形 `{capturedAt,lastOk,lastStatus,liveId,rows}`)を返す。assumption 2 は解消。
>
> 版番号は 0.1.1562〜 を仮置き。着手時に manifest の最新 +1 へ読み替える。

---

## 1. Problem Statement(利用者視点で何が足りないか)

拡張の応援レーン(①②③共通のタイル `buildPersonTileEl`・`src/lib/personTileDom.js:53-116`)は「顔・ID・名前」の2行だけで、**その人がどれだけ応援したか(🎁pt / 📣pt / 💬件)がタイルに出ない**。同じデータは拡張の手元に既にある(集約行の `commentCount` `src/lib/userLaneCandidatesFromStorage.js:181,230` / koken 貢献度 `contribution` `src/lib/kokenContributionRankingApi.js:189-208` / nicoad `contribution` `src/lib/officialDomRankingRowsToStripRooms.js:62`)のに、画面では「応援者が主役」(AGENTS §3.5)になりきれていない。

Web版 /live/ は 60 秒差分で (a) 人ごとの内訳バッジ、(b) ギフト増分 `+N pt`、(c) 熱い人の `+N件`、(d) コメント速度 `+N/分`、(e) 段見出しの人数 を出す。拡張は秒単位で実データが届くのに、この「見せ方」が無い。一方で拡張には /live/ に無い制約がある: **3 画面パリティ**(地図 §4.1)・**ちらつきの歴史**(`fillLaneTier` の diff-skip・`src/extension/story/renderStoryUserLaneDom.js:401-416`)・**サイドパネルは親と同一スレッド**(§4.5)・**max-lines ラチェット 22,096**(`eslint.config.js:398`、現在 21,516 行=余地 580 行)。

本 SPEC は「/live/ の見せ方のうち拡張で意味があるもの」を選び、**タイルを作り直さず・鍵を揺らさず・DOM 要素を増やさず**(属性+`::after`)、共有レンダラ 1 箇所と鏡(`nls_lane_mirror_v2`)の additive フィールドで 3 画面同時に出す設計。

---

## 2. Solution

### 2.1 採用一覧(/live/ の機能 → 拡張のどこに・どう入るか・版)

| # | /live/ の機能 | 拡張での入り方 | 版(仮) | データが無いとき |
|---|---|---|---|---|
| **A+I** | 内訳バッジ 🎁pt / 📣pt / 💬件(`liveLaneBuckets.js:21-28`)+誠実な注記 | タイルの meta に **`data-stats` 属性**を付け、CSS `.nl-story-userlane-meta[data-stats]::after { content: attr(data-stats) }` で 3 行目として描く(DOM 要素 +0)。値は popup が 1 回だけ合成し、鏡 cell の additive `stats` で②③へ運ぶ。脚注に「🎁📣は公式の公開pt・💬は拡張が記録した件数」 | **1562** | 出さない(0 を捏造しない。`null`=不明) |
| **F** | 段見出しの人数(`live-ranking-entry.js:97-125`) | 既存の段案内帯 `buildStoryUserLaneGuide{Top,Gift,Ad,Konta,Tanu}Html` に additive 第2引数 `count` を足し `<span class="nl-story-userlane-guide__count">N人</span>` を付ける(CSS 既存 `popup.html:1436`)。会場は `VENUE_LANE_GUIDES_EXACT_COPY = true`(`venueBar.js:374`)で同じ帯を描くので自動で出る | **1563** | 0人でもそのまま「0人」(段が空なら空段ノートが出る既存挙動のまま) |
| **G(軽)** | 視覚言語のうち「識別絵は点線枠」(`live/index.html:259`) | `[data-thumb="0"] .nl-story-userlane-avatar { border-style: dashed }` の CSS 1 行(JS 変更なし)。寸法・配色の全面差し替えは**しない**(§2.3 Q6) | **1564** | — |
| **B** | ギフト増分 `+N pt`・50/500/5000 段階(`liveGiftPulse.js:48-64`・`giftDeltaFallback.js:31-35`) | koken 貢献度行の **公式サンプル間差分**を `createGiftPulseRegistry`(`liveGiftPulse.js:71`・そのまま import)で取り、タイルに `is-gifted` + `data-pulse="+1,200pt"` + `data-pulse-tier` を**その場更新**。鏡 cell に additive `pulse` | **1565** | 2 標本が揃うまで無し。15 分超の間隔は捨てる(`PULSE_MAX_GAP_MS`) |
| **C(+E)** | 熱いチップ `+N件`(`liveMotion.js:143-148`)/ 増えた行だけ光る(`liveRankingView.js:403-431`) | 拡張は秒単位なので「**直近 60 秒にコメントが増えた人**」を段内で光らせる: `is-hot` + `data-pulse="+N件"`(N=60 秒窓の増分・tier は `tierForCommentDelta` を葉モジュールへ抽出して再利用)。初回観測は光らせない(E の規律)。rank strip 側(`popup-entry.js:9663`)は**触らない**(§2.2 E) | **1566** | 増分が無ければ無し。裏タブ復帰時は窓で自然に失効(バースト無し) |
| **D** | コメント速度 `+N/分`(`liveMotion.js:92-99,135-139`) | 公式値チップ「本家コメ」(`popup.html:11139`・`paintOfficialNicoStatsStrip` `popup-entry.js:9049`)の隣に `<span id="officialStatNicoCommentsRate">`。公式 `commentCount` の 2 標本(≥20 秒差)から算出。③は iframe で自動継承。**②会場の上部バーは対象外**(レーン DOM ではない・§2.3 Q1) | **1567** | 標本が揃うまで空(「計測中」は出さない=チップが狭い) |

版順の根拠(「壊れにくい順」): 1562〜1564 は**差分不要・データが無くても壊れない**(属性/文言/CSS)。1565〜1566 は**差分が要る**。常時アニメは**採用ゼロ**(J 見送り)。1567 はレーン外の独立面なので最後。

### 2.2 見送り一覧(理由つき)

| # | 機能 | 見送り理由(根拠) |
|---|---|---|
| **H** | 匿名同名衝突に uid 断片 | 拡張のタイルは **ID 行に既に `a:XXXX…` の断片**を出している(`storyUserLaneMetaLines` → `compactNicoLaneUserId` `src/lib/nicoAnonymousDisplay.js:99-112`)。/live/ は名前 1 行しか無いから衝突が見えたが、拡張では「先頭4文字が同じ+同じ表示名」の二重一致でしか起きない。発生頻度は**未計測**なので、実機で衝突が見えたら `src/lib/anonymousNameCollision.js`(`liveRankingView.js:250-288` の移植・tanu 段のみ・nameLine にだけ付与)を 1 版で足す。今回は作らない(作る前に測る) |
| **E(rank strip 側)** | 応援件数の帯で増えた行だけ光る | 帯は popup 専用(`renderTopSupportRankStrip` は会場に対応物が無い=3画面に乗らない)で、`strip.innerHTML` 全書き換え方式(`popup-entry.js:9719`)。光らせるには行の同一性追跡を帯にも持ち込む必要がある。**タイル側の C で「増えた人が光る」は満たす**ので重複投資しない |
| **J** | 脈拍レーン(名前チップが流れる・240/分で縞) | 拡張は**コメント本文そのものがリアルタイムで流れる**(ティッカー `renderCommentTicker` `popup-entry.js:3007`・地図 §4.2 拡張は本文 OK)。名前だけ流す帯は劣化コピー。さらに常時 rAF アニメはサイドパネル(親と同一スレッド・§4.5)で黒画面の再発経路になる。「段の上の細い帯」案も、動かすものが増えるだけで情報は増えない |
| **K** | X シェア | レーンの見せ方ではなく別の UI 面。popup には「🔗 WEBサイトURLで共有」(`buildStatusShareUrls`・`live-view-entry.js:22`)が既にあり、X 直リンクは `xIntentUrl.js` を import すれば 1 ボタンだが「何の URL を投げるか(共有スナップショット URL か /live/?lv= か)」の決定が要る=別お題 |
| **G(重)** | タイル 84px/丸 48px・金銀銅の順位丸・紺/オレンジ配色の全面寄せ | window popup は高さ 580px 固定の箱で 32px が上限(`popup.html:1125-1134` の設計コメント)。寸法は既に CSS 変数化され `laneAvatarSize.wiring.test.js` が「3 画面の意図的な差」を守っている。順位丸はレーンに順位概念が無い(並びは直近アクティブ順)。配色全面差し替えは 13k 行インライン CSS のカスケード位置地雷(§4・memory `shared-css-extraction-keeps-cascade-position`) |
| **D の補間カウンタ** | 実測 2 点の線形補間 | 拡張は実値が秒単位で来る(地図 §2 D 司令塔評価と同じ)。補間は嘘の中間値 |
| **L** | ホバー直近発言カード / Kick / 配信横断 / FAB / OGP | 拡張は本文を手元に持ち(会場ホバーカード済)・単一配信・自前 UI。意味が無い(地図 L) |

### 2.3 地図 §7 の質問への回答

1. **取り込む集合**: A+I / F / G(軽) / B / C(+E) / D の 6 版。H・E(帯)・J・K・G(重)・L は見送り(§2.2)。J は「拡張では本文が流れるので意味が薄い+常時アニメの性能リスク」で明確に **No**。
2. **A のデータ源と合成場所**: **`renderStoryUserLane` 内で 1 回だけ合成**し、buckets(link/gift/ad/konta/tanu 全段)に `stats` を attach してから `publishLaneMirror`(`popup-entry.js:6437`)に渡す。②③は**再計算しない**(鏡を読むだけ)。
   - 💬件: `STORY_SOURCE_STATE.laneAggregates`(`popup-entry.js:5422`)の各 `commentCount`(`userLaneCandidatesFromStorage.js:181`)。候補ループは `aggList` を回している(`popup-entry.js:6278-6281`)が、候補の `entry` は `agg` ではなく合成 `PopupCommentEntry`(`:6293-6312`)なので、**uid→stats の索引**を別に作って attach する(entry の形は変えない)。
   - 🎁pt: popup が既に持つ koken 貢献度 top10 の合流バッファ `_northStarMirrorLanes.contributionRanking`(`popup-entry.js:7217`・`ContributionRankerRow[]`)。uid は `officialDomRankingRowsToStripRooms(rows,{userKeyKind:'contrib'})`(`:46-`)が `userPageUrl` から取り出す既存経路を使う(推測ゼロ)。匿名「名無し」行は誰にも付けない。
   - 📣pt: 同バッファの `adRanking`(nicoad API 行)。広告段アイテムは `adLanePicksFromRooms`(`src/lib/adLanePicksFromRooms.js:54`)が `room.count`(=contribution)を手元に持つので、**lib 側で `stats.adPt` を直接載せる**(uid 無し広告主にも出せる)。
   - 「3 画面で同じ値」の保証: (i) 値は writer(popup)だけが計算し鏡で運ぶ(`laneMirrorContract.js:73-83` の単一書き手不変条件に乗る)、(ii) `composeVenueLaneBuckets`(`venueLaneMirrorSupply.js:125-159`)は**個別列挙で作り直す型**なので `stats`/`pulse` を明示的に引き継ぐ(落とすと黙って消える=`:139-154` の既知の穴)、(iii) 3 経路(popup 直描画 / 鏡復元 / 会場 wrap)で同じ fixture から**同一 outerHTML** になることを vitest で固定(§5.3)、(iv) `venueBar.js` が `laneTileStats`/`laneHeatTracker` を import **しない**ことを wiring test で固定(第二の計算経路を作らせない)。
3. **B/C の「直近」とバッジの寿命**:
   - B(ギフト): 基準は **koken 公式サンプル間の差**(/live/ と同じ原理・同じ lib)。標本時刻は koken storage の取得時刻(`readCardCapturedAtMs(kokenContribStorageKey(lid))` `popup-entry.js:11665` で既に読んでいる値をモジュール変数に控える)。バッジは**次の標本が来るまで残る**(`pulseFor` は同じ capturedAt の再送に前回結果を返す `liveGiftPulse.js:88-89`)。次の標本で増えていなければ消える。間隔 15 分超は差分を出さない(`PULSE_MAX_GAP_MS`)。
   - C(コメント): 基準は **直近 60 秒窓の `commentCount` 増分**(`HOT_WINDOW_MS = 60_000`)。各 paint(3 秒 tick)で uid ごとに前回値との差を時刻付きで積み、窓内の合計 N を `+N件`、tier は `tierForCommentDelta(N)`。初回観測はベースライン(光らせない)。窓を過ぎれば次の paint で自然に消える(タイマーは足さない)。
4. **再描画の単位**: タイルは作り直さない。(a) **鍵を揺らさない**: `storyLaneTierBodyKey`(`renderStoryUserLaneDom.js:302-316`)にも `buildStoryUserLaneRenderSignature`(`storyUserLaneRenderSignature.js`)にも stats/pulse を**入れない**。(b) **属性だけ更新**: `fillLaneTier` の diff-skip 分岐(`:410-414`)で `syncLaneTierPulseInPlace(el, items)` を呼び、作成時に控えた `WeakMap<laneEl, Map<userKey, tileEl>>` から要素を引いて `dataset.stats` / `dataset.pulse` / `classList.toggle` を**値が変わったときだけ**書く(DOM query ゼロ)。(c) popup の「描かない 3 経路」(sig 一致 `:6446`・縮小ガード `:6476`・鏡 skip `:6618`)では paint が走らないので、そこに `syncStoryUserLaneStatsInPlace(els, buckets)` を 1 行ずつ足す。(d) DOM 要素は +0(属性+`::after`)。
5. **段見出しの数字**: 段ごとに「**表示 N人**」= `buckets[tier].length`(=その段の DOM 枚数)。「素性 M」は段別に持っていない(`totalCandidates` は全段合計 `popup-entry.js:6441`)ので、**段別は表示数のみ・全体の「ほか M人」は既存フッター**のまま(`buildStoryUserLaneGuideFootHtml` `storyUserLaneGuideHtml.js:76-85`)。会場の visibleSeats 間引きは**席(装飾)だけ**に効き、段は鏡の全セルを描く(`venueBar.js:5150-5168`・`venueLaneMirrorSupply.js:113-116`)ので、mirror モードでは①=②が同じ N になる。fallback モード(鏡なし)は fallback buckets の長さ(描いた枚数)を出す=描いていない人数を名乗らない。
6. **視覚トークン**: 寸法は**変えない**(Q6 見送り理由は §2.2 G(重))。足すのは色トークン 3 つだけ: `--nl-lane-stats`(内訳の文字色・既存 `.nl-story-userlane-guide__count` の `#9a6f12` と同じ)、`--nl-lane-pulse-gift`(/live/ `--orange #c8721c` 相当)、`--nl-lane-pulse-hot`(同)。mega 段階は `#c02a2a`(/live/ `index.html:244`)。定義場所は `popup.html` の `--nl-lane-accent-*` ブロック(`:68-74`)と dark(`:10412-10418`)の**隣**(末尾ではない=カスケード位置の地雷回避)。会場は `VENUE_CSS` の変数ブロック(`venueBar.js:1124` 付近・`--nl-text-sub` が定義されている場所)に同値を置き、規則本体は `LANE_CSS_SYNC_BEGIN/END`(`:1159-1414`)区間内に写す。
7. **版の分割**: §2.1 の表のとおり 6 版(1562 A+I → 1563 F → 1564 G軽 → 1565 B → 1566 C+E → 1567 D)。各版は単独で出荷可能・単独で戻せる。
8. **検証の定義**: §5。要点=「同一 fixture → popup 経路 / 鏡復元経路 / 会場 wrap 経路 の 3 本で各段タイルの outerHTML(席ラッパを剥いだもの)が**文字列一致**」を vitest で固定し、実機は `/nicolive-selfcheck` で ①の `data-stats` と ②の同 uid タイルの `data-stats` を読み比べ、鏡 `nls_lane_mirror_v2_<lv>` の cell に `stats` が載っていることを storage で確認。ちらつきは `getStoryLaneRepaintCounts()`(`renderStoryUserLaneDom.js:109`)が**stats だけの変化では増えない**ことで判定。

---

## 3. User Stories

| # | シナリオ | 期待(受け入れ条件) |
|---|---|---|
| S1 正常系 | 配信中、A さん(数値ID・サムネあり)がコメント 12 件・ギフト 1,200pt | りんく段の A タイル 3 行目に `🎁1,200 💬12`。①②③で同じ文字列。koken が 30 秒後に 1,700pt を返したら `+500pt` の is-gifted(tier large)が付き、次の標本まで残る |
| S2 空データ | 配信開始直後、koken/nicoad も記録も無い | タイルは従来どおり(属性なし=3 行目は描かれない)。段見出しは「0人」ではなく空段ノート(既存)。脚注は表示枚数 0 のとき出さない |
| S3 koken/nicoad が落ちている | API が 5xx / 形が変わった | `normalizeKokenRankingResponse` が null(`kokenContributionRankingApi.js:155-159`)→ バッファは前回値を温存 → pt は**前回の公開値のまま**、増分は新標本が無いので出ない。💬件は影響なし。例外でレーンが落ちない |
| S4 匿名だけの配信 | 全員 `a:` uid | たぬ姉段の各タイルに `💬N`。C の熱い判定は匿名 uid(番組内で安定・`liveGiftPulse.js:19-21` と同じ前提)でも効く。🎁📣は付かない(公式は匿名に uid を出さない=捏造しない) |
| S5 500 人規模 | たぬ姉 480 人+窓(`nl-story-userlane--windowed`) | DOM 要素は +0。中身 LOD の枠だけタイル(hollow)は属性を持たず、中身が詰まった瞬間に付く。後列(25 枚目以降)は meta が `display:none`(`popup.html:1219-1224`)なので `::after` も見えない=高さ不変。sync は Map 参照 O(n)・DOM 読み取りゼロ |
| S6 reduced-motion | OS 設定で動きを減らす | `is-gifted`/`is-hot` の一発アニメは `animation: none`。輪・色の**静的**強調は残る |
| S7 裏タブ復帰 | popup を 10 分隠してから戻る | 隠れている間は tick が描画をスキップ(`popup-entry.js:21234`・会場が開いていれば publish のみ)。復帰後の最初の paint で窓判定を今の時刻で行うので古い hot は即失効、ギフト増分は「標本間隔 ≤15 分」なら残り、超えれば出ない。溜まったアニメが一斉に動くことは無い(タイマーを持たないため) |
| S8 既存 storage との互換 | v0.1.1561 以前が書いた鏡 / 1562 以降が読む | `stats`/`pulse` が無い cell は属性を付けない=今日と同じ描画。キー名 `nls_lane_mirror_v2` は据え置き(additive)。逆(新鏡を旧コードが読む)も未知フィールドは無視される(`restoreLaneMirrorBuckets` は個別列挙) |
| S9 3 画面で同一 | ①を開いたまま②会場を開き、③別窓も開く | 同 uid のタイルの `data-stats`/`data-pulse`/class が三者で一致。②は鏡を読むだけなので①より最大 180 秒(SOFT 窓)遅れることがあるが、文字列は一致する |
| S10 段見出し | りんく 12 / ギフト 3 / 広告 2 / こん太 5 / たぬ姉 480 | 各帯の末尾に「12人」「3人」「2人」「5人」「480人」。フッターは従来の「いま N 件を表示中（ほか M人）」のまま |
| S11 速度 | 本家コメが 3,266 → 3,310 を 40 秒後に観測 | 「本家コメ 3,310 **+66/分**」。2 標本が 20 秒未満なら出さない。15 分以上空いたら消す |

---

## 4. Implementation Decisions(版ごと)

共通の方針: **ロジックは `src/lib`(純関数・テスト付き)、配線は entry**。popup-entry.js への追加は全版合計 **≤ 60 行**(ラチェット 22,096 に対し現在 21,516)。`buildPersonTileEl`(凍結)は触らず、呼び出し側 `fillLaneTier` で属性を付ける(`dataset.thumb`/`dataset.userKey` と同じ流儀 `renderStoryUserLaneDom.js:474-483`)。

### 版 1562 — A+I 内訳バッジ

**新規 lib `src/lib/laneTileStats.js`**
```js
/** @typedef {{ commentCount: number|null, giftPt: number|null, adPt: number|null }} LaneTileStats */
export function buildLaneTileStatsIndex({ aggregates, kokenRows, nicoadRows }): Map<string /*uid*/, LaneTileStats>
  // aggregates: readonly UserLaneCandidateFromStorage[](commentCount)。kokenRows/nicoadRows: ContributionRankerRow[]|null。
  // uid は officialDomRankingRowsToStripRooms(rows,{userKeyKind}) の userKey が数値のときだけ採用(合成キー __ad_/__anon_ は捨てる)。
export function mergeLaneTileStats(a: LaneTileStats|undefined, b: LaneTileStats|undefined): LaneTileStats|undefined
  // 非 null を優先して合成。全部 null なら undefined(=属性を付けない)。
export function attachLaneTileStats(buckets, index): buckets
  // 5 段すべて map で {...item, stats: mergeLaneTileStats(item.stats, index.get(uid))} の新配列を返す(frozen アイテム対応)。
export function formatLaneTileStats(stats): string
  // '🎁1,200 📣500 💬12'(順序・区切りは liveLaneBuckets.js:21-28 と同じ。formatNumberJa を再利用)。null/0 は省略。全部無ければ ''。
export function laneTileStatsLegendText(): string
  // '🎁📣は公式の公開pt・💬は拡張が記録した件数'
```
**lib 変更(additive)**
- `src/lib/adLanePicksFromRooms.js:116-121`: `stats: { commentCount: null, giftPt: null, adPt: room.count > 0 ? room.count : null }` を追加(uid 無し広告主にも pt が出る)。
- `src/lib/laneMirror.js` `toMirrorCell`(`:107-140`): `stats` が undefined でなければ `stats: { c, g, a }`(null は省略)を載せる。`restoreLaneMirrorBuckets`(`:239-262`): `stats` を復元。`laneSceneContentHash` は**変えない**(uid|displaySrc|title のみ `laneSceneEnvelope.js:33-48`)→ scene 一致判定は不変。`laneMirrorContract.js:195` のセル形コメントを更新。
- `src/lib/venueLaneMirrorSupply.js` `composeVenueLaneBuckets` `:139-154`: `stats: cell?.stats` を追加(**個別列挙の穴**)。
- `src/lib/storyUserLaneGuideHtml.js` `buildStoryUserLaneGuideFootAndRecordedHtml`(`:94-123`): 表示枚数 > 0 のとき `<p class="nl-story-userlane-guide__legend">` に `laneTileStatsLegendText()` を 1 行追加(I)。

**共有レンダラ `src/extension/story/renderStoryUserLaneDom.js`**
- `const _laneTileNodes = new WeakMap<HTMLElement, Map<string, HTMLElement>>()`(段 el → userKey → タイル el)。キーは既存 `venueLaneParityKey(p)`(`venueLaneParity.js:61-69`・`u:uid` / `c:idLine|title`)。
- `function applyLaneTileStatsAttr(tileEl, p)`: `const metaEl = tileEl.lastElementChild`(`personTileDom.js:113-114` で meta が最後に append される凍結前提)。`text = formatLaneTileStats(p.stats)`; 非空なら `metaEl.dataset.stats = text`、空なら `delete metaEl.dataset.stats`。**値が同じなら書かない**。
- `fillLaneTier`: 通常生成(`:470`)と hollow→実体置換(`:450-458`)の両方で `applyLaneTileStatsAttr` を呼び、`_laneTileNodes` に登録。diff-skip 分岐(`:410-414`)で `syncLaneTierStatsInPlace(el, items)`(Map 参照のみ)を呼ぶ。`replaceChildren` 時と `resetStoryUserLaneDom`/`paintStoryUserLaneDomEmptyGuides`(`:366-370`, `:691-695`)で `_laneTileNodes.delete(laneEl)`。
- `export function syncStoryUserLaneStatsInPlace(els, buckets)`: 5 段に対し `syncLaneTierStatsInPlace`。popup の「描かない 3 経路」から呼ぶ。
- `paintStoryUserLaneDomFilled`: 既存どおり(fillLaneTier 内で完結)。

**popup-entry.js(配線・+約 25 行)**
- `renderStoryUserLane` の `buckets.ad = [...adPicks]`(`:6401`)の直後: `const statsIndex = buildLaneTileStatsIndex({ aggregates: STORY_SOURCE_STATE.laneAggregates, kokenRows: _northStarMirrorLanes.contributionRanking, nicoadRows: _northStarMirrorLanes.adRanking }); const bucketsWithStats = attachLaneTileStats(buckets, statsIndex);` 以降 `publishLaneMirror`(`:6437`)と `paintStoryUserLaneDomFilled`(`:6501`)に `bucketsWithStats` を渡す(`laneSig`/`picked` は従来の buckets から=鍵不変)。
- sig 一致 return(`:6446-6454`)・縮小ガード return(`:6476-6484`)・鏡 skip(`:6618` の sig 一致分岐)の直前に `syncStoryUserLaneStatsInPlace(els, bucketsWithStats)` を 1 行。
- `_northStarMirrorLanes` は popup 内の既存変数(`:7217`)。北極星 fetch が OFF(β オプトイン `:9741-9760`)のときは空配列 → pt は null → 💬 だけ出る(正直)。

**CSS(`extension/popup.html`、`[data-thumb="0"] .nl-story-userlane-meta` 規則 `:1150-1153` の直後に置く)**
```css
.nl-story-userlane-meta[data-stats]::after {
  content: attr(data-stats);
  font-size: 9px; font-weight: 700; line-height: 1.2;
  color: var(--nl-lane-stats);
  font-variant-numeric: tabular-nums; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.nl-story-userlane-guide__legend { margin: 2px 0 0; padding: 0 2px; font-size: 10px; color: var(--nl-muted); line-height: 1.35; }
```
トークン: `:root` の `--nl-lane-accent-*` 隣(`:68-74`)に `--nl-lane-stats: #9a6f12;`、dark(`:10412-10418`)に `--nl-lane-stats: #f5d975;`。
- `src/extension/venueBar.js`: 同規則を `LANE_CSS_SYNC_BEGIN/END` 区間(`:1159-1414`)に `.nlsb-venue-lane-stack` 接頭で写し、変数は VENUE_CSS の変数ブロック(`:1124` 付近)へ。
- `app/live-view.html` は `npm run build` が popup.html から再生成する**追跡ファイル**(`scripts/build.mjs:200`)→ 必ず再ビルドしてコミット。
- `.nl-story-userlane-avatar` セレクタに px を書かない(`laneAvatarSize.wiring.test.js` が赤にする)。

**鏡への additive フィールド**: `LaneMirrorCell.stats?: { c?: number, g?: number, a?: number }`(非 null のみ)。1 セル ≤ 30 バイト。512KB フェイルセーフ(`laneMirror.js:49,225-230`)の守備範囲内。

**再描画の単位**: タイル不変・属性のみ・値一致なら無書き込み(§2.3 Q4)。

### 版 1563 — F 段見出しの人数

- `src/lib/storyUserLaneGuideHtml.js:19-66`: 5 つの `buildStoryUserLaneGuide*Html(face, count?)` に additive 第 2 引数。`Number.isFinite(count) && count >= 0` のときだけ `storyUserLaneGuideLine` の本文末尾に `<span class="nl-story-userlane-guide__count">${n}人</span>` を付ける。未指定なら**バイト同一**(既存 8 テストは無変更で緑)。
- `renderStoryUserLaneDom.js` `paintStoryUserLaneDomFilled` の各 `guideLines*.innerHTML = build...(faces.x)` 呼び出し(`:607-640`)に `buckets[tier].length` を渡す(広告は `(buckets.ad || []).length`)。
- 会場は同じ paint(`venueBar.js:5222`・`guides: VENUE_LANE_GUIDES_EXACT_COPY=true`)なので配線追加なし。
- CSS は既存 `.nl-story-userlane-guide__count`(`popup.html:1436`・dark `:10538`)。venueBar の同区間にこのセレクタが既にあることは parity wiring test が固定済み(`venueLaneParity.wiring.test.js:165-175`)。
- 再描画: 人数が変わる=buckets が変わる=どのみち paint が走る回なので追加 churn なし。

### 版 1564 — G(軽) 識別絵の点線枠(CSS のみ)

- `popup.html` `[data-thumb="0"] .nl-story-userlane-avatar` 規則(`:1140-1145`)に `border-style: dashed;` を 1 行。venueBar の同区間にも。寸法は書かない。
- 既存の `.nl-avatar--tv-fallback`(`:1117`)は別物(ゆっくりTV)なので触らない。

### 版 1565 — B ギフト増分バッジ

**lib**
- `src/lib/laneTileStats.js` に追加: `export function pulseRowsFromKokenRows(rows): Array<{ uid: string, point: number }>`(`officialDomRankingRowsToStripRooms(rows,{userKeyKind:'contrib'})` → 数値 userKey のみ)。`createGiftPulseRegistry`(`liveGiftPulse.js:71`)は `pulseRowKey` が `row.uid` を読む(`:25-28`)のでこの形で足りる。
- `export function attachLaneTilePulse(buckets, pulseByUid: Map<uid, {giftDelta, giftTier}>): buckets`(`attachLaneTileStats` と同型・`item.pulse` を additive)。
- `export function formatLaneTilePulse(pulse): { text: string, kind: ''|'gift'|'hot', tier: string }`: gift 優先(`formatPtDelta` `liveGiftPulse.js:108`)、無ければ hot(1566 で使用)。
- `laneMirror.js` toMirrorCell/restore に `pulse?: { g?: number, gt?: string, h?: number, ht?: string }`。`composeVenueLaneBuckets` に `pulse: cell?.pulse`。

**popup-entry.js(+約 12 行)**
- モジュール変数 `const _laneGiftPulse = createGiftPulseRegistry();` と `let _kokenRowsCapturedAtMs = 0;`(`refreshNorthStarContributionRankingLaneAsync` `:11664-11667` で `readCardCapturedAtMs` を読んだ値を控える)。
- `renderStoryUserLane` の attach 直後: `const gp = _laneGiftPulse.pulseFor(liveId, pulseRowsFromKokenRows(_northStarMirrorLanes.contributionRanking), _kokenRowsCapturedAtMs);` → `pulseByUid` を作り `attachLaneTilePulse`。`begin()/end()` は配信切替時だけ(単一配信なので実質 `lives` は 1 件)。

**レンダラ**: `applyLaneTilePulseAttr(tileEl, p)`: `{text, kind, tier} = formatLaneTilePulse(p.pulse)`; `tileEl.dataset.pulse = text`(空なら削除)、`tileEl.dataset.pulseTier = tier`(空なら削除)、`classList.toggle('is-gifted', kind==='gift')`、`classList.toggle('is-hot', kind==='hot')`。`syncLaneTierStatsInPlace` が stats と pulse を同時に見る(関数名は `syncLaneTierTileAttrsInPlace` に統一してよい)。

**CSS(`LANE_CSS_SYNC` 対象・popup.html 同ブロック)**
```css
.nl-story-userlane-cell[data-pulse]::after {
  content: attr(data-pulse); margin-left: 2px; padding: 0 5px; border-radius: 999px;
  font-size: 9px; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap;
  background: color-mix(in srgb, var(--nl-lane-pulse-gift) 16%, transparent); color: var(--nl-lane-pulse-gift);
}
.nl-story-userlane-cell.is-gifted { box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-lane-pulse-gift) 55%, transparent); animation: nl-lane-pulse-pop 600ms ease-out 1; }
.nl-story-userlane-cell[data-pulse-tier="mega"] { --nl-lane-pulse-gift: #c02a2a; }
@keyframes nl-lane-pulse-pop { 0% { transform: scale(1); } 40% { transform: scale(1.045); } 100% { transform: scale(1); } }
@media (prefers-reduced-motion: reduce) { .nl-story-userlane-cell.is-gifted, .nl-story-userlane-cell.is-hot { animation: none; } }
```
(scale 1.045 は /live/ と POP の「控えめ」値 `live/index.html:310-319`。アニメは **class 追加時に 1 回**。diff-skip で DOM が不変なら再発火しない。)
トークン `--nl-lane-pulse-gift: #c8721c`(dark `#ffb86c`)。

**裏タブ**: JS タイマー無し。CSS アニメは非表示タブでブラウザが止める。tick は hidden で描画スキップ(`popup-entry.js:21234`)。

### 版 1566 — C(+E) 熱い人

**lib**
- `src/lib/commentDeltaTier.js`(葉・依存ゼロ): `tierForCommentDelta` を `liveMotion.js:143-145` から**移動**し、`liveMotion.js` は re-export(正本 1 つ・/live/ 無変更)。popup に `liveMotion.js` を import しない(`liveRankingView.js` 513 行が bundle に付いてくる)。
- `src/lib/laneHeatTracker.js`:
```js
export const LANE_HEAT_WINDOW_MS = 60_000;
export function createLaneHeatTracker({ windowMs = LANE_HEAT_WINDOW_MS, maxEventsPerUid = 8 } = {})
  // .observe(liveId: string, rows: Array<{ uid: string, commentCount: number }>, nowMs: number)
  //    → Map<uid, { heat: number, tier: 'small'|'medium'|'large'|'mega', lastAt: number }>(heat>0 のみ)
  // 規則: liveId 切替で全消去 / 初回観測はベースライン(heat 0) / 減少は無視(AGENTS §3.6) /
  //       窓外イベントは prune / 今回 rows に居ない uid は windowMs 経過後に忘れる / 乱数・タイマー無し。
```
- `attachLaneTilePulse` に heat を合成(`pulse.heat/heatTier`)。`formatLaneTilePulse` は gift が無いとき `formatCountDelta(heat)`(`liveGiftPulse.js:114`)で `+N件`・kind `'hot'`。

**popup-entry.js(+約 8 行)**: `const _laneHeat = createLaneHeatTracker();` → attach 直前に `_laneHeat.observe(liveId, aggregates.map(a => ({ uid: a.userId, commentCount: a.commentCount })), Date.now())`。鏡 publish は sig 判定より前(`:6437`)なので hidden-but-venue-open でも会場へ届く。

**CSS**: `.nl-story-userlane-cell.is-hot { box-shadow: 0 0 0 2px color-mix(in srgb, var(--nl-lane-pulse-hot) 55%, transparent); animation: nl-lane-pulse-pop 600ms ease-out 1; }`、`.is-hot[data-pulse]::after` の色は `--nl-lane-pulse-hot`。reduced-motion は 1565 の規則が包含。

**E の扱い**: 「初回は光らせない」「増えた人だけ」は tracker の規則で満たす。rank strip は触らない。

### 版 1567 — D コメント速度 `+N/分`

**lib `src/lib/officialCommentRate.js`**(葉・依存ゼロ・≤40 行)
```js
export const RATE_MIN_SPAN_MS = 20_000;   // これ未満の 2 標本では出さない(秒ノイズ)
export const RATE_MAX_GAP_MS = 15 * 60_000; // liveMotion.js:11 と同値
export function createCommentRateTrack()
  // .push(count: number, atMs: number): boolean   値が変わったときだけ標本採用(同値・逆行は捨てる)
  // .ratePerMin(nowMs): number|null              直近 2 標本(span が MIN..MAX)から。減少は null。
  // .reset()
export function formatCommentRate(rate: number|null): string   // '+66/分' / rate<1 は '+0.5/分' / null は ''
```
(/live/ の `formatRatePerMin` は null を「計測中」にするが、チップは狭いので空文字。文言差は意図的。)

**popup-entry.js(+約 10 行)**: `const _officialCommentRate = createCommentRateTrack();` `paintOfficialNicoStatsStrip`(`:9049`)で `digest.comments.isPlaceholder` でなければ `push(officialCommentCount, Date.now())` → `applyChip('officialStatNicoCommentsRate', { text: formatCommentRate(rate), isPlaceholder: text==='' })`。liveId が変わったら `reset()`(`:8738` の null 経路で)。

**popup.html `:11139`**: `<span class="nl-official-nico-stats__val" id="officialStatNicoComments">—</span>` の直後に `<span class="nl-official-nico-stats__rate" id="officialStatNicoCommentsRate" aria-live="off"></span>`。CSS: `.nl-official-nico-stats__rate { font-size: .74em; font-weight: 700; color: var(--nl-lane-pulse-hot); margin-left: 4px; font-variant-numeric: tabular-nums; } .nl-official-nico-stats__rate.is-placeholder { display: none; }`。
`officialNicoStatsStripDigest.js` は**触らない**(`stableKey`/`summaryText` を固定するテスト `officialNicoStatsStripDigest.test.js` が無傷)。

---

## 5. Testing Decisions

### 5.1 vitest(純関数)
- `src/lib/laneTileStats.test.js`: 索引(uid 無し行は入らない・名無しは誰にも付かない・ad と contrib の userKey 種別を取り違えない)/ merge(null は負けて 0 は捏造しない=`formatLaneTileStats({commentCount:0,...})==''`)/ attach(frozen アイテムを壊さず新配列・5 段すべて・`stats` 以外のフィールド不変)/ `pulseRowsFromKokenRows` / `formatLaneTilePulse` の gift 優先。
- `src/lib/laneHeatTracker.test.js`: 初回はベースライン / 60 秒窓の合計 / 窓外 prune / 減少無視 / liveId 切替で消える / rows から消えた uid の忘却 / tier 境界(2,5,10)。
- `src/lib/officialCommentRate.test.js`: 20 秒未満は null / 15 分超は null / 減少は null / 同値 push は不採用 / 書式。
- `src/lib/commentDeltaTier.test.js`: 移動後も `liveMotion.js` から同じ関数が取れる(re-export 固定)。
- `src/lib/laneMirror.test.js` 更新: `:41-45`/`:166-171` の `toEqual` に `stats`/`pulse`(undefined のときはキー無し)。round-trip で `stats` が戻る。`stats` 全 null のセルは `stats` キーを持たない(容量)。
- `src/lib/venueLaneMirrorSupply.test.js` 追加: `composeVenueLaneBuckets` が `stats`/`pulse` を落とさない(**個別列挙の穴**の回帰ガード)。
- `src/lib/storyUserLaneGuideHtml.test.js` 追加: 第 2 引数省略でバイト同一 / 指定で `guide__count` が付く / NaN・負は付かない。

### 5.2 vitest(共有レンダラ・happy-dom)
`src/extension/story/renderStoryUserLaneDom.test.js` に追加:
- stats 付きアイテムで `.nl-story-userlane-meta` に `data-stats` が付く・無しで付かない。
- **同一 items で stats だけ変えて 2 回描く → cell ノードが同一参照のまま(img 破棄なし)・`data-stats` だけ更新・`getStoryLaneRepaintCounts()` が増えない**(ちらつき固定の本丸)。
- 値が同じなら `setAttribute` が呼ばれない(spy)。
- hollow→実体置換後に `data-stats` が付く。
- `is-gifted`/`is-hot` の付け外しと `data-pulse` 更新がその場で起きる。
- `resetStoryUserLaneDom` 後は node map が無効化され、同一 items でも再生成される。

### 5.3 vitest(パリティ・3 画面同一 DOM)
`src/lib/laneTilePresentation.parity.test.js`(happy-dom):
1. fixture buckets(5 段・stats/pulse 入り・匿名/数値混在)。
2. 経路 ①: `paintStoryUserLaneDomFilled(els1, faces, buckets, …)`。
3. 経路 ③: `restoreLaneMirrorBuckets(buildLaneMirrorSnapshot({buckets}))` → paint(els2)。
4. 経路 ②: `composeVenueLaneBuckets({ mirrorBuckets: 同上, seatIndexByUid })` → paint(els3, `{ wrapTileEl: (t)=>{ const s=document.createElement('div'); s.className='nlsb-seat'; s.append(t); return s; }, guides: true }`)。
5. 各段で `querySelectorAll('.nl-story-userlane-cell')` の `outerHTML` 列を比較 → **3 本すべて文字列一致**(席ラッパは外側なので cell の outerHTML には含まれない)。案内帯の `guide__count` も 3 本で一致。
6. 件数で断言(各段の cell 数が fixture と一致・0 件の緑を許さない)。

### 5.4 vitest(wiring・文字列スキャン、既存の `venueLaneParity.wiring.test.js` と同型)
`src/lib/laneTilePresentation.wiring.test.js`:
- popup-entry: `attachLaneTileStats(` が `publishLaneMirror({` より**前**にある / `syncStoryUserLaneStatsInPlace(` が「sig 一致 return」「縮小ガード return」「鏡 skip」の 3 箇所にある(件数 3 で断言) / `import` が `laneTileStats.js`・`laneHeatTracker.js`・`officialCommentRate.js`・`liveGiftPulse.js` を含み、`liveMotion.js` を**含まない**(bundle 肥大防止)。
- venueBar.js: `laneTileStats`/`laneHeatTracker` を import **しない**(第二の計算経路禁止)。`LANE_CSS_SYNC` 区間内に `[data-stats]::after` / `[data-pulse]::after` / `.is-gifted` / `.is-hot` がある。
- popup.html と app/live-view.html の両方に同セレクタと `--nl-lane-stats`/`--nl-lane-pulse-gift`/`--nl-lane-pulse-hot` の定義がある(件数で)。
- `renderStoryUserLaneDom.js` の `storyLaneTierBodyKey` 本体に `stats`/`pulse` が**無い**、`storyUserLaneRenderSignature.js` にも無い(鍵を揺らさない固定)。
- CRLF 正規化してから検査(`venueLaneParity.wiring.test.js:17-21` の地雷)。

### 5.5 変異テスト(手動で 1 回ずつ壊して赤を確認)
| 変異 | 赤くなるべきテスト |
|---|---|
| `applyLaneTileStatsAttr` の「値が同じなら書かない」を外す | 5.2 の setAttribute spy |
| `composeVenueLaneBuckets` から `stats:` を消す | 5.1 supply / 5.3 parity |
| popup の sig 一致 return 前の sync 呼び出しを消す | 5.4 wiring(件数 3→2) |
| `formatLaneTileStats` で 0 を `💬0` と出す | 5.1 honesty |
| `storyLaneTierBodyKey` に `stats` を混ぜる | 5.4 鍵固定 + 5.2 repaint カウント |
| `toMirrorCell` で `stats` を落とす | 5.1 laneMirror round-trip / 5.3 parity |
| heat tracker の初回ベースラインを外す | 5.1 heat「初回は光らない」 |

### 5.6 `/nicolive-selfcheck` 実機確認(何が見えたら完了か)
1. `reload_extension`(install ではない)→ `new_page` で実配信 watch を開く(軽い経路に落ちないため)。
2. storage を太らせる: コメント行(3 uid × 複数件)+ `nls_koken_api_contrib_<lv>` に rows(数値 `userPageUrl` 付き 2 人)+ `nls_nicoad_api_ranking_<lv>`。
3. **①**: `#sceneStoryUserLaneLink .nl-story-userlane-meta[data-stats]` の値が `🎁… 💬…` 形で、件数が投入した行数と一致。
4. **②**: 会場を開き、同 uid の `.nlsb-venue-lane-stack .nl-story-userlane-meta[data-stats]` が①と**文字列一致**。段案内帯の `guide__count` も一致。
5. **鏡**: `chrome.storage.local.get('nls_lane_mirror_v2_<lv>')` の cell に `stats` が載っている(③/会場の供給源の実証)。
6. **ちらつき**: 1 uid にコメントを 1 件追加 → `getStoryLaneRepaintCounts()`(状態速報に出る)が**増えない**のに `data-stats` の件数は +1(=属性更新だけで描けている)。
7. **B**: koken rows を +500pt に書き換え capturedAt を進める → `is-gifted` と `data-pulse="+500pt"`。次の標本で増分なしなら消える。
8. **C**: 60 秒以内に 3 件追加した uid が `is-hot` `+3件`、60 秒放置で消える。
9. **reduced-motion**: `emulate` で reduce → `getComputedStyle(cell).animationName === 'none'`。
10. **性能**: タイル数 N に対し DOM 要素数(`domTreeCensus`/`popupDomCensus` の既存計器)が導入前後で**差 0**。popup バンドル KB(`npm run check:improvement`)の増分を台帳に記録(目安 +4〜6KB。超えたら理由を書く・計器は削らない `improvementHistory.js:95-110` の流儀)。
11. **会場の吹き出し座標**: タイル高さが +1 行分増えた状態でコメント吹き出しがアバター頭上に出る(`positionBubble` は getBoundingClientRect で毎回測る設計=`HANDOFF-venue-equals-lane.md` 穴3。**理論上安全だが必ず目視**)。
12. 出力は表(実測/判定)。再現できた=実機の原因、ではない(スキル §3)。

---

## 6. Out of Scope

- H(匿名同名衝突)・E(rank strip 側)・J(脈拍レーン)・K(X シェア)・G(寸法/順位丸/配色全面)・補間カウンタ・L(§2.2 に理由)。
- ②会場の上部バーへの `+N/分`(レーン外。会場上部に「本家コメ」相当があるかは**未確認**)。
- ギフト pt を `nls_gift_events`(個別イベント `StoredGiftEvent.point` `giftEventStore.js:17-27`)や `nls_gift_users.totalPoints` から合算する案: 公式 koken の公開値と二重の正本になる(AGENTS §3.6「公開値/自前集計の区別」)。今回は**公開値のみ**。koken が取れない配信で「🎁」を出したければ別お題(自前集計と明記する表示が要る)。
- /live/ 側を拡張の段順(`['link','gift','ad','konta','tanu']`)に寄せる話(地図 §2 末尾のとおり対象外)。
- 鏡キーのバージョン更新(`nls_lane_mirror_v2` → v3)。additive で足りる。
- `laneSceneContentHash` への stats 追加。入れると scene 一致判定が「件数は同じなのに不一致」を量産する(揺れるフィールドを混ぜない `laneMirror.js:43-45` の既知地雷)。

---

## 7. Further Notes(地雷)

1. **個別列挙の穴が 3 箇所**: `toMirrorCell`(`laneMirror.js:139`)・`restoreLaneMirrorBuckets`(`:248-253`)・`composeVenueLaneBuckets`(`venueLaneMirrorSupply.js:139-154`)。どれか 1 つ忘れると「①には出るが②③に出ない」を**黙って**起こす(v0.1.1218/1219/1221 の再発類型)。5.3 parity が捕まえる。
2. **`entry` は agg ではない**: 候補の `entry` は合成 `PopupCommentEntry`(`popup-entry.js:6293-6312`)。`commentCount` は `aggregates` から索引で引く。`entry` に足すと `storyUserLaneRenderSignature` の `stableIdOf(entry)` 周りに影響しうる。
3. **鍵を揺らさない**: `storyLaneTierBodyKey`・`buildStoryUserLaneRenderSignature`・`laneSceneContentHash`・`venueLaneParityKey` のどれにも stats/pulse を入れない。入れた瞬間に 6 版かけたちらつき対策(`story-userlane-churn-filllanetier-v1039`)が戻る。
4. **描かない 3 経路**: sig 一致(`:6446`)・縮小ガード(`:6476`)・鏡 skip(`:6618`)は paint を呼ばない。sync を足し忘れると「件数が更新されない」が実機でだけ出る(テストは paint 経路しか通らない)。5.4 が件数 3 で固定。
5. **hollow タイル**には meta が無い(`src/extension/story/laneContentLod.js:141-149`・司令塔が実在確認)。属性は置換後に付ける。置換コールバックが捕まえている `p` は fill 時点の値=次の sync で追いつく。
6. **`metaEl = tileEl.lastElementChild`** は `personTileDom.js:113-114` の append 順に依存。凍結ファイルなので安全だが、characterization test(`personTileDom.test.js`)が順序を固定していることを確認してから使う。
7. **CSS の 3 コピー**: popup.html / venueBar.js(`LANE_CSS_SYNC` 区間内・外に書くと同期テストが素通り) / app/live-view.html(build 生成・追跡)。`npm run build` 後に `git add app/live-view.html` を忘れると CI の `check:tracked-imports` 系ではなく実機で割れる。
8. **venue の CSS 変数**: `.nlsb-venue-lane-stack` は `--nl-*` を自前で持つ(`venueBar.js:1124` 付近)。新トークン 3 つを足し忘れると `var()` が無効→文字が消える(色なし)。
9. **bundle 肥大**: `liveMotion.js` を popup に import しない(`liveRankingView.js` を連れてくる)。`tierForCommentDelta` は葉へ移動して re-export。
10. **koken の capturedAt**: `readCardCapturedAtMs` は async(storage read)。renderStoryUserLane 内で新規 read を足さない(read 回数が支配的 `storage-get-call-count-dominates`)。既存読み(`:11665`)で得た値を控える。
11. **北極星 OFF**: koken/nicoad fetch はオプトイン β(`popup-entry.js:9741-9760`)。OFF の利用者には 💬 しか出ない=仕様。「🎁が出ない」報告はまず ON/OFF を見る。
12. **max-lines**: popup-entry 余地 580 行。本 SPEC の合計 ≤60 行。超えたら lib へ。
13. **laneMirror.test の `toEqual`**(`:41-45,166-171`)は形を完全固定している=1562 で必ず更新する(更新忘れは CI 赤=意図どおり)。
14. **changelog**: 各版 `src/lib/changelog.js` 先頭・summary 35 字以内・`npm run verify:bump`。20 版上限(`split-changelog`・実行後に archive の差分を master+N版の最小形へ戻す。2026-10-05 の手順参照)。
15. **a11y**: `::after` の `content: attr()` は多くの支援技術で読まれるが保証はない。フッターの件数は `aria-live` 付き(`storyUserLaneGuideHtml.js:84`)で補う。必要なら後版で `aria-label` に stats を合流(bodyKey 不関与)。

---

## 未解決の質問(司令塔が裁定済み・冒頭参照)

1. 版 1564 → 出す。 2. uid 無し広告主の 📣pt → 出す。 3. 会場上部バーの `+N/分` → 今回は出さない。 4. 標本時刻 → koken storage の capturedAt(着手時に `readCardCapturedAtMs` の中身を確認)。

## 仕様に根拠がない断定(assumption list)

1. **koken/nicoad の popup 側バッファ `_northStarMirrorLanes`(`popup-entry.js:7217`)が renderStoryUserLane 実行時点で最新の rows を持つ**。publish は allSettled 後の 1 回(`:7229-7232`)だが、合流自体は `mergeNorthStarMirrorLanes` で即時。**タイミング差があっても次 paint(3 秒)で追いつく**想定=未実測。
2. ~~`readCardCapturedAtMs` の中身は未読~~ → 司令塔が確認済み(冒頭の裁定 4)。解消。
3. 公式 `commentCount`(programStats・watch DOM の data-value)が `paintOfficialNicoStatsStrip` を通して**20 秒以内の粒度で更新される**(呼び出し周期 `:2327` `:12879` は未計測)。粗ければ `+N/分` の更新も粗くなるだけで壊れはしない。
4. 会場の吹き出し/ギフト投げ座標はタイル高さ変化に追従する(`HANDOFF-venue-equals-lane.md` 穴3「getBoundingClientRect で毎回測る」を根拠。実機目視は必須=5.6-11)。
5. 匿名同名衝突(H)が拡張で実害になる頻度は低い(idLine の `a:XXXX…` が既にある)。未計測。
6. `content: attr()` の `::after` が flex 列(`.nl-story-userlane-meta` は `display:flex; flex-direction:column`)の 3 行目として期待どおり並ぶ(標準挙動。happy-dom では検証できず実機で確認)。
7. 鏡に `stats`/`pulse` を足しても 500 人規模で +15KB 程度に収まり 512KB フェイルセーフは発動しない(1 セル ≤30 バイトの概算・未実測)。
