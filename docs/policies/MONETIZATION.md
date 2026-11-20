# 課金(レポート有料化)の方針 — 正本

> **この1枚が正本です。** どの AI(Claude Code / Codex / Cursor / Antigravity・Gemini / Grok / Copilot など)も、
> 課金・有料・無料・サポーター・マーケ分析レポートに触れる作業の前にここを読むこと。
> AGENTS.md・CLAUDE.md・GEMINI.md・`.cursor/rules/monetization.mdc`・`.github/copilot-instructions.md` はここを指しているだけ。
> 方針を変えるときは**このファイルを直してから**コードを変える(りんくの OK が必須)。
>
> 決めた人: りんく(2026-11-05〜06)。最終更新: 2026-11-20。

---

## 1. ひとことで

**有料なのは「マーケ分析レポート(マーケ HTML)」だけ。それ以外は全部無料。**
有料プランの名前は **「サポーター」**(月額 / 年額)。支払いは **Stripe の外部ページ**。

## 2. 有料のもの(サポーター向け)

| 何 | 中身 | 実装の入口 |
|---|---|---|
| **マーケ分析レポート(マーケ HTML)** | `marketing-export.html` で開く分析レポートの**全体**。メディアキットもこのレポートの1章として同じ HTML に入るので有料側 | `src/extension/marketing-export-entry.js` の `runExport()` 冒頭 `passSupporterGate()` |

- ★**関所はレポート全体に1つ**。章ごとの切り売りはしていない(「マーケの章全体」= マーケ HTML まるごと)。
- ★**全サービス共通**。ニコ生・YouTube・Twitch・Kick・ふわっち・SHOWROOM・ミクチャ・TikTok・ツイキャス・ABEMA の
  マーケ HTML は、同じ `marketing-export-entry.js` を束ねたもの(`scripts/youtube-build.mjs` → `yt-marketing-export.html`)なので、
  **どのサービスでも同じ関所を通る**。サービス別にマーケ HTML を作り替えるときも、この関所の後ろに置くこと。

## 3. 無料のもの(有料にしない)

- コメントの記録・振り返り・3 レーン(りんく/こん太/たぬ姉)・会場・コメビュ(OBS)・応援者ランキング(配信中のリアルタイム表示を含む)
- **読み上げ**(人ごとの声・VOICEVOX・合唱などすべて)
- **スマホ**(「📱 スマホで見る」・WEB 版ライブビュー・PWA・iOS/Android アプリ)
- **YouTube 版・他プラットフォーム対応**(記録・表示・公式ランキング)
- 診断・状態速報などそれ以外の機能すべて

## 4. 条件(実装済み・本番稼働中)

| 項目 | 値 | 正本のコード / 文書 |
|---|---|---|
| 価格 | **月額 980 円 / 年額 9,800 円(税込)** | Stripe 本番の価格 `tsuioku_supporter_monthly` / `tsuioku_supporter_yearly`・`tsuioku-no-kirameki/tokushoho.html` |
| お試し | **14 日**。数え始めは「初めてマーケ HTML を開いた日」 | `src/lib/supporterLicense.js` `TRIAL_MS` |
| 台数 | **1 コード 1 台**(PC を移すときはサポーターのページの「この PC に移す」・30 日に 1 回) | `supporterLicense.js`・`src/server/billingApi.js` |
| 期限切れ | 期限後 **7 日は使える**(猶予) | `supporterLicense.js` `GRACE_MS` |
| 確かめられないとき | **開ける側に倒す**(払った人を締め出さない) | `decideFeatureAccess()` の `unverifiable` |
| 関所のスイッチ | `SUPPORTER_GATE_ENFORCED = true`(v0.1.1897〜閉めている) | `supporterLicense.js` |
| 返金 | 支払い後の返金なし。解約しても期間の終わりまで使える | `tokushoho.html` |
| 今までの利用者 | 自動の無料枠は作らない。**申請があれば** Stripe のクーポン(3 か月無料)を 1 人ずつ発行 | Stripe 側の運用 |
| 無料の人の印 | OBS コメビュ右下に「💬 追憶のきらめき」。サポーターには出ない | `shouldShowCreditBadge()`・`src/extension/comeview-entry.js` |
| 申し込みページ | `https://app.tsuioku-no-kirameki.com/supporter` | `app/supporter.html`・`src/lib/supporterAccess.js` |
| サーバー | Vercel `api/billing.js`(台帳 Upstash・Stripe webhook・Ed25519 署名の証明書) | `src/server/billingApi.js` |

## 5. やらないこと(提案もしない)

- **投げ銭**(払う人がいない・りんく 2026-11-05)
- **スマホだけの有料化**(配信者は PC が多い)
- **読み上げ・YouTube・他サービス対応・スマホ機能の有料化**
- **iOS / Android アプリ内での購入導線**(アプリ内で売ると Apple/Google の課金が必須になる。アプリには購入ボタンを出さない)
- **キャラ・声パックの販売**(今回は入れない。将来案としてだけ残す)
- **無料の画面にマーケ HTML 相当の分析を丸ごと出して関所を迂回する**こと(無料の画面に分析を足すときは、
  それが有料レポートの中身の代わりにならないかを先に考え、迷ったらりんくに聞く)
- 価格・お試し日数・有料の範囲・関所のスイッチを **りんくの OK なしに変える**こと

## 6. 収益の方向(背景)

- コメントツール単体の課金は細い。**まずダウンロード数を増やす**のが先(無料部分を手厚くするのはそのため)。
- そのうえで、サポーター(マーケ HTML)に加えて、**グッズ・「きみとりんくボイス」の声優募集・動画の広告枠**などでも稼ぐ。
- 新機能は「わんコメが持っていない機能」を選ぶ(配信中リアルタイムの応援者ランキングが強み)。

## 7. 変えるときに一緒に直すもの

課金の範囲・価格・条件を変えたら、次を**同時に**揃える(片方だけだとストア審査で齟齬と言われる):

1. このファイル
2. `tsuioku-no-kirameki/index.html`(LP の「プライバシー」節・料金の記載)・`tokushoho.html`・`privacy.html` §4-3
3. `docs/releases/cws-submission-texts.md`(CWS の説明・データ使用)
4. `src/lib/supporterLicense.js` のコメントと定数

## 8. 紹介料（2026-11-20 りんく承認）

紹介コード（`RH-XXXX` の形。台帳が受け付ける英数字のコード）が付いた**新しい**申し込みだけ、支払い額の 20%（その紹介者を紹介した人に 5%）を partnership の台帳へ報告する。率は台帳が計算する。**料金・お試し・有料の範囲・関所・値引きは変えない。** この仕組みより前の契約には紹介コードを後から付けない。申込者のメールと紹介コードの持ち主のメールが両方分かって同じときは、こちらから送らない。持ち主のメールは今の台帳の受け口では取れないので、台帳側が自己紹介を 0 円にするまでは報酬が付く余地がある。詳細は [docs/referral-commission.md](../referral-commission.md)。

## 9. 経緯

- 2026-11-05 りんく「マーケ HTML の部分でいいかも」→ 有料はマーケ HTML だけ。投げ銭は入れない。
- 2026-11-05 価格決定(月 980 円 / 年 9,800 円)。2026-11-06 特商法・返金方針決定、v0.1.1897 で関所を閉め、0.1.1898 で本番通し確認。
- 2026-11-17 りんく「いろんな AI を渡り歩いても、言わなくても伝わるように」→ この正本を作り、各 AI の自動読込ファイルから参照。
