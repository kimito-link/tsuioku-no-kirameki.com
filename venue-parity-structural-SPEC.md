# venue-parity-structural-SPEC.md — 会場パリティ「何周も再発する構造」への実装仕様

> 設計=Fable / 地図・裏取り=司令塔 / 2026-08-06
> 地図: [venue-parity-structural-MAP.md](venue-parity-structural-MAP.md)（必読・本仕様の事実根拠は全て地図と実コード）

---

## ★司令塔による裏取り結果（2026-08-06・実装前に必読）

Fable の主張を実コードで検証した。**設計は妥当。ただし1点、数値の訂正がある。**

### 確認できた（そのまま実装してよい）

| 主張 | 検証結果 |
|---|---|
| 嘘コメント「会場には一切関係しない」が実在 | ✅ `popup-entry.js` に**1件**実在 |
| 会場の鏡受け入れは2箇所 | ✅ **5635行(catch-up get)** と **5962行(onChanged)** の2箇所で確定 |
| `linkPolicy` は匿名を弾く | ✅ [linkPolicy.js:47](src/domain/lane/columns/linkPolicy.js) `if (isAnonymousStyleNicoUserId(uid)) return false;` |
| `tanuPolicy` は匿名を吸収 | ✅ [tanuPolicy.js:34](src/domain/lane/columns/tanuPolicy.js) `return isAnonymousStyleNicoUserId(uid);` |
| → 既存 tier 法を契約の normative source にできる | ✅ 妥当 |
| 空メッセージ「該当者がいません」は①と共有 | ✅ [storyUserLaneGuideHtml.js:130-154](src/lib/storyUserLaneGuideHtml.js)。会場だけ文言を変える設計（`emptyTextOverrides`）は正しい |

### ★訂正が必要（§4-1 の登録簿リスト）

Fable が挙げた `LANE_MIRROR_CONSUMERS` の初期値は**実際と食い違う**。
実 grep（`laneMirrorKey` を import する非テストファイル）は **11ファイル**:

```
src/extension/popup-entry.js          src/lib/laneMirror.js
src/extension/status-entry.js         src/lib/laneMirrorKey.js
src/extension/venueBar.js             src/lib/mirrorBundleFlushScheduler.js
src/lib/commentTimelineMirrorKey.js   src/lib/mirrorBundleKey.js
src/lib/giftHistoryMirrorKey.js       src/lib/statCardsMirrorKey.js
src/lib/statusExtrasBatch.js
```

- Fable が挙げた `src/lib/watchUrlFreshness.js` は **含まれない**
- 逆に `commentTimelineMirrorKey.js` / `giftHistoryMirrorKey.js` / `statCardsMirrorKey.js` /
  `mirrorBundleKey.js` / `laneMirror.js` / `laneMirrorKey.js` 自身が**漏れている**

★ただし Fable 自身が §4-1 末尾で「実装時に grep で確定させること／テストが正とするのは grep 結果」
と留保しているため、**設計は壊れていない**。実装時は必ず grep 結果を正とすること。

★なお、上記のうち `*MirrorKey.js` 系は「キー定義の相互参照」であって鏡データの読み書きではない
可能性が高い（**未確認**）。登録簿の `role` は実装時に1ファイルずつ実体を確認して付けること。
役割を推測で埋めると、この仕様が防ごうとしている「契約の嘘」を自分で作ることになる。

---

## 1. Problem Statement

会場モードと①パネルの不一致は過去1ヶ月で少なくとも8回設計・修正されたのに、また再発した。
今回の実測（同一配信・同一瞬間）では ①・会場・鏡の3者が三つ巴でずれた（①link12 / 会場link8+匿名混入 / 鏡link7・鏡age656s）。

個別の不一致の下に、**再発を生産し続ける構造**が4つある（地図3章・実コードで裏取り済み）:

1. **契約の不在**: 同一キー `KEY_LANE_MIRROR` について、書き手(popup-entry.js:7019)は
   「会場には一切関係しない」と書き、読み手(venueBar.js:202)は「会場の正本に昇格」と書いている。
   片側の変更がもう片側へ無言で伝播する。これが「直しても直しても再発する」の源泉。
