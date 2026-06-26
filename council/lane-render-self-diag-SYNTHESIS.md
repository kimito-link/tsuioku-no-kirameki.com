# 会議 SYNTHESIS: 応援レーン描画の自己診断（v0.1.955 予定）

## 結論（4視点一致 + 司令塔の実コード裁定）

応援レーン（りんく/こん太/たぬ姉/ギフト/広告）の描画経路に、北極星の `_northStarRenderProbe` と
**同形のプローブ `_storyUserLaneRenderProbe`** を1個入れ、状態速報に「鏡N件 → 画面M件描画」と
「どの step で止まったか」を必ず出す。これで (A)〜(E) を状態速報だけで切り分けられる。

## プローブのフィールド（最小で最大の切り分け力）

| フィールド | 意味 | これで分かること |
|---|---|---|
| `activePath` | 'heavy' \| 'mirror' \| '' | (E) どちらの経路が今アクティブか |
| `started` / `completed` | 描画関数の入口/正常出口の回数 | 描画が走ったか・完走したか |
| `lastReachedStep` | start / entries-empty-return / mirror-empty / painted / done | (B)(C) どこで止まったか |
| `lastError` | 例外メッセージ(200字) | 例外で落ちたか |
| `domTilesPainted` | paint 直後に DOM に出た顔タイル総数 | (B)(D) 実際に画面に何件出たか |
| `mirrorCells` | 鏡の非null件数(mirror経路) | (A) 鏡が空か |
| `entriesLen` | STORY_SOURCE_STATE.entries 件数(heavy経路) | (C) heavy 未完走か |
| `lastRunAgoMs` | 最終実行からの経過 | プローブ自体の鮮度 |

## 状態速報での見せ方（ユーザー擁護役）
```
応援レーン描画: 経路=mirror / 鏡5件 → 画面0件描画 🔴 / 最後の到達=mirror-empty / 2秒前
  → 鏡にデータがあるのに画面0件=描画関数が呼ばれていない or 早期returnの疑い
```
- `domTilesPainted > 0 && ローディング継続` を検知したら『描画済みなのにローディングが終わらない(overlay バグ)』カード。
- `mirrorCells > 0 && domTilesPainted === 0` を検知したら『鏡はあるのに描けていない(描画停止)』カード。
- `mirrorCells === 0 && entriesLen === 0` なら『元データ無し＝出なくて正常』（誤検知しない）。

## 却下した案（批判役）
- ✗ overlay を畳む関数に「なぜまだ出しているか」専用 state を持たせる = 過剰。
  domTilesPainted>0 && overlay表示中 を状態速報側で判定すれば足りる。
- ✗ paint の read path を新規ラップ = v0.1.948 の地雷。観測は paint 直後の childElementCount を
  globalThis に記録するだけ＝描画サイクルを変えない。
- ✗ 推測でレーン描画ロジックを直す = まず診断を出して事実ベースにする（v0.1.953 の学びの再適用）。

## 制約の遵守
- 新規 storage read ゼロ（globalThis 集計 + 既に手元の値だけ。北極星プローブと同方式）。
- popup refresh()/paint の read path 不改変。
- 純データの build/format は lib（storyUserLaneRenderProbe.js）でテスト。popup-entry は記録1行ずつ。
- 件数と step のみ（キー値・個人情報なし）。

## 実装計画（v0.1.955）
1. 新 src/lib/storyUserLaneRenderProbe.js: createStoryUserLaneRenderProbe()/recordStep()/
   buildStoryUserLaneRenderDiag()/formatStoryUserLaneRenderDiagLines()/toActionCards()（純関数・test）。
2. popup-entry.js: _storyUserLaneRenderProbe を1個持ち、renderStoryUserLane()/applyLaneMirrorForPassive()
   の start / 早期return(entries-empty/mirror-empty) / painted(domTilesPainted) / done を記録。
   診断JSON(popup.storyUserLaneRenderProbe)に出す（northStarRenderProbe の隣）。
3. status-entry.js: fastDiag.popup.storyUserLaneRenderProbe を読んで状態速報に
   「応援レーン描画」セクション + 致命カード結合。
4. paintStoryUserLaneDomFilled の戻り or 各 lane の childElementCount で domTilesPainted を取る
   （paint 関数を1行変える程度・描画は変えない）。
