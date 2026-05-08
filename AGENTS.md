# AGENTS.md — プロジェクト引き継ぎノート

Cursor / Claude Code / その他エージェントが共通で参照する前提ファイル。
**過去の詳細セッション履歴は [docs/agents-session-history-archive.md](docs/agents-session-history-archive.md) に分離。** ここは現役の設計判断・運用ルールのみ残す。

---

## 1. プロジェクト概要

- **名称**: 君斗りんくの追憶のきらめき（Chrome 拡張機能）
- **ドメイン**: https://tsuioku-no-kirameki.com/ （紹介 LP + プライバシーポリシー）
- **運営**: Kimito-Link Project
- **単一用途**:
  ニコニコ生放送 (`*.nicovideo.jp`) で流れる応援コメントを、利用者本人の
  ローカル PC (`chrome.storage.local`) の中にのみ記録し、放送終了後に
  3 つのレーン（りんく／こん太／たぬ姉）＋活発度の色分けで振り返れるよう
  可視化すること。

---

## 2. Chrome Web Store ステータス

- **拡張 ID**: `cjbabignmmodaickpeckiojjabnlogdb`
- **公開中**: **0.1.7**（2026-04-23 提出 / 2026-04-29 公開）
- **直近提出**: **0.1.102**（2026-05-01 23 時台 / 自動公開 ON / 審査結果は要確認）
- **ローカル開発**: `feature/live-item-throw-by-user` ブランチで **v0.1.168** まで進行中（2026-05-05 時点）。CWS 未提出
- **CWS Developer Dashboard 入力の正本**: [docs/releases/cws-submission-texts.md](docs/releases/cws-submission-texts.md)
  - 提出時に毎回そこから貼り直す運用（再構築コスト削減）
- **ホスト権限**: `https://*.nicovideo.jp/*` のみ（`localhost`/`127.0.0.1` は提出版から除外）
- **次回提出時のチェック**:
  1. ZIP 生成: `python scripts/stage-submission.py <version>`
  2. `npm run verify:bump` で manifest / package / changelog 整合確認
  3. ダッシュボード本文を `docs/releases/cws-submission-texts.md` から貼り直し
  4. privacy.html とダッシュボード入力の文言整合（特に「AI 連携」「個人特定情報」）

---

## 3. 重要な設計判断（今後も踏襲すること）

### 3.1 「ゆっくり」という言葉の扱い
本拡張のオリジナルキャラクター（りんく・こん太・たぬ姉）は **東方Project の二次創作キャラクター（霊夢・魔理沙）ではない**ため、「ゆっくり〜」「ゆっくり解説」という表現を使ってよい。一方で description / store listing では「3 匹のガイドキャラ」「オリジナルキャラクター」「やわらかい雰囲気のキャラ案内」などの言い回しも併用する。popup UI / LP 内では「ゆっくり始める」「ゆっくり解説」等を従来どおり使用してよい。

### 3.2 3 キャラの役割（ブレさせない）
| キャラ | 役割 | レーン |
|---|---|---|
| りんく | 配信者視点 | りんくレーン |
| こん太 | ファン視点 | こん太レーン |
| たぬ姉 | 匿名ガイド / しっかり者解説 | たぬ姉レーン（184 匿名コメントの振り分け先） |

### 3.3 プライバシーの合言葉
- **外部送信なし / 広告なし / 計測なし / 完全ローカル保存**
- AI 連携（OpenRouter）は**現時点で未実装**（将来予定）。privacy.html §6 と CWS ダッシュボード「単一用途」「データ使用」フィールドはこれと整合させる
- `chrome.storage.local` のみを保存先とし、自動同期はしない

### 3.4 識別子の扱い
- 内部識別子 `nicolivelog` は `manifest.json` の description に **含めない**
- CWS ストア掲載上の名称は `君斗りんくの追憶のきらめき` で統一

---

## 4. ファイル配置のルール