2. **鏡は①が描画したときだけ更新される**: `publishLaneMirror` の呼び出しは
   `renderStoryUserLane` 内の1箇所のみ(popup-entry.js:7023)。Side Panel 移行(v0.1.1275)で
   「①を閉じたまま会場を見る」が普通になり、656秒 stale は SOFT(180s)〜HARD(900s)の
   「意図的に古い鏡を使い続ける谷間」に日常的に落ちる。
3. **読み口が無検査**: `composeVenueLaneBuckets`(venueLaneMirrorSupply.js:125-159)は鏡の段構成を
   そのまま信じ、匿名判定を一切しない。一方 fallback(venueLaneBuckets.js:171)は匿名を弾く。
   経路によって不変条件が変わる＝どの経路を通ったかで画面の「法」が変わる。
4. **原理的な非対称**: ①の gift/ad は tier 判定外の後付け(popup-entry.js:6914,6919)。
   fallback は tier 判定しか持たないので gift/ad を**作れるはずがない**(venueLaneBuckets.js:173 で空配列固定)。
   にもかかわらず会場UIは fallback 時に「該当者がいません」と**知らないことを断定**する。

ユーザー体験への影響: 配信者が会場を映しながら「①では見えている応援者」が会場に出ない・
匿名が出るべきでない段に出る・件数が3画面で食い違う。「どれを信じればいいのか」が壊れる。

## 2. Solution

**方針: データフローは変えない。契約を成文化し、読み口に関所を置き、UIの嘘をやめ、再発をCIで機械検知する。**

v0.1.1111（鏡=会場の正本）・v0.1.1136 C2（SOFT/HARD二段窓）・v0.1.1138（独自受け皿なし）・
v0.1.1234（鏡cap撤廃）の設計判断は全て維持する。地図6章の「壊れうる箇所」には一切触れない。

「まず計器を入れて様子を見る」はしない（直近28版/計器14版の教訓）。本仕様の新規要素は
**強制(enforcement)とテスト**であり、観測ではない。唯一の数値追加（sanitize が落とした件数）は
既存の venueSeatsDiag 1行に載せるフィールド1個で、新しい観測系統ではない。

### 地図8章 Q1〜Q6 への回答

**Q1（契約）**: 新モジュール `src/lib/laneMirrorContract.js` を `KEY_LANE_MIRROR` の**正本契約**とする。
内容＝(a) 消費者登録簿 `LANE_MIRROR_CONSUMERS`（writer/reader を全列挙）、
(b) 段別不変条件（匿名uidは link/konta に入らない＝①自身の tier 法
`linkPolicy.js:47`/`kontaPolicy.js:39` がそのまま normative source。tanu は匿名を吸収する設計
`tanuPolicy.js:34`。uid無しセルは gift/ad のみ許可＝広告主セル）、
(c) capturedAt の意味（壁時計・snapshot identity）、(d) 単一グローバルキーゆえ読み手は必ず liveId 照合。
**会場は鏡を読み続ける**（v0.1.1111 維持。会場が鏡をやめて独自集計に戻る案は、gift/ad が
tier 外後付けである原理的非対称（地図4章）により①と一致し得ないため否決）。
popup-entry.js:7017-7019 の嘘コメント「会場には一切関係しない=popup と status だけ」は**削除**し、
契約モジュールへの参照に置換。CI が登録簿と実際の import を照合する（Q5-①）ので、
「書き手が読者を知らない」状態は構造的に作れなくなる。

**Q2（鏡の陳腐化）**: MVP は **(d) 会場が「古い」ことをユーザーに見せる**。
- (a) 会場自身が publish → **否決**。単一writer原則が壊れる。会場 fallback は gift/ad 空・匿名全除外で
  ①の実paintと異なる法を持つため、それが鏡に混ざると③まで汚染する。
- (b) content が publish → **否決（MVPでは）**。レーン集計パイプライン（roster keeper・sort・bucket・
  gift/ad picks）の二重実装になる。後続 Phase 2 で「①の集計を renderless に動かす offscreen document」
  として再検討する（二重実装ではなく同一コードの移設なら原則に反しない）。
