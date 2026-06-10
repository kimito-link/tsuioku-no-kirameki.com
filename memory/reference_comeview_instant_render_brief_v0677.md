# コメビュ即時描画(YouTube式)+ホバーアクション+コメピタ 実装依頼 v0.1.677

司令塔(Claude Code)発・Codex CLI 向け設計メモ。2026-06-10。

## 背景

- v0.1.676 でコメビュ(comeview.html)の一覧は POP(パネル)の応援タイムラインと**完全同一パイプライン**になった(データ=IDB正本>チャンク+テール・整形=buildSupportActivityTimeline・描画=buildSupportTimelineBodyHtml)。実機検証済み。
- ただし現状は「2.5秒ポーリング+innerHTML全再構築」のため、新着の体感が遅くカクつく。
- ユーザー要望: **「YouTube(のライブチャット)みたいにすぐ動くようにしたい」**+わんコメ式ホバー操作+「コメピタ」(=コメントのピン留め固定。わんコメで多用)。
- 世界の定石(調査済み・memory/reference_live_chat_render_world_standards.md): わんコメ/YouTube とも**素のDOM・差分appendのみ・件数上限・最下部追従**。仮想スクロールは件数capがあれば不要。

## 対象ファイル(これ以外は触らない)

- `src/extension/comeview-entry.js`(本丸。仕込み済み: CV_ACTION_ICONS 定数・_hiddenSigs・comeviewPinStorageKey import)
- `extension/comeview.html`(CSS追記。`.cv-pinbar`/`.cv-panel` 等は既存)
- 必要なら `src/lib/` に**純関数を新規追加+vitestテスト必須**(例: 差分append判定)
- ⚠️ `popup-entry.js` / `content-entry.js` / `supportTimelineHtml.js`(POPと共有) は変更禁止

## 実装内容

### 1. YouTube式 即時描画(最重要)

- 並びを **asc(新着が下)** に変更し、**差分appendのみ**にする(innerHTML全再構築は初回だけ):
  - `buildSupportActivityTimeline(comments, gifts, { order: 'asc', limit: 120 })`
  - 各行は `buildTimelineRowHtml(item, opts)`(supportTimelineHtml.js・既存export)で1行ずつ生成して append=POPと同一見た目を維持
  - 既出判定は `TimelineItem.key`(builderが一意キーを持つ)を Set で管理
  - 上限120行: 超過したら先頭(古い)からDOM remove+Setからkey削除
  - **最下部±80pxに居るときだけ**自動で最下部へ追従(読み返し中は邪魔しない)
  - 行追加アニメは既存 `cvRowIn` 相当の軽いslide-in(prefers-reduced-motion で無効)
- **即時性= chrome.storage.onChanged**:
  - `nls_ctail_<lv>` / `nls_gift_events_<lv>` の変化で即時に増分処理(ポーリング待ちゼロ)
  - 新着行の組み立ては「テール由来の新規行だけ」で行い、**IDB/チャンク全読みを hot path から外す**
  - IDB/チャンクの全読み(readCanonicalComments)は「初回・NG変更時・60秒に1回の整合リフレッシュ(プロフィール名の後追い反映を含む)」だけ
  - 既存 interval は保険として残してよい(5秒に伸ばす)
- 全置換リフレッシュ(初回/NG変更/整合リフレッシュ)時はスクロール位置を保つ(最下部追従中なら最下部へ)

### 2. ホバーアクション(わんコメ式)

- **フローティングバー1個を使い回す**(document.body直下・position:fixed・z-index高)。行の innerHTML/append 再描画に耐える(listの外に置くのが要点)
- `#cvList` への mouseover 委譲で `.nl-tl-row` / `.nl-tl-gift` を検出→行の右上に重ねて表示。listのscroll/mouseleaveで隠す(バー自身へのmouseover中は隠さない)
- ボタン(仕込み済み CV_ACTION_ICONS を innerHTML で使用・ユーザー由来文字列は混ぜない):
  - 🗑 この行を隠す: `_hiddenSigs` にシグネチャ追加+行remove。シグネチャは comment=`c|uid|text(trim,500)` / gift=`g|uid|itemName(trim,120)`。タイムライン組み立て時にも同シグネチャでfilter(純関数化+test推奨)
  - ⊘ この人を非表示: 既存 `addNg({userId, name})`。uid無し行は disabled
  - 👤 詳細: 既存 `showUserDetail`。uid無し行は disabled
  - ⧉ コピー: `名前: 本文`(既存 copyTextToClipboard)
  - 📌 コメピタ(ピン留め): 下記3
- OBSモード(`body.is-obs`)ではバーを一切出さない

### 3. 📌コメピタ(ピン留め固定)

- クリックで `comeviewPinStorageKey(lv)` に `{ name, text, at }` を保存。`#cvPinBar`(既存CSS)に表示。✕で解除(storage remove)
- storage 経由なので**同じ配信の全コメビュ窓(OBS透過窓含む)に同期表示**される(各窓は onChanged or 整合リフレッシュで読む)
- OBS窓ではピンバーだけ表示(操作UIなし)・既存CSSに `body.is-obs .cv-pinbar` あり

## 受け入れ基準

- `npm run verify` 全緑(test/lint/typecheck/build)
- 新規純関数には vitest テスト
- bump **0.1.677**: extension/manifest.json + package.json + src/lib/changelog.js 先頭にエントリ(summary は**35字以内**・items はユーザー向け平易日本語)
- **commit はしない**(司令塔が実機検証後に commit/push する)
- 既存機能の後退ゼロ: 詳細パネル(ニックネーム/ラベル/メモ/発言一覧/NG)・?user= 自動詳細・NG管理パネル・OBS透過はそのまま動くこと
