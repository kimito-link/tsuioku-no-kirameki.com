# venue-avatar-stale-mirror-DESIGN.md — 会場サムネ白丸(鏡stale×プローブ固着)根治設計

> 設計=Fable(claude-fable-5) / 実機検証・裏取り=司令塔(Claude Code)
> 3段構えワークフロー(council-fable スキル)の手順2の産物。日付: 2026-07-20。
> 前提: [[avatar-stability-mvp-2026-07-18]]の続き。今回は会場モード(venueBar.js)固有の
> 「新規発見」であり、前回実装した3対策(URL式重複解消/空ctx裁定/heavyRace single-flight)
> とは別系統の真因。

## Context

ユーザーから実機スクリーンショット2枚+状態速報の共有を受け、司令塔が実地調査・実測(curl・
既存テスト実行)で真因を絞り込んだ。前回実装した3対策では解決していなかった。

## 確定事実(司令塔が実機・コード・テスト実行で裏取り済み)

### 事実1: 実機での症状の時系列

1. 1回目のスクショ: 会場参加者パネルの「りんく」列7タイル、**全て白丸**。UID記名済み
   (1385857671, 1447271831, 4046119, 45574905, 8020037, 8346754, 84613833)。
2. 直後の状態速報: `会場一致 ⚪鏡stale(21437s)`(約6時間)。別の状態速報では「応援レーン:
   🔴鏡なし(popupを一度も開いていない疑い)」「popup固有診断が18分前で古い」。
3. 数十分後のスクショ: 同じパネルの「りんく」列が**全て正常なサムネ**に回復(UIDは全て別人:
   1037886, 121029602, 135993463等)。

### 事実2: CDN実在性(curlで実測済み)

7件中5件は合成URL(`https://secure-dcdn.cdn.nimg.jp/nicoaccount/usericon/s/<bucket>/<uid>.jpg`)
が実際にHTTP 200、2件のみ404。「画像が存在しない」ことは主因ではない。

### 事実3: 鏡のstale許容設計(意図的・コード確認済み)

`src/lib/venueLaneMirrorSupply.js`の`isLaneMirrorUsableForVenue`は、`liveId`一致かつ
`capturedAt`が`VENUE_LANE_MIRROR_SOFT_WINDOW_MS`(180秒、`venueLaneParity.js:18`)以内なら
使用可、超えたら`stale`理由を返す。`venueBar.js:4579-4586`の`composeVenueBaseRows`は
`reason==='stale'`のときfallbackへ降格せず**直近の鏡をそのまま使い続ける**(v0.1.1136 C2、
「配信のコメント速度が遅い時間帯で鏡モード⇔fallbackモードを数分おきに往復してりんく段が
総入替=出たり消えたりする実害を止める」ため意図的)。**この設計は「数分規模の一時的な遅れ」を
想定しており、「popupが数時間開かれない」ケースは想定の外**。

### 事実4: 鏡セルはpopup側のプローブ結果を反映しない

`src/lib/laneMirror.js`の`toMirrorCell`は`displaySrc`(URL文字列)をそのまま保存するだけ。
この文字列は`resolveStoryLaneAvatarSrc`→`niconicoDefaultUserIconUrl`等が生成した合成URLで、
popup側の画像プローブ(成功/失敗)の結果は一切含まれない。

### 事実5: fallback経路(鏡absent時)は正しく動作する(既存テスト21件で実測確認済み)

`enrichVenueRowsWithProfileAvatars`(`src/lib/venueAvatar.js`)は`venueBar.js:3984`の
`commitDisplay`(座席描画の共通関所)で必ず呼ばれ、UID合成フォールバックで確定パターンURLを
必ず生成する。`npx vitest run src/lib/venueAvatar.test.js src/lib/venueLaneBuckets.test.js`
=21件全緑で確認済み。**fallback経路(鏡が全く無い状態)では白丸にならない設計**。

### 事実6: 白丸の実体はプローブのfallback表示、失敗記録は恒久・共有されない