- (c) HARD窓短縮 → **保留**。推測B（v0.1.1275 との因果）が未検証。判定は**新計器を入れず**、
  既存 venueSeatsDiag の `mirrorAgeSec`（venueLaneParity.js:462 で既に毎回出ている）を
  次の実配信**3回分**のコピペから読むだけ。3配信で判定を打ち切る（延長しない）。
  SOFT超が常態なら Phase 2 を起動、稀なら現状維持。
- MVP の (d) 実装: staleButUsable（venueBar.js:5368）のとき会場レーン見出しに
  「①の鏡 N分前（①パネルを開くと更新）」を小さく表示。staleHard→fallback 降格時は
  「①パネル未接続」を表示。**SOFT/HARD の値・降格挙動は1バイトも変えない**（C2維持）。

**Q3（fallback の gift/ad 空配列）**: **維持する**。fallback が gift/ad を作れないのは原理
（tier外後付け）であり、作らせれば「会場独自の受け皿」の復活＝v0.1.1138 に逆行。
代わりに**UIの嘘をやめる**: fallback モード時、gift/ad 段の空メッセージを
「該当者がいません」（＝知らないのに断定）から「①パネル未接続のため表示できません」に変える。
mirror モード時の空は従来どおり「該当者がいません」（鏡が空だと知っている＝正しい断定）。
件数表記も同様: 会場の「応援コメント N件」は実際には段に並べた人数なので
「段に表示中 N人」へ改名（数字の意味を実装に一致させる。①165件との数値統一は Phase 4）。

**Q4（同一tick一貫）**: **今回はスコープ外**（Phase 3）。理由: (i) 今回の三つ巴は鏡age656s
（陳腐化）と fallback 非対称でほぼ説明でき、MVP がそこを塞ぐ。(ii) 書き側は既に
`mirrorBundleFlushScheduler.js` が5鏡を1回の `chrome.storage.local.set` に合流しており
（popup-entry.js:7481-7496）、同一tick化の半分は達成済み。残り半分（読み側が複数キーを
同一世代として採用する仕組み）は①③会場の3実装に跨がる大工事で、1PRの安全範囲を超える。
MVP では契約モジュールに「capturedAt が snapshot identity であり、異なる capturedAt の値を
並べて✅一致を名乗ってはならない」と明文化するに留める（既存 parity は鏡age で既に fail-closed）。

**Q5（再発の機械的ガード）**: 4層。全て「変異で赤を確認するまでが1セット」（§5）。
1. **消費者登録簿テスト**: `src/` 全体を走査し `laneMirrorKey.js` を import する実ファイル一覧と
   `LANE_MIRROR_CONSUMERS` が完全一致することを断言。未登録の新読者/書き手を CI が止める。
2. **round-trip 保存テスト**（実import必須）: `buildLaneMirrorSnapshot` → `restoreLaneMirrorBuckets` →
   `composeVenueLaneBuckets` を本物のコードで通し、5段の集合・順序・全フィールド
   （recentTexts/displaySrc/meta.idLine 等）が落ちないことを断言。
   「個別列挙で作り直す関数が値を落とす」再発バグ類型（[[venue-mirror-is-the-primary-path-2026-08-01]]）の恒久檻。
3. **verdict 不変条件テスト**: 「鏡age>SOFT で✅を名乗れない」「fallback は常に⚪」
   「DOM未計測は⚪」を `buildVenueLaneParity` の実呼び出しで断言（嘘の緑の再発防止を仕様化）。
4. **嘘コメント禁止テスト**: popup-entry.js に「会場には一切関係しない」が存在しないことを断言
   （コメントの再劣化＝契約の再崩壊を文字列レベルで止める）。

**Q6（匿名混入）**: **防止は MVP に含め、発生源調査は別案件に切り出す**。
読み口の関所 `sanitizeLaneMirrorForRead` が link/konta 段の匿名uidセルを落とす（tanu は落とさない＝
①の tier 法と同一）。もし①側が匿名を link に publish していた場合、会場は落とすので
既存 parity の「欠」未説明が**書き手を名指しで**赤にする（=どちらが犯人かは調査せずとも
出荷後の既存診断1行で確定する）。発生源のコード調査は、防止後に実害が消えるため優先度を下げて別案件。

