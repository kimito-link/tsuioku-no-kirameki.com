# コードベース機能マップ（自動生成）

> `npm run feature-map` で再生成。手で編集しない。
> 機能境界は esbuild の entry(バンドル単位)。境界の正本は `scripts/feature-map.mjs` の FEATURES。

## 機能ごとのマップ

- [記録エンジン(watchページ常駐)](content.md) — `src/extension/content-entry.js`
- [ポップアップ(応援レーン)](popup.md) — `src/extension/popup-entry.js`
- [会場モード(standalone)](venue.md) — `src/extension/venue-entry.js`
- [コメビュ(別窓)](comeview.md) — `src/extension/comeview-entry.js`
- [状態速報ページ](status.md) — `src/extension/status-entry.js`
- [コメント IDB 書き手](offscreen.md) — `src/extension/offscreen-entry.js`
- [バックフィル SW](backfill-sw.md) — `src/extension/backfill-sw-entry.js`
- [ページ傍受](page-intercept.md) — `src/extension/page-intercept-entry.js`
- [Web版 状態(スマホ)](web-status.md) — `app/app.js`

## データの流れ・影響範囲

- [storage データバス図](storage-bus.md) — 全 86 キーの producer/consumer と断線検出
- [影響範囲マップ](impact-map.md) — このファイルを変えたら何が壊れるか(波及機能の逆引き)
