# 状態速報 取り込み中の激重(7071ms) 所要比例間引きで緩和 — v0.1.1010 (2026-06-30)

## 結論
master HEAD = **v0.1.1010 (5fd1dc25)**・origin 同期 0/0・C:\nicolive-ext も v0.1.1010。
v0.1.1009 の固定2tick間引きでは足りなかった激重(7071ms)を、所要比例の間引きで緩和。

## 真因(計器+Explore で裏取り)
- 更新所要(計器)が 2配信記録中+1取り込み中で **7071ms**(backfill 1918ms/fastDiagLite 1749ms/summaries 1724ms)。
  ~1KB の fastDiagLite すら 1749ms=read サイズでなく **単一 LevelDB の write ロック待ち**。
- 主因(Explore): backfill SW の staged 書込(20-100KB/2.5秒・backfill-sw-entry.js:131) + content の
  persistCommentRowsImpl(1.5秒周期・content-entry.js:11668) が同時実行し read を待たせる。
  2配信だと per-liveId のコメント/テール/staging 書込が倍増。read 側(status の5キー)は既に最小。

## 修正(記録/取り込みには触らず status の更新頻度だけ)
- ★src/lib/statusRefreshBackoff.js 新設(純関数・テスト可能): computeRefreshBackoffTicks(lastMs) =
  直近 refresh の所要に**比例**して次の間引き tick を返す(ceil(ms/2000)・1〜15クランプ)。
  REFRESH_SLOW_MS(500ms)以下は 0=2秒のまま=通常時の鮮度不変。重いほど大きく控えて書込が drain する余地を作る。
- status-entry.js startRefreshLoop: v0.1.1009 の固定2tick を本関数に置換(+ v0.1.1009 の再入防止 _refreshInFlight は維持)。

## 実機相当の挙動(出荷バンドル probe)
5/500ms→0tick(2秒) / 1819ms→1tick(4秒) / **7071ms→4tick(約10秒)** / 激重→15tick(約32秒・天井)。

## 「診断ページが重い」全体(3層に整理・全て手当て済 or 切り分け済)
1. 初期ロード: コードは無罪(実測 LCP 42〜54ms・データ量無関係)。主因は環境(Claude多重/Chrome)=health-check で整理。
2. 通常の更新サイクル: 0〜6ms=軽い。
3. **取り込み中の更新**: write 競合で 1819〜7071ms→ v0.1.1009(再入防止+固定間引き)+ v0.1.1010(所要比例間引き)で緩和。

## ★まだ残る可能性(様子見)
- 所要比例間引きは「頻度」を下げて競合を減らすが、**1回の refresh の重さ(7071ms)自体は下げない**。
  ユーザー実機で改善が体感不足なら、次は書込側(Explore 提案):
  (A) backfill staging 周期を content persist とずらす(STAGING_WRITE_INTERVAL_MS 2500→3500等)=効果中・取り込み速度微減。
  (B) KEY_AUTO_BACKUP_STATE を per-liveId 分割=効果大だがSW改造で記録に触れる=会議級・慎重に。
  (C) comment timeline mirror の無変化時 set スキップ=効果小・安全。
  → まず status 側の本版で様子見。改善不足の報告が来たら (C)→(A) の順で安全側から。

## verify
- verify:cc 緑(backoff: 通常0/比例増/上限クランプ/非数0/opts上書き)。

## 残(別系統)
- 会場座席(venue-seats)完全性スコア不合格。backfill 律速そのもの(取得遅さ)は v0.1.999 計器の実測待ち。
- ①POP応援レーン描画 started:0(popup独立窓・viewKind:popup)は storage 競合で描画トリガが回れない疑い=本版の緩和で改善見込み(再発したら別途)。

## 今セッション出荷(v0.1.998〜1010=13版・全 push 済み・同期0/0)

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