`src/lib/supportGrowthAvatarLoad.js`の`createSupportAvatarLoadGuard`は「先にfallback
(blank.jpg)表示→背景プローブ→成功時のみimg.src差替」設計(星野ロミAvatar.tsxパターン、
404フリッカー防止)。**プローブ失敗は`failedKeys`(Set)に永久登録され、TTLもリトライ上限も
無い**(`pickDisplaySrc`68行目・`noteRemoteAttempt`86行目で確認済み)。

`clearFailedUrls()`(失敗記録クリア)の呼び出しは**リポ全体で`popup-entry.js:8697`
(配信切替時)の1箇所のみ**(司令塔がgrepで実測確認)。`venueBar.js`には一切無い。
会場は`venueBar.js:346-350`で独自guardインスタンス(`venueAvatarLoadGuard`)を持ち、
popup側の`succeededKeys`/`failedKeys`(モジュールクロージャ)とは共有されない。

## A.【最重要・裁定】白丸の真因

### 結論

**白丸の直接原因は「表示層の負キャッシュ恒久化」= 一度プローブに失敗(timeout/error)した
URLが`failedKeys`に永久登録され、以後いっさい再プローブされない仕組みと、diff-skipにより
数時間タイルが再構築されない状況の合わせ技。**

会場に「鏡に居ない新規参加者だから空avatar」(事実1の仮説a)ではない(棄却)。理由:
- mirror mode(stale含む)の段描画は鏡の5段のみを描く(v0.1.1138で会場独自受け皿を撤去済み)。
  鏡に居ない新規参加者は白丸ではなく「タイル不在」になる。1回目スクショの白丸7タイルは
  UID記名済み=タイル実在=鏡セルに居た人。「鏡に居ないから空avatar」は観測と矛盾。
- fallback mode(鏡absent)ではUID合成フォールバックが必ず動く(事実5)。URL文字列の層は
  絶対に空にならない。空になるのは「表示の層」だけ。

### 根拠(コード事実だけで完結する論理連鎖)

1. **白丸の正体はguardのfallback表示**(事実6)。
2. **失敗は恒久**: プローブが`error`または3秒timeoutで`failedKeys.add(key)`。以後
   `pickDisplaySrc`は永久にfallbackを返し、`noteRemoteAttempt`は**プローブ自体を拒否**する
   (86行目`if (failedKeys.has(key)) return null`)。TTLもリトライ上限も無い。
3. **会場は負キャッシュを一度も掃除しない**(事実6、`clearFailedUrls`呼び出しは
   `popup-entry.js`の1箇所のみ)。会場タブを開いている限り失敗記録は残り続ける。
4. **diff-skipが再プローブ機会を殺す**: `renderStoryUserLaneDom.js:272-276`のbodyKey一致で
   DOM不触=`buildPersonTileEl`不実行=`noteRemoteAttempt`不実行。鏡が数時間staleならbodyKeyは
   変わらないので、**タイルは会場を開いた瞬間の1回しか構築されず、プローブもその1回きり**。
   白丸のタイル=その1回のプローブが失敗したタイル。
5. **回復現象の説明**: popupが起動→新鮮な鏡がpublish→bodyKey変化→タイル総入替。実機の2枚の
   スクショはUID群が完全に別。つまり**白丸が「治った」のではなく、白丸セルごと退場して
   別人の新URL(failedKeys未登録)が入り、そのプローブが成功した**。

### 事実1(a)の変形=第2の実害(こちらは実在・別対処)

鏡が数時間staleのままmirror modeが続く間、その間に来た新規参加者は段に一切現れない(空席の
まま)。C2(v0.1.1136)は「数分単位の鏡遅れ」想定であり、数時間規模のstaleを同じ窓で使い
続けるのは設計意図の外。

### 実機でしか確定できないこと

