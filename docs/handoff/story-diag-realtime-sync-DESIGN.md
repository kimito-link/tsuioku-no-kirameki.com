# 会場モード「記録件数パネル」リアルタイム同期 根治設計

> 設計=Fable(claude-fable-5) / 素材収集=会議ハーネス(クラウド5体・2026-07-18) / 裏取り=司令塔(Claude Code)
> 3段構えワークフロー(council-fable スキル)の手順2の産物。日付: 2026-07-18。
> 実装ハンドオフは同名 `story-diag-realtime-sync-IMPLEMENTATION-HANDOFF.md` を参照。

## Context

②会場モード(venueBar)の「記録している応援コメント◯件です」パネルが、①popupを開いて
いない/①側の`refresh()`が停止していると固定表示のまま更新されない不具合をユーザーが報告。

会議(5体)は「background.js/offscreen documentに集計・鏡flushロジックを移行すべき」で
強く収束したが、**Fableが実地裏取りでこの前提を覆す決定的事実を発見した**(下記§0)。

## §0. 設計の前提を変える決定的事実(裏取りで新たに確定・司令塔が再検証済み)

**`recordedCount`の一次生成元は既に`content-entry.js`(watchタブに注入されるcontent
script)に存在し、popup非依存でstorageへpublishされ続けている**(grepで実在確認済み):

- `content-entry.js:779` `recordedCountForDisplay(lid)` — 取込パイプラインの生カウントを
  per-live単調化した値。
- `content-entry.js:10658` `PANEL_SUMMARY_WRITE_MIN_MS = 2_000` — 2秒間隔の書き込みガード。
- `content-entry.js:10819` `persistPanelLiveSummaryIfDue()` — 取込バッチごとに
  `nls_panel_summary_<lv>`(`recordedCount`含む)を書く。呼び出し箇所は9901/12743/13404行目
  (popup非依存のイベント駆動)。
- `panelSummaryStorageKey`(`src/lib/panelLiveSummary.js:22`)は`content-entry.js`からのみ
  使われており、`venueBar.js`は未使用(grep確認済み=会場側はまだこのキーを読んでいない)。
- ①popupの数字カードは既にこのキーを読んで`selectDisplayRecordedCount(summary)`
  (`src/lib/displayRecordedCount.js`)で表示している(`popup-entry.js:9458, 9505`)。
  AGENTS.md §12.8の正本パイプラインそのもの。

**つまり「popup非依存・約2秒鮮度・§12.8正本準拠の件数ストリーム」は既に存在し、動いている。
会場が読んでいないだけである。**

したがって本設計は「background.jsに集計を移す」(会議収束案)ではなく、**「②会場を、
既存の正本ストリーム`nls_panel_summary_<lv>`の購読者にする」**を主軸にする。新しい
集計器・新しい書き込みcadence・新しい常駐プロセスを一切作らない。

## §A. 理想の体験フロー

**ユーザー**:
- 配信者が①popupを閉じて②会場モードだけを映して配信していても、コメントが来るたび
  約2秒以内に「記録している応援コメント N件です」が増える。①②の数字は同じstorage値
  由来なので構造的に一致する。
- ①popupを一度も開いていなくても、②単独で件数が出る(現状は①が一度flushするまで非表示)。
- 内訳(withUid等)は①でしか計算できないため、①が閉じていると古くなる。そのとき②は
  「内訳は◯分前の情報」と正直に古さを表示し、件数だけは新鮮であることを区別して見せる
  (嘘の緑を作らない)。

**開発者**:
- 「件数がいつの・どの経路の値か」が鏡payloadの計器フィールド(`totalSource`/`panelAgeSec`)
  で状態速報からコピペ1発で分かる。
- 件数の正本が`selectDisplayRecordedCount`1本に本当に統一され、
  `STORY_AVATAR_DIAG_STATE.total`(独立集計)という§12.8違反の分裂が解消される。

## §B. 統合アーキテクチャ(コンポーネント4個)

