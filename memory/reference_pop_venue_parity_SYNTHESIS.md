# 設計正本: ①POP応援レーンと会場モードのメンバー完全一致(鏡優先+同型フォールバック)

- 設計=Fable(claude-fable-5) / 裏取り=司令塔(Opus) / 2026-07-08
- 3段構えワークフロー(会議4体→Fable設計→実装引き継ぎ)の手順2産物
- 素材=会議(gemma4/qwen3-32b/qwen3.6-27b/gpt-oss-120b+統合)+Explore地雷調査+司令塔実コード裏取り
- 実装ハンドオフ: [HANDOFF-pop-venue-parity-IMPL.md](../HANDOFF-pop-venue-parity-IMPL.md)
- 司令塔の実在裏取り済み: KEY_LANE_MIRROR='nls_lane_mirror_v1'(laneMirrorKey.js:11)・restoreLaneMirrorBuckets(laneMirror.js:105)・publishLaneMirror(popup-entry.js:6804/7253)・①embed=popup.htmlのiframe=別JSコンテキスト(content-entry.js:3053付近CSSコメントで確認)・VENUE_ROSTER_ENABLED=false(venueBar.js:53・v0.1.789以降)

---

# 設計書: ①POP応援レーンと会場モードのメンバー完全一致アーキテクチャ

作成: claude-fable-5 / 2026-07-08 / 対象リポ master v0.1.1110
根拠: ブリーフ(fable-brief-pop-venue-parity.md) + 実コード実読(下記引用はすべて実在確認済み)

---

## 0. 一致の「定義」(最初に確定・すべての判定はこれに従う)

**正本 = ①POPが最後に実paintした5段buckets、その物理的実体 = `KEY_LANE_MIRROR`(`nls_lane_mirror_v1`・src/lib/laneMirrorKey.js:11)。**

laneMirrorKey.js:5 は既に「会場をいじる前に『POP に並ぶべきもの』を正本として診断に映し、会場のズレを後で突合する土台にする」と自ら宣言している。この鏡は publishLaneMirror(popup-entry.js:6804, 7253)が paint 直後の確定 buckets(gift/ad 込み)から作り、buildPersonTileEl が読む5フィールドだけを cap200・512KB 自衛付きで保持する(laneMirror.js:28-98)。**一致の正本を新設しない。既にあるものを正本に昇格させる。**

会場の表示メンバーは次の**3層**で定義し、層ごとに一致規則を変える:

| 層 | 中身 | 一致規則 |
|---|---|---|
| **P層(プレフィックス)** | 鏡の5段(link/gift/ad/konta/tanu)そのもの | 段ごとに**集合も順序もbyte一致**(userId列が同一。ad段等uid無しは idLine+title で照合) |
| **T層(tail・cap溢れ)** | ①が limit=200(popup-entry.js:6566)で切った残り。会場は500席(VENUE_FULLSCREEN_MAX_SEATS)まで各段末尾に継ぎ足す | 「①の cap 外」と機械分類できれば**一致扱い**(件数を1行に明記)。並びは Phase2 で同一comparator保証 |
| **X層(transient発言者)** | 鏡にまだ居ない直近発言者(mergeSpeakersIntoVenueRows・venueSpeech.js:177)。ライブ感のため即着席 | `_venueTransient` マーク+**60秒の猶予窓**内は「説明済み差分」=緑のまま件数明記。60秒超えて鏡に現れなければ unexplained に昇格=🔴 |

- **cap差の扱い**: cap の正本は①の limit(200)ひとつ。会場500は「T層の長さ」であって別のcapではない。→ cap差という概念自体を消す。「会場=全員500」のユーザー既定方針は T層で満たし、「①も全員表示」は Phase3(容量ゲート付き・L4)で limit を1定数に集約してから一斉に上げる。
- **会場専用要素の除外規則**: 3キャラ常駐(residentsLayer)、額縁フレーム、群衆Canvas、トップNバー、順位バッジ/VIP装飾、吹き出しは**レーンbucketsに入らない構造**なので突合対象外。判定はbucketsのみを見る=構造的に誤検知しない。
- **inlineの表示間引き(L6)**: selectStableVisibleMembers は「レイアウトに収める」層であり、一致判定は**間引き前の段割当列**に対して行う。間引きで隠れた数は token に `visibleShown/logical` で正直に併記。