- 白丸7件の初回プローブ失敗の種別(timeout vs error)と誘因(コールドキャッシュ・スリープ
  復帰直後・一時的ネット断)。既存計器`avatarProbe`は総数のみで種別・時刻が無いため現状では
  切り分け不能。→ §D計器で解決。

## B. 根治設計の全体像

**結論: 「表示層」と「供給層」の二層根治+計器先行。1つの修正で両方を治そうとしない。**

症状は独立した2欠陥の重なり:

| 層 | 欠陥 | 根治 |
|---|---|---|
| 表示層(guard) | 負キャッシュにTTL・リトライ・再プローブ機会が無い | **根治1**: 失敗記録のTTL+指数バックオフ再プローブ(opt-in・会場から) |
| 供給層(鏡) | stale許容が無期限で、長時間popup不在だと新規参加者が不可視 | **根治2**: stale二段窓(SOFT 3分=現状維持/HARD 15分でfallback降格) |

設計原則との整合:
- C2(stale鏡でちらつき防止)は**壊さない**: SOFT窓(3分)の挙動は1バイトも変えず、桁違いに
  長いHARD窓を上に足すだけ。
- diff-skip(`storyLaneTierBodyKey`)は**不触**: 再プローブは成功時に`img.src`を直接差し替える
  既存機構(applySuccess)に乗るので、bodyKeyにプローブ状態を混ぜる必要がない。
- popupの挙動は段階を分けて変える(guardは共有lib。MVPでは会場のみopt-in)。

## C. 具体的な実装案

### 根治1: guardの負キャッシュTTL+再プローブ(`src/lib/supportGrowthAvatarLoad.js`)

#### C-1a. 失敗記録のメタデータ化(挙動不変・MVPに含む)

```js
// failedKeys: Set<string> → Map<string, { kind: 'timeout'|'error', failCount: number, lastFailAt: number }>
// 判定はhas()相当のままなので retryPolicy 未指定なら挙動は1ビットも変わらない。
```

- `applyFailed`を`applyFailed(kind)`にし、timeout側は`applyFailed('timeout')`、errorリスナは
  `applyFailed('error')`。`failCount`は既存記録があれば+1。
- `getDiagnostics()`拡張: `{ succeededTotal, failedTotal, failedTimeout, failedError,
  retriedTotal, usericonSucceeded, usericonFailed, failedUsericonSamples, lastFailAgoMs }`。

#### C-1b. retryPolicy(opt-in・会場のみ有効化)

```js
createSupportAvatarLoadGuard({
  fallbackSrc, urlKey?, onFallbackApplied?, onRemoteSuccess?, timeoutMs?,
  retryPolicy?: { baseMs?: number, maxMs?: number, maxAttempts?: number }
  //             既定値 baseMs:30_000, maxMs:600_000, maxAttempts:5。未指定(null)=従来の恒久負キャッシュ。
})
```

- 再試行可否の純関数を同ファイル内export(TDD対象): `export function isProbeRetryEligible(rec,
  nowMs, policy)` — `nowMs - rec.lastFailAt > min(maxMs, baseMs * 2**(rec.failCount-1))`
  かつ`rec.failCount < maxAttempts`。404恒久URL(実機で2/7確認済み)への無限リトライは
  maxAttemptsで止まる。
- `noteRemoteAttempt`冒頭の失敗キー拒否(86行目)を変更: retryPolicy有効かつeligibleなら
  再プローブ続行。ineligibleなら従来どおりnull。ただし**どちらの経路でも**
  `img.dataset.nlsbAvatarRetrySrc = req`を刻む。`applySuccess`で
  `delete img.dataset.nlsbAvatarRetrySrc`。personTileDom.js(凍結)は不触=刻印は全て
  guard側で行う。

#### C-1c. 再プローブスイープ(`venueBar.js`・新規タイマーなし)

```js
// guard に追加
retrySweep(rootEl, nowMs) // rootEl配下の img[data-nlsb-avatar-retry-src] を走査し、
                          // eligible なものだけ noteRemoteAttempt(img, src) を再発行。戻り値 {scanned, retried}。
```