```
[content-entry.js (watchタブ)]  ←件数の一次生成者(現状のまま・変更ほぼ無し)
   │ 取込イベント駆動 + min-gap 2s
   ▼ chrome.storage.local.set
┌──────────────── storage ────────────────┐
│ nls_panel_summary_<lv>   ← 件数の正本ストリーム(recordedCount)│
│ KEY_STORY_DIAG_MIRROR    ← 内訳鏡(①のpaint結果・従来通り)     │
└─────────────────────────────────────────┘
   │ onChanged / catch-up read              │ onChanged / catch-up read
   ▼                                        ▼
[① popup-entry.js]                    [② venueBar.js]
 件数=panel summaryの購読者に格下げ      件数=panel summaryの購読者(★新規配線)
 内訳(withUid等)の唯一の計算者・         内訳=従来通り鏡の受動購読
 KEY_STORY_DIAG_MIRROR のpublisher       +鮮度2本立て表示

[background.js] … 本件の責務ゼロ(MVPでは触らない)。SW休止リスクを「負わない」ことが対策(§D)
```

責務分割の要点:
- **content**: 件数の一次生成とpublish(既存)。担わない: 内訳集計・DOM描画。
- **popup**: 内訳の計算と鏡publish(既存)。件数は自分で数えるのをやめ、正本の購読者に
  格下げ(qwen案の「popupを対等なsubscriberに格下げ」を件数に限って採用)。
- **venue**: 正本ストリームと内訳鏡の2系統を購読し、鮮度を別々に表示。担わない: 集計。
- **background**: 関与しない(§Gで理由)。

3画面パリティ: ③純WebはそもそもKEY_STORY_DIAG_MIRRORを読んでいない(grep実測: 読み手は
venueBarのみ)ので、本件のパリティは①=②のみ。①②とも同一storage値`recordedCount`から
導出するため同一tick一貫が構造的に成立する。

## §C. 具体機構

### C-1. 新規lib: `src/lib/storyDiagTotalSource.js`(純関数・テスト付き)

```js
/**
 * storyDiagTotalSource.js — 「記録している応援コメント N 件」の N を1箇所で決める純関数。
 *
 * 入力の出どころ: panelSummary = nls_panel_summary_<lv>(content が一次生成・§12.8 正本)。
 *                fallbackTotal = 呼び手の手元配列長(popup: arr.length / venue: 鏡の total)。
 * 出力の使われ方: ①popup の STORY_AVATAR_DIAG_STATE.total と ②venue の診断パネル total。
 * 担う責務: 正本(selectDisplayRecordedCount)優先・不在時のみ fallback、の選択と出所ラベル。
 * 担わない責務: 単調化(呼び手の storyDiagMonotonic が担う)・storage read・描画。
 * ★禁止(§12.8): fallback を max で混ぜない。正本が有効なら正本のみを返す。
 */
import { selectDisplayRecordedCount } from './displayRecordedCount.js';

/**
 * @param {{ panelSummary?: unknown, liveId?: string, fallbackTotal?: number, nowMs?: number }} args
 * @returns {{ total: number, source: 'panel'|'fallback', panelAgeSec: number|null }}
 */
export function resolveStoryDiagTotal({ panelSummary, liveId, fallbackTotal, nowMs }) { /* … */ }
```

判定: `panelSummary.liveId`が正規化一致し`recordedCount`が有限数なら
`{ total: selectDisplayRecordedCount(panelSummary), source: 'panel', panelAgeSec }`。
それ以外は`{ total: max(0, floor(fallbackTotal||0)), source: 'fallback', panelAgeSec: null }`。

### C-2. ②venueBarの配線(2箇所・どちらも既存構造への相乗り)

1. **catch-up**(`venueBar.js:4811-4812`): 既存の1回読みに`panelSummaryStorageKey(liveId)`を
   追加 → `panelSummarySnap`に保持 → `renderStoryDiagMirrorPanel()`。
2. **onChanged**(`venueBar.js:5115-5119`の直後): `changes[panelSummaryStorageKey(liveId)]`の
   newValue直採用(追加readゼロ) → `panelSummarySnap`更新 → `renderStoryDiagMirrorPanel()`。

### C-3. `venueStoryDiagMirrorPanel.js`の拡張

```js
export function renderVenueStoryDiagMirrorPanel(host, snap, opts = {})
// opts に panelSummary?: unknown を追加。内部で:
//   const resolvedTotal = resolveStoryDiagTotal({ panelSummary: opts.panelSummary, liveId: opts.liveId,
//     fallbackTotal: Number(s?.total) || 0, nowMs: opts.nowMs });
//   描画用 snapshot = { ...s, total: 単調クランプ(resolvedTotal.total) }
```

