# 診断ページ「重い」切り分け + 更新所要計器をコピー本文へ — v0.1.1005 (2026-06-30)

## 結論
master HEAD = **v0.1.1005 (e9a7f311)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1005。
「診断ページが重い」の切り分けを実測ドリブンで進行中。更新処理自体は軽い(実機 4ms)と判明。

## 実測で分かったこと(推測しない)
- 状態速報ヘッダーの既存計器(v0.1.890 の _mark)が実機で **「更新 4ms(lives 1ms / summaries×1 1ms)」**。
  = status-entry の 1 refresh サイクル(直列 read 5本 + extras 12本間引き + renderAll)は **4ms=重くない**。
- 開いた瞬間のスクショでもコア(取得率100%/リアルタイム取込0秒前/記録↔公式一致100%)は即埋まる=データ取得も遅くない。
- → 「重い」体感の正体は **更新処理ではなく、ページ初期ロード(重いJS/DOM構築)or スクロール再描画**の疑い。まだ未確定。

## この版でやったこと(ユーザー要望: 計器をコピペにも入れたい)
- status-entry.js: refresh の totalMs/stepMs を _lastRefreshPerf に保持→renderAll→buildAiShareFullText へ
  refreshPerf として渡す(render は当該サイクル計測前に走るので前サイクル値=代表値)。
- aiShareFullText.js: formatRefreshPerfLine() 新設。本文冒頭(生成行直後)に
  「更新所要(計器): Nms(重い順: …) — 小さいほど更新は軽い(体感が重いなら初期ロード/スクロール側)」。②③もバイト一致。
- これで「重い」を共有時にスクショ往復せず状態速報1枚で更新所要が分かる。

## refresh の構造(軽量化の地図・触るなら実測後)
- コア(2秒毎・直列): enumerateActiveLives → loadAllSummaries(lvList) → loadStatusFastDiagLiteSafe(~1KB lite) →
  loadPopupDiagSafe → loadBackfillProgressSafe。
- extras(12秒間引き・EXTRAS_REFETCH_MS): voice/venueSeats/reportPreview/watchTabMap/trend/laneDiag/各鏡/publishOutcome/
  commentTimeline/previewRenderAck の12本。
- ★並行 read は単一 LevelDB で stall するので【直列】が正(v0.1.867 で並行化して退行・撤回済)。雑に Promise.all しない。
- 再構築 skip 署名: _lastLivesSig/_lastHealthSig/_lastActionSig(2秒毎の全再生成を止める済)。

## 次の一手(実測ドリブン)
ユーザーが次に「重い」と感じたとき状態速報を共有 → **更新所要(計器)** を読む:
- 4ms 等で小さい → 更新は無罪 → 初期ロード(status バンドルサイズ/DOM 構築)or スクロール側を計測(別計器が要るかも)。
- 大きい(どの step が支配的か) → その step(summaries 全件 read 等)を間引き/署名skip で削る。
※backfill(v0.1.999)・記録>本家(v0.1.1002/1003)の計器と同じ「見える化して実測してから直す」路線。

## 完全性スコアの残: 会場座席(venue-seats)のみ不合格(別途・会場使用時に切り分け)。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