- 呼び出しは`venueBar.js`の既存`diagDue`(3秒min-gap・4381行目)ブロックに相乗り:
  `if (diagDue) venueAvatarLoadGuard.retrySweep(venueLaneEls.stack, Date.now());`。
  新規タイマー・新規read/writeゼロ=hot path保護の既存方針どおり。

#### C-1d. 鏡世代前進時のtimeout系リセット(`venueBar.js`)

- `scheduleLaneMirrorRecommit`(4629行目)で鏡`capturedAt`の前進を検知したら、guardの新API
  `clearTimedOutFailures()`(**timeout種別のみ**削除。errorは維持=404の再打撃なし)を1回
  呼ぶ。popup復帰=ネット・キャッシュ環境が変わった節目に、時間切れ組へ即座の再機会を与える。
- ⚠️ `clearFailedUrls()`は使わない(succeededKeysも消して全タイルが一瞬白丸に戻る。§G参照)。

### 根治2: stale二段窓(`src/lib/venueLaneParity.js` + `venueLaneMirrorSupply.js`)

```js
// venueLaneParity.js
export const VENUE_LANE_MIRROR_SOFT_WINDOW_MS = 180_000;   // 既存・不変(C2の窓)
export const VENUE_LANE_MIRROR_HARD_WINDOW_MS = 900_000;   // 新設: 15分。これを超えた鏡は「popup実質不在」とみなす
```

- `isLaneMirrorUsableForVenue`のreason型を`''|'absent'|'liveIdMismatch'|'stale'|'staleHard'|
  'empty'`に拡張。SOFT超〜HARD以内は従来どおり`'stale'`、HARD超は`'staleHard'`。
- `venueBar.js:4582`の`staleButUsable = !usable.usable && usable.reason === 'stale'`は
  **無変更のまま**`'staleHard'`が自動的にfallback降格になる(変更最小)。C2コメント
  (4569-4574)にHARD窓の追記。
- ヒステリシスは不要(鏡が更新されない限りageは単調増加なのでHARD境界の往復は構造的に
  起きない。過剰設計を避ける)。
- 効果: popupが15分以上不在なら会場はfallback(全参加者を候補から組む)へ移行し、新規参加者が
  段に出る+enrichの確定URL生成(事実5)が効く。§A末尾の「第2の実害」の根治。

### 責務分割

- `supportGrowthAvatarLoad.js`: 担う=表示src解決・プローブ・負キャッシュ(TTL含む)・
  retry刻印/スイープ。担わない=URL生成(正本: supportGrowthTileSrc.js/
  deriveAvatarUrlFromUid.js)・段組み(正本: venueLaneMirrorSupply.js)。
- `venueLaneMirrorSupply.js`: 担う=鏡の使用可否判定(二段窓)。担わない=白丸の表示判定
  (正本: supportGrowthAvatarLoad.js)。

## D. 新規診断計器の最小設計

**結論: 「白丸の実数」を実DOMで数える計器が主役。プローブ種別と鏡年齢が脇を固める。**

1. **白丸census(症状そのものの直接観測)** — `src/lib/venueDomCensus.js`の
   `collectVenueLaneDomCensus`にextras `fallbackSrc`を追加し、段内
   `img.nl-story-userlane-avatar`のうち`src === fallbackSrc`の枚数を`whiteTiles`
   (段別+合計)として数える。既存censusの走査に1条件足すだけ。
2. **プローブ種別診断** — C-1aの`getDiagnostics()`拡張値(failedTimeout/failedError/
   retriedTotal/lastFailAgoMs)を既存経路(venueBar.js:4418 extras.avatarProbe→
   venueDomCensusToParityDom)で通す。
3. **鏡年齢+鏡外人数** — `venueLaneParity`診断に`mirrorAgeSec`(now−capturedAt)と
   `mirrorTailCount`(composeVenueBaseRowsのtail.length=mirror mode中に段へ出ていない
   参加者数)を追加。

