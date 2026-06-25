# 純Web /live-view = 本物 popup.html の丸ごとコピー（chrome シム方式）

> 正本。純Web `app.tsuioku-no-kirameki.com/live-view?v=<token>` を、拡張内 応援ライブビュー
> （= popup.html を iframe で丸ごと出す＝完璧）と「まったく同じ＝コピー」にするための設計。
> ★セクションを1個ずつ独自に組み立てて足すのは【禁止・ユーザーが何度も否定】。

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
