# 会場「全員500人をサムネ優先で並べる」設計会議 — 司令塔の収束 (2026-06-22)

質問: `council/venue-all-faces-500-question.txt` / 生回答: `council/venue-all-faces-500-answers.json`

## 会議の結果(routed・general)
- **回答した3体は全員一致**: local/deepseek-r1:14b(批判)・groq/gpt-oss-120b(批判)・deepseek統合 = いずれも **「縦スクロール型フラットリスト + 段階的LOD」** を結論。
- gemma4(lead) は再起動の abort で中断・groq llama-3.3-70b は HTTP 429(TPD上限)で無回答。
- 最も具体的だったのは **gpt-oss-120b**(PR1レイアウト→PR2 cap撤廃→PR3 LOD→PR4 点描整理 を提示)。

### 会議の一致した方向(採用)
1. 8段3Dひな壇の **同時表示頭打ち(cap150)** が「482人なのに96人しか顔が出ない」の正体。全員出すには cap を外す。
2. **content-visibility:auto + 固定高さセル** で500要素でも軽い(過去調査 583ms→6ms)。Canvas点描は数千人〜でないと不要。
3. **サムネ優先LOD**: 実サムネ(VIP・手前大)→数値ID由来アイコン→ゆっくり顔→(最奥)シルエット。手前数行を拡大して奥行き感(SHOWROOM感)を演出で残す。
4. **点描Canvasは「無言視聴者(PV・席資格なし)」専用**に整理。席資格者(userId観測済)は全員顔付き。
5. 画像は IntersectionObserver で遅延ロード(rootMargin 先行)。grid-auto-flow:dense は席順を壊すので不可。

## ★司令塔が裏取りした「会議が見落とした穴」(破壊的手段は却下)
会議の**方向は正しい**が、gpt-oss が出した**実装手段は危険**:
1. **`resolveDynamicArenaCap` を `return total` にするのは却下** — この純関数は venueSeats.test.js(計77本中の cap 系)と `resolveVisibleArenaCount`・`resolveVenueMaxHeightVh`(高さ計算)が依存。雑に撤廃するとテスト全壊+会場高さが壊れる。**cap は上げるが段組み/高さ計算との整合を保つ**。
2. **「3Dひな壇を捨てる」は却下** — `--nlsb-tier-y/z/scale`・VIP拡大・常連オーラ・発話streak・**吹き出し座標(seatAnchorEl)** が全て tier 構造依存。捨てると演出が全壊。
3. → **作り替えでなく、cap を上げて全員ぶんの席を可変生成し、奥段をフラット化する漸進的アプローチ**が回帰リスク桁違いに小さい。過去「壁で覆う」を実機見ず大きく作って却下された教訓どおり、段階リリース+各段実機確認。

## 実コードで確認済みの現状(変更対象の正確な姿)
- 席プール = `VENUE_FULLSCREEN_MAX_SEATS=150` 個を起動時に生成(venueBar.js:1473)。tierNode は `VENUE_MAX_TIER_NODES`(8)個(:1463)。
- 同時表示 = `resolveVisibleArenaCount({totalCount, perRow, rows:8})` = min(total, perRow×8, hardCap=resolveDynamicArenaCap)(venueSeats.js:90)。
- 入りきらない人 = `totalAnonymous`「ほか N人」→ crowdCanvas 点描(venueBar.js:2490, 2506-2530)。
- サムネ優先は部分実装済(`partitionThumbnailFirst`・venueBar.js:2483)。実サムネは `.nlsb-seat-vip`。
- 席タイル本体は popup の本物 `buildPersonTileEl`(v0.1.900)。演出はラッパー .nlsb-seat に被せる。
- 診断土台 `lastRosterInput = {allSeats, visibleSeats, audienceCount}` は毎描画で保持済(venueBar.js:2496)。「メンバー一覧」ボタン(rosterBtn)は header に既にあるが画面表示は要確認。

## 推奨PR順(各段で実機確認)
- **PR1**: 診断ボタン(rosterBtn)で `lastRosterInput` を「会場参加者N人中・席M人・点描K人」一覧モーダルに。実機を見なくてもデータで「全員入ったか」検証できる土台。回帰ゼロ。
- **PR2**: cap を上げ(150→可変・例500)、席プールを可変生成、セルに content-visibility:auto + 固定高さ。奥段はフラット化。**resolveDynamicArenaCap は消さず引数で上限を上げる**(テスト維持)。
- **PR3**: サムネ優先LOD 3階層強化。
- **PR4**: IntersectionObserver 画像遅延ロード。点描を PV 専用に整理。

## 未確定(次セッションでユーザーに確認)
- 最初のPRをどれで切るか(PR1診断/PR2 cap撤廃/まず実機スクショ)を AskUserQuestion で聞いたが未回答のまま再起動。次回その回答から再開。

[[feedback_meeting_room_for_complex_tasks]] [[feedback_self_verifying_loop]]