状態速報の1行イメージ:
`会場顔: 白丸3/42 probe ok:39 fail:5(t:3,e:2) retry:1 鏡age:21437s tail:6`

**配線の断言(地雷回避)**: venue系計器も[[fastdiag-lite-is-the-printer-subset]]と同型の罠が
ある——printerまで通して初めて計器。`venueLaneParity.wiring.test.js`に「venueBar.jsソースが
whiteTiles/fallbackSrcをcensus extrasに渡している」「印字側が新フィールドを含む」の断言を
追加する(既存116行のavatarProbe断言と同型)。

**この計器で切り分かること**: 白丸再発時、
- `whiteTiles>0 & failedTimeout優勢 & 鏡age大` → 本設計の想定どおり(根治1/2で消えるはず)
- `whiteTiles>0 & probe okに該当URLが載る` → 想定外の新経路(pickDisplaySrc呼び出し漏れ等)で再調査
- `whiteTiles=0なのに目視で白い` → fallback画像以外の白(CSS/空席)で別件

## E. MVP(最初の1歩)

**結論: 段階0=「計器+失敗メタデータ化」のみ。表示挙動の変更はゼロ。**

- 内容: C-1a(failedKeys→Map化・getDiagnostics拡張。retryPolicy未指定なので挙動不変)+
  §Dの3計器+wiring断言テスト。
- 理由: 根治1のTTL/バックオフ初期値(30s/10min/5回)はtimeout:error比率の実測で妥当性が
  決まる。実機の白丸再発1回ぶんの状態速報コピペで裏取りしてから段階1へ進む
  (診断ファースト・[[feedback-trust-status-report-over-browser-check]]の原則=
  ユーザーへの目視依頼なしで切り分け可能になる)。
- 以降: 段階1=根治1(C-1b/c/d・会場のみ)→段階2=根治2(HARD窓)→段階3=popupへの
  retryPolicy展開判断(popupにはclearFailedUrls運用が既にあるため必要性を実測してから)。
  各段階とも`npm run verify:cc`一本をゲートに独立してship可能。

## F. 捨てた案と理由

| 案 | 捨てた理由 |
|---|---|
| popup→会場へプローブ結果を共有(storage/messaging) | **過剰かつ有害**。成功情報の実利はChromeのHTTPキャッシュ共有で既にほぼ得られている(プローブ往復の短縮のみ)。失敗情報の共有はpopup側の一時的失敗を会場へ**伝播**させ、症状を悪化させる。共有機構は書き込み増=robust-architecture設計(onChangedファンアウト地雷)にも逆行 |
| staleで即fallback降格(C2撤回) | v0.1.1136が止めた「モード往復で段総入替ちらつき」が再発。二段窓なら3〜15分帯の防御はそのまま |
| 会場レーンにX層(独自受け皿)復活 | v0.1.1138「5つの段=鏡=①の実paint」の厳密同一を壊す。新規参加者の可視化はHARD窓降格で足りる |
| fallback先行をやめrequestedを直接img.srcに | 404フリッカー再発(星野ロミパターンの存在理由の否定) |
| 鏡更新時に`clearFailedUrls()`全消し | succeededKeysも消える→次paintで全タイルが一旦白丸に戻る=ちらつき新設。timeout種別のみ消す専用APIにした |
| loading="lazy"/IntersectionObserver | 過去に撤回済みの既知地雷(3D変形で可視判定が崩れサムネが出ない・personTileDom.js:87-90) |
| プローブ状態をbodyKeyに入れて再描画で解決 | diff-skipキー揺れ=churn再発(renderStoryUserLaneDom.js:155の明示警告・v1022の轍) |

## G. 地雷と回避策

1. **`clearFailedUrls`は成功集合も消す** — 「失敗だけ消す」用途に使うと全白丸化ちらつき。
   `clearTimedOutFailures()`を新設し、既存APIは触らない。
