# 配信途中からの過去コメント自動読み足し 実測レポート

実装版: `v0.1.2137`（ブランチ: `antigravity/platform-history-backfill`）
検証日時: 2026-11-16 19:15〜19:18 JST
検証環境: Playwright Chromium（`--headless=new`、拡張 `C:\tmp\nl-backfill\extension` をロード・ログインなし）

## 実測サマリー

| サービス | 検証した配信 URL | 配信キー | 読み足した件数 | ページ数 | 所要時間 | 停止理由 | 失敗数 |
|---|---|---|---|---|---|---|---|
| **Kick** | `https://kick.com/quillysilly` | `kk.quillysilly.138153314` | **271件**（総記録 274件） | 11 | 15,085 ms | `reached-start` | 0 |
| **ABEMA** | `https://abema.tv/now-on-air/abema-news` | `ab.n-abema-news.chwbfqehifqbsm` | **1,429件**（総記録 1,539件） | 16 | 21,275 ms | `empty` | 0 |
| **Twitch** | `https://www.twitch.tv/1win_dota_ru` | `tw.1win_dota_ru.319422434662` | **309件**（総記録 311件 / IRC 14行） | 7 | 10,538 ms | `reached-irc` | 0 |

## 補足
- Twitch は `https://www.twitch.tv/indegnasen0706`（`tw.indegnasen0706.316792055923`）でも途中から開いて 1,186件（IRC 95行に対して VOD から 1,000件以上）が記録に追加されることを確認したのち、約47分経過配信 `1win_dota_ru`（`vodLen=2849s`）で `reached-irc` による完了までを通して計測した。
- いずれのサービスでも 429・エラーによる失敗は 0回で、1ページあたり 550ms 間隔で安全に完了した。
- 読み足した過去分にはすべて `skipVoice: true` を付与し、読み上げ・会場 PICK UP に流れないようにした。
