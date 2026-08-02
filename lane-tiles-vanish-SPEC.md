# 応援レーン「サムネが減る」根治仕様(SPEC)

- **設計**: Fable (claude-fable-5) / **地図・裏取り**: 司令塔 (Claude Opus 5) / **日付**: 2026-08-02
- **地図(正本の事実)**: [lane-tiles-vanish-MAP.md](lane-tiles-vanish-MAP.md)
- **前提**: v0.1.1232(上限撤廃+名簿キーパー)出荷済み・[lane-never-drop-SPEC.md](lane-never-drop-SPEC.md)

---

## ★司令塔による裏取り結果(Fable設計後に実コードで検証)

HOWTO の定めにより Fable の主張を検証した。**結果、Fable は司令塔の見落とし2件を正しく指摘し、
司令塔の分析の誤り1件を訂正した。** 以下すべて実コードで確認済み。

### 検証1: ★「穴3」は実在する — **司令塔が作り込んだバグ**(最重要)

Fable の指摘「`lid=''` の窓で名簿が全消去される」は**正しい**。

[laneRosterKeeper.js](src/lib/laneRosterKeeper.js) の該当箇所(司令塔が v0.1.1232 で書いた):

```js
// 配信が変わったら名簿をリセット(ユーザーが別番組へ移った=正当な切替)。
if (lid !== state.lid) {
  state.lid = lid;
  state.rows = new Map();   // ★lid='' でもここに来る = 名簿が全消去される
```

**空文字は「配信が変わった」ではなく「不明」なのに、区別していなかった。**

リセット窓の実在も確認: [popup-entry.js:8989](src/extension/popup-entry.js)

```js
if (!hasWatch) {                      // watch タブが取れないとき
  syncStorySourceEntries('', []);     // ★liveId が空になる窓が開く
```

→ この瞬間に `renderStoryUserLane()` が走ると名簿が消え、直後の fallback が
取り込み途中(実測20%)の少ない供給で名簿を作り直す = **同一配信なのにタイルが減る。**

→ **司令塔のテストにも `lid=''` のケースが無かった**(`laneRosterKeeper.test.js` を確認)。テストの穴。

### 検証2: ★司令塔の「72%」は誤算だった — Fable の補正1が正しい

司令塔は「観測された縮小 36→26 = 72% なので閾値 0.6 では守れない」と分析したが、
**これは時点の違う数字(鏡37秒前 / DOM77秒前)を割ったもの**で、地図§2 で司令塔自身が
「時点差を症状扱いするな」と警告した過ちを、司令塔自身が犯していた。

実際の検知器は [storyUserLaneRenderProbe.js:468](src/lib/storyUserLaneRenderProbe.js):

```js
export function detectStoryUserLaneShrink(els, nextTileCount, ratio = 0.6) {
```

**既定 ratio は 0.6。** つまり `shrinkDetectedCount=1` は「**実際に 60%未満の縮小が起きた**」ことを
意味する。72% ではない。**観測された事象は穴1+穴3で説明がつく。**

→ 閾値厳格化(論点B)の根拠は「観測値」ではなく「**不変条件と名簿の単調性**」に置くべき、という
Fable の判断が正しい。仕様本文もそう書かれている。

### 検証3: ①=③一致が DOM を見ていない(地図§3)は確定

[liveviewPublishSelfDiag.js:294](src/lib/liveviewPublishSelfDiag.js) の `lanePicked` は
`lane.pickedLength`(鏡の値)。コメント自身が「同じ buckets 由来なので一致が正常」と認めている。
**鏡と鏡を比べており DOM を見ていない。**

### 検証4: `会場一致 ①DOM=鏡` は DOM を見ている(地図§7-1 / Fable A-4 を解消)

[venueLaneParity.js:396-413](src/lib/venueLaneParity.js) に
「v3 DOMセグメント: 一致なら『DOM=データ(幽N)』」とあり、**こちらは実DOMを見ている**。
→ Fable が Out of Scope に送った A-4 は**解決済み**。会場側の検証は健全で、
問題は §3 の `liveviewPublishSelfDiag` 側だけ。

### 司令塔の結論

**MVP は Fable の Patch 0+2+3。ただし優先度は Patch 3 > Patch 2。**
穴3 は司令塔が作り込んだ実在のバグ(検証1)で、観測された症状を最もよく説明する。
Patch 2(閾値厳格化)は不変条件からの正当な強化だが、観測値がその必要性を証明したわけではない
(検証2)。**Patch 3 を先に、Patch 2 を同時に**入れるのが妥当。

---

