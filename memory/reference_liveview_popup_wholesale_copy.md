# 純Web /live-view = 本物 popup.html の丸ごとコピー（chrome シム方式）

> 正本。純Web `app.tsuioku-no-kirameki.com/live-view?v=<token>` を、拡張内 応援ライブビュー
> （= popup.html を iframe で丸ごと出す＝完璧）と「まったく同じ＝コピー」にするための設計。
> ★セクションを1個ずつ独自に組み立てて足すのは【禁止・ユーザーが何度も否定】。

## ★★実装完了（2026-06-26・v0.1.948）= 丸ごとHTML鏡方式に作り直した★★

下の「最終確定方針」を**実装した**。per-section paint は純Webから撤去済み（拡張側の per-section publish は
domMirror が無い時のフォールバックとして残置）。**経路（実装済み・verify:cc 全8緑）**:
- 拡張: 新 `src/lib/sanitizeFullHtml.js`（丸ごと用 sanitizer・既存 mirrorSanitize.js は不変）+ `src/lib/liveviewDomMirror.js`
  （`buildLiveViewDomMirrorSnapshot` / `publishLiveViewDomMirror` 純関数寄り・テスト済）。
- popup-entry.js: `paintWatchPopupUi` の全 paint 後に `publishLiveViewDomMirrorFromMain(...)` を1行呼び、
  `.nl-main` の outerHTML を sanitizeFullHtml→`KEY_LIVEVIEW_DOM_MIRROR`（storageKeys.js・nls_liveview_dom_mirror_v1）へ。
  INLINE_PASSIVE は書かない・8秒 min-gap・best-effort（記録/描画は不変）。
- status-entry.js: `loadDomMirrorSafe()` を extras（12秒間引き=毎回 read を増やさない）で読み、jsonBlob に
  `domMirror:{ html, liveId, capturedAt }` を相乗り（api/status.js は丸ごと保存=無変更）。
- 純Web `app/live-view.js`: **「貼るだけ」に全面書き直し**。chrome シム+popup-entry import+per-section paint を**全廃**。
  GET?v=→domMirror.capturedAt 3分鮮度ガード→`host.outerHTML = domMirror.html`（class 維持の outerHTML 置換）→
  初回ロード幕（nl-init-shade--done+hidden）と利用規約ゲート（html[data-nl-usage-terms-ack='1']）を JS で隠す→
  60秒ポーリング（前回 html と同一なら skip=白フラッシュ防止）。build.mjs の live-view ターゲットは popupDefine 不要に。
- max-lines ラチェット: popup-entry は HEAD でちょうど 21040。今回 import3行+呼び出し1行で 21046 へ（publish 本体は
  lib 抽出済=「機能追加の例外」枠・eslint.config.js コメントに記録）。feature-map の storage 断線 baseline に
  KEY_LIVEVIEW_DOM_MIRROR を追加（producer が computed key 経由の偽陽性・KEY_LANE_MIRROR と同型）。
- sanitize 仕様: class 全保持 / a href は http/https のみ / style は --nl-* と color・background-color のみ /
  [hidden] 保持 / img src は http(s) と data:image/svg+xml のみ / script・on*・iframe・style タグ・form 削除 / id nonce rename。
- ⚠**次=ユーザー実機検証**: ①PC で配信を開き popup/状態速報を一度開く→②`/live-view?v=<token>` を別端末/スマホで開く→
  「左(拡張 popup)と右(純Web)が全体一致」を確認。chrome-extension:// は私のツールで開けない=実機はユーザー。
  ★per-section が残るのは domMirror=null（popup を一度も開いていない）の時だけ。普通は domMirror が出る。

## ★★最終確定方針（2026-06-25 夜・ユーザー「1個ずつ足す発想がダメ・同じものでないとひどい」）★★

**セクション別 paint（per-section mirror）方式は廃止する。** 理由（実データで確定）:
- 各鏡（laneMirror / statCardsMirror / northStarMirror / topSupporters）は【別々のタイミング・別々の鮮度】で
  publish されるため、WEB 側で「数字カードは17分前で鮮度切れ・応援者ランキングはそもそも送られていない・
  りんく段は link:0」のように【永久に揃わない】。1個ずつ paint 関数を足すほど穴が増える。
- ユーザーの一貫した要求＝「コピー」「同じものにしろ」。