観測済み不一致への当てはめ: りんく段①40 vs 会場43(13702502 等)は「①の入力合成(avatarObserved・contamination guard・numeric-drop popup-entry.js:6619)と会場の入力合成(venueLaneBuckets.js:61 `avatarObserved:false` 固定 + :53 deriveNicoUserIconUrl を tier 入力に混入)が違う」ことによる**P層違反**、広告段欠落は bucketVenueLaneSeats が `gift:[], ad:[]` を返す未配線(venueLaneBuckets.js:105)による**P層違反**。どちらも本設計の Phase1 で構造的に消える。

なお並び順について実読で確定した好材料: comparator(storyUserLaneSort.js:22)は tier→thumbScore→ID形式→**userId辞書順**の順で比べ、候補は userId で dedupe 済みのため**最終tie-break の entryIndex には原理的に到達しない**。ブリーフの懸念「entryIndex の意味が①(集約順)と会場(lastAt)で違う」は並びに影響しない。並び差の真因は tier/thumbScore の入力差だけに絞られる。

---

## A. 理想の体験フロー(受け入れ基準)

1. **並べて見れば同じ**: watch タブで①POPパネルと会場を同時に開くと、りんく→ギフト→広告→こん太→たぬ姉の5段が**同じ顔ぶれ・同じ順序**で並ぶ(先頭200人はスクショ突合でピクセル単位の同一メンバー)。会場は広告段も①と同じ10人を表示する。
2. **会場はさらに全員**: ①が「ほか M人」と切った人たちが、会場では各段の続きとして座っている(スクロールで全員・500席)。
3. **しゃべった人は即座る**: コメントした人は会場に1秒以内に着席し吹き出す(従来どおり)。数秒〜数十秒後、①のレーンにも同じ人が現れ、両者は同化する。
4. **一致は機械が言い切る**: 状態速報に1行トークンが出る。例:
   `会場一致 ✅鏡(3s前) link40+尾3 gift0 ad10 konta5 tanu152 / 暫定1 / 未説明0`
   未説明差分が1件でもあれば 🔴 とサンプル userId を出す。①パネル未描画時は ⚪fallback と正直に言う(嘘の緑なし)。
5. **3時間配信でも軽い**: 新規の storage 書き込みゼロ・新規の全件再集計ゼロ(既存の書き込み済みデータを読むだけ)。

---

## B. 統合アーキテクチャ(採用: 折衷=A主・B従「鏡優先+同型フォールバック」)

```
┌─①POP popup-entry.js(popup.htmlをcontent-entry.jsがinline iframeとして注入=別JSコンテキスト)
│   paint確定buckets ──publishLaneMirror(:6804)──▶ KEY_LANE_MIRROR(既存・512KB自衛・min-gap3s+合流400ms
│                                                   =mirrorBundleFlushScheduler.js:31, popup-entry.js:7236)
│
├─【新規lib①】venueLaneMirrorSupply.js(純関数)
│   鏡snap ─▶ P層rows/buckets + aggregatedCandidatesからT層継ぎ足し + X層マーキング
│
├─会場 venueBar.js(content script / venue.html 別窓 — どちらも chrome.storage 直読可)
│   storage.onChanged(既存リスナーに KEY_LANE_MIRROR 分岐を追加・newValue直採用=追加readゼロ)
│   ├ 鏡が新鮮(同liveId & age≤180s) → mirror mode: P+T+X で描画
│   └ 鏡なし/stale/別配信        → fallback mode: 既存経路そのまま(venueRowsFromUserLaneCandidates)
│   ↓ どちらも commitDisplay(enrich関所・不変) → renderSeats → paintStoryUserLaneDomFilled+wrapTileEl(不変)
│
└─【新規lib②】venueLaneParity.js(純関数)
    paint に使った snap と実際の段割当列を突合 → venueSeatsDiag(既存キー・publishVenueSeatsDiag 3s min-gap)に同梱 → 状態速報1行
```

