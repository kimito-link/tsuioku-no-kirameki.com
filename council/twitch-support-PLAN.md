# Twitch 対応 計画(2026-11-07・スレッド「TikTok・Twitch・Kick に対応する」)

りんくの選択(2026-11-07 判断カード): **Twitch → Kick → TikTok** の順。調査 doc: https://claude.ai/artifact/FfmXphHBxgZSPk7g3QRxP5

## 目的
- ニコ生版・YouTube 版と同じ画面(ニコ生版の完全コピー)で Twitch の配信を記録・振り返り・読み上げ・会場表示する。
- 本体に同梱する(YouTube と同じ。別拡張にしない)。

## 非目的(今回やらない)
- Twitch 公式 API(Helix/EventSub)の OAuth。開発者アプリの登録がりんくの手作業になるため。読むのはログイン無しの IRC。
- ハイプトレイン・チャンネルポイント・予測(画面に対応する欄が無い)。
- Kick / TikTok(次の段)。

## 設計の要(なぜこの形か)
1. **読む = Twitch 公式の読み取り専用 IRC(wss://irc-ws.chat.twitch.tv・NICK justinfanNNNN)**。
   DOM を読むより壊れにくい。tags に表示名・数字 user-id・Bits・サブスク・ギフトサブ・レイドが乗る。
   視聴ページ(twitch.tv/<チャンネル>)を開いている間だけ、そのタブの content script が1本つなぐ。
   純関数 `src/lib/twitch/twIrcParse.js`(済・単体試験 14 件)。
2. **YouTube 版の入口から下(記録 IndexedDB・集計・ytNicoShim・yt-* 画面)をそのまま使う**。
   Twitch の1件を YouTube の1件と同じ形にそろえる(人キー `tw:<user-id>`・Bits は通貨 `BITS`・サブスク=membership・
   ギフトサブ=membership_gift)。YouTube 版で見つけて直したちらつき・二重記録・別配信混入の対策を Twitch でも失わない
   (コピーすると片方だけ直る事故になる)。
   - 配信キー(YouTube の videoId の位置)= `tw.<login>.<配信開始の時刻>`。11 文字の videoId と形がぶつからない。
   - プラットフォームで違うのは「リンク先・顔の取り方・言葉(スパチャ→Bits 等)・送信先」だけ。ここを
     `src/lib/platform/` の小さな表で分け、ytNicoShim / background / ytPanelRoute が配信キーの頭で引く。
3. **顔**: IRC に顔は無い。YouTube の @ハンドルと同じく、background がチャンネルページの og:image を引いて覚える。
   取れない人はゆっくり顔(identicon)。§3.5 / §3.6。
4. **送信**: 視聴ページのチャット入力欄に打つ(YouTube と同じ中継)。ログインしていなければ理由を出す。
5. **読み上げ**: コメビュがそのまま読む(YouTube 版と同じ経路)。人ごとの声も同じ。

## 変更ファイル(予定)
- 新規 `src/lib/twitch/`(IRC・URL・配信キー)、`extension-youtube/src/tw-content-entry.js`(Twitch タブの読み取り)
- `src/lib/platform/`(プラットフォーム表)
- 既存: `ytNicoShim.js`(タブの写し・リンク・言葉)、`background-entry.js`(配信キーの扱い・顔)、`ytPanelRoute.js`(Twitch タブでも
  YouTube 版の画面へ)、`ytMergedIsolation.js`、`scripts/youtube-build.mjs`、`extension/manifest.json`(twitch の content script と
  ホスト権限 `https://www.twitch.tv/*`・`wss://irc-ws.chat.twitch.tv/*`・`https://static-cdn.jtvnw.net/*`)
- ニコ生版の共有コード(src/extension・src/lib の非 youtube)は触らない。

## 段階(フェーズ)
| # | 内容 | 状態 |
|---|---|---|
| 0 | IRC の1行を YouTube と同じ形に(純関数+試験) | ✅ |
| 1 | Twitch タブで IRC をつなぎ、YT_STREAM_META / YT_CHAT_ITEMS で background へ送る → 記録される | ⚙️ |
| 2 | サイドパネルが Twitch タブで開き、ニコ生版の画面に Twitch の記録が出る(リンク・言葉の差し替え) | ○ |
| 3 | 顔(og:image)・送信・会場(視聴ページの上)・読み上げ | ○ |
| 4 | 拡張の自動検証(verify:extension)に twitch の注入を足す・PC 実機で本物の配信に計器を当てる | ○ |

## 検証
- 純関数は vitest。拡張は `npm run verify:extension`。
- クラウドからは twitch.tv に出られない(proxy が拒否)。本物の配信での確認は PC(Remote Control)で、計器
  (記録件数・Bits 件数・顔の取得率)を読んで行う。りんくに見え方を聞かない。

## 失敗時の戻し方
- Twitch 部分は manifest の content script を外せば止まる(記録は yt_kirameki_db の `tw.` キーだけ・他に影響しない)。

## ストア
- ホスト権限が増える版 → API アップロードでは理由欄が出ない。ダッシュボードから手で上げる(§2)。Kick と一緒に1回で出す案。