- 単調クランプは既存`src/lib/storyDiagMonotonic.js`の`createStoryDiagMonotonicState()`/
  `applyStoryDiagMonotonic()`を venueBarモジュールスコープで再利用(新規実装しない、実在
  確認済み)。鏡と正本の一瞬の食い違いで数字が下がるchurnを防ぐ
  (story-userlane-churn-filllanetier-v1039の教訓)。
- **鏡不在でもpanelSummaryが同一lvなら描画する**(現状は非表示)。このときcompact lead
  (件数行)のみ・`details`(内訳)は「内訳は①ポップアップを開くと表示されます」の1行に
  差し替え。0埋めのverboseを出して「アイコン0件」と誤読させない。
- 鮮度2本立て: 見出しを`①の診断(内訳 ◯分前・件数 ◯秒前)`とする。`◯秒前`は
  `panelSummary.updatedAt`由来、`◯分前`は鏡`capturedAt`由来。

### C-4. 計器(fastdiag-liteの教訓を先回り)

- ①がpublishするstoryDiag鏡payload(`popup-entry.js:7529`)に`totalSource: 'panel'|
  'fallback'`と`panelAgeSec`を追加。
- **statusFastDiagLiteのpassthroughに必ず追加**(fastdiag-lite-is-the-printer-subsetの
  教訓: liteに通さない計器はコピペに永久に出ない)。wiring断言テストも同時に足す。

### C-5. タイミング設計(新規タイマーゼロ)

| 経路 | 駆動 | 間隔 |
|---|---|---|
| content→storage | 取込イベント + min-gap | 2秒(既存・不変) |
| storage→②venue | onChanged(イベント駆動) | 即時 |
| ②の保険read | 既存の定期ポーリング(v0.1.1090相乗り)にpKeyを追加。stale>15秒のときだけ読む | 既存間隔のまま |

alarms 5秒間隔(会議案)は不採用。イベント駆動で足りる(§G)。

## §D. service worker休止リスク対策

**第一の対策は「SWに新しい常駐責務を持たせない」という構造選択そのものである。** 本設計の
同期チェーン(contentのstorage書き込み→`chrome.storage.onChanged`→venue描画)はSWを
経由しない。onChangedは書き手・読み手とも表示中ページのコンテキストで発火し、SWの生死と
無関係。会議(compound)が指摘した休止リスクは「回避する」のではなく「負わない」。

残るリスクと個別対策:

**D-1. contentタブが背面でタイマー間引きされる場合** — 件数更新の主経路は取込イベント駆動
(`bufferRowsToTail`)でありタイマー非依存。取込自体が背面で止まる問題は既存の
`BACKFILL_BG_KICK_ALARM`(`background.js:1444-1466`)が既にカバー済み。本件で追加実装なし。

**D-2. onChangedの取りこぼし(②を開く前に書かれた値・イベント欠落)** — 二重化で吸収する。
(a) 開いた瞬間のcatch-up read(C-2-1)。
(b) 既存ポーリングへの保険相乗り(会場側の自己修復・最小実装):

```js
// venueBar.js — 既存の定期ポーリング(v0.1.1090 相乗り)内に追加。新タイマーは作らない。
// 担う責務: onChanged 欠落時の自己修復(15秒以上更新が無いときだけ 1 key read)。
// 担わない責務: 通常時の更新(それは onChanged が担う=毎tick read を増やさない)。
const STORY_DIAG_PANEL_STALE_MS = 15_000;
if (Date.now() - _panelSummaryLastSeenAt > STORY_DIAG_PANEL_STALE_MS) {
  const bag = await runStorageOpWithTimeout(
    () => chrome.storage.local.get(panelSummaryStorageKey(liveId)), 3000);
  const snap = bag?.[panelSummaryStorageKey(liveId)];
  if (open && snap && typeof snap === 'object') {
    panelSummarySnap = snap;
    _panelSummaryLastSeenAt = Date.now();
    renderStoryDiagMirrorPanel();
  }
}
```

**D-3. 将来backgroundに鏡flushを移す場合の指針(Phase 3・今は実装しない)** — それでも移す
なら、既存の実証済みパターン(`background.js:653-664 ensureAutoBackupAlarm` /
`1455-1466 ensureBackfillBgKickAlarm`)を踏襲する:

