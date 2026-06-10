# 追憶メディアキット(Kick Analytics/Media Kit 概念の移植) 設計メモ v0.1.678

司令塔(Claude Code)発・Codex CLI 向け。2026-06-10。

## 概念(ユーザー提示・Kick の新機能)

Kick の Analytics & Media Kit = 「配信者向け統計画面」ではなく**営業資料**:
- 30日/60日/90日の列で: フォロワー数・獲得フォロワー数・平均同時視聴者数・最大同時視聴者数・
  ユニーク視聴者数・総視聴時間・チャット率(件/分)・サブスク・配信頻度(週N回)
- 「公式データであることの明示」(信頼バッジ)
- **リンク1つ(=1ファイル)で共有できる**=配信者育成&スポンサー営業用

これをニコ生版として追憶に入れる。**過去配信を全部アーカイブしている追憶だから作れる**差別化機能
(SocialXup/OSINT戦略 Phase2 の延長)。

## データ棚卸し(既存・実装確認済み)

1. **broadcastSessionSummaryDb**(IDB `nls_broadcast_summary_v1`・popup から open 可):
   配信ごと時系列サンプル(1 live 最大200行・全体5000行)。
   fields: liveId, capturedAt, commentStorageCount, uniqueKnownCommenters, giftUserCount,
   peakConcurrentEstimate, officialCommentCount, officialViewerCount, broadcastTitle,
   broadcasterName/UserId/IconUrl, viewerCountFromDom。
   `listRecentUniqueBroadcastLiveIds(db, {limit})` 等のヘルパあり(popup-entry が使用中)。
2. **broadcasterProfileStorageKey(lv)** = `nls_broadcaster_profile_<lv>`:
   followerCount / followeeCount / broadcastStartDate / cumulativeBroadcastDays / capturedAt
   → 配信ごとのフォロワー数スナップショット=**獲得フォロワー数(期間差分)が出せる**。
3. **`nls_gift_events_<lv>`**: ギフトイベント配列(point 合計でギフトpt)。
4. (任意) チャンク/IDB コメント全件 → 期間ユニーク応援者の厳密値(重いので任意・cap付き)。

## 指標マッピング(30日/60日/90日の3列・Kick 表と同型)

| 指標 | 算出 |
|---|---|
| フォロワー数 | 期間内最新の broadcaster_profile.followerCount |
| 獲得フォロワー数 | 期間内最新 − 期間内最古の followerCount(2点未満は「-」) |
| 平均同時視聴者数 | 各配信の peakConcurrentEstimate サンプル平均(配信毎平均→全体平均) |
| 最大同時視聴者数 | 期間内 peakConcurrentEstimate の最大 |
| 来場者数(累計/配信平均) | 各配信の最終サンプル officialViewerCount(無ければ viewerCountFromDom)の合計/平均 |
| コメント数(累計) | 各配信の最終 officialCommentCount(無ければ commentStorageCount)の合計 |
| チャット率(件/分) | 累計コメント数 ÷ 推定配信分数(配信毎の capturedAt 最初↔最後の差の合計。0除算ガード) |
| 応援者数(ユニーク目安) | 各配信の最終 uniqueKnownCommenters の最大(厳密でない旨を脚注) |
| ギフト(累計pt/件数) | nls_gift_events_<lv> の point 合計と件数(期間内 lv のみ) |
| 配信頻度 | 期間内ユニーク lv 数 ÷ (期間日数/7) → 「週N.N回配信」 |

- 期間 = now から遡る 30/60/90日。配信の帰属は「その lv の最終サンプル capturedAt」。
- **データが無い枠は Kick 同様「-」表示**(誤魔化さない)。
- 注記: 「以下の統計データは追憶のきらめきが配信中に記録した公式値・実測値です」+
  各指標の出所(公式API値/実測)を脚注で正直に書く(信頼バッジの概念)。

## 実装(PR分割)