### MVP（1回のPRで安全に出す範囲）

1. `src/lib/laneMirrorContract.js` 新設（契約・登録簿・sanitize 関所）
2. venueBar.js の鏡受け入れ2箇所（onChanged: 5962 / catch-up get: 5630-5635）を関所経由に
3. 嘘コメント削除・両端コメントを契約参照に置換
4. UIの嘘3点（stale表示 / fallback時gift/ad空文言 / 件数ラベル改名）
5. Q5 の4層テスト

## 3. User Stories

- **正常系**: ①がSide Panelで開いていて描画中。鏡age<180s。会場5段は鏡と集合・順序一致。
  匿名は tanu 段のみ。stale 表示なし。
- **空の状態**: 配信開始直後で鏡なし → fallback。link/konta/tanu は席から出る（匿名全除外・従来どおり）。
  gift/ad 段は「①パネル未接続のため表示できません」（「該当者がいません」と嘘をつかない）。
- **読み込み中**: 会場起動直後の catch-up get（最大3秒・venueOpenLatency.js）中は従来挙動のまま。
  sanitize は catch-up 完了時の受け入れ点で1回だけ走る（描画hot pathに入れない）。
- **失敗と再試行**: 鏡が壊れた形（buckets欠落・liveId空）→ sanitize が issues を返し fallback へ
  fail-closed。例外は握りつぶさず issues として venueSeatsDiag の既存行に載る。
- **古いデータとの互換**: 旧版が書いた snapshot（新フィールド無し）も sanitize は受理する
  （additive-only。書き込みペイロードは MVP では変更しない＝旧読者も壊れない）。
- **別画面/別ウィンドウとの競合（本丸）**:
  - ①(active) + 会場 + ③ 同時 → 書き手は①のみ。②/passive は INLINE_PASSIVE で書かない（既存・
    登録簿に role として明記しテストで固定）。
  - 別タブで**別配信**の①が鏡を書く → 単一グローバルキーなので上書きされるが、会場は liveId 照合で
    `liveIdMismatch` → fallback（既存挙動を契約に明文化・テストで固定）。
  - ①を閉じて会場だけ見る（Side Panel 時代の常態）→ 180s超で「①の鏡 N分前」表示、
    900s超で fallback 降格＋「①パネル未接続」。**ユーザーは初めて「なぜずれるか」を画面で知れる**。

## 4. Implementation Decisions

### 4-1. 新規 `src/lib/laneMirrorContract.js`（DOM/chrome 非依存・純関数）

```js
/** KEY_LANE_MIRROR の契約の正本。書き手・読み手はここを import し、登録簿テストが照合する。 */
export const LANE_MIRROR_CONTRACT_VERSION = 1; // コード上の契約版。snapshotには書かない(MVPは書式不変)

/** @type {ReadonlyArray<{file: string, role: 'writer'|'reader'|'reader-batch'|'passive-reader'}>} */
export const LANE_MIRROR_CONSUMERS = [
  { file: 'src/extension/popup-entry.js',  role: 'writer' },          // renderStoryUserLaneの1箇所のみ。INLINE_PASSIVEは書かない
  { file: 'src/extension/status-entry.js', role: 'reader' },
  { file: 'src/extension/venueBar.js',     role: 'reader' },          // v0.1.1111: 会場の正本
  { file: 'src/lib/statusExtrasBatch.js',  role: 'reader-batch' },
  { file: 'src/lib/mirrorBundleFlushScheduler.js', role: 'writer' },  // 合流flushの書き出し口
  { file: 'src/lib/watchUrlFreshness.js',  role: 'reader' }
];

/**
 * 読み口の関所。段別不変条件(匿名はlink/konta不可・uid無しはgift/adのみ)を強制し、
 * 違反セルを落として件数と理由を返す。snapshotの他フィールドは一切触らない(spreadで写す)。
 * @param {unknown} rawSnap
 * @returns {{ snap: object|null, droppedLinkAnon: number, droppedKontaAnon: number,
 *             droppedUnkeyed: number, issues: string[] }}
 */
export function sanitizeLaneMirrorForRead(rawSnap) { /* isAnonymousStyleNicoUserId を domain/user/identity.js から import */ }
```