以下、Fable による設計本文(原文のまま。上記の裏取りを反映して読むこと)。

---

# lane-tiles-vanish-SPEC.md — 応援レーン「サムネが減る」根治仕様

- **最上位不変条件(ユーザー確定)**: 「その配信に来た人は、増えることはあっても、減って消えることは絶対にない」

---

## 1. Problem Statement

### 1.1 何が起きたか

実配信 lv351091198(v0.1.1232)で、ユーザーが「はじめ見たときよりレーン表示のサムネが減っている」と目視報告。計器も `shrinkDetectedCount=1 / provisionalFalseCount=1` を記録し、「縮小しているのにガードが素通り(provisional=false)」と自己申告した。

### 1.2 なぜ問題か(ユーザー体験)

応援レーンは「来てくれた人が積み上がっていく」ことが製品の約束そのもの(KimitoLink の理念=一度来た人を消さない)。サムネが減る現象は、この約束の**見える形での破綻**であり、配信者の信頼を直接損なう。さらに深刻なのは、整合チェックが「①POP 36 / ③WEB鏡 36 ✅一致」と**緑を出しながら**画面が減っていたこと。緑の信頼性が崩れると、以後すべての「✅」が疑わしくなる(§3 で対処)。

### 1.3 どの層のバグか

- 上限撤廃・名簿キーパー(v0.1.1232)は `droppedTotal=0 / cappedOutTotal=0` で無罪確定。
- 消えたのは **DOM 描画層**: `renderStoryUserLane()` の縮小ガード(`shouldKeepStoryUserLaneTilesOnShrink`)が働くべき場面で働かず、少ないタイルで上書きされた。

### 1.4 本仕様が特定した消える経路(3つ)

| 穴 | 経路 | 状態 |
|---|---|---|
| 穴1 | storage fallback が `provisional` 未申告(popup-entry.js:14940) | **司令塔修正済み(未コミット)・本仕様は妥当と評価**(§2-C-1) |
| 穴2 | 閾値 0.6 では 60%以上の縮小しか守れない(renderStoryUserLaneDom.js:186) | 本仕様 Patch 2 |
| **穴3(本設計で新発見)** | `syncStorySourceEntries('', [])` リセット中(liveId='')に別トリガの `renderStoryUserLane()` が走ると、**名簿が全消去され(laneRosterKeeper.js の lid 不一致リセット)+ DOM が空ガイドで畳まれる**(`shouldKeepStoryUserLaneTilesOnEmpty` が cur='' で false=畳む)。直後の fallback が取り込み途中(20%)の少ない供給で名簿を作り直す=**同一配信なのに減ることが正当化されてしまう** | 本仕様 Patch 3。★司令塔が実コードで実在を確認(冒頭 検証1) |

穴3 の根拠: `renderStoryUserLane()` はギフト経路等から `syncStorySourceEntries` を経由せず直接呼ばれる。`sync('', [])` は renderCharacterScene(:8989)・refresh の no-watch 経路(:15695, :15807)で発火し、`STORY_SOURCE_STATE.liveId=''` の窓が開く。この窓で render が走ると、picked=空 → notePaintDecision が **shrinkDetected=true / provisional=false / guardHit=false(lid 不一致)** を刻む——**観測された計器値(shrinkDetected=1, provisionalFalse=1)と正確に同型**。穴1 の修正だけではこの経路は塞がらない(guard は lid 不一致で必ず素通りする)。

---

## 2. Solution — 地図§8 A〜F への回答

方針の一言: **「暫定を疑い、確定を信じ、不明では何も壊さない。ただし出口は時間で保証する」**。

### A. 「①=③一致 ✅」が画面を保証していない問題 → **検証は残し、名前を正直にし、DOM を見る行を1つ足す**

