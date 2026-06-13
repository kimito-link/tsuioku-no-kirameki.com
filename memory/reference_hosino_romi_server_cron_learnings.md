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