### PR1: 集計純関数 `src/lib/mediaKitStats.js`(+vitest 必須)
- `buildMediaKitStats({ summaryRows, profileSnapshots, giftEventsByLive, nowMs, windowsDays: [30,60,90] })`
  → `{ windows: [{ days, followers, followersGained, avgConcurrent, maxConcurrent, visitors,
      comments, chatRatePerMin, uniqueSupporters, giftPoints, giftCount, broadcastsPerWeek,
      liveCount }], broadcaster: { name, userId, iconUrl } }`
- 入力は全て plain data(IDB/chrome.* 非依存=テスト可能)。null/欠損は null を返し UI が「-」。

### PR2: メディアキットHTML `src/lib/mediaKitHtml.js`(+vitest)
- Kick のスクショと同型: ヘッダ(配信者サムネ・名前・ID・「公式KICK統計」相当の
  信頼バッジ=「追憶のきらめき 実測統計」)+ 指標×30/60/90日のテーブル + 脚注(出所)。
- 自己完結 single-file HTML(外部リソースなし・XSS: 全テキスト escape)。既存 HTML レポートの
  トーン(白地・フラット・--nl 変数系)を踏襲。スマホでも崩れない簡易レスポンシブ。
- 既存 reportFriendlyMetaRowsHtml 等と同じく chrome.* 非依存の純関数。

### PR3: 配線(popup-entry.js 最小差分)
- データ読み: broadcastSessionSummaryDb から期間内サンプル全件 + 各 lv の
  nls_broadcaster_profile_<lv> / nls_gift_events_<lv> を chrome.storage.local.get
  (lv 数は最大 90日分・listRecentUniqueBroadcastLiveIds 流用・上限 60 lv で打ち切り+脚注)。
- 入口: 既存クイックツールバー(HTML/マーケ/スクショ/…)に「📣 メディアキット」ボタン
  → 生成して .html ダウンロード(既存 HTML レポートと同じ保存経路を流用)。
- 生成は重くても数秒に収める(サンプル行は軽量。コメント全件は読まない)。

### PR4: 応援者セクション「応援者が主役」(ユーザー指示 2026-06-10 で方針転換)

> 当初の「視聴者個人の情報は載せない」は**撤回**。ニコ生のコメント/ギフトは公開情報
> (OSINT=公開情報の知見化・本プロジェクトの基本戦略)であり、追憶の思想は「応援者が主役」。
> メディアキットにも応援者を**表彰として**載せる(きらめきの賞と同系のトーン)。

- **期間内ギフト応援 TOP10**: 名前(匿名は匿名NNN)・サムネ(uid由来/identicon)・累計pt・件数。
  出所 = nls_gift_events_<lv> の期間集計(安価・全期間lv対象)。
- **期間内コメント応援 TOP10**: userId 集計の件数上位。名前/サムネはプロフィールキャッシュ
  (nls_user_comment_profile_v1)で解決。重さ対策=コメント全件読みは直近最大12配信に cap し
  脚注に「直近12配信から集計」と明記(きらめき賞の既存パターン踏襲)。
- **常連指標**: 期間内2配信以上に現れた応援者数と比率(同じ12配信capで算出・脚注)。
- トーン: ランキングでなく**表彰**(「この配信を支えた応援者たち」)。Kickに無い追憶だけの差別化。
- 集計純関数は mediaKitStats.js に追加(supporters: { giftTop, commentTop, regulars })+test。
  HTML は mediaKitHtml.js にセクション追加。

## 制約

- 触ってよいファイル: src/lib/ 新規2本+テスト、src/extension/popup-entry.js(ボタン配線と
  データ読み出しの最小差分)、extension/popup.html(ボタン1個)。content-entry.js 変更禁止。
- bump 0.1.678(manifest/package/changelog.js 先頭・summary 35字以内・items 平易日本語)。
- `npm run verify` 全緑。git commit/push はしない(司令塔が実機検証後に行う)。
- プライバシー方針(更新): ニコ生上で**公開**されている応援情報(コメント/ギフト)の集計は
  OSINT として載せてよい(応援者が主役)。非公開情報・追跡的な個人プロファイリングは載せない。