- 鏡同士の突合(liveviewPublishSelfDiag.js:294-301)は「buckets→鏡 publish でセルが捨てられていないか」を守る**publish 整合の検証**であり、過去に実害(③WEBでレーン欠け)を捕まえた実績がある。**廃止しない**。
- ただし表示文言が「①POP」を名乗るのは誇大。**ラベルを「①鏡=③鏡(publish整合・画面は含まず)」に変更**する(文言のみ・判定ロジック不変)。
- **DOM を見る行を追加する**。鍵は既に配線済みの事実: popup-entry.js:6944-6945 で「paint と同じ同期フレーム」で `measureLaneDomSelf(els)` を測り、鏡 payload に `domSelf` として publish している(laneMirror.js:139・venueLaneParity.js:241 が既に消費)。つまり **鏡スナップショット内の `domSelf`(①実DOM) と `pickedLength`(①鏡) は同一フレームの値**であり、TOCTOU は既に解決されている。新しい検証「①DOM=①鏡」はこの2値を突合するだけでよい。paint 見送り時(ガード発動)は publish 自体が走らない(return が publish より前)ため、鏡は常に「実際に描いたフレーム」の整合したペアを持つ。
- 旧鏡(domSelf 無し)は venueLaneParity と同じ流儀で「⚪ ①DOM未計測」として沈黙(誤検知ゼロ最優先の家風に従う)。
- **却下した代替案**: (a)一致検証の文言修正だけ → 「緑なのに壊れている」が再発し続けるため不足。(b)publish と別タイミングで DOM を再計測して突合 → TOCTOU を新規に持ち込む上、既にある同期フレーム計測を無視して二重実装になる。

### B. 縮小ガードの閾値 → **(a)厳格化: 暫定中は1枚でも減ったら守る(next < prev)**

- **根拠1(前提の変化)**: 名簿キーパー(laneRosterKeeper.js)導入で、ユーザー段(りんく/こん太/たぬ姉)の picked は同一配信・同一セッション内で単調増加。「暫定供給で正当に減る」ケースは原理的に gift/ad 段の入れ替わりだけになった。0.6 という割合で妥協する根拠(そもそも commit 27cf7b30 にも根拠の記載なし=司令塔確認済み)は失われた。
- **根拠2(不変条件)**: 「1枚でも減って見えたら破綻」がユーザーの定義。95% は「微減だから許す」ではなく「5%の人が消えた」。
- **既存テスト書き換えの正当性**: 「微減(200→190=95%)は keep=false」(renderStoryUserLaneDom.test.js:225-227)は、名簿導入**前**の世界で「暫定でも進捗は見せたい」という妥協を明文化したもの。名簿導入後は進捗(増加・同数・内容変化)は全て `next >= prev` で通るため、この妥協で得られるものが無くなった。**契約変更として明示的に書き換える**(§5 T-1)。
- **★固着地雷(commit 27cf7b30 段A)との両立**: 固着の真因は「**暫定の短い候補が完全描画を上書き退化**」= ガードが働かなかった側の事故。厳格化はガードの発動域を**広げる**方向であり、固着防止を弱めない(むしろ強める)。固着を防ぐもう1つの柱「keep 時に sig を更新しない → settle 後の本描画は sig 不一致で必ず通る」(popup-entry.js:6906-6924)は**一切触らない**。段B(heavyChunkReadReuse)も不触。両立はテストで二方向とも固定する(§5 T-3)。
- **地図への軽微な訂正(E とも関連)**: 「観測された縮小 36→26=72%」は鏡(37秒前)と DOM(77秒前)の**時点差込みの算術**であり、閾値設計の根拠に使えない(§2 の警告が自分自身にも当たる)。一方、計器の `shrinkDetectedCount=1` は既定 ratio=0.6 の検知器(storyUserLaneRenderProbe.js:468)が発火した=**実際に起きた縮小は60%未満**だった。つまり観測済み事象は穴1+穴3で塞がる。厳格化の正当性は観測値ではなく**不変条件と名簿の単調性**に置く。

### C. 「確定なら無条件で描く」1行目は正しいか → **正しい。維持する。ただし出口を三層+時間上限で明文化する**

確定(settled)を信じない設計にすると、古い表示を捨てる契機が消え「増える一方で永久に減らない」=別の不具合(タブ汚染・配信をまたいだ残骸)になる。信頼境界は `watchPopupHeavyCommentsSettled`(heavy 全件読了)に置き続けるのが正しい。名簿がある今、**settled 供給でユーザー段が減ることは原理的に起きない**(減ったらそれは名簿のバグ=検知すべき異常)ので、「確定を信じる」ことのリスクは gift/ad 段の正当な入れ替わりに限定されている。

**古い表示を捨てる出口(4つ・優先順)**:

1. **settle した本描画**(既存・主出口): ガード1行目で必ず通る。keep 時に sig を更新しない既存設計がこの出口の到達を保証する。
2. **配信切替**(既存): lid が**別の実配信**に変わったら畳む。★穴3対応で「lid=''(不明)」は切替と**みなさない**ように変更(§4 Patch 3)。
3. **供給の回復**(構造上の出口): `next >= prev` の paint は常に通る。名簿の単調性により、取り込みが進めば必ずここに戻る。
4. **時間上限(新設・病理時の非常口)**: keep が同一配信で**連続 10 分**(`STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 600_000`)続いたら、縮小でも描く(fail-open へ転落)+計器 `shrinkKeepExpiredCount` を刻んで状態速報に⚠を出す。settle しない経路が万一あっても、古い表示が永久に残ることはない。10分の根拠: 大配信 backfill(実測 20%・残640件)は分単位で続くため短すぎると症状が再発する。不変条件は「stale > 縮小」を選好するので長めに倒し、値は export 定数として調整可能にする。