```
extension/             ← 拡張本体のソース。ここを編集する。
  manifest.json        ← 公式の配布版ソース。version を更新する場所。
  images/logo/         ← アイコンのマスター（16/32/48/128/256/512）

src/                   ← LP 側 + 純粋関数ライブラリ
  extension/           ← popup-entry.js / content-entry.js / background 系
  lib/                 ← 純粋関数（unit test 対象）
  images/googlechrom/  ← CWS 提出物のマスター（コミット対象）
    konta-yukkuri-icon-128.png   ショップアイコン
    promo-tile-440x280.jpg       プロモタイル(小)
    marquee-1400x560.jpg         マーキー

tsuioku-no-kirameki/   ← 本番 LP の配信ディレクトリ（GitHub Webhook で XServer に deploy）
  index.html           ← LP 本体
  privacy.html         ← プライバシーポリシー
  google7e3e79636d884c2.html   Search Console 所有権確認（残置）
  google7e3e79636d884c2f.html  同上（末尾 f 付きが正で、Search Console 側で選択）

build/                 ← .gitignore 対象。CWS 提出用 ZIP + 生成アセット置き場
  store-listing/
    description-ja.txt                5,377 字（そのまま貼付け用）
    privacy-justifications-ja.txt     7 種の権限理由 + データ開示テンプレ
    screenshot-1〜5-*.jpg              1280×800
    promo-video.mp4                   46s / 1920×1080 / H.264（YouTube アップ済）
    youtube-thumbnail-1280x720.jpg    YT サムネ
    _gen_*.py                         再生成用 Python スクリプト
```

**編集時の注意**:
- `build/` は gitignore されているので、中の成果物は `_gen_*.py` から **再生成可能な状態** を保つこと
- CWS 提出物のマスターは `src/images/googlechrom/` にだけ置く（`build/store-listing/` は中間生成物扱い）

---

## 5. 直近の変更履歴

過去のセッション別変更詳細は [docs/agents-session-history-archive.md](docs/agents-session-history-archive.md) を参照。**個別 commit は git log で十分追えるので、ここには集約しない方針**（プロンプト税対策・2026-05-05）。

直近のローカルバンプは `feature/live-item-throw-by-user` ブランチで v0.1.165〜v0.1.168（2026-05-05）：
- v0.1.165: ロード演出 CSS auto-fade フェイルセーフ
- v0.1.166: NDGR field 6 単独「ニコ生現在 N 位」誤表示撤去 + 診断 JSON 強化
- v0.1.167: ツールバー押下で何も出ない事故修正（panel 画面外時に popup window fallback）
- v0.1.168: 貢献度ランキング scraper を実 DOM `.content-supporter-section` 構造に対応

---

## 6. 審査通過後にやること（TODO）

1. **LP (`tsuioku-no-kirameki/index.html`) に「Chrome ウェブストアで入手」ボタンを追加**。URL は承認メールが来たら CWS の公開ページから取得。ヒーロー CTA とフッターの 2 箇所
2. **privacy.html の最下部「インストールは Chrome ウェブストアから」リンクも同じ URL に差し替え**
3. **スクリーンショットの段階的差し替え検討**（現状コンセプトモック → 実動画面）
4. **YouTube 動画の説明欄に CWS の公式 URL を追加**
5. **レビュー・評価が付き始めたら、LP の「ユーザーの声」セクションを更新**

---

## 7. コミット・メッセージ規約

- プレフィックス: `feat` / `fix` / `chore` / `docs` / `refactor` / `style` / `test`
- スコープは括弧で括る: `feat(lp): ...` / `fix(privacy): ...`
- 日本語本文で OK。件名は 1 行 50〜72 字目安
- Claude Code が付ける `Co-Authored-By: Claude ...` 行はそのまま残す

---

## 8. デプロイ / CI

- **LP**: `master` ブランチへ push すると、XServer 側の GitHub Webhook が自動で `tsuioku-no-kirameki/` 配下を本番反映する。ビルド手順は不要
- **拡張 ZIP**: `python scripts/stage-submission.py <version>` で一括生成
  - 生成物: `build/submission-<version>/` と `build/tsuioku-no-kirameki-<version>.zip`
  - スクリプトが自動でやること: (1) dev manifest から localhost / 127.0.0.1 を落とす (2) description の「（開発識別子: nicolivelog）」サフィックスを落とす (3) ホワイトリストで必要な画像だけコピー (4) ZIP 出力前に全エントリがフォワードスラッシュか検証

---

## 9. エージェントへのお願い

- **この AGENTS.md を最初に読むこと**。とくに §3.1「ゆっくり OK」と §3.2「3 キャラの役割」はコピー＆新規生成するコンテンツに波及しやすい
- **CWS 申請関連のファイル**（`src/images/googlechrom/`, `build/store-listing/` の `description-ja.txt` / `privacy-justifications-ja.txt`）は、仕様・文言を変える際に必ず「審査通過後の差分提出」を意識する
- **プライバシー周り**の文言を変更したら、`privacy.html` と `description-ja.txt` と `privacy-justifications-ja.txt` の 3 点を同期させる（片方だけ変わると審査で齟齬として指摘される）
- **拡張 bump は build + commit + push + 本体 pull + chrome://extensions リロード + watch タブ F5 まで 1 セット**（途中で止めると Chrome に届かない）
