# reference: AI汎用ルール(best-trust / 星野メソッド / Karpathy)からの知見

> 2026-06-14 ユーザー提供 github/AI汎用ルール を調査。tkjp(ユーザー)のマルチプラットフォーム
> 展開マスタールール + 星野ロミメソッド + Karpathy 4原則。追憶に効く知見を抽出。
> 関連: [[reference_hosino_romi_server_cron_learnings]] [[reference_socialxup_uiux_learnings]]。

## ⭐ 今すぐ効く: 実装規律(3つの源が同じ方向=AGENTS.md 実装前ゲートに統合する)

### Karpathy 4原則(docs/karpathy-guidelines.md / andrej-karpathy-skills)
LLM 特有の失敗(推測で進む・過剰設計・無関係な箇所を触る)を減らす:
1. **コードの前に考える**(前提を明示・曖昧なら止まる)。
2. **シンプルに**(依頼以上を足さない)。
3. **外科的に変更**(依頼と無関係な「ついで修正」をしない)。
4. **目標を検証可能に**(テスト/確認手順で完了を定義)。
→ 今セッションの教訓(走りながら考えて暴走・クラッシュ)と完全一致。会議P0の AGENTS.md 実装前
  ゲート(Codex E案)+ 星野メソッド + この4原則を統合して規律を1本にまとめる。

### 星野メソッド(docs/hoshino-method-framework.md)
「ユーザーの脳に負荷をかけず本能で操作させる」3本柱:
1. **摩擦ゼロ**(ログイン/入力/待機を悪と定義)。
2. **行動誘発**(「次」を予測して提示・選択肢を与えすぎない)。
3. **速度至上主義**(読み込み時間はデザインの一部)。
- Auth-less First(まず使わせる・登録は最後)/ Predictive UI(次クリック先をプリフェッチ)/
  禁止=モーダル乱用・多段フォーム・重い装飾JS。
- KPI: TTI<1.5s / Login-less Conversion>90% / PV/User>6。
→ 追憶への適用例(実証済): comeview の「読み上げされない=配信切替に追従せず無音」は摩擦そのもの。
  星野式「自動追従」で v0.1.724 根治。匿名UUID/即時表示/待たせない は既に追憶の方針と一致。

### 01_CORE_RULES(DeveloperPack)
- 実装前に要件明文化・既存部品を検索して再利用・1変更1意図で小さくコミット・推測実装を避ける・
  未検証コミット禁止・!important 依存禁止。→ 上記2つと同方向。

## 中期: 配信プラットフォーム拡張の設計(best-trust §4.2 / §5.B)
- **Adapter Pattern で配信プラットフォーム対応**: 各プラットフォームのアダプタが onComment()/onGift()/
  postComment() を emit。live-aggregator に登録。→ 追憶(ニコ生)を将来 YouTube/Twitch 等へ広げる土台。
  **LiveStateStream(会議最優先)の延長線**=イベントを1本のストリームに集約する思想と一致。
  追憶の LiveStateStream を「ニコ生アダプタ」として作れば、後で他プラットフォームを足せる。
- §1.2「すぐに展開」と YAGNI の両立=追憶の「今は拡張内完結・将来サーバ/多プラットフォーム」判断と同じ。
- §6.1 Web版実装ガイド=追憶の app/(Web版)の参考。

## 大構想(参考・今は採らない)
- best-trust はモノレポ(Turborepo)+ Clerk認証 + tRPC + Drizzle ORM + LINE/プッシュ通知の
  マルチアプリ展開構想。追憶単体(MV3拡張・素JS)とは規模が違うので**今は採らない**。将来 Web/モバイルを
  本格展開するときの設計図として参照。

## 追憶への適用優先(司令塔メモ)
1. 今すぐ=**AGENTS.md 実装前ゲートに Karpathy 4原則 + 星野メソッドを統合**(承認済み計画 PR1)。
2. 中期=LiveStateStream を「ニコ生アダプタ」として設計し、後の多プラットフォーム化に備える。
3. UI=星野メソッド(摩擦ゼロ・行動誘発)を診断/会場/コメビュの導線に。
- 関連: [[reference_live_state_stream_meeting]] [[reference_hosino_romi_server_cron_learnings]]