### D. provisional の既定値 → **true(fail-closed)へ変更。ただし実運用の防波堤は配線テスト**

- 「無指定=false(確定)」は申告漏れが**静かにタイル消失**になる設計で、実際に穴1が起きた。既定 true なら、将来の申告漏れの最悪ケースは「最長10分の stale(出口4で回復)」に格下げされる。**壊れる方向が不変条件に沿う**のが fail-closed の価値。
- 影響評価: 供給を渡す3経路(:7226/:14940/:16527)は全て明示済み(既定値に依存しない)。空リセット4箇所(`sync('', [])`)は entriesProvisional=true になるが、ガードは lid 実一致が必要なため描画結果は不変(むしろ穴3対応と整合)。計器 `lastProvisional/provisionalTrue/FalseCount` の内訳が変わる点のみ状態速報の読み手に影響(§6 地雷5)。
- 既定値変更だけに頼らない: 司令塔が入れた配線テスト(「供給を渡す呼び出しは provisional を明示」)を**恒久ゲート**として維持し、既定値は最後の safety net という位置づけにする。

### E. 数字の食い違い(26/36/18/25)の扱い → **司令塔の判定「計測時点差であり症状ではない」は妥当。2点だけ補正**

- 妥当性の検証: 名簿25は popup 起動0.4秒後の値・鏡36は37秒前・速報自身が「起動直後はゼロや未観測でも正常」と警告している。これを症状として仕様化しなかった判断は正しい(誤った仕様を防いだ)。
- **補正1**: 司令塔自身も §5 穴2 で「36→26=72%」と時点差込みの2値を割り算して閾値の議論に使った。これは§2 の自らの警告に反する(悪意なき混同)。本仕様は閾値変更の根拠を観測算術から切り離した(上記B)。
- **補正2**: 「popup 起動0.4秒後の診断が残っている」こと自体が、**名簿と DOM がインメモリで popup 再起動を生き延びない**という構造的ギャップの証拠。これは本バグの症状ではないが、不変条件を「popup を閉じて開き直しても」守るには名簿の永続化が要る(§6 Out of Scope・次段候補として明記)。
- 速報の見せ方: 各数値に計測時点を刻み、時点が違う数値を同じ表に並べる際は「⚠ 別時点・直接比較不可」の注記を出す(Patch 6・任意)。

### F. 退行検知 → **純関数テスト+配線テスト+「シナリオ台本」テストの3層。実配信は計器で追認**

DOM を伴うが、ガード判定・名簿・paint はすべて純関数/準純関数に切り出し済みなので、**happy-dom 上のシナリオテストで「減らない」と「固着しない」を同時に固定できる**(§5 T-3 が要)。実配信でしか出ない race(onChanged vs poll)は再現を狙わず、計器(`shrinkKeepExpiredCount` / `emptyLidRenderCount` 新設)で本番追認する——この家風(診断先行)は本リポで確立済み。

---

## 3. User Stories

| # | シナリオ | 期待挙動 |
|---|---|---|
| S1 | **正常系**: 配信視聴中、コメントが増える | タイルは増える or 同数で内容更新。減らない |
| S2 | **空の状態**: 初回起動・保存ゼロ | 空ガイド(キャラ案内)を表示。ガードは prev=0 で不干渉 |
| S3 | **読み込み中(backfill 谷間)**: 取り込み20%で fallback/軽量供給が短い候補を出す | provisional=true 申告済み+厳格ガードで前回描画を keep。取り込みが進み next>=prev になった時点で自然に更新(出口3) |
| S4 | **失敗と再試行**: heavy が race/stall で settle しない | keep が続くが最長10分で出口4が開き、縮小描画+⚠計器。以後も3秒 poll で回復を試み続ける |
| S5 | **古いデータとの互換**: domSelf を持たない旧鏡を status/③が読む | 新検証は「⚪ ①DOM未計測」で沈黙(🔴を出さない)。既存検証は文言変更のみで判定不変 |
| S6 | **別画面との競合**: ③WEB鏡・会場・status は本変更の影響を受けるか | 鏡の publish 条件・payload 構造は不変(ラベル文言と検証行の追加のみ)。keep 時に publish しない挙動も従来どおり=③は常に「最後に実際に描いた整合ペア」を映す |
| S7 | **配信切替**: lv1 視聴→lv2 へ移動 | 名簿リセット+畳んで新配信を描く(従来どおり)。**lid=''(URL 不明の谷間)は切替扱いしない**=名簿も DOM も守られ、watch に戻れば同一配信として継続 |
| S8 | **popup 再起動**: 閉じて開き直す | 名簿・DOM は消える(インメモリ)。fallback が nls_comments から復元するが、取り込み途中なら起動直後は少なく見え得る。**本仕様の範囲では在席保証しない**(Out of Scope・永続化は次段)。ただし穴3修正により「開いたまま減る」ことは無くなる |
| S9 | **固着の再発防止(27cf7b30 の地雷)**: 大配信+backfill で暫定の短い候補が連発 | keep で完全描画を守り(強化)、settle 後の本描画は sig 不一致で必ず通る(不変)。「たぬ姉段固着」は再発しない |

