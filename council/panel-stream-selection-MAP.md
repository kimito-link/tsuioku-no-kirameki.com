# 横の欄(サイドパネル)・コメビュが「どの配信を出すか」を決める流れ — MAP

- 作成: 2026-11-09 司令塔(実コードを読んで裏取り済み。行番号は 0.1.1945 時点の master+PR #591 ブランチ)
- 方式: AGENTS.md §12.10 wayfinder→to-spec。次は `panel-stream-selection-SPEC.md`(Fable 設計)
- りんくの症状(2026-11-09 実機): SHOWROOM・Kick・Twitch・ふわっち・ミクチャ・TikTok のタブを前面にしても、
  横の欄が YouTube(や Kick)の配信を出す。「一瞬変わって、また YouTube に戻る」。
- りんくの指示: 「車輪の再発明にならないように調査して会議」「コンポーネント＆リファクタリングもすべきかも」

---

## 0. 一言でいうと

**ニコ生版には「どの配信を出すか」を決める正しい仕組みが3層そろっている。
YouTube 系(YouTube+6サービス)はその3層のうち2層を素通りし、代わりに shim の中で
「記録がいちばん最近更新された配信」という別の決まりで推測している。** これが真因の根。
0.1.1946 候補(未配置)は shim の中にさらに「前面タブを探す」仕組みを足したもので、
ニコ生版の層をもう一つ作り直している(=車輪の再発明)。

---

## 1. ニコ生版の正しい仕組み(既存部品)

| 層 | 部品 | 何をする | 場所 |
|---|---|---|---|
| A. 外枠の追従 | `sidepanel-iframe-boot-entry.js` + `pickPanelLv`(sidePanelLvFromTabs.js) | パネルはグローバル1枚。前面タブが watch ならその lv を iframe src `?lv=` に焼き、`tabs.onActivated` / `onUpdated` で**別の配信になったら iframe を読み込み直す**(`loader.update`)。watch 以外へ移ったら今の配信を保つ | src/extension/sidepanel-iframe-boot-entry.js:58-101 |
| B. 中身の選択 | `pickWatchUrlFromMultipleSources` | popup の refresh ごとに 優先順 inlineParam → activeTab → dataBacked → lastFocusedNormal → storage(`nls_last_watch_url`) で URL を決める | src/lib/popupWatchUrlResolveMultiTab.js:100 / 呼び出し popup-entry.js:14918-15042 |
| C. 「最後に見た配信」の記憶 | content-entry `rememberWatchPageUrl` | **watch ページ自身が、前面に来たとき(focus/visible)と URL が変わったときだけ** `nls_last_watch_url` を書く。popup も activeTab/lastFocused で決めたときだけ書く | src/extension/content-entry.js:10548-10573 / popup-entry.js:15033-15042 |
| D. コメビュの追従 | comeview-entry | `?lv=` 明示なら固定。無ければ `nls_last_watch_url` を読み、その変化で `switchToLiveId` | src/extension/comeview-entry.js:413-450, 2381-2384 |

ニコ生版では A が iframe を作り直すので、文言・状態は毎回まっさら。C は「見た」事実だけを書く。

## 2. YouTube 系がいま通っている道

| 層 | 実際 | 場所 | 問題 |
|---|---|---|---|
| A | `isYtPanelTabUrl(url)` なら固定の `YT_PANEL_SRC`(**配信を表す値なし**)。`follow()` は「今が yt-sidepanel でなければ」だけ付け替え | ytPanelRoute.js:5-11 / boot:63-64, 83-86 | **YouTube→Kick→TikTok と移っても src が同じなので iframe は一度も読み込み直されない**。ニコ生↔YT 系の切替だけ反応 |
| A' | `isYtPanelTabUrl` の正規表現は STREAM_PLATFORMS とは別に手書き | ytPanelRoute.js:10 | サービス追加のたびに2か所直す(重複) |
| B | `tabs.query` / `tabs.get` / onUpdated・onCreated は `mapTab` で疑似 lv に写す | ytNicoShim.js:126-136, 926-1029 | 記録の無いチャンネルは写せない(1946 で仮キー対応)。**`windows.getLastFocused` は写していない**ので lastFocusedNormal 経路は YT 系で常に空振り |
| C | YT 系の content script は `nls_last_watch_url` を**書かない**。shim が**読むときに**「記録の updatedAt が最新の配信」へ差し替える | ytNicoShim.js:55-66, 810-815, 828-834 | 裏で記録中の YouTube タブが常に「最後に見た配信」になる。popup が activeTab で書いた正しい値も、読むたびに上書きされる |
| C' | 記録の更新(`yt_stream_summaries` 変化)のたびに shim が `nls_last_watch_url` の**偽の変化**を listener に配る | ytNicoShim.js:1114-1131 | コメビュ・popup が裏の配信へ引っ張られる(「一瞬変わって戻る」の有力候補) |
| D | コメビュは同じ偽の値で追従 | comeview-entry.js:2381 | 同上 |
| 文言 | `fixTextNode` / `screenWording` が DOM を**その場で書き換え**、`screenPlatformBase` は lastAskedLv → newest で決める | ytNicoShim.js:1351-1420 | iframe を作り直さないので前のサービスの言葉(「Kicks ランキング」等)が残る |
| 疑似 lv の対応表 | `videoIdByLv` / `lvByVideoId` は shim のモジュール内 Map | ytNicoShim.js:93-120 | 外枠(boot)からは疑似 lv が引けない(boot は配信キーを知らない) |

## 3. 0.1.1946 候補(未コミット・`/mnt/project-files/platform-panel/candidate-0.1.1946.patch`)が足したもの

- `frontWatchKey()`: shim の中で `tabs.query({active})` をもう一度呼んで前面タブのキーを探す → **層 B(activeTab)と層 A の再実装**
- `reloadIfWordingPlatformChanged`: サービスが変わったら `location.reload()` → **層 A の iframe 作り直しの再実装**
- 仮キー `<head><login>.00000`(記録の無いチャンネル): 必要(層 A/B に渡す値がそもそも無い問題の手当て)
- `lastAnnouncedWatchUrl`: 偽の変化の配りすぎを抑える(C' の対症療法)

単体テスト・型・9サービス e2e・verify:cc は通ったが、PC 実機では未確認。

## 4. 裏取りできていないこと(推測のまま設計しない)

1. 「一瞬変わって戻る」の**戻す犯人**は C' か、popup の別経路(lastPainted lid・鏡・lane の lid 解決)か。実機の計器で未確認。
   → 計器案: shim に「誰が lv を決めたか(source)」と「偽の変化を配った回数・そのときの前面キー」を診断に出す。
2. サイドパネル内の `tabs.query({active:true,currentWindow:true})` が、パネルにフォーカスがあるときも配信タブを返すか(ニコ生版 boot のコメントでは返す前提・実測は v0.1.1696 時)。
3. ニコ生版で `?lv=` は popup に読まれていない(`INLINE_OWN_WATCH_URL` は sidePanel では空・popup-entry.js:1063-1073)。ニコ生版の正しさは「iframe 作り直し+activeTab」で成り立っている。

## 5. 既存部品の棚卸し(使い回せるもの)

| 部品 | 使い道 |
|---|---|
| `STREAM_PLATFORMS` / `platformChannelOfUrl` / `platformOfStreamKey`(streamPlatform.js) | URL→サービス・チャンネル。`isYtPanelTabUrl` の手書き正規表現をこれに置き換えられる |
| `pickPanelLv` / `sidepanel-iframe-boot-entry` の `follow` | 「前面タブ追従+watch 以外では保つ」をそのまま YT 系にも使える(比較する値を lv から「タブの配信URL」に広げる) |
| `pickWatchUrlFromMultipleSources` | shim が `windows.getLastFocused` も写せば、YT 系でもそのまま正しく働く |
| `rememberWatchPageUrl` の型(content-entry) | YT 系の content script(yt/tw/kk/ww/sr/mx/tt)に同じ「前面に来たら書く」を足せば、shim の「最新更新で推測」が要らなくなる |
| `diagTabShare.js` | 複数タブの書き合いを避ける既存の型(Kick は未適用) |

## 6. 部品化・リファクタの候補(会議で決める)

- (i) **最小**: 層 A を直す=boot の YT 系で src に前面タブの URL(または配信キー)を焼き、URL が変わったら読み込み直す。`isYtPanelTabUrl` を STREAM_PLATFORMS 由来に。
- (ii) **層 C を本物にする**: YT 系 content script が前面時に「最後に見た配信」を書く(共通部品1つを7サービスで共有)。shim の newest 推測と偽の変化(C')を撤去。
- (iii) **層 B の写し漏れ**: `windows.getLastFocused` も mapTab。
- (iv) 1946 の `frontWatchKey` / `reloadIfWordingPlatformChanged` は (i)(ii) が入れば不要=捨てる。仮キーは残す。
- (v) shim(2,484行)の分割: 配信選び・文言・ギフト・絵文字…を別モジュールに。今回の範囲に入れるかは要判断。
