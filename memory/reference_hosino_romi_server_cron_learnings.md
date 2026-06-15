# reference: 星野ロミ氏ソース(surechigai-lite)から追憶へ転用できる知見

> 2026-06-14 ユーザー提供の星野ロミ氏ソース `github/hosino-romi/surechigai-lite-handoff` を調査。
> 「すれちがいライト」=位置情報ベースのすれ違い通信アプリ(ニコニコ超会議2026で実運用)。
> 本番 https://surechigai-nico.link(Vercel / Next.js 15 / Railway MySQL / Upstash Redis)。
> 追憶のきらめき(ニコ生コメント拡張)に直接効く設計・運用知見を抽出。

## 技術スタック(星野ロミ式の本番構成・実体)
- フロント: Expo(React Native)+ Next.js 15(API Routes)・状態 Zustand
- DB: MySQL 8.0+(SPATIAL INDEX / ST_Distance_Sphere)・Railway。Redis=Upstash。
- 認証: 完全匿名 UUID(アカウント登録不要)+ Clerk(LP用)
- アバター: DiceBear(URL生成式・毎回作り直し可能)
- cron: matcher.ts(5分毎マッチング)/ resetHitokoto.ts(1時間毎リセット)
- デプロイ: Vercel(Root Directory=server)。

## 追憶に直接効く知見

### 1. cron アーキテクチャ(MEMORY「閉じても裏で取り切る」サーバ化の実体)
- **5分毎の cron でバッチ処理**(matcher.ts)+ **1時間毎のリセット cron**(resetHitokoto.ts)。
  `*/5 * * * * npx tsx src/cron/matcher.ts` の形。追憶の過去ログ backfill をサーバ常駐化するなら
  この「定期 cron + 冪等処理」が雛形。タブを閉じても裏で取り切る設計の現実解。
- ティア制(段階的に条件を緩めて処理)+ **同一ペアのクールダウン**(8h/24h)で無駄打ち防止。
  → 追憶の profile 解決リトライ予算/クールダウン設計に応用可。

### 2. ヘルスチェック API(追憶 status.html と同じ思想・一括健康診断)
- `GET /api/health/yukkuri` で **DB / Cron / カバレッジを一括取得**(`?detail=1` で詳細)。
- `GET /api/health/db` で DB 単体。`GET /api/health/*` を公開ルートにする運用。
  → 追憶の status.html(状態ページ)を「1エンドポイントで全部わかる」方向に寄せる参考。

### 3. 手動 backfill API(dryRun パラメータ)
- `POST /api/admin/yukkuri-backfill?dryRun=0`(Basic 認証)。**dryRun=1 で試算・0 で実行**。
  → 追憶の過去ログ取得を「手動で安全に流す」UIに dryRun の発想を入れられる。

### 4. 冪等 DDL + ビルド時自動適用(マイグレーション手順を不要に)
- スキーマ変更は `ensure-chokaigi-tables.sql` に集約。`CREATE TABLE IF NOT EXISTS` /
  `ALTER ... CONVERT TO utf8mb4` / information_schema を見て ADD COLUMN で**冪等**。
- **Vercel build が next build の前に ensure スクリプトを実行**(env があれば DDL 適用・無ければ
  graceful skip)。「スキーマ変更 ≒ コード変更」で別手順不要。
  → 追憶の IndexedDB スキーマ管理(version bump 競合の回避)に同じ「冪等・自動適用」を応用。

### 5. プライバシー保護(追憶の IDアンカー/匿名方針と同根)
- 正確な緯度経度は DB に保存するが、**他者に見えるのは 500m グリッドに丸めた値だけ**。
  → 追憶の「サムネ・ID・ハンドルは分かる範囲でセット・匿名は匿名のまま」と同じ「出す情報を絞る」哲学。

### 6. DiceBear URL生成式アバター(追憶の匿名ゆっくり顔と完全同型)
- アバターは **URL から決定的に生成**(毎回作り直し可能・保存不要)。
  → 追憶の anonymousIdenticonDataUrl / avatarPartsComposer(髪・目・口を決定的合成)と完全に同じ発想。
    「同じ人はいつも同じ顔」を URL/seed から作る。追憶は既にこの設計=正しさの裏付け。

### 7. リアルタイム地図ストリーム(読み上げ/会場のリアルタイム同期の参考)
- lib に liveMapBus.ts / useLiveMapStream.ts / liveMapShared.ts =**リアルタイムに地図上の状態を配信**。
  → ユーザー要望「読み上げ・アイテムをリアルタイム同期」「会場のリアルタイム感」の実装に、
    この「bus + stream hook」分離が参考。状態を1本のストリームに集約して購読する。

## 運用ルールの知見(星野ロミ氏の CLAUDE.md・追憶の規律強化に効く)
- ⭐**「実装前に必ず plan モードで設計を出してから書け。走りながら考えるは禁止(トークン浪費と
  暴走の元)」** ← 今セッションで司令塔がやりすぎた点。星野ロミ氏の明確な規律。複数ファイル変更は
  特に先に計画を提示。1行修正は除外。