---

## 4. Implementation Decisions

**Patch 0(最初に行う)**: 司令塔の未コミット修正(popup-entry.js:14940 + laneShrinkGuardWiring.test.js)をそのままコミットする。評価: 妥当。fallback は取り込み途中でも走る=本質的に暫定、という認定に同意。ただし単独では穴3を塞がない(本仕様 §1.4)。

以降、**1変更=patch 1つ・各 patch で `npm run verify:bump`**(AGENTS.md §12.1/§12.5)。

### Patch 2: ガード厳格化+時間上限の出口(renderStoryUserLaneDom.js / popup-entry.js / storyUserLaneRenderProbe.js)

`src/extension/story/renderStoryUserLaneDom.js`:

```js
// 変更: 判定式のみ(シグネチャ不変)。0.6 比率を廃し「暫定中は1枚でも減ったら守る」。
//   根拠: 名簿キーパー(v0.1.1232)でユーザー段 picked は単調増加=暫定供給の縮小は常に供給の不完全さ。
export function shouldKeepStoryUserLaneTilesOnShrink(
  els, currentLiveId, lastTiledLid, nextTileCount, entriesProvisional
) // 内部: return next < prev;  (旧: next < Math.floor(prev * 0.6))

// 削除: export const STORY_USER_LANE_SHRINK_KEEP_RATIO = 0.6;
//   (参照はテスト2ファイルのみ=同 patch で書き換え)

// 新設: keep が続きすぎたときの非常口(純関数+小さな状態)。
export const STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10 * 60 * 1000;

/** @returns {{ lid: string, firstKeptAtMs: number }} */
export function makeLaneShrinkKeepClock()

/**
 * keep 判定のたびに呼ぶ。wouldKeep=false なら時計リセット。lid が変わったら仕切り直し。
 * 同一 lid で keep が MAX_MS を超えて連続したら true=非常口(縮小でも描く)。
 * @param {{ lid: string, firstKeptAtMs: number }} clock
 * @param {{ liveId?: unknown, wouldKeep: boolean, nowMs: number }} args
 * @returns {boolean} true=期限切れ(keep を解除して描く)
 */
export function laneShrinkKeepExpired(clock, args)
```

`src/extension/popup-entry.js`(:6910 付近・呼び出し側):

```js
const _rawKeep = shouldKeepStoryUserLaneTilesOnShrink(
  els, STORY_SOURCE_STATE.liveId, _storyUserLaneLastTiledLid, nextTileCount, _prov);
const _keepExpired = laneShrinkKeepExpired(_laneShrinkKeepClock,
  { liveId: STORY_SOURCE_STATE.liveId, wouldKeep: _rawKeep, nowMs: Date.now() });
const _shrinkGuardHit = _rawKeep && !_keepExpired;
```

`_laneShrinkKeepClock` はモジュールスコープに `makeLaneShrinkKeepClock()` で1つ。**keep 時に sig を更新しない既存構造(:6915-6924)と `dismissInitialLoadShade` 呼び出しは不触**。

`src/lib/storyUserLaneRenderProbe.js`:
- state に `shrinkKeepExpiredCount: 0` 追加。`notePaintDecision(probe, args)` の args に `expired?: boolean` を追加し、true なら加算+`paintSkipReasons` とは別に速報行「⚠ keep 期限切れで縮小描画 N 回(要調査: settle 不達の疑い)」を `formatStoryUserLaneRenderDiagLines` に追加。
- `detectStoryUserLaneShrink(els, nextTileCount, ratio = 1)` — 既定 ratio を 1 に変更しガードと同義に揃える(0.6 のままだと計器とガードの「縮小」の定義がズレて次の切り分けが again 詰まる)。

