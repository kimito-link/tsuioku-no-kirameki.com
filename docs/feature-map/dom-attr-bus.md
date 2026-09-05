# DOM属性 データバス図（自動生成）

> `npm run feature-map` で再生成。手で編集しない。
> `<html>` 等に書く `data-*` 属性ごとに「誰が書き(producer)・誰が読むか(consumer)」を示す。

> ★なぜこの図が要るか: 既存の地図は**ファイル単位**で 99.3% 網羅しているのに、
> 2026-08-21 の不具合5件を**1件も検出できなかった**。どれも「書き手↔読み手の対」の
> 破れで、**1ファイルを読んでも見えない**種類だったため。storage キーには既に
> 同じ検出器があり実際に効いていたので、**同じ形を DOM属性へ広げた**。

## ⚠️ 断線（書く人だけ / 読む人だけ）

> 🟠 = 書いているが誰も読まない（書きっぱなし＝消す候補）
> 🔵 = 読んでいるが誰も書かない（★常に空を読む＝バグの可能性が高い）

- 🟠 **data-nl-popup-content-painted** — 書く人だけ: extension/popup-entry.js
- 🟠 **data-nl-score-final** — 書く人だけ: lib/broadcastScoreHtml.js
- 🟠 **data-nl-state** — 書く人だけ: extension/popup-entry.js
- 🟠 **data-nl-support-wired** — 書く人だけ: extension/popup-entry.js
- 🟠 **data-nl-toolbar-only** — 書く人だけ: extension/popup-entry.js
- 🟠 **data-nl-usage-terms-ack** — 書く人だけ: extension/popup-entry.js, lib/cloakNotForSidePanel.js
- 🟠 **data-nls-backfill** — 書く人だけ: extension/content-entry.js
- 🟠 **data-nls-backfill-diag** — 書く人だけ: extension/content-entry.js
- 🟠 **data-nls-heat** — 書く人だけ: extension/venueBar.js
- 🟠 **data-nls-hidden-injected** — 書く人だけ: extension/content-entry.js
- 🟠 **data-nls-intercept-visitor-probe** — 書く人だけ: extension/page-intercept-entry.js
- 🟠 **data-nls-ndgr-dedupe** — 書く人だけ: extension/page-intercept-entry.js
- 🟠 **data-nls-ndgr-view-uri-count** — 書く人だけ: extension/page-intercept-entry.js
- 🟠 **data-nls-page-intercept-href** — 書く人だけ: extension/page-intercept-entry.js
- 🟠 **data-nls-page-intercept-referrer** — 書く人だけ: extension/page-intercept-entry.js
- 🟠 **data-nls-warmup-state** — 書く人だけ: extension/content-entry.js
- 🔵 **data-nl-trio-slot** — 読む人だけ: extension/popup-entry.js

## 全属性

| 属性 | 書く人(producer) | 読む人(consumer) |
|---|---|---|
| `data-nl-acq-mode` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-acq-tier` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-anonymous-avatar-key` | lib/avatarPartsComposer.js<br>lib/supportTimelineHtml.js | lib/avatarPartsComposer.js |
| `data-nl-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-click-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-concurrent-chara-jump-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-detail-hover-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-gift-rank-metric` | lib/paintTopSupportRankStyleIntoElement.js | extension/popup-entry.js<br>lib/paintTopSupportRankStyleIntoElement.js |
| `data-nl-hoisted` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-on-error-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-pickup-key` | lib/venuePickupBanner.js | lib/venuePickupBanner.js |
| `data-nl-popup-content-painted` | extension/popup-entry.js | — |
| `data-nl-popup-primary-cloak` | lib/cloakNotForSidePanel.js | extension/sidepanel-entry.js |
| `data-nl-recording` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-score-final` | lib/broadcastScoreHtml.js | — |
| `data-nl-scroll-perf-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-state` | extension/popup-entry.js | — |
| `data-nl-story-growth-bound` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-support-wired` | extension/popup-entry.js | — |
| `data-nl-ticker-key` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-timeline-docked` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-toolbar-only` | extension/popup-entry.js | — |
| `data-nl-trio-overall` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nl-trio-slot` | — | extension/popup-entry.js |
| `data-nl-uid` | lib/supportTimelineHtml.js | extension/comeview-entry.js<br>extension/popup-entry.js |
| `data-nl-uname` | lib/supportTimelineHtml.js | extension/comeview-entry.js<br>extension/popup-entry.js |
| `data-nl-usage-terms-ack` | extension/popup-entry.js<br>lib/cloakNotForSidePanel.js | — |
| `data-nl-user-detail-wired` | extension/popup-entry.js | extension/popup-entry.js |
| `data-nls-active` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-audition-fetch` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-auto-open` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-backfill` | extension/content-entry.js | — |
| `data-nls-backfill-diag` | extension/content-entry.js | — |
| `data-nls-comment-av-bound` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-fetch-log` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fetch-other` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-attempts` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-err` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-found` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-probe` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-rows` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-scans` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-fiber-step` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-heat` | extension/venueBar.js | — |
| `data-nls-hidden` | extension/content-entry.js | extension/content-entry.js<br>lib/inlineHostVisibilityIntent.js |
| `data-nls-hidden-injected` | extension/content-entry.js | — |
| `data-nls-inline-close` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-intercept-visitor-probe` | extension/page-intercept-entry.js | — |
| `data-nls-ld-stream` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr-dedupe` | extension/page-intercept-entry.js | — |
| `data-nls-ndgr-dedupe-snapshot` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr-tags` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr-unknown-samples` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr-view-uri` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-ndgr-view-uri-count` | extension/page-intercept-entry.js | — |
| `data-nls-nicoad-fetch` | extension/content-entry.js | extension/content-entry.js |
| `data-nls-page-intercept` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-enqueued` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-fetch` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-href` | extension/page-intercept-entry.js | — |
| `data-nls-page-intercept-member-json` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-posted` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-referrer` | extension/page-intercept-entry.js | — |
| `data-nls-page-intercept-ws` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-page-intercept-xhr` | extension/page-intercept-entry.js<br>lib/ndgrUnknownSamplesBudget.js | extension/content-entry.js |
| `data-nls-page-token` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-pi-phase` | extension/page-intercept-entry.js | extension/content-entry.js |
| `data-nls-warmup-state` | extension/content-entry.js | — |
| `data-nlsb-avatar-retry-src` | lib/supportGrowthAvatarLoad.js | lib/supportGrowthAvatarLoad.js |