**A/B/折衷のどれか: 折衷(鏡=A が主経路、既存ローカル集計=B系 がフォールバック兼T層供給)。理由:**
1. **①の最終描画だけが「ユーザー体感の真実」**(gemma4 の A 論)。特に own-posted/viewer自己合成(popup-entry.js:6586)・contamination guard(:6641)・kokenApi 由来の広告段(:6688)は popup コンテキストの入力(viewerUid・STORY_SOURCE_STATE)に依存し、**会場からは原理的に再構成できない**。B案(純関数共有)をどれだけ頑張っても入力が揃わない=「似て非なる実装」の温床。鏡ならbyte単位で正になる。
2. **容量・重さが実質ゼロ**(制約§3時間配信): 鏡は既に毎≥3秒書かれている。会場は読むだけ、しかも既存 onChanged リスナーの newValue 直採用で追加 read もゼロ。③jsonBlob(112%)には1バイトも足さない。
3. **B の「同一入力→同一出力」論**(gpt-oss)は捨てない: fallback と T層の入力合成を①と同値化する Phase2 として限定採用。ヘッドレス共有ストア案(qwen3.6)は「KEY_LANE_MIRROR が既にそれ」なので新設不要。

コンポーネントは4個: (1)鏡の書き手=**既存・無変更** (2)供給合成lib=新規純関数 (3)会場配線=venueBar.js の2箇所差し替え (4)パリティ計器lib=新規純関数。

---

## C. 具体機構(ファイル/関数/スキーマ)

### C-1. 新規 lib `src/lib/venueLaneMirrorSupply.js`(純関数・TDD)

```js
// 鏡が会場の正本として使えるか(mode判定)。W_softは完璧な診断シート設計と同じ180s。
isLaneMirrorUsableForVenue(snap, liveId, nowMs)
  → { usable: boolean, reason: ''|'absent'|'liveIdMismatch'|'stale'|'empty' }

// P層: 鏡セル→buildVenueSeatingが食えるrows({userId,name,avatar,text,capturedAt,preCount,...})。
//   preCount/preHasGift/preGiftCount は candidatesByUid(会場の既存aggregatedCandidates)からjoin=L7死守。
//   順序=鏡のflatten順を保持。
venueRowsFromLaneMirror(snap, candidatesByUid)

// T層: aggregatedCandidates のうち鏡に居ない人を venueSeatEntryToLaneItem 系で段付けし段末尾へ。
// X層: 鏡に居ない直近発言者rowを _venueTransient:true + firstSeenAt でマーク。
// 出力は paintStoryUserLaneDomFilled がそのまま食えるbuckets(各itemに _venueSeatIndex を
//   seatByKey(`u:${uid}`)から付与。席が無いitem(ad段のuid無し広告主等)はwrapTileElが素通し=既存挙動)。
composeVenueLaneBuckets({ snap, seatByKey, tailItems, transientItems })
```

鏡セルの復元は既存 `restoreLaneMirrorBuckets`(laneMirror.js:105)を再利用する(自作しない)。

### C-2. 新規 lib `src/lib/venueLaneParity.js`(純関数・TDD)

```js
buildVenueLaneParity({ snapUsedForPaint, paintedTierSequences, transientMarks, nowMs })
→ {
  mode: 'mirror'|'fallback',
  mirrorAgeMs, bundleGen,            // bundleGen=buildLegacyMirrorSetPayloadが封筒スタンプ済(mirrorBundleFlushScheduler.js:69)
  mirrorPruned: boolean,             // Σ各段cells < snap.pickedLength → 鏡が512KB自衛でcap半減した縮退検知
  perTier: { link:{pop,prefixOk,tail,transient}, gift:{...}, ad:{...}, konta:{...}, tanu:{...} },
  visibleShown, logicalTotal,        // L6 inline間引きの正直な併記
  unexplained: { count, sampleKeys:[...最大5] },
  verdict: '✅'|'⚪'|'🔴',
  line: '会場一致 ✅鏡(3s前) link40+尾3 gift0 ad10 konta5 tanu152 / 暫定1 / 未説明0'
}
```

照合キー: `userId`、uid が空の広告セルは `idLine + '|' + title`。トークンは既存 `venueSeatsDiag`(venueSeatsDiagKey.js / publishVenueSeatsDiag・3s min-gap)へ**同梱**する(新キーを作らない=mirrors-written-per-key 地雷を増やさない)。サイズ ~1-2KB。

