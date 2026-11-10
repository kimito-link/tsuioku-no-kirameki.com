# 直す前の数字(0.1.1946・2026-11-09 PC 試験用 Chrome・本物のサイドパネル)

新しいプロファイル・公開配信5本(Kick/SHOWROOM/TikTok/ふわっち/YouTube)・記録は数分ぶん。前面切替は chrome.tabs.update。ミクチャ・Twitch は未測定。

| 計器 | 横の欄 | コメビュ | SPEC の予想 |
|---|---|---|---|
| lastWatch.counts | newest 1106 / page 0 | newest 1 | 当たり(層 C が本物でない) |
| announceCounts.summaries | 362 | 33 | 当たり(偽の知らせ C') |
| askedSwitches | 34(コメビュを開いた後 切替6回で23) | 15 | 「戻る」揺れ |
| probe | 12回・最大 5 lv・最大 27,345ms | 0 | 当たり(探り読みが重く lastAskedLv を動かす) |
| popupLastWatchWrites | 1093(全て疑似 lv) | 0 | 漏れは書き込みとしては当たり。ただし最後に nls_last_watch_url の実値は空(理由未解明) |
| tabsQuery | 4315回・1100ms 超 14・empty 0・最大 8,213ms | — | H-a は空にはならず遅いだけ |
| unmappedWatchTabs | 124(記録なし部屋) | 0 | 当たり(仮キーが要る) |
| lastFocused.watchLikeUnmapped | 4255 / 4315 | 0 | 当たり(層 B の写し漏れ) |

見え方:
- 配信中の5サービスは横の欄が5秒以内に前面へ切替(誤りなし)。iframe の src は一度も変わらず、Kick から移った後も「Kicks」が2か所残った。example.com 前面で「Kicks」の語数が 13→3→13→2 と揺れた。
- 記録なしの SHOWROOM 部屋: 前の Kick を出し続け、5秒後「TikTok」、20秒後「YouTube」「トップファン」の語が一時混入(約3秒前に探り読みが YouTube を聞いていた)。
- コメビュ: 切替15秒後に前面と違う配信を聞いていた 6回中5回(announce summaries で引っ張られる)。
