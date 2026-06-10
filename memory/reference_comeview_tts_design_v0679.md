# コメビュ内蔵読み上げ(TTS) 設計メモ v0.1.679

司令塔(Claude Code)発・Codex CLI 向け。2026-06-10。

## 方針

- **Web Speech API(speechSynthesis)のみ**を使う: 追加インストール不要・manifest 権限変更不要
  (CWS 審査中のためリスクゼロ構成)・拡張ページ(comeview.html)でそのまま動く。
- 外部連携(VOICEVOX/棒読みちゃん=localhost HTTP)は**今回やらない**(審査後に opt-in で別PR)。
- わんコメの読み上げ体験を手本: ON/OFF・フラッド制御(溜まったら読み飛ばす)・
  ユーザー単位ミュート。

## 実装

### PR1: 純関数 `src/lib/comeviewTtsQueue.js`(+vitest 必須)

読み上げキューの判断ロジックを純関数化(speechSynthesis 非依存=テスト可能):
- `buildTtsUtteranceText(item, opts)` → 読み上げ文字列。
  - comment: 「(表示名、)本文」。名前読み上げは設定(既定 OFF=本文のみ。わんコメ既定に合わせる)
  - gift: 「(名前)さんが(アイテム名)を贈りました」
  - URL は「URL省略」に置換・絵文字連打や同一文字の3連超は圧縮・最大読み上げ長 80 字で切る
- `shouldSkipForFlood({ queueLength, maxQueue })` → キューが maxQueue(既定 3)超なら古い未読を捨てる
  判断(「最新だけ読む」=わんコメ同様、配信に追従し続ける)
- `isTtsMutedRow(row, mutedKeys, ngKeys)` → ユーザー単位ミュート+NG は読まない
- 設定の正規化 `normalizeComeviewTtsSettings(raw)` → { enabled, readName, rate, volume, mutedKeys: string[] }
  (storage キー `nls_comeview_tts_v1`・グローバル)

### PR2: comeview-entry.js 配線(最小差分)

- ツールバーに「🔊読み上げ」トグルボタン(ON で speechSynthesis 開始・OFF で cancel+キュー破棄)。
  状態は nls_comeview_tts_v1 に永続(他のコメビュ窓とは独立に発話=二重読み防止のため
  **発話するのは操作した窓だけ**。OBS 窓(?obs=1)では読み上げ UI ごと無効)。
- 新着 append パイプライン(appendTimelineItems 相当)に hook: enabled なら
  buildTtsUtteranceText → SpeechSynthesisUtterance(lang='ja-JP'・日本語 voice を自動選択)
  → speak。フラッド制御は shouldSkipForFlood(pending 監視)。
- ホバーバーに **🔇このユーザーを読み上げミュート** ボタンを追加(CV_ACTION_ICONS に
  mute アイコン定数を足す・固定SVGのみ)。ミュート一覧の解除は既存 NG パネルと同様の
  簡易リスト(🔊ボタン長押し等の複雑UIはやらない。ヘッダの NG ボタン横に「🔇 n」を出し
  クリックで解除パネル)。
- 一時停止ボタン(既存)で読み上げも止める。document.hidden では読み続けてよい
  (配信を見ながら別窓のコメビュを聞く用途)。

## 受け入れ基準

- npm run verify 全緑・新規純関数に vitest テスト
- bump 0.1.679(manifest/package/changelog.js 先頭・summary 35字以内)
- manifest.json の permissions は**変更しない**こと(speechSynthesis は権限不要)
- git commit/push はしない(司令塔が実機検証後に行う)
- 既存機能の後退ゼロ(即時append/ホバーバー/コメピタ/詳細パネル/OBS透過)