### C-3. venueBar.js の変更(2箇所+リスナー1分岐・描画lib不触)

1. **受信**: `handleStorageChange` に `changes[KEY_LANE_MIRROR]` 分岐を追加。newValue 直採用で閉包 `laneMirrorSnap` を更新→`commitDisplay` 再実行(rAF集約)。open時に1回だけ `chrome.storage.local.get(KEY_LANE_MIRROR)`(catch-up)。
2. **供給差し替え**: aggregateParticipants の `baseRows = venueRowsFromUserLaneCandidates(...)` を「usable なら `venueRowsFromLaneMirror(snap, byUid)` + tail rows、でなければ既存呼び出し」に差し替え。**aggregateParticipants 自体(30秒+バースト+onChanged差分集計)は現状維持**=T層とpreCount供給源+fallback として引き続き必要。追加の全件再集計なし。
3. **段割当差し替え**: renderSeats の `bucketVenueLaneSeats(visibleSeats, ...)` を「mirror mode なら `composeVenueLaneBuckets(...)`、fallback なら既存」に差し替え。paintStoryUserLaneDomFilled / wrapTileEl・enrich関所 commitDisplay・seatNodes プールは**1バイトも触らない**。
4. mergeSpeakersIntoVenueRows は不変。mirror mode では合成時に鏡非在籍の発言者へ `_venueTransient` を付けるだけ。

### C-4. 配線忘れ防止(レジストリ思想の再利用)

`src/lib/venueLaneParity.wiring.test.js`: venueBar.js のソースを読み `composeVenueLaneBuckets(` と `buildVenueLaneParity(` の呼び出しが存在することを assert(v0.1.1106 の丸写しセクションレジストリと同型=配線忘れ=CI赤)。

### C-5. Phase3 用: `src/lib/laneDisplayLimit.js`

`export const STORY_USER_LANE_MAX_TOTAL = 200;` を新設し、popup-entry.js:6566 の limit・publishLaneMirror の cap(:7260)・③鏡 prune 側が同一定数を import。**limit と鏡capの二重管理(v1051-1052の轍=L4)を定数1つに畳む。**

---

## D. 偽陽性潰し(嘘の緑/嘘の赤を出さないロジック)

**嘘の緑の防止:**
1. ✅ は `mode:'mirror'` ∧ `snap.liveId===現配信` ∧ `age≤180s` ∧ 全段プレフィックスbyte一致 ∧ `unexplained===0` の**全条件AND**でのみ出す。fallback は常に ⚪(①未描画/鏡stale)=①一致を主張しない。
2. **TOCTOU排除**: 突合は「diag 時に storage を読み直す」のではなく、**この paint に実際に使った snap の参照**(commitDisplay 時に固定)と実際の段割当列を比べる。鏡が3秒後に更新されていても判定はズレない(mirrors-written-per-key-per-tick の教訓)。
3. **鏡縮退の正直申告**: buildLaneMirrorSnapshot は 512KB 超で cap を半減する(laneMirror.js:91-96)。Σセル数 < pickedLength なら `mirrorPruned:true` とし、✅ でなく「⚪鏡縮退(判定は鏡範囲のみ)」を出す=①の実paintより狭い正本で「完全一致」を騙らない。
4. ✅でも件数が違えば必ず1行に明記(`link40+尾3` の形式)=「嘘つかない」原則の継承。

**嘘の赤の防止:**
1. **cap溢れ(T層)の分類**: 鏡の `pickedLength`/`totalCandidates` を使い「①がcapで出していない人」を unexplained から除外。
2. **transient窓(X層)**: `_venueTransient` かつ firstSeenAt から60秒以内は説明済み。①のpoll(3s)+paint+publish(3s)で通常10秒以内に同化するため60秒は十分な余裕、超えたら🔴に昇格(①側の取りこぼし検知として機能)。
3. **会場専用要素**: 3キャラ・群衆Canvas・トップNバー・順位/VIP装飾はbuckets非経由=判定対象に構造上入らない(§0)。
4. **inline間引き(L6)**: 判定は間引き前の論理段割当に対して行い、`visibleShown/logicalTotal` を併記。間引きを不一致と誤診しない。
5. **uid無しセルの照合**: 広告段(userKeyKind:'ad'・popup-entry.js:6689)は idLine+title で照合し、「uid空=全部不一致」の誤爆を防ぐ。
6. **mode切替の明滅防止**: mode 切替回数を計器化(venueMirrorModeSwitches)。鏡は①生存中≥3秒ごとに更新されるため180s窓でフラップは起きない設計だが、切替が多発したら計器が写す。

