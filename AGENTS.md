# AGENTS.md — プロジェクト引き継ぎノート

Cursor / Claude Code / その他エージェントが共通で参照する前提ファイル。
直近のセッションで決まった設計判断と、引き継ぎ事項をまとめている。

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

- **提出バージョン**: 0.1.6
- **提出日**: 2026-04-19
- **ステータス**: 審査中（承認合格後に自動公開 ON）
- **拡張 ID**: `cjbabignmmodaickpeckiojjabnlogdb`
- **CWS Developer Dashboard**: 投稿者「君斗りんく」
- **ホスト権限**: `https://*.nicovideo.jp/*` のみ（`localhost` / `127.0.0.1` は
  提出版から除外済み）

---

## 3. 重要な設計判断（今後も踏襲すること）

### 3.1 「ゆっくり」という言葉は使わない
- description / LP / store listing に **意図的に** 入れていない。
- 代替表現: 「3 匹のガイドキャラ」「オリジナルキャラクター」
  「やわらかい雰囲気のキャラ案内」。
- 過去の他拡張の審査通過実績に合わせて、このトーンで統一している。

### 3.2 3 キャラの役割（ブレさせない）
| キャラ | 役割 | レーン |
|---|---|---|
| りんく | 配信者視点 | りんくレーン |
| こん太 | ファン視点 | こん太レーン |
| たぬ姉 | 匿名ガイド / しっかり者解説 | たぬ姉レーン（184 匿名コメントの振り分け先） |

### 3.3 プライバシーの合言葉
- **外部送信なし / 広告なし / 計測なし / 完全ローカル保存**
- 唯一の例外が AI 連携 (OpenRouter)。ただし (1) API キー、(2) 機能 ON、
  (3) 送信同意 ON の **3 点すべて手動 ON** のときだけ通信する。既定は全 OFF。
- `chrome.storage.local` のみを保存先とし、自動同期はしない。

### 3.4 識別子の扱い
- 内部識別子 `nicolivelog` は `manifest.json` の description に **含めない**。
- CWS ストア掲載上の名称は `君斗りんくの追憶のきらめき` で統一。

---

## 4. ファイル配置のルール

```
extension/             ← 拡張本体のソース。ここを編集する。
  manifest.json        ← 公式の配布版ソース。version を更新する場所。
  images/logo/         ← アイコンのマスター（16/32/48/128/256/512）

src/                   ← LP 側のソース
  images/googlechrom/  ← CWS 提出物のマスター（コミット対象）
    konta-yukkuri-icon-128.png   ショップアイコン
    promo-tile-440x280.jpg       プロモタイル(小)
    marquee-1400x560.jpg         マーキー

tsuioku-no-kirameki/   ← 本番 LP の配信ディレクトリ（GitHub Webhook で XServer に deploy）
  index.html           ← LP 本体
  privacy.html         ← プライバシーポリシー
  google7e3e79636d884c2.html   Search Console 所有権確認（残置）
  google7e3e79636d884c2f.html  同上（末尾 f 付きが正で、Search Console 側で選択）

build/                 ← **.gitignore 対象**。CWS 提出用 ZIP + 生成アセット置き場。
  store-listing/
    description-ja.txt                5,377 字（そのまま貼付け用）
    privacy-justifications-ja.txt     7 種の権限理由 + データ開示テンプレ
    screenshot-1〜5-*.jpg              1280×800（コンセプトモック）
    promo-video.mp4                   46s / 1920×1080 / H.264（YouTube アップ済）
    youtube-thumbnail-1280x720.jpg    YT サムネ
    _gen_*.py                         再生成用 Python スクリプト
```

**編集時の注意**:
- `build/` は gitignore されているので、中の成果物は
  `_gen_*.py` から **再生成可能な状態** を保つこと。
- CWS 提出物のマスターは `src/images/googlechrom/` にだけ置く
  （`build/store-listing/` は中間生成物扱い）。

---

## 5. 直近セッションで入った変更（2026-04-19）

```
af5ec15 chore: Google Search Console 所有権確認用 HTML を設置
3d9172b fix(privacy): topbar を LP と同じハンバーガー＋in-app 警告に差し替え
cfba326 feat(lp): Phase H コメンター活発度色分けの説明を LP に追加 + プライバシーポリシーページを新設
```

加えて CWS 向けの画像アセットを `src/images/googlechrom/` にマスター置き済み。

---

## 6. 審査通過後にやること（TODO）

1. **LP (`tsuioku-no-kirameki/index.html`) に「Chrome ウェブストアで入手」
   ボタンを追加**。URL は承認メールが来たら CWS の公開ページから取得。
   ヒーローセクションの CTA と、フッターの 2 箇所に置くのが自然。
2. **privacy.html の最下部「インストールは Chrome ウェブストアから」リンク
   も同じ URL に差し替え**。
3. **スクリーンショットの段階的差し替え検討**。現状は UI 配色・機能を
   正確に表したコンセプトモックだが、将来的に実動画面に差し替える余地あり。
4. **YouTube 動画の説明欄に CWS の公式 URL を追加**（`tsuioku-no-kirameki.com`
   だけでなく、ストアページへのリンクがあると導線が強化される）。
5. **レビュー・評価が付き始めたら、LP の「ユーザーの声」セクションを更新**。

---

## 7. コミット・メッセージ規約

- プレフィックス: `feat` / `fix` / `chore` / `docs` / `refactor` / `style` / `test`
- スコープは括弧で括る: `feat(lp): ...` / `fix(privacy): ...`
- 日本語本文で OK。件名は 1 行 50〜72 字目安。
- Claude Code が付ける `Co-Authored-By: Claude ...` 行はそのまま残す。

---

## 8. デプロイ / CI

- **LP**: `master` ブランチへ push すると、XServer 側の GitHub Webhook が
  自動で `tsuioku-no-kirameki/` 配下を本番反映する。ビルド手順は不要。
- **拡張 ZIP**: `build/submission-<version>/` に ZIP 生成用の素ファイルを
  staging し、Python の `zipfile` でフォワードスラッシュ化して作る
  （Windows の `Compress-Archive` はバックスラッシュになるので使用不可）。

---

## 9. エージェントへのお願い

- **この AGENTS.md を最初に読むこと**。とくに §3 の「ゆっくり NG」と
  「3 キャラの役割」は、コピー＆新規生成するコンテンツに波及しやすい。
- **CWS 申請関連のファイル**（`src/images/googlechrom/`, `build/store-listing/`
  の `description-ja.txt` / `privacy-justifications-ja.txt`）は、仕様・文言を
  変える際に必ず「審査通過後の差分提出」を意識する。
- **プライバシー周り**の文言を変更したら、`privacy.html` と
  `description-ja.txt` と `privacy-justifications-ja.txt` の 3 点を
  同期させる（片方だけ変わると審査で齟齬として指摘される）。