**正しい方式 = popup が今表示している `.nl-main` の outerHTML を【1かたまり】で publish し、WEB はそれを貼るだけ。**
- 全セクションが同時・同一・鮮度1つ。文字通り「同じDOM」。北極星レーンが既に mirrorHtml 方式なので発想は実証済み。
- WEB 側の app/live-view.html は popup.html 丸ごとコピー＝**CSS class が全部揃っている**ので、`.nl-main` の
  HTML（class 保持）を流し込めば【CSS で】popup と同一に描ける。style 属性は不要（class+コピー済み<style>で足りる）。

### 実装の要点（次の人へ・未実装）
1. 拡張側（popup-entry か content）: popup の `.nl-main`（または描画済みルート）の outerHTML を取得 → sanitize →
   KEY_LIVEVIEW_DOM_MIRROR 的なキー（or 既存 publish 経路）へ。status が jsonBlob に `domMirror` として相乗り。
   ★publish タイミングは1本化（全セクションが1スナップショットで揃う）。
2. WEB 側 app/live-view.js: per-section paint（paintStatCardsMirror/paintLaneMirror/paintNorthStarMirror/
   paintSupporterRanking）を【全廃】し、domMirror を `#nl-main`（or 相当）に innerHTML 注入するだけにする。
   chrome シム＋本物 popup-entry 起動は不要になる可能性大（HTML を貼るだけなら popup.js を動かさなくてよい）。
   ※ただし popup.js のローディング幕/ゲート解除は別途必要（HTML 注入前に幕を外す軽い処理）。
3. ★sanitizeMirrorHtml の調整が要る: 現状は小フラグメント用で `style`/`href`/非whitelistタグ/[hidden]を削る。
   全popup を通すには (a) `a`/`href`（ユーザーページリンク）を許可 (b) lane/grid が使う class 以外の必要属性
   （loading/decoding/referrerpolicy/data-*）を検討 (c) [hidden] セクションの扱い（popup は hidden を JS で外す）。
   → 「丸ごと」用に sanitize を緩めるか、専用 sanitizer を作る。XSS は維持（script/on*/style/危険protocol は削る）。
4. 画像パス: popup の `images/...` を WEB で `/app/images/...` に（注入時に置換 or <base href="/app/"> は既に注入済み）。
5. ★送信サイズ: `.nl-main` 全体（70人タイル等）が Upstash/Vercel 上限内か実測必須。超えるなら段ごとに cap。
   現状の per-section snapshot は ~45KB。丸ごとHTML はもっと大きい可能性＝サイズ測定が着手前の関門。
6. 鮮度: domMirror に capturedAt を1つ持たせ、WEB は3分ガードで「終わった配信の残骸」を隠す（従来同型・1つで足りる）。

### これまでの per-section 実装（v0.1.942〜947・破棄予定だが当面は動く）
chrome シム＋本物 popup-entry 起動＋per-section paint。下記の旧記述は per-section 方式の記録。
丸ごとHTML 方式に移行したら、app/live-view.js の per-section paint は撤去する。

## 決定（2026-06-25・司令塔＋ユーザー確認）

- **方式 = 本物 popup.html を DOM+CSS 丸ごとコピー＋本物 popup.js を chrome シムで純Webでも起動**
  （= 拡張 live-view が popup を iframe で出すのと同じ「本物をそのまま動かす」を純Webで再現）。
- **データの渡し方 = 鏡（mirror）から描く**（生コメントデータは送らない）。
  - 理由（調査で判明・重要）: 本物 popup は応援レーン/数字カード/北極星レーンを
    **生コメントデータ**（`nls_comments_<lv>` 等・最大70人規模で数千行）から毎回**再計算**して描く。
    鏡（laneMirror/statCardsMirror/northStarMirror）は popup が**書く**側で、**読まない**。
  - 生データを送ると数MB→Upstash/Vercel のサイズ上限で詰まる（「URL共有が止まる」の温床）。
  - よって **popup の受動モード（dock=liveview）だけ「生データが無ければ鏡から本物 paint 関数で描く」**
    経路を足す。拡張側の本番挙動は不変（dock=liveview ＝ 元々 INLINE_PASSIVE で書込/注入/fetch なし）。

## なぜ「本物 popup.js を動かす」必要があるか（生データ無し paint だけでは不足）