```js
// background.js — alarm は「存在確認→無ければ作る」を onInstalled/onStartup/初回イベントの
// 全てで呼ぶ(SW再起動でin-memory状態は消える前提。状態はstorageのみに置く)。
const STORY_DIAG_FRESHNESS_ALARM = 'nls_story_diag_freshness';
async function ensureStoryDiagFreshnessAlarm() {
  try {
    const existing = await chrome.alarms.get(STORY_DIAG_FRESHNESS_ALARM);
    if (existing) return;
    chrome.alarms.create(STORY_DIAG_FRESHNESS_ALARM,
      { delayInMinutes: 0.5, periodInMinutes: 0.5 }); // Chrome最小=0.5分
  } catch { /* no-op */ }
}
```

ただし§Gの通り、このPhase 3は「①も②も閉じて③純Webだけ見る」ユースケースが実在すると
確認できるまで着手しない。

## §E. `STORY_AVATAR_DIAG_STATE.total`の正本統合(3箇所の移行手順)

前提(確定情報): 参照はpopup-entry.js内3箇所のみ(7534/16034/16098行目)。他モジュールは
壊れない(grep実測済み)。移行は「totalの**代入側**を差し替える」だけで、読み手
(`mergeAndScheduleFlush('storyDiag', ...)` 7529行目・storyAvatarDiagLine描画)は無変更。

**手順0(準備)**: popupがrefresh内で読んだpanel summaryをモジュールキャッシュに保持する。
`popup-entry.js:15672`付近(`panelSummaryKey` read済みの場所)で:

```js
// 件数正本キャッシュ: refresh が読んだ nls_panel_summary_<lv> を STORY_AVATAR_DIAG_STATE.total の
// 解決(16034/16098)へ渡すために保持。出どころ=content の recordedCountForDisplay(§12.8 正本)。
/** @type {{ lv: string, summary: Record<string, unknown>|null }} */
let _storyDiagPanelSummaryCache = { lv: '', summary: null };
// refresh 内・pRaw 取得直後:
if (isPanelLiveSummary(pRaw, lv)) _storyDiagPanelSummaryCache = { lv, summary: pRaw };
```

**箇所1: 7534行目(`resetStoryAvatarDiagState`)** — 変更なし(`total = 0`のまま)。ただし
キャッシュも同時に破棄する1行を追加:
`_storyDiagPanelSummaryCache = { lv: '', summary: null };`(配信切替で前配信の件数が漏れる
のを防ぐ)。

**箇所2: 16034行目** — 差し替え:

```js
// 旧: STORY_AVATAR_DIAG_STATE.total = arr.length;
// 新: §12.8 正本(panel summary recordedCount)優先。summary 不在時のみ従来 arr.length(fallback)。
//     max では混ぜない(§12.8 禁止事項)。単調化は従来通り 16046 行の applyStoryDiagMonotonic が担う。
const _totalResolved = resolveStoryDiagTotal({
  panelSummary: _storyDiagPanelSummaryCache.lv === lv ? _storyDiagPanelSummaryCache.summary : null,
  liveId: lv,
  fallbackTotal: arr.length,
  nowMs: Date.now()
});
STORY_AVATAR_DIAG_STATE.total = _totalResolved.total;
STORY_AVATAR_DIAG_STATE.totalSource = _totalResolved.source;   // 計器(鏡に載る→②/状態速報で読める)
STORY_AVATAR_DIAG_STATE.panelAgeSec = _totalResolved.panelAgeSec;
```

(直後の16046行`applyStoryDiagMonotonic`はそのまま=解決→単調化の順。)

**箇所3: 16098行目(`paintWatchPopupUi`内)** — 同じhelperで差し替え:

```js
// 旧: STORY_AVATAR_DIAG_STATE.total = applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, { total: arr.length }).total;
// 新: 正本優先で解決してから従来の単調化ゲートへ通す(ゲートの位置・回数は不変)。
const _paintTotal = resolveStoryDiagTotal({
  panelSummary: _storyDiagPanelSummaryCache.lv === lv ? _storyDiagPanelSummaryCache.summary : null,
  liveId: lv,
  fallbackTotal: arr.length,
  nowMs: Date.now()
}).total;
STORY_AVATAR_DIAG_STATE.total = applyStoryDiagMonotonic(_storyDiagMonotonicState, lv, { total: _paintTotal }).total;
```

