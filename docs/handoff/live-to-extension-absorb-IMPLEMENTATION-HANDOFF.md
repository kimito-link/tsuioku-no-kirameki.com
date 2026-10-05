# 実装ハンドオフ: /live/ の良い部分を拡張(応援レーン・会場・別窓)へ取り込む

> 作成: 2026-10-06 / 司令塔 / この 1 枚だけで着手できる粒度で書く。
> 正本: 仕様 [live-to-extension-absorb-SPEC.md](live-to-extension-absorb-SPEC.md)(設計=Fable・裏取り済み)
> 地図: [live-to-extension-absorb-MAP.md](live-to-extension-absorb-MAP.md)
> 読む順: この HANDOFF → SPEC §2.1(採用表)→ SPEC §4(版ごとの手順)→ SPEC §5(検証)。地図は根拠を確かめたいときだけ。

## 0. スコープ(MVP)

6 版・各版は単独で出荷・単独で戻せる。**この順で 1 版ずつ**(1 変更=1 版・AGENTS §12.5)。

| 版 | 内容 | 主な変更 |
|---|---|---|
| 1562 | タイル 3 行目に 🎁pt / 📣pt / 💬件(`data-stats` + `::after`)、脚注 1 行 | 新規 `src/lib/laneTileStats.js`、`laneMirror.js`/`venueLaneMirrorSupply.js`/`adLanePicksFromRooms.js`/`storyUserLaneGuideHtml.js` の additive 変更、`src/extension/story/renderStoryUserLaneDom.js`(属性付け・その場同期)、popup-entry 配線 ≤25 行、CSS(popup.html・venueBar.js `LANE_CSS_SYNC` 区間)、`npm run build` で `app/live-view.html` 再生成 |
| 1563 | 段見出しに「N人」 | `storyUserLaneGuideHtml.js` 第 2 引数(additive)、renderer の呼び出し 5 箇所 |
| 1564 | 識別絵(identicon)を点線枠 | CSS 1 行 × 2 箇所(popup.html / venueBar.js) |
| 1565 | ギフト増分 `+N pt`(koken 標本間差分・次の標本まで残る) | `laneTileStats.js` 追加関数、`createGiftPulseRegistry`(既存 `liveGiftPulse.js`)を popup から利用、鏡 `pulse` additive、CSS |
| 1566 | 熱い人 `+N件`(直近 60 秒のコメント増分・初回は光らせない) | 新規 `src/lib/laneHeatTracker.js`、`tierForCommentDelta` を葉 `src/lib/commentDeltaTier.js` へ移動(liveMotion.js は re-export)、CSS |
| 1567 | 公式値チップ「本家コメ」に `+N/分` | 新規 `src/lib/officialCommentRate.js`、popup.html に span 1 個、popup-entry ≤10 行 |

版番号は着手時の manifest 最新 +1 に読み替える(2026-10-06 時点の最新は 0.1.1561)。

## 1. 着手手順

```bash
git checkout master && git pull --ff-only
git checkout -b feat/live-absorb-lane-stats
npm run test:cc            # 着手前に全緑を確認(約 2 分)
```
- SPEC assumption 2(koken の標本時刻)は司令塔が `readCardCapturedAtMs`(popup-entry.js:11002-)を読んで解消済み。storage の `capturedAt` をそのまま使ってよい。
- 着手前に `src/lib/personTileDom.test.js` が「img → meta の append 順」を固定していることを確認(SPEC §7-6)。固定していなければテストを 1 件足してから `lastElementChild` に依存する。
- TDD: 各版とも **純関数テスト → 共有レンダラの happy-dom テスト → パリティ/配線テスト → 実装** の順。

## 2. 実装ステップ(版ごと・SPEC の該当章を指す)

1. **1562**: SPEC §4「版 1562」。順序: `laneTileStats.js`(+test) → `adLanePicksFromRooms.js` → `laneMirror.js`(toMirrorCell/restore・`laneMirror.test.js` の `toEqual` 更新) → `venueLaneMirrorSupply.js`(composeVenueLaneBuckets に `stats`) → `storyUserLaneGuideHtml.js`(脚注) → `renderStoryUserLaneDom.js`(`_laneTileNodes` WeakMap・`applyLaneTileStatsAttr`・diff-skip 分岐での sync・`syncStoryUserLaneStatsInPlace` export) → popup-entry 配線(attach は `publishLaneMirror` より前・sync は「描かない 3 経路」) → CSS 3 コピー → `npm run build`。パリティテスト(SPEC §5.3)と wiring テスト(§5.4)はこの版で新設。
2. **1563**: SPEC §4「版 1563」。`storyUserLaneGuideHtml.test.js` に「省略でバイト同一」を先に書く。
3. **1564**: SPEC §4「版 1564」。CSS のみ。`laneAvatarSize.wiring.test.js` が緑のままであること。
4. **1565**: SPEC §4「版 1565」。`pulseRowsFromKokenRows` → `attachLaneTilePulse` → 鏡 `pulse` → レンダラ `applyLaneTilePulseAttr` → popup 配線(`_laneGiftPulse`・`_kokenRowsCapturedAtMs`)→ CSS。
5. **1566**: SPEC §4「版 1566」。`commentDeltaTier.js` の移動を先に(re-export テスト)→ `laneHeatTracker.js`(+test)→ 配線 → CSS。
6. **1567**: SPEC §4「版 1567」。`officialCommentRate.js`(+test)→ popup.html の span → `paintOfficialNicoStatsStrip` 配線。`officialNicoStatsStripDigest.js` は触らない。