### Patch 3: lid=''(不明)を配信切替扱いしない(laneRosterKeeper.js / renderStoryUserLaneDom.js / probe)

`src/lib/laneRosterKeeper.js` — `applyLaneRosterKeeper` 内:

```js
// 変更: lid が空(=URL不明の谷間・sync('',[]) リセット窓)では名簿をリセットしない。
//   リセットは「空でない lid が state.lid と異なる」= 本物の配信切替のときだけ。
if (lid && lid !== state.lid) { /* 既存のリセット処理 */ }
// lid が空のときは state.lid を保持したまま復活合流パスへ落ちる
//   → 空 candidates でも merged=名簿全員が返り、picked が保たれる。
```

`src/extension/story/renderStoryUserLaneDom.js` — `shouldKeepStoryUserLaneTilesOnEmpty` / `shouldKeepStoryUserLaneTilesOnShrink` 共通:

```js
// 旧: if (!cur || cur !== last) return false;
// 新: 「不明」は切替ではない。
if (!last) return false;              // 一度も描いていない=守るものが無い
if (cur && cur !== last) return false; // 本物の配信切替=畳む/描く
// cur が空('') は同一配信の谷間扱い → 以降の実タイル数チェックへ
```

`storyUserLaneRenderProbe.js`: state に `emptyLidRenderCount: 0` 追加。renderStoryUserLane 冒頭で `STORY_SOURCE_STATE.liveId` が空かつ名簿非空なら加算(仮説 A-1 の本番検証計器)。速報行「⚠ lid不明のまま render N 回(旧版なら名簿全消去していた回数)」。

### Patch 4: provisional 既定 fail-closed(popup-entry.js)

```js
// syncStorySourceEntries JSDoc + 実装:
//   旧: 「無指定は false=既存呼び出しは挙動不変」
//   新: 「無指定は true(暫定)=fail-closed。確定供給は provisional: false を明示申告する。
//        申告漏れの最悪ケースはタイル消失(旧)ではなく最長10分のstale(新・出口4で回復)」
STORY_SOURCE_STATE.entriesProvisional = !(opts && opts.provisional === false);
```

配線テスト(供給呼び出しの明示強制)は維持=既定値に実運用で依存しない。

### Patch 5: 自己診断の正直化(liveviewPublishSelfDiag.js)

```js
// 新設(純関数): 同一フレームで測った ①実DOM(domSelf) と ①鏡(pickedLength) の突合。
/**
 * @param {{ measured?: boolean, perTier?: Record<string,{visible:number}> }|null} domSelf
 * @param {number} pickedLength
 * @returns {{ verdict: 'match'|'mismatch'|'unmeasured', reason: string }}
 */
export function judgeLaneDomVsMirror(domSelf, pickedLength)
```

- `domSelf` 無し/`measured!==true` → `unmeasured`(⚪表示・旧鏡互換)。
- `Σ perTier[*].visible === pickedLength` → match、それ以外 mismatch(reason に両値)。
- consistency 配列に行追加: `lane: '応援レーン(①DOM=①鏡・同一フレーム)'`。
- 既存行(:298-300)の `srcLabel: '①POP'` → `'①鏡'` に変更し、reason/コメントに「publish整合のみ・画面(DOM)は保証しない」を明記。判定ロジックは不変。

### Patch 6(任意・P2扱い): 状態速報の時点注記

数値行に計測時点(◯秒前)を常時併記し、時点の異なる値を並べる箇所に「⚠ 別時点・直接比較不可」を出す。実装コスト小だが緊急性は低い。MVP から除外可。

**MVP = Patch 0+2+3(不変条件の直接防衛)。Patch 4+5 は同スプリント推奨、Patch 6 は任意。**

---

## 5. Testing Decisions

vitest・日本語 describe/it の家風に沿う。★印が「減らない」と「固着しない」の両立を守る要。

### T-1: `src/extension/story/renderStoryUserLaneDom.test.js` — shrink describe 書き換え(Patch 2)