- **探索と編集の分離**: Read/Grep/Glob で把握 → 計画 → 編集。探索中にいきなり Edit しない。
- **コミットは明示的に頼まれてから**(自動コミットしない)。
- **型チェック・ビルドで壊れたら止まる**(tsc --noEmit / build が通らない状態で完了宣言しない)。
- 新公開 API は middleware の isPublicRoute 配列にも追加(忘れると認証リダイレクトで JSON が壊れる)。

## 追憶への適用優先(司令塔メモ)
- 今すぐ効く=**運用規律**(plan 先行・探索編集分離)を AGENTS.md/作業習慣に反映。
- 中期=**ヘルスチェック一括化**(status.html を health エンドポイント的に)・**dryRun backfill**。
- 長期=**サーバ cron 化**(閉じても取り切る)。ただし NDGR の view-uri/著作権の壁は別途
  (既存メモリの結論=まずローカル IDB 即時表示+JSON 入出力で拡張内完結が現実解)。
- 関連: [[reference_json_cache_instant_display_meeting]] [[reference_comebyu_competitors_and_oauth]]

## 2026-06-14 第2弾: フルリポ surechigai-nico の【実コード】から得た具体パターン
> github/surechigai-nico(handoff zip でなく実体・.github CI/CD あり)。LiveStateStream/health の
> 設計を実コードで裏付け。追憶へ転用する実装レベルの知見。

### liveMapBus.ts(Pub/Sub バス)= 追憶 LiveStateStream の元ネタ・実装パターン
- **2層フォールバック**: 主=Upstash Redis(複数インスタンス跨ぎ)+ fallback=in-process EventEmitter。
  publish は両方に書く(片方失敗ても必ず流す)。→ 追憶版: 主=runtime.Port + fallback=storage.onChanged。
- **ring buffer(直近200件)で catch-up**: 新規接続時に recentEvents(sinceMs) で追いつき。
  → 追憶版: seq欠落時 IDB/tail 再hydrate + ring で軽い catch-up。
- ⭐**listener を try/catch で隔離**: 「1つの壊れた購読がサーバ全体を落とすのは致命的」→各コール
  バックを try/catch で囲む。→ 追憶版: 1つの壊れたUI購読(comeview/venue/popup)が全体を落とさない
  よう各 listener 隔離(会議では出ていなかった重要な堅牢化)。
- publish は **fire-and-forget**(揮発・応答待たない)。EventEmitter.setMaxListeners(1000)。

### useLiveMapStream.ts(購読フック)= 追憶の各UI購読側の実装パターン
- **指数バックオフ再接続**(2秒→最大30秒・open でリセット)。→ MV3 SW は30秒で寝るので Port 再接続必須。
- **catchup イベント(接続時に直近一括)+ live イベント(リアルタイム)の2系統**。
- ⭐**visibilitychange でタブ hidden→接続close・visible→再接続**。→ 追憶が苦労してる「タブhiddenで
  停止」と同じ制御。「見えてる時だけストリーム」で省電力。
- **SSE失敗時は polling が担保**(二重化)。JSON.parse は try/catch で握る。

### yukkuriHealth.ts(ヘルスチェック)= 追憶 status.html 強化の実装パターン
- ⭐**カバレッジ診断**: total / withName / withAvatar / withBoth / coveragePct(%)。
  → 追憶版: **まさにサムネ問題の指標**=「参加者中サムネ取得率○%」を status に出せる。サムネ会議
    (profileResolveState)の効果測定にも直結。
- ⭐**公開版(detailed:false)と詳細版(detailed:true=admin)を分離**: 公開は env 有無等の弱い情報
  開示を隠す(攻撃者に技術スタックを教えない)。→ 追憶版: 軽量モード(保存済み診断値)と詳細診断
  (SW/VOICEVOX 能動 ping)の分離=会議結論と一致。
- **各診断を try/catch 隔離**(1つのDB失敗が全体を落とさない)+ **エラーに直し方 hint**
  (テーブル不在→「ensure-…sql を適用」)。→ 追憶版: status の各指標を独立表示+直し方提示。
- **lastBackfillAt / lastBackfillFailed だけは公開**(UptimeRobot 等が「24h以内に回ったか・失敗が
  閾値以下か」を外形監視できる最小値)。

### docs/.github(未読・次回深掘り候補)
- docs/V2-SURECHIGAI-DESIGN.md(v2設計=最新思想)・docs/OPS.md(運用)・CHOKAIGI_RUNBOOK.md(13KB・
  会期中トラブル対応の実戦索引)。
- .github/workflows/claude.yml(**Claude を CI で自動化**するワークフロー=追憶の自動レビュー/検証 CI 化の参考)。
- server/src/lib: aiErrorReport.ts(AIエラー報告)/moderation.ts/visibilityFilter.ts(公開範囲)/
  yukkuriBackfillState.ts(backfill 状態管理)も追憶に転用候補。