**移行の検証**: `storyDiagTotalSource.test.js`(純関数)+ wiringテスト(popup-entryソースに
`resolveStoryDiagTotal`が2箇所現れ、`= arr.length;`直代入がtotalに残っていないことの
文字列断言。既存の`venueBarPopupOcclusion.wiring.test.js`と同流儀)。出荷ゲートは
`npm run verify:cc`一本。

## §F. MVP(最初に作る1つ)

**MVP = C-1 + C-2 + C-3(②venueがpanel summaryを購読して件数を描く)。popup側E移行は
MVPに含めない。**

理由: ユーザーが報告した症状(②の固定表示)はこれだけで根治し、変更がvenue側+新規純関数に
閉じる(popup-entryの巨大ファイルに触らない=事故半径最小)。①は既に数字カードで同じ正本を
表示しているので、MVP時点で①の数字カード=②のパネル件数のパリティが成立する。①の診断
パネル内total(arr.length由来)との小さな不一致が残り得るが、それは第2弾(E)で解消し、
その間も`totalSource`計器と鮮度ラベルで観測可能。

実装順: MVP(1 patch) → E移行+計器lite passthrough(1 patch) → 実配信で状態速報コピペ検証。

## §G. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| **background.js/offscreenに集計・鏡flushを移行**(会議の最有力収束点) | 裏取りで前提が崩れた。件数の一次生成元はcontentで、popup非依存のpublishが既に2秒cadenceで動いている。backgroundに移すと(a)SWがstorageから材料を読み直す新規read負荷(大規模配信の地雷)、(b)SW休止対策という新しい問題、(c)ESM import不可のbackgroundへのlibミラー(drift地雷)を**わざわざ新規に背負う**。既に存在する経路を読むだけで同じ結果が得られる。内訳(withUid等)のpopup非依存化が将来必要になったときだけPhase 3として再検討(D-3)。 |
| **chrome.alarms 5秒間隔の定期flush**(会議の具体案) | alarmsの最小周期は0.5分=30秒であり「5秒間隔」はそもそも実現不可。かつイベント駆動(onChanged)で足りる場面にポーリングを足すのは負荷源。 |
| **汎用reactive store / pub-sub基盤**(qwen発散案の全面採用) | 過剰設計。「popupを対等なsubscriberに格下げ」という思想だけを件数1フィールドに限って採用(E)。 |
| **②が自前でdelta追跡して自己修正**(qwen案) | 会場に第2の集計器を作ると§12.8の「カウンタ分裂」を再演する。採用するのは最小版=stale時の保険read+鮮度正直表示のみ(D-2)。 |
| **鏡(KEY_STORY_DIAG_MIRROR)への書き込みをcontentにも持たせる** | 1つの鏡キーに書き手が2人になるとlast-write-winsの取り合いで既知の教訓(mirrors-written-per-key-per-tick-root-of-parity-lie)の新型を作る。書き手は鏡=popupのみ・panel summary=contentのみ、を不変条件として維持。 |

## §H. 地雷と回避策

1. **storage onChangedファンアウト再燃**(robust-architecture-designの教訓): 本設計は
   **書き込み側のcadenceを一切増やさない**(既存のpanel summary書き込みに読み手を足すだけ)。
   venueのonChangedハンドラはpKey完全一致時のみ処理し、描画は既存sig-skip
   (`renderVenueStoryDiagMirrorPanel`)で無変化再描画を抑止。
2. **§12.8のmax混ぜ禁止**: 「鏡totalと正本の大きい方」をつい採りたくなるが、
   `displayRecordedCount.js`冒頭コメントが明記する禁止事項(0潰し・分裂の再演)。fallbackは
   「正本不在時のみ」。venueの一瞬の後退はmonotonicクランプ(既存lib再利用)で吸収する。
3. **配信切替での持ち越し**: monotonic state・`panelSummarySnap`・
   `_storyDiagPanelSummaryCache`はすべてliveId照合+切替時破棄(E-箇所1)。per-live map
   (`createStoryDiagMonotonicState`はlvキー付き)を使い、別配信のクランプが効かないこと。
4. **鏡不在時の0埋めverbose誤読**: 鏡なし・summaryありの新規描画モードでは内訳を出さない
   (C-3)。「アイコン0/500」という嘘を出すくらいなら出さない。