2. **personTileDom.jsは凍結**(characterization testで1バイト固定) — retry刻印・スイープは
   全てguard側と呼び出し側で行い、タイル正本に手を入れない。
3. **bodyKeyにプローブ由来の値を混ぜない** — `img.dataset.nlsbAvatarRetrySrc`はguardが
   非同期で付け外しするだけでkey計算(item由来フィールドのみ)に不干渉であることをテストで
   断言。
4. **404 URLへの再打撃** — maxAttempts=5+指数バックオフ上限10分で頭打ち。errorキーは鏡世代
   リセットの対象外。
5. **スイープの新規タイマー禁止** — 既存diagDue(3秒min-gap)相乗り。毎paint実行はhot path
   汚染(既存計器と同じ規律)。
6. **printer通し忘れ** — 計器を足してもprinterに出なければ永久に見えない
   ([[fastdiag-lite-is-the-printer-subset]]と同型)。wiring断言テストをMVPに含める。
7. **guardはpopupと共有lib** — retryPolicy既定はnull(従来挙動)。既定値を変えるとpopupの
   挙動が黙って変わる。段階3まで触らない。
8. **HARD窓とSOFT窓の定数を1つにまとめない** — C2の窓(180s)を触った瞬間ちらつき防止が
   壊れる。定数・テストとも分離。
9. **検証エージェントBG実行中にcommitしない**([[reality-checker-stash-detaches-head-2026-07-07]])。

## H. コメント規約の具体例(supportGrowthAvatarLoad.js 冒頭)

```js
/**
 * 応援グリッド/会場のリモート avatar img の読み込みガード(表示src解決の正本)。
 *
 * 【担う責務】
 *   - 星野ロミ Avatar.tsx パターン: fallback 先表示→背景プローブ→成功時のみ img.src 差替(404フリッカー防止)。
 *   - プローブ失敗の負キャッシュ。retryPolicy 指定時は種別(timeout/error)つき記録+指数バックオフ再試行
 *     (venue-avatar-stale-mirror-DESIGN.md: 恒久負キャッシュが「一度の一時失敗=セッション中ずっと白丸」を生んでいた)。
 *   - 再試行対象の刻印(img.dataset.nlsbAvatarRetrySrc)と retrySweep(呼び出し側の低頻度サイクルから叩く)。
 *
 * 【担わない責務(正本を明記)】
 *   - サムネURLの生成/選択: supportGrowthTileSrc.js / deriveAvatarUrlFromUid.js が正本。
 *   - タイルDOMの構造: personTileDom.js(凍結)が正本。本ガードは img.src と dataset のみ触る。
 *   - 鏡の使用可否(stale判定): venueLaneMirrorSupply.js が正本。表示層は供給層の判断に関与しない。
 *
 * 【地雷】
 *   - clearFailedUrls は succeeded も消す(全タイルが一旦 fallback に戻る)。「失敗だけ」は
 *     clearTimedOutFailures を使うこと。
 *   - retryPolicy 既定は null=従来の恒久負キャッシュ(popup 互換)。既定値を変えると popup の挙動が黙って変わる。
 */
```

## 検証済み事実(司令塔による裏取り)

- `pickDisplaySrc`/`noteRemoteAttempt`のfailedKeys恒久登録ロジック、実読で確認済み
  (`supportGrowthAvatarLoad.js:62-71,86`)。
- `clearFailedUrls`呼び出しがリポ全体で`popup-entry.js:8697`の1箇所のみ、grepで実測確認済み。
- `enrichVenueRowsWithProfileAvatars`+`venueSeatEntryToLaneItem`のfallback経路が白丸を
  出さないこと、既存テスト21件(`venueAvatar.test.js`+`venueLaneBuckets.test.js`)実行で
  確認済み。
- CDN実在性、curlで実測済み(7件中5件が200、2件が404)。
- `isLaneMirrorUsableForVenue`のSOFT_WINDOW_MS=180000、実読で確認済み。