---

## E. MVP と Phase 分割(各Phaseに機械的完了判定)

**1つだけ作るなら Phase 0(計器)。** 描画に一切触れず、現在の不一致(43vs40・広告段欠落)が分類付きで🔴に写ることを確認してから直す(会議収束点の踏襲)。根治の最小束は Phase 0+1。

| Phase | 内容 | 完了判定(機械的) |
|---|---|---|
| **0 計器** | venueLaneParity.js 新設(fallback mode 用に現行段割当 vs 鏡 の突合のみ)+ venueSeatsDiag 同梱 + wiring test | `npm run verify:cc` 全緑・新規テスト緑。実配信の状態速報に1行トークンが出て、既知の不一致が **🔴 link: extra3(13702502,…) / ad: pop10 venue0** と分類付きで写る(=計器が真実を言う証明) |
| **1 鏡消費(MVP本体)** | venueLaneMirrorSupply.js 新設 + venueBar.js の供給/段割当2箇所差し替え + onChanged 1分岐 + X層マーク | 同一実配信で token が **✅**(mirror mode・全段プレフィックス一致・広告段10人が会場に出る)。①パネルを閉じて180s後に ⚪fallback へ自動降格・再開で自動復帰。吹き出し/ギフト投げ/読み上げ/順位バッジ/VIP光らせが実機で生存(reality-checker)。renderStoryUserLaneDom.js/personTileDom.js の diff ゼロ |
| **2 fallback/T層の入力パリティ** | venueSeatEntryToLaneItem(venueLaneBuckets.js:36)の tier 入力を①と同値化: (a) avatarObserved を集約値から受ける(venueRowsFromUserLaneCandidates(venueSeats.js:752)が現在落としている→rowに透過) (b) deriveNicoUserIconUrl(:53)を displaySrc 用に残しつつ **tier判定の httpAvatarCandidate から外す** (c) contamination/numeric-drop 規則の適用(broadcasterUid は既存 _bcUidForExclude) | fixtureテスト: 同一候補集合を①経路(explainSupportGridDisplayTier 入力)と会場経路に通し、段別 userId 列が一致。実配信 fallback mode で perTier 差分が overflow/transient 分類のみになる |
| **3 全員表示の一斉cap上げ(別タスク接続)** | laneDisplayLimit.js に定数集約 → 200→500 を1箇所で。**容量ゲート必須(L4)**: (i) cap500 時の KEY_LANE_MIRROR 実測JSON(概算~350KB。512KB自衛内だが**実配信で実測してから**) (ii) ③jsonBlob≤87%(prune はしごの既存閾値) (iii) mirrorPruned が出ないこと | 3条件の実測が全て閾値内・①③会場の3面 token 緑 |

Phase 0-2 の storage 増分: **書き込みキー増ゼロ・既存 venueSeatsDiag に+~2KB のみ**。jsonBlob(112%)には不足。

---

## F. 捨てた案と理由