- it(`同一lv+暫定+大幅減(200→74)は keep=true(前回の完全描画を守る)`) — 既存維持
- it(`微減(200→199)でも暫定中は keep=true(名簿導入後は1枚の減も供給不完全のしるし)`) — **旧「微減は描く」を反転・契約変更を名前で宣言**
- it(`settled(provisional=false)なら大幅減でも keep=false(正当な減少は描く)`) — 既存維持(固着出口1の防衛)
- it(`同数(200→200)と増加(200→260)は keep=false(進捗は必ず描く)`)
- it(`配信切替(lv不一致)なら keep=false(古い配信を残さない)`) — 既存維持
- it(`lid空('')は切替扱いしない: 暫定+縮小なら keep=true(リセット窓でタイルを守る)`) — Patch 3
- it(`前回タイル0(初回)なら keep=false`) — 既存維持
- describe(`laneShrinkKeepExpired(keep の時間上限=出口4)`)
  - it(`初回 keep で時計が始まり、MAX_MS 以内は false`)
  - it(`同一lvで keep が MAX_MS 超連続したら true(縮小でも描く非常口)`)
  - it(`途中で wouldKeep=false(描けた)なら時計リセット`)
  - it(`lv が変わったら時計は仕切り直し`)

### T-2: `shouldKeepStoryUserLaneTilesOnEmpty`(Patch 3)

- it(`lid空('')+同一配信のタイルありは keep=true(no-url 谷間で畳まない)`)
- it(`本物の切替(lv1→lv2)は従来どおり keep=false`) — 既存維持

### T-3 ★: 新規 `src/extension/story/laneShrinkScenario.test.js` — 台本テスト(減らない×固着しないの両立)

呼び出し側(popup-entry)の判定順序を純関数だけで再現するミニハーネス(paint → guard判定 → keepならpaintしない → sig更新なし相当)で:

- it(`台本A(今回の症状): 完全描画36 → 暫定26 は keep=タイル36のまま → 供給回復37で描画=減らない`)
- it(`台本B(27cf7b30の固着): 完全描画200 → 暫定74連発は全てkeep → settle後74(provisional=false)は必ず描ける=固着しない`)
- it(`台本C(出口4): 暫定縮小keepが10分続いたら描く=永久staleにならない(⚠計器が立つ)`)
- it(`台本D(穴3): lid=''のrenderを挟んでも名簿・タイルが消えない`) — applyLaneRosterKeeper を組み込み、`sync('',[])`相当→空render→fallback相当の順で merged が単調非減少であることを確認

### T-4: `src/lib/laneRosterKeeper.test.js` 追加(Patch 3)

- it(`lid空('')では名簿をリセットしない(不明は切替ではない)`)
- it(`lid空('')+空candidatesでも名簿全員がmergedに載る(picked が保たれる)`)
- it(`本物のlid切替では従来どおり名簿を作り直す`)

### T-5: `src/lib/laneShrinkGuardWiring.test.js` 更新(Patch 2/3)

- 既存3件のうち 0.6 正規表現を `next\s*<\s*prev` に更新
- it(`renderStoryUserLane は laneShrinkKeepExpired を通してから guardHit を決める(非常口の配線)`) — ソース文字列検査
- it(`syncStorySourceEntries の既定は fail-closed(無指定=暫定)`)(Patch 4)

### T-6: `src/lib/liveviewPublishSelfDiag.test.js` 追加(Patch 5)

- it(`①DOM=①鏡: domSelf合計とpickedLength一致でmatch`)
- it(`①DOM=①鏡: 不一致はmismatchで両値をreasonに出す`)
- it(`旧鏡(domSelfなし)はunmeasured=⚪で沈黙(🔴を出さない)`)
- it(`鏡同士の行はラベルが「①鏡」であり画面を名乗らない`)

### T-7: probe(`storyUserLaneRenderProbe.test.js` 追加)

- it(`detectStoryUserLaneShrink 既定はガードと同義(1枚の減も検知)`)
- it(`shrinkKeepExpiredCount / emptyLidRenderCount が速報行に出る`)

実配信の追認: 次の大配信で状態速報の `shrinkDetectedCount`(定義が厳格化される点に注意)・`shrinkKeepCount>0`・`shrinkKeepExpiredCount=0`・`emptyLidRenderCount` を確認。検証は reality-checker に委任(自己採点しない)。

---

## 6. Out of Scope(今回やらない)

1. **名簿の永続化(popup 再起動をまたぐ在席保証)** — chrome.storage.session/鏡からの hydration。不変条件を完全化する次段の最有力候補だが、表示順契約(popup=venue)と容量の設計が別途要る。S8 は既知の限界として明記。
2. **`会場一致 ①DOM=鏡` 等、他の一致検証の総点検** — ★司令塔が裏取りで確認済み: venueLaneParity は実DOMを見ており健全(冒頭 検証4)。よって総点検は不要。
3. **`mirrorCells=18` の正体究明** — 症状との因果が示されていない。
4. **heavy settle 経路そのものの改修**(段B/heavyChunkReadReuse) — 根治済みの層。不触。
5. **③WEB(app/live-view)・会場・status の描画変更** — 鏡 payload・publish 条件は不変。
6. **状態速報の全面リフォーマット** — Patch 6 の注記追加のみ、それ以上はしない。