popup.html には popup.js が管理する要素が多数ある:
- `#nlInitialLoadShade`（全画面ローディング幕）→ popup.js の `dismissInitialLoadShade()` で外す。
- `#usageTermsGate`（利用規約ゲート）→ `applyUsageTermsGateState()` で隠す。
- 多数の `hidden` セクションを popup.js のロジックが reveal する。
popup.js を動かさないとこれらが残って白/覆い被さり画面になる。→ **本物 popup.js を起動させるのが最も忠実なコピー**。

## chrome シムの最小サーフェス（dock=liveview 受動モード）

`globalThis.chrome` を **popup-entry を import する前に** 設置する:
- `chrome.runtime.id`（truthy 必須・`hasExtensionContext()` が `runtime.id && storage.local` を見る・popup-entry.js:2795）
- `chrome.runtime.getURL(p)` → `/app/<p>`（画像/アセットを純Web配下へ）
- `chrome.runtime.getManifest()` → `{ version }`、`chrome.runtime.lastError` → undefined
- `chrome.storage.local.get(keys)` → 設定キーの既定値＋**鏡キー**（snapshot から）を返す
  - 3シグネチャ対応: get(string) / get(array) / get(object-defaults) / get(null=全件)
- `chrome.storage.local.set/remove` → no-op（受動モードなので呼ばれてもよい・実害なし）
- `chrome.storage.onChanged.addListener` → 登録のみ（純Webでは発火しない＝初回 paint は get() 由来で完結）
- `chrome.storage.session.{get,set}` → no-op
- それ以外（tabs/windows/scripting/downloads/webNavigation/runtime.sendMessage）→ no-op スタブ
  （INLINE_PASSIVE ガードで呼ばれない。万一呼ばれても Promise.resolve 等で落とさない）

★synchronous boot blocker は無い（調査確定）。全 chrome 呼びは async 関数か防御ラップ内。

## 鏡キー → storage キーのマッピング

snapshot（GET /api/status?v=token の data）の各鏡を、popup が読む storage キーに載せる:
| snapshot フィールド | storage キー（定数） | 文字列値 |
|---|---|---|
| laneMirror | KEY_LANE_MIRROR (laneMirrorKey.js) | nls_lane_mirror_v1 |
| statCardsMirror | KEY_STAT_CARDS_MIRROR (statCardsMirrorKey.js) | （定数参照） |
| northStarMirror | KEY_NORTH_STAR_MIRROR (northStarMirrorKey.js) | （定数参照） |

## 本物 paint 関数（似せて自作しない・全て再利用）

- 応援レーン: `restoreLaneMirrorBuckets` → `paintStoryUserLaneDomFilled` / `paintStoryUserLaneDomEmptyGuides`
- 数字カード: `paintStatCardsMirrorValues`（+ `buildStatCardsMirrorSignature`）
- 北極星レーン: `paintNorthStarLaneBody`（src/lib/northStarLaneDom.js）/ `officialDomRankingRowsToStripRooms`
- 配信者カード: `buildChikuranCardModel` → `buildChikuranHeaderDom`
- 応援者ランキング: `buildSupporterRankingRows` → `supporterRowToPersonTile` → `buildPersonTileEl`

## ファイル構成

- `app/live-view.html` = `extension/popup.html` の DOM+`<style>` 丸ごとコピー。
  - `<script src="dist/popup.js">` を外し、新エントリ `/app/dist/live-view.js` を `type="module"` で読む。
  - 画像パス `images/...` → `/app/images/...`（vercel 配下は相対 `images/` が `/images/` に化けて404）。
- `app/live-view.js`（新エントリのソース）= chrome シム設置 → snapshot fetch → storage 充填 →
  本物 `popup-entry.js` を dynamic import で起動 → 受動モードの鏡 paint 経路に乗る。
- `app/images/` = `extension/images/` を丸ごとコピー（93ファイル）。
- build.mjs の `app/live-view.js` ターゲット（既存）が新エントリをバンドル（chrome 依存は esbuild で同梱・実行時はシムが食う）。

## 反映3手順（毎回ユーザーに伝える）
1. git pull → 2. chrome://extensions リロード(🔄) → 3. watch タブ F5。
（純Web側は Vercel へ push で反映だが、鏡を送るのは拡張なので拡張リロードも要る）

## 戒め
**「コピー」= popup.html を丸ごと＋本物 popup.js を動かす。セクションを独自に足すな。**
描画は本物 paint 関数を import 再利用。実機で白画面でないことを確認するまで「できた」と言わない。
[[feedback_self_verifying_loop]] [[feedback_meeting_room_for_complex_tasks]]