登録簿の実ファイル一覧は実装時に `laneMirrorKey.js` import の grep で確定させること
（上のリストは司令塔 grep の観測値。テストが正とするのは grep 結果）。

### 4-2. venueBar.js — 受け入れ点2箇所を関所経由に

新ローカル関数（venueBar内・純委譲）:
```js
/** 鏡snapshotの受け入れ関所。onChanged/catch-upの2箇所から必ずこれを通す(wiringテストがtoBe(2)で固定)。 */
function acceptLaneMirrorSnapshot(rawSnap) {
  const r = sanitizeLaneMirrorForRead(rawSnap);
  _laneMirrorSanitizeDropped = r.droppedLinkAnon + r.droppedKontaAnon + r.droppedUnkeyed; // 既存diag行に載せる数値
  return r.snap; // null なら従来の「鏡なし」経路
}
```
- 変更点1: `changes[KEY_LANE_MIRROR]`（:5962 付近）で `laneMirrorSnap = acceptLaneMirrorSnapshot(newValue)`
- 変更点2: catch-up `bag?.[KEY_LANE_MIRROR]`（:5635 付近）も同様
- `composeVenueLaneBuckets`・`venueRowsFromLaneMirror`・parity 突合は**無変更**
  （sanitize 済み snap が渡るだけ。parity は sanitize 前でなく後の snap と突合＝会場が実際に使った正本と突合、
  ①が匿名を書いた場合は既存の「欠」未説明で赤が出る）
- `_laneMirrorSanitizeDropped` は venueSeatsDiag の既存 parity 行末尾に `鏡除外N`（N>0のみ）で併記。
  新規キー・新規観測系統は作らない。

### 4-3. コメント修正（コード挙動不変）

- popup-entry.js:7017-7019: 「会場には一切関係しない=popup と status だけ」を削除し
  「読者は laneMirrorContract.js の LANE_MIRROR_CONSUMERS が正本（会場も読む）」に置換
- venueBar.js:202 と venueLaneMirrorSupply.js 冒頭に「契約: laneMirrorContract.js」参照を追記

### 4-4. UIの嘘3点

1. **stale表示**: 純関数 `venueMirrorAgeNotice(mode, mirrorAgeSec)` を `src/lib/venueLaneMirrorSupply.js` に追加
   （'' | '①の鏡 N分前（①パネルを開くと更新）' | '①パネル未接続' を返す）。venueBar が会場レーン
   ヘッダー既存要素の隣に textContent で出す（新規DOM構築は最小・paint毎のDOM走査禁止の規律に従い
   値が変わったときだけ書く）。
2. **fallback時のgift/ad空文言**: `paintStoryUserLaneDomFilled`/空ガイド描画は①と共有のため**本体は触らない**。
   opts に `emptyTextOverrides?: { gift?: string, ad?: string }` を追加し、venueBar の呼び出しだけが
   fallback 時に渡す（①・③の描画は1バイトも変わらない）。
3. **件数ラベル**: venueBar.js:5979 付近の「記録している応援コメント N 件です」系のうち、
   段人数を数えている表示を「段に表示中 N人」へ。実装時に当該文字列の生成箇所を特定し、
   **数える対象は変えずラベルだけ**変える。

### 4-5. 変更しないもの（明示）

SOFT/HARD の値と二段窓構造・`publishLaneMirror` の呼び出し位置と INLINE_PASSIVE ガード・
鏡cap（撤廃のまま）・`composeVenueLaneBuckets` の復元ロジック・fallback の gift/ad 空配列・
mirrorBundleFlushScheduler・書き込みペイロード書式。

## 5. Testing Decisions

このリポの流儀: **wiring テストは書いた直後に変異（`if(false)`前置・該当行コメントアウト）で
赤になることを確認して初めて1セット**。regex は前後アンカー必須（[[mutation-test-needs-anchored-regex-2026-08-05]]）。
文字列スキャンは「呼び出しが無条件に実行される文」であることまで断言（既知の穴）。