---

## 7. Further Notes(実装時の地雷)

1. **keep 時に sig を更新しない構造(popup-entry.js:6906-6925)を絶対に崩さない**。これが「settle 後の本描画が必ず通る」= 固着回避と出口1の生命線(v1032 退行の教訓)。
2. **`STORY_USER_LANE_SHRINK_KEEP_RATIO` 削除は import 2箇所(両テスト)を同 patch で更新**。残すと「0.6 がまだ生きている」と誤読される。
3. **配線テストの正規表現はソース実文字列と一致させる**(laneShrinkGuardWiring.test.js はソース文字列検査型。判定式を書き換えたら同時に)。
4. **`detectStoryUserLaneShrink` の既定変更で `shrinkDetectedCount` の意味が変わる**。過去の速報値と比較する際は「v0.1.1234以降は1枚減でもカウント」と読み替えが要る(changelog に明記)。
5. **Patch 4(既定true)は計器の暫定/確定内訳を変える**。`sync('',[])` 4箇所が暫定として数えられるようになる=`provisionalFalseCount` が減って見えるのは仕様。
6. **穴3修正後も `paintStoryUserLaneDomEmptyGuides` へ落ちる正当経路(真の空・切替)は生かす**。OnEmpty の変更は「!cur かつ last あり」の分岐だけに限定。
7. `laneShrinkKeepExpired` の nowMs は `Date.now()`(probe と同じ epoch 系)。performance.now を混ぜない。
8. dist 反映: push しただけでは Chrome に届かない(pull→拡張リロード→watch タブ F5 をユーザーに毎回併記)。
9. 検証は `npm run verify:cc`(`npm run verify` はハング)。失敗時は `.artifacts/verify-cc.log` を Read。
10. AGENTS.md §12.1: 本件は複数ファイル+状態管理に該当。実装者は **Plan 先行**で本 SPEC の patch 分割をそのまま Plan に落とすこと。

---

## 未解決の質問

1. **穴3 は実際に lv351091198 で起きたか** — ★司令塔がコード上の実在は確認済み(冒頭 検証1)。ただし当該配信で発火したかの直接証拠は無い。Patch 3 の `emptyLidRenderCount` が次の実配信で答えを出す。
2. **heavy が settle しないまま10分を超える実配信が存在するか** — 出口4の MAX_MS(10分)の妥当性はこの答えに依存。速報の `shrinkKeepExpiredCount` で観測後に調整。
3. **gift/ad 段は settled 状態で正当に縮小し得るか**(公式ランキングから人が落ちるか) — 落ちないなら「settled でも減=異常」の canary 計器を足す余地がある。
4. **26 と名簿25 の差1の正体** — gift/ad 由来と推測のまま。
5. **名簿永続化(Out of Scope 1)をいつやるか** — S8(popup 再起動)が残る唯一の不変条件破れ。

## 仕様に根拠がない断定(assumption list)

- **A-1**: 穴3 の発火順序(`sync('',[])` の窓で gift 経路等の `renderStoryUserLane()` が割り込む)は、コード構造からの演繹。★司令塔が `laneRosterKeeper.js` のリセット条件と `popup-entry.js:8989` の窓の実在を確認済み(冒頭 検証1)が、当該配信での発火ログは無い。
- **A-2**: `STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10分` は観測に基づかない設計値(「backfill は分単位」「stale > 縮小」からの選好)。
- **A-3**: `buildPersonTileEl` が全タイルに `nl-story-userlane-cell` クラスを付ける前提で `judgeLaneDomVsMirror` の exact match を設計した。実装時に personTileDom.js で要確認。
- **A-4**: ~~`会場一致 ①DOM=鏡` が DOM を見ているという推測は未検証~~ → ★司令塔が [venueLaneParity.js:396-413](src/lib/venueLaneParity.js) で**確認済み・解消**(冒頭 検証4)。
- **A-5**: 観測された shrinkDetected=1 が「60%未満の実縮小」だったという解釈は、検知器の既定 ratio=0.6 からの逆算。★司令塔が [storyUserLaneRenderProbe.js:468](src/lib/storyUserLaneRenderProbe.js) で既定値 0.6 を**確認済み**。ただしその paint の prev/next 実値は記録されていない。
