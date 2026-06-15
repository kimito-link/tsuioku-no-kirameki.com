# reference: ユーザー別ユニークボイス読み上げ（VOICEVOX連携）設計正本

> 2026-06-12 ユーザー要望「来場ユーザーごとにユニークな声を自動割り当てて読み上げ。userIdごとに声を
> 紐づけ保存し2回目以降は同じ声。300人同接想定。VOICEVOX等ローカル音声合成で無料実装」。

## 実現性

**完全に可能・無料**。VOICEVOX はローカル HTTP サーバー（http://127.0.0.1:50021）として動作し
API 課金なし。利用規約はキャラごとのクレジット表記（「VOICEVOX:ずんだもん」等）のみ。
主要API: `GET /speakers`（スタイル一覧）→ `POST /audio_query?text=..&speaker=<styleId>` →
`POST /synthesis?speaker=<styleId>`（wav が返る）→ `<audio>` 再生。

## 核心設計

### 1. 声の割り当て＝決定論ハッシュ + 保存上書き
- 純関数: `hash(userKey) → { speakerStyleId, pitchScale補正, speedScale補正 }`
- VOICEVOX スタイルは約60〜100種。300人で被らないよう **pitch(±0.06・5段)×speed(±0.1・3段)の
  微調整をハッシュから導出**して掛け合わせ＝約900通りのユニーク声
- 同じ userId は常に同じ声（決定論ハッシュなので保存なしでも安定・端末を跨いでも同じ）
- さらに `nls_voice_assignments`（userKey→styleId/params）に保存して**手動上書き**を可能に
  （コメビュの「この人の発言」「ニックネーム」機能と同じ UX 系統＝ホバーメニューに「声を変える」）
- 匿名(184)は userId 代替キー（コメビュのアイコン色生成と同じ a: キー）で同様に安定割り当て

### 2. 読み上げパイプライン（コメビュ comeview.html に内蔵）
- 「🔊読み上げ」トグル（既定OFF）。OBS透過モード(?obs=1)では音は出さない（配信音と二重になるため）
- 新着コメント → 直列再生キュー → audio_query/synthesis → 再生
- 渋滞対策: キュー N件(例:5)超で古い順にスキップ（「○件スキップ」表示）。
  段階制御で speedScale を自動引き上げ（1.0→1.2→1.4）も検討
- VOICEVOX 未起動時はトグル横に「VOICEVOX が見つかりません（起動してください）」
- 本文の前処理: URL/長文の切り詰め・ギフト/システム行の読み分け（名前+「○○です」等）

### 3. manifest 変更（CWS 注意）
- host_permissions に `http://127.0.0.1:50021/*` を追加（VOICEVOX 既定ポート）
- CWS 再申請の理由書（cws-submission-texts.md）に「ローカル音声合成エンジン連携」を一行追記

### 4. PR 分割
- **PR-V1**: 純関数 `src/lib/voiceAssignment.js`（hash→声パラメータ・スタイル一覧から決定論選択・
  テスト10件以上）
- **PR-V2**: `src/lib/voicevoxClient.js`（audio_query/synthesis・タイムアウト・未起動検知）+
  再生キュー純関数 + comeview 配線（トグル・キューUI）
- **PR-V3**: 声の手動上書きUI（コメビュのホバーメニュー「声を変える」→スタイル選択・
  nls_voice_assignments 保存）

### 5. 将来
- SW 読み上げ（タブ依存なし・SW移行基盤に乗せる）
- COEIROINK / AivisSpeech 対応（VOICEVOX 互換 API・ポート違いだけ）
- 読み上げの声をコメビュのアイコン色とリンク（視覚と聴覚の一致＝「あの色のあの声の人」）

## 競合との差別化

わんコメ+棒読みちゃん/VOICEVOX 連携は「1つの声で全部読む」が基本。
**「人ごとに声が違う・いつ来ても同じ声」は『常連が声で分かる』という配信者体験の発明**で、
追憶の「応援の可視化」思想（情報セット原則・唯一性）の聴覚版になる。