### `src/lib/laneMirrorContract.test.js`（純関数・実import）
- `it('sanitize: link段の匿名uidセルを落とし droppedLinkAnon に数える')`
- `it('sanitize: konta段の匿名uidセルを落とす')`
- `it('sanitize: tanu段の匿名uidセルは落とさない(①のtier法と同一)')`
- `it('sanitize: gift/ad段のuid無しセル(idLine+title広告主)は落とさない')`
- `it('sanitize: link段のuid無しセルは droppedUnkeyed に落とす')`
- `it('sanitize: 正常snapは内容等値で通し recentTexts/displaySrc/meta を落とさない')` ← spread検証
- `it('sanitize: 壊れた形(bucketsなし/liveId空)は snap:null + issues で fail-closed')`
- `it('sanitize: 旧版snapshot(新フィールド無し)を受理する')`

### `src/lib/laneMirrorContract.registry.test.js`
- `it('KEY_LANE_MIRROR(laneMirrorKey.js)をimportする実ファイル一覧が LANE_MIRROR_CONSUMERS と完全一致する')`
  （src/ を fs 走査。**件数も配列等値で断言**＝片方だけの増減を検知）
- `it('popup-entry.js に「会場には一切関係しない」が存在しない')`
- 変異確認: 登録簿から1行消す→赤 / 新ファイルに import を足す→赤

### `src/lib/laneMirrorRoundTrip.test.js`（実import・手書きコピー禁止 [[integration-test-must-import-real-code]]）
- `it('build→restore→compose で5段の集合と順序が保存される')`
- `it('build→restore→compose で displaySrc/title/meta.idLine が落ちない')`
- `it('venueRowsFromLaneMirror で recentTexts/preCount/preGiftCount が落ちない')`
- 変異確認: composeVenueLaneBuckets の rows.push から1フィールド消す→赤

### `src/lib/venueLaneParity.invariants.test.js`
- `it('鏡age>SOFT(180s) では verdict が ✅ にならない')`
- `it('fallback モードは常に ⚪')`
- `it('DOM未計測(mirror・全条件良好)でも ⚪ = fail-closed')`

### `src/lib/venueLaneMirrorSupply.wiring.test.js` へ追加
- `it('venueBar の鏡受け入れは acceptLaneMirrorSnapshot 経由が2箇所(onChanged+catch-up)ある')`
  （`(venueBarSrc.match(/acceptLaneMirrorSnapshot\(/g) || []).length` を **toBe(3)**＝定義1+呼出2。
  [[wiring-test-must-assert-counts-2026-08-04]]。アンカー: onChanged 側は `changes\[KEY_LANE_MIRROR\]` 近傍、
  catch-up 側は `bag\?\.\[KEY_LANE_MIRROR\]` 近傍まで regex に含める）
- `it('venueMirrorAgeNotice: stale帯/staleHard/freshで正しい文言を返す')`（純関数テスト）
- 変異確認: 片方の呼び出しを素の代入に戻す→赤

### 実機確認（reality-checker へ委任・自己採点しない）
- 実配信で会場を開き状態速報コピペ1枚: (1) 鏡stale帯で「①の鏡 N分前」が出る
  (2) fallback で gift/ad 段の文言が変わる (3) `鏡除外N` は通常0。
- 判定は状態速報のコピペで行う（[[feedback-trust-status-report-over-browser-check]]）。

## 6. Out of Scope（後続フェーズ番号つき）

- **Phase 2 — 鏡の鮮度アーキテクチャ**: ①不在時も鏡を新鮮に保つ根本策
  （候補: レーン集計＋publish を offscreen document へ移設＝同一コードの renderless 実行。
  「他人の領域で戦うより自分の領域へ移す」の適用形）。起動条件＝既存 mirrorAgeSec の実配信3回分で
  SOFT超が常態と確認できたとき。HARD窓の再調整もこのフェーズ（推測B検証後）。
- **Phase 3 — 同一tick一貫（Q4）**: 読み側の世代同期。①③会場が同一 capturedAt 世代を採用する仕組み。
  [[mirrors-written-per-key-per-tick-root-of-parity-lie]] の完全解。
- **Phase 4 — 件数の意味統一**: ①「応援165件」と会場「段に表示中N人」の数値定義を揃える
  （MVPはラベルの誠実化まで）。