5. **計器のlite passthrough忘れ**(fastdiag-lite-is-the-printer-subsetの教訓):
   `totalSource`/`panelAgeSec`をstatusFastDiagLiteに通し、wiring断言を同patchに含める。
   忘れると検証がコピペで永久にできない。
6. **段階移行の中間状態**: MVP時点では「①診断パネルのtotal(arr.length)」と「②のtotal
   (正本)」が数件ズレうる。これは既知・一時・観測可能(totalSource計器)とし、E patchで
   閉じる。MVPとEを同一patchに押し込んでpopup-entryとvenueBarを同時に触るほうが事故
   リスクが高い(1変更=patch1つの粒度規約にも沿う)。
7. **venue保険readをコアreadに足さない**: D-2(b)は既存の間引きポーリングへの相乗り+
   stale時のみ発火。毎tickの直列readに足すと既知の教訓(status-extras-read-not-core-read)
   の再演。
8. **wiringテストによるdrift防止**: venueBarはcontent-entryからimportされない別バンドル
   のため、pKey購読の存在は文字列契約テストで固定(既存
   `venueBarPopupOcclusion.wiring.test.js`の流儀)。

## §I. コメント規約の具体例

各ブロックに「入力の出どころ・出力の使われ方・担う責務・担わない責務」を書く。venueBar
配線部の実例:

```js
// ── 記録件数の正本購読(v0.1.117x・storydiag-realtime設計 §C-2) ──────────────
// 入力の出どころ: nls_panel_summary_<lv>。content-entry.js が取込イベント+min-gap 2秒で
//   popup非依存に書く recordedCount(= recordedCountForDisplay(lid)・per-live単調化済み・
//   AGENTS.md §12.8 の表示正本)。
// 出力の使われ方: renderStoryDiagMirrorPanel → resolveStoryDiagTotal が KEY_STORY_DIAG_MIRROR
//   由来の total(①popupのarr.length系)より優先して「記録している応援コメント N 件です」の N になる。
// 担う責務: newValue 直採用(追加readゼロ)でのキャッシュ更新と再描画キック。
// 担わない責務: 集計(contentが正本)・内訳(withUid等は鏡=①popupが唯一の計算者)・
//   単調化(storyDiagMonotonic が担う)・保険read(既存ポーリング相乗り側 D-2 が担う)。
// ①popupが閉じていてもこの経路だけで件数は動き続ける=本設計の根治点。
const panelChange = changes[panelSummaryStorageKey(liveId)];
if (panelChange && panelChange.newValue && typeof panelChange.newValue === 'object') {
  panelSummarySnap = /** @type {Record<string, unknown>} */ (panelChange.newValue);
  _panelSummaryLastSeenAt = Date.now();
  renderStoryDiagMirrorPanel();
}
```

## 検証済み事実(司令塔による裏取り)

- `content-entry.js:779`(`recordedCountForDisplay`)、`10658`(`PANEL_SUMMARY_WRITE_MIN_MS`)、
  `10819`(`persistPanelLiveSummaryIfDue`)、呼び出し箇所9901/12743/13404行目、実在確認済み。
- `panelSummaryStorageKey`(`src/lib/panelLiveSummary.js:22`)が`content-entry.js`からのみ
  使われ`venueBar.js`では未使用、grep実測済み。
- `src/lib/storyDiagMonotonic.js`の`createStoryDiagMonotonicState`/`applyStoryDiagMonotonic`/
  `forgetStoryDiagMonotonicForLive`、実在確認済み。
- `STORY_AVATAR_DIAG_STATE.total`の参照箇所は`popup-entry.js`内3箇所
  (7534/16034/16098行目)のみ、grep実測済み。

## 変更ファイル一覧(全体)

- 新規: `src/lib/storyDiagTotalSource.js` / `.test.js`
- MVP: `src/extension/venueBar.js`(catch-up+onChanged+保険read)・
  `src/lib/venueStoryDiagMirrorPanel.js`(+`.test.js`)
- 第2弾(E): `src/extension/popup-entry.js`(3箇所+キャッシュ)・statusFastDiagLite
  passthrough・wiringテスト
- 触らない: `content-entry.js`(件数生成は現状で正しい)・`background.js`・
  `mirrorBundleFlushScheduler.js`・鏡キー構成