各版の出荷は `/nicolive-ship`(bump 3 点セット・`verify:bump`・`verify:cc`・commit・push)。changelog は 20 版上限=1 版足すごとに `node scripts/split-changelog.mjs` → archive の差分を「HEAD + 移った 1 版」の最小形に戻す(2026-10-05 の手順: `git show HEAD:src/lib/changelog-archive.js` を土台に、先頭 1 エントリだけ挿入)。

## 3. 機械的な完了判定(版ごと)

- `npm run verify:cc` 緑(test / lint / typecheck / build / dist-fresh / tree-map / feature-map / layer-map / improvement)。
  - 新規 lib を足した版は `npm run tree-map` `npm run feature-map` `npm run layer-map` を**`git add -A` の後**に再生成(`scripts/repo-tree-map.mjs` の `FEATURES` に新 lib を 1 行足す)。
  - `check:improvement` が bundle-kb の増加で赤くなったら `src/lib/improvementHistory.js` の該当エントリに **note**(なぜ増えてよいか)を書く。数字は消さない。
- SPEC §5.5 の変異テストを各版で最低 2 件: 壊す → 該当テストが赤 → `git checkout` で復元 → 緑 → `git status` が clean。
- SPEC §5.6 の実機確認(`/nicolive-selfcheck`・devtools Chrome に repo の `extension/` を `reload_extension`)。
  - 1562 の完了条件: ① `#sceneStoryUserLaneLink .nl-story-userlane-meta[data-stats]` が投入データと一致 / ② 会場の同 uid タイルと**文字列一致** / 鏡 cell に `stats` / 1 件追加で `getStoryLaneRepaintCounts()` が増えないのに `data-stats` が +1。
  - 1565: koken rows を +500pt に書き換え capturedAt を進める → `is-gifted` + `data-pulse="+500pt"`。
  - 1566: 60 秒以内に 3 件追加 → `is-hot` `+3件`、60 秒放置で消える。
  - 1567: 公式コメ数が 40 秒で +44 → `+66/分`。
- 実装後は **reality-checker** に SPEC §5 を土台にした検証を委任(自己採点しない)。
- 出荷後、ユーザーの Chrome へは `npm run copy:ext` + `verify:deploy`(配信視聴中は禁止)。実 Chrome のリロードは手動(この端末からは届かない: 2026-10-05 の記録)。

## 4. 地雷(SPEC §7 の要約・毎回踏むもの)

- **個別列挙の穴 3 箇所**(toMirrorCell / restoreLaneMirrorBuckets / composeVenueLaneBuckets)。1 つ忘れると「popup には出るが会場・別窓に出ない」を黙って起こす。パリティテストで固定。
- **鍵を揺らさない**: `storyLaneTierBodyKey` / `buildStoryUserLaneRenderSignature` / `laneSceneContentHash` / `venueLaneParityKey` に stats/pulse を入れない(6 版かけたちらつき対策が戻る)。
- **描かない 3 経路**(sig 一致・縮小ガード・鏡 skip)に sync を足す。テストは paint 経路しか通らないので、忘れると実機でだけ「件数が更新されない」。
- **CSS は 3 コピー**: popup.html / venueBar.js の `LANE_CSS_SYNC_BEGIN/END` 区間内 / `app/live-view.html`(build 生成・追跡ファイル=`git add` 必須)。
- **venue の `--nl-*` 変数は自前**: 新トークン 3 つを `VENUE_CSS` の変数ブロックにも置く。
- **`liveMotion.js` を popup に import しない**(bundle に `liveRankingView.js` が付いてくる)。
- **popup-entry.js の max-lines** 22,096(余地 580 行)。合計 ≤60 行。超えたら lib へ。
- **commit-msg フック `root-cause-claim`**: 実機証拠なしに「根治」と書くと止まる。「効くはず(未確認)」と書く。
- **CRLF 混在**: 置換が空振りしたら行末を疑う(wiring テストも CRLF 正規化してから検査)。
- **北極星 OFF の利用者には 🎁📣 が出ない**(仕様)。「出ない」報告はまず ON/OFF を見る。

## 5. 次のセッションに渡す一言

> `docs/handoff/live-to-extension-absorb-IMPLEMENTATION-HANDOFF.md` を読んで、ブランチ `feat/live-absorb-lane-stats` を切り、版 1562 から TDD で実装してください。実装後は reality-checker に検証を委任し、各版は `/nicolive-ship` で出してください。