- **Phase 5 — fallback の gift/ad 供給**: gift/ad picks 導出を storage 由来の純関数へ抽出し
  会場でも同一関数で計算する案。v0.1.1138 との整合裁定が必要（「独自の受け皿」ではなく
  「同一正本関数の共有」と言えるか）。ユーザー裁定待ち。
- **別案件 — 匿名混入の発生源調査**: MVP の関所で実害は消える。①側が書いたか鏡が壊れたかは
  出荷後の parity 未説明＋`鏡除外N` で自然に確定する。
- **やらないこと**: SOFT/HARD統合・鏡cap再導入・passive での publish・会場独自受け皿・
  新規の観測系統追加・書き込みペイロード書式変更。

## 7. Further Notes（実装時の地雷）

1. **sanitize は受け入れ点で1回**。paint/renderSeats 内で呼ぶと hot path 汚染（v0.1.1201 の轍）。
2. **emptyTextOverrides は venueBar からのみ渡す**。①③の描画呼び出しに触れると3画面の見た目同一
   （[[venue-equals-lane-same-layout]]）を自分で壊す。
3. **parity 突合は sanitize 後の snap と行う**（会場が実際に使った正本＝TOCTOU 排除の既存原則。
   laneMirrorPaintSnap の固定機構 venueBar.js:5346-5373 を経由するので受け入れ点差し替えだけで自然に満たされる）。
4. **旧5キー同梱の移行期**（mirrorBundleKey.js）: 登録簿テストの grep は laneMirrorKey.js import を正とする。
   bundle 側を見落とすと登録簿が嘘をつく。
5. **wiring テストの CRLF**: 走査前に `\r\n`→`\n` 正規化（[[wiring-test-mutation-check-2026-08-01]]）。
6. 出荷ゲートは `npm run verify:cc` 一本。新 lib 追加後は tree-map/feature-map 再生成もコミットに含める。
7. version bump は 1変更=patch 1つ・manifest/package/changelog 同期（`npm run verify:bump`）。
   push しても Chrome には届かない＝ユーザーの反映3手順を報告に併記。
8. **verify系サブエージェント実行中に commit しない**（[[reality-checker-stash-detaches-head-2026-07-07]]）。

## 未解決の質問

1. ①のりんく段に匿名が実際に混入して publish されたのか、鏡データが壊れていたのか（推測A）。
   → MVP は両ケースを封じる。確定は出荷後の parity 未説明＋`鏡除外N` で。
2. 推測B（Side Panel 移行が鏡陳腐化を常態化させたか）。→ 既存 mirrorAgeSec を実配信3回分読んで判定。
   3配信で打ち切り。
3. 会場「応援コメント23件」の N の正確な生成箇所（venueBar.js:5979 近傍と推定・実装時に特定）。
4. Phase 5 の裁定: gift/ad 導出関数の共有は v0.1.1138「独自受け皿禁止」に抵触するか（ユーザー裁定）。
5. staleHard 中の「①パネル未接続」表示の文言・置き場所の最終デザイン（機能仕様は本SPECで確定、
   見た目はユーザー確認）。

## 仕様に根拠がない断定（assumption list）

1. LANE_MIRROR_CONSUMERS の初期リストは司令塔 grep の観測値。**テストが grep 結果を正**とし、
   実装時に確定させる前提。
2. 「gift/ad の uid無しセル＝広告主セルは正当」は venueLaneParity.js:57(idLine+title照合の存在)からの推定。
3. 「①の tier 法（linkPolicy/kontaPolicy が匿名拒否・tanu が吸収）が鏡の段別不変条件として妥当」は
   domain/lane/columns の実装からの読み取りで、明文の設計文書は未確認。
4. venueSeatsDiag の parity 行にフィールドを1つ足しても statusFastDiagLite の passthrough が不要
   （parity.line 文字列に併記するだけ）という前提。lite が line をそのまま印字することは
   [[fastdiag-lite-is-the-printer-subset]] から推定・実装時に wiring で確認すること。
5. 会場レーンヘッダーに stale 文言を出せる既存要素があるという前提（無ければ最小の span を1個だけ追加）。