1. **素のB案(popup-entry.js:6606-6697 の candidates 組み立てループ丸ごと共有lib化)** — 過去会議(venue-lane-mirror-SYNTHESIS PR1)の案だが、当時と状況が変わった: viewerUid/ownPostedUidSet/自己合成レーン/storyGrowthAvatarSrcCandidate/広告picks は popup コンテキスト固有で会場から入力を再構成できず、「同一関数・別入力」で drift が残る。鏡が byte 正本を只で配れる今、丸抽出は工数過多(qwen3-32b の指摘どおり)。入力同値化は Phase2 の3点に限定。
2. **postMessage 直結(v0.1.1092 の nonce 機構流用)** — ①iframe→content script には速いが、**standalone venue.html(別窓)に届かない**。経路が2本になり正本が分裂。storage 鏡なら両方に同一機構で届く。
3. **新設ヘッドレス共有ストア(会議qwen3.6折衷案)** — 思想は採用したが実体は新設しない。KEY_LANE_MIRROR が既にヘッドレス共有ストアそのもの(①のUIライフサイクルから publish 済み・heavy見送り中も前回完全paintを保持=L8)。新キー追加は容量と per-key-per-tick 地雷を増やすだけ。
4. **鏡オンリー(fallback廃止)** — ①パネル未描画/初期化前に会場が空白になる。批判役の刺した穴そのもの。fallback(現行経路)を残す。
5. **会場を200に絞って一致** — ユーザー既定方針「会場=全員500」(venue-all-faces-500)に違反。プレフィックス一致+T層で両立。
6. **①を即500に上げて一致** — jsonBlob112%・鏡512KB の容量計算未実測で先行できない(L4)。Phase3 にゲート付きで隔離。
7. **popup DOM の物理コピー / roster(在席)復活 / segmentLayout.js等の描画lib新分割** — いずれも過去に却下済み(venue-is-popup-clone-SYNTHESIS・v0.1.789ロールバック・HANDOFF-venue-equals-lane)。再提案しない。
8. **発言者即時マージの廃止(完全一致の純化)** — 「しゃべった人が即座る」はニコ生実況(匿名主体)の核体験(venueBar.js:4328-4333)。X層として一致定義に組み込む方が正しい。

## G. 地雷と回避策(L1-L10)

- **L1**: VENUE_ROSTER_ENABLED=false(venueBar.js:53)は不変。roster 休眠コードは本件では**削除しない**(ロールバック保険として残置。削除は Phase2 安定後の別クリーンアップ)。鏡消費は roster と無関係な供給差し替え。
- **L2**: buildPersonTileEl/wrapTileEl 注入点を素通しで使う。composeVenueLaneBuckets は item に `_venueSeatIndex` を付けるだけで DOM 経路は不変=吹き出し/ギフト投げ/順位バッジの座標系無傷。
- **L3**: diff-skip(storyLaneTierBodyKey)は paint 側にあり不触。鏡は≥3秒ごと同内容更新→キー安定→skip が効く。「消す側」も不触+mode切替カウンタを計器に追加。
- **L4**: Phase0-2 は書き込み増ゼロ。Phase3 は laneDisplayLimit.js への定数集約+3実測ゲート(§E)を通過条件にする。鏡capとlimitが同一定数になるため v1051-1052 型の取り残しが構造的に不可能になる。
- **L5**: 供給がどちらのmodeでも必ず commitDisplay を通る(入口は変えない)。enrich は冪等なので鏡由来rowsにも無害。
- **L6**: venueViewport の間引き層は不触。一致判定を間引き前の論理列で行い、表示数は token に併記(§D-4)。
- **L7**: venueRowsFromLaneMirror が aggregatedCandidates から preCount/preHasGift/preGiftCount を join(§C-1)=VIP光らせ/順位バッジのスコア源を落とさない。ユニットテストで固定。
- **L8**: heavy見送り中の鏡=前回完全paint=そのまま正(一致に有利)。「①が一度もpaintしていない開直後」は isLaneMirrorUsableForVenue が absent/stale を返し fallback(現行挙動)で表示→鏡初回publishで自動昇格。空白は発生しない。
- **L9**: 過去却下案(DOM物理コピー/roster復活/過剰lib分割/min(48,cap))は§Fで明示的に不採用。venue-lane-mirror の「抽出PR1」は鏡正本化で置換した(理由も§F-1に明記)。
- **L10**: 会場の広告段は**鏡から受け取る**(snap.ad=①のkokenApi由来picksの写し)=新ソース配線ゼロで欠落が直る。fallback mode では従来どおり ad 空となるが、token が ⚪ と「ad: 鏡なし」を正直に言う。ギフト段も同様(snap.gift)。

**実装役への申し送り**: 着手順は Phase0 から。新規2libは vitest 純関数TDD(fixture=実機の43vs40ケースを再現するモック鏡+候補集合)。venueBar.js への差し替えは2箇所+1分岐に閉じ、`npm run verify:cc` と reality-checker(実機: 吹き出し/ギフト投げ/読み上げ/順位バッジ/mode自動降格・復帰)を各Phaseの出荷ゲートとする。1変更=1 patch bump・反映3手順の併記を忘れない。
