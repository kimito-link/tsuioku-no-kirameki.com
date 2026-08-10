# backfill スループット計器 — v0.1.999 (2026-06-29)

## 結論
master HEAD = **v0.1.999 (572baaa9)**・origin 同期 0/0・C:\nicolive-ext も v0.1.999。
「過去ログ取得が遅い/取得率%が低い」の**真の律速(seek=入口さがしか否か)を実機スクショ1枚で確定する計器**を追加。
速度本体はまだ直していない=「推測で直さない=まず見える化して実測」原則(reference_backfill_speed_meeting)に忠実。

## 現状把握(Explore で裏取り・過去メモは古かった)
- 「見える化」は既に一部あり(stopReason/seg/rows を状態速報に表示・v0.1.995)。だが**経過時間・再シード回数が無く**
  「1区画あたり何ms」が出せなかった=seek 律速の確定材料が欠けていた。
- 既出荷の速度レバー: prefetch パイプライン(v0.1.759)・前面タブ gap 15→6ms/pause 150→24ms(v0.1.761)・%廃止(v0.1.763)。
- **未出荷の大レバー**: seekBackwardUri を reseed のたびにキャッシュ無しでやり直す(ndgrBackfillCrawl.js)。3回目会議の#1律速候補。
- 並列スロット=2(BAN安全)。内側next.uriチェーンは連結リストで並列不可(LLM会議の並列案は物理的に却下済)。

## この版でやったこと(計器のみ・取り込み内容/順序/件数は不変)
- ndgrBackfillCrawl.js: crawl の summary() に **elapsedMs(t0基準)/reseeds(外側ループ回数)** を追加。
  t0/reseeds は summary 参照のため let 前方宣言(TDZ回避)。早期returnでも0で無害。
- backfill-sw-entry.js / content-entry.js: crawl done 値から elapsedMs/reseeds を拾い **KEY_BACKFILL_PROGRESS** に同梱(両経路)。
- ★status-entry.js `loadBackfillProgressSafe`: whitelist に **seg/elapsedMs/reseeds を追加**。
  【地雷】この関数は storage の進捗を whitelist で作り直す=新フィールドを足さないと値が落ちて行が出ない。
  **ユニットは緑なのに実機で行が出ず=実機verifyで発見**(教訓: 表示系は whitelist/サニタイズ層を必ず疑う)。
- backfillRinkuNarration.js: `backfillThroughputLine()` 純関数新設。出力例
  「⏱ 取得速度: 経過12.3秒・区画420・再シード8回 → 約1区画29ms」。材料不足(elapsedMs/seg が 0)なら空=出さない。
- statusFormat.js `buildBackfillProgressLine`: 材料が揃ったら別行で併記(後方互換=既存テスト不変)。

## verify
- verify:cc 緑(throughput純関数5+併記/後方互換2)。maps/site-health/feature-map 再生成同梱。
- 実拡張 v0.1.999 install→状態速報 概要に「⏱ 取得速度…」が実描画されることを目視確認(スクショ取得)。②③も同テキスト共有。

## 次の一手(ユーザー次第・実測ドリブン)
1. ユーザーが次配信で状態速報をスクショ → 「経過/区画/再シード/約1区画ms」を読む。
   - 区画数の割に**再シードが多い** or **1区画あたりが重い** → seek が律速 → seek ヒント化(終端 nextAt を次 seed のヒントに)を実装。
   - cap_elapsed で seg 多・再シード少・1区画軽い → 律速は別(深さ不足)→ cap内でより深く。
2. 実測で律速を確定**してから** seek ヒント化等を TDD で。会議案の並列増/throttle撤廃は BAN で禁止。

## 反映3手順(AGENTS.md §12.5)
push済。ユーザーは **拡張🔄リロード→watch F5**。③純Webは Vercel デプロイ別途。
