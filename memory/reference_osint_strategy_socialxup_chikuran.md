---
name: reference_osint_strategy_socialxup_chikuran
description: 「追憶のきらめき」の OSINT 拡張戦略(SocialXup・ちくらん・Shobon Kick Ranking 級を目指す)・取得層最強化計画
metadata: 
  node_type: memory
  type: project
  originSessionId: 3ee3e8e7-8fa7-43ef-ad2d-99c142f37510
---

# 「追憶のきらめき」の OSINT 拡張戦略(v0.1.607〜)

## 1. 戦略の核

ユーザー(運営者)の意図:
> 「追憶のきらめき拡張」を **OSINT(Open Source Intelligence)= 公開情報を組み合わせた知見ツール** に進化させ、
> **SocialXup(socialxup.com)/ ちくらん(chikuwachan.com)/ Shobon Kick Ranking(shobon-ranking.ddns.net)** 級の
> 公開分析サービスを展開する。

## 2. ベンチマーク

### SocialXup(X+YouTube アカウント追跡)
- **アカウントパワー診断**(A〜E、0〜100 スコア)
- **アカウント偏差値診断**
- **凍結アカウント記録保存**(歴史保存価値)
- **凍結カレンダー**(日別ヒートマップ)
- **フォロワー数増加アカウント**(時系列)
- **YouTube をやっている X アカウント**(クロス SNS 紐付け)
- **ファンネル**(流入経路の矢印可視化)
- **ジャンル**アバター並び(視覚カテゴリ)
- 完全無料・登録不要

### ちくらん(ちくわちゃんランキング)
- ニコ生・ツイキャス・YouTube・Twitch・ふわっち・OPENREC 横断
- コメント数(=勢い)指標
- **コミュ人数や視聴者数に関係なくお祭り状態を発見**できる独自価値
- ニコ生では古くからデファクトスタンダード

### Shobon Kick Ranking
- ニコニコ・ツイキャス・Twitch リアルタイム同接
- 高密度縦長スクロール(数百件俯瞰)
- ナビ: Ranking/Team/Search/Category/Gift/Award/Tier/Graph/Clip
- 連絡: @ShobonRanking on X

## 3. 我々の優位性

| 競合に足りないもの | 我々の強み |
|---|---|
| 配信者の外側からしか見えない(公開 API/URL) | 配信者本人が拡張装着で**内側から精度高く記録** |
| 視聴者個別の応援活動が見えない | コメ・ギフト・常連度を**配信者の手元で詳細記録** |
| 静的な公開情報のみ | **配信者本人が公開 OK したコメンターだけ深く出す**設計が可能 |

## 4. OSINT としての設計方針

| 観点 | 方針 |
|---|---|
| 集めて良い | niconico が公開している情報のみ(プロフィール・フォロー/フォロワー数・コミュ・配信履歴) |
| 集めてはいけない | DM・パスワード・非公開コメント・本人未公開連絡先 |
| 公開範囲 | 公開情報の**加工・集計・可視化公開**は OSINT 正規行為 |
| 個別特定 | uid・公開ニックネームは OK、侵襲的特定(本名・住所)は NG |
| 利用規約 | niconico ToS の自動アクセス・スクレイピング条項を尊重(過度なレート/サーバ負荷を避ける) |

## 5. 真因(Explore 調査・2026-06-03)

「フォロワー数が全然取れていない」の真因 TOP 3:

1. 🔴 **キャッシュ TTL 24h** で再取得されない(過去 24h fetch 済み uid は新規対象外)
2. 🟠 **未ログインで 401 silent fail** + キャッシュに forbidden 焼き込み → 再試行禁止
3. 🟠 プロフィール非公開で 403 silent fail

## 6. 実装ロードマップ

### Phase 1: 取得層根治(2-3 PR・即着手)
- **1-A**: TTL 24h → 6h リフレッシュ + 履歴蓄積追記型
- **1-B**: 401/403 のキャッシュ TTL を 15 分に短縮(ログイン回復で自動再試行)
- **1-C**: popup に「全コメンターのフォロー情報を強制再取得」ボタン
- **1-D**: フォロワー数の時系列追記型ストレージ(日付スタンプ付き履歴)

### Phase 2: 分析強化(Codex draft 依頼)
- **2-A**: 応援者パワー診断(A〜E、0〜100)
- **2-B**: 応援者 Tier(S/A/B/C)
- **2-C**: 常連密度スコア(N 配信中 X 回コメ)
- **2-D**: 卒業/復帰カレンダー(status 履歴の時系列管理)

### Phase 3: UI 拡張
- **3-A**: マーケ HTML レポートに応援者パワー診断グラフ・Tier 表示
- **3-B**: 配信中ライブランキング(popup の応援帯を Tier 色付きに)
- **3-C**: 今月の MVP 応援者(Award)

### Phase 4: 公開 SaaS 構想(別プロジェクト)
- **4-A**: LP に「応援者分析ツール」セクション拡張
- **4-B**: 配信者が手元 JSON をアップロード → SaaS 側で SocialXup 風ダッシュボード生成
- **4-C**: プライバシー設計(配信者が公開を選んだコメンターだけ)
- **4-D**: ちくらん風「勢いのある配信を発見」セクション(参加配信者ネットワーク)

## 7. 既存資産(これだけ揃っている)

- `src/lib/commenterFollowAnalytics.js`(965 行・15 export)
- `src/lib/commenterFollowCache.js`(380 行)
- `src/lib/commenterFollowingListCache.js`(303 行)
- `src/lib/nicoUserFollowingApi.js`(159 行)
- `src/lib/nicoUserProfileApi.js` / `nicoUserProfilePage.js`
- マーケ HTML レポートのコメンターフォロー分析セクション

つまり**基盤は既に SocialXup 級に整っている**。Phase 1 で取得層を直せばデータが揃い、Phase 2-3 で SocialXup/ちくらん級の UI に進化できる。

関連:
- [[reference_baseline_v0192_zip]](尊重対象)
- [[reference_2026-06-03_wip_consolidation_and_bugfixes]](現マイルストーン)
- [[codex_collaboration_rules]](Codex 縄張り)
