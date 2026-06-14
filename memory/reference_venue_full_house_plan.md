# 会場モード「全員入れる」計画書（feature/venue-full-house）

2026-06-14 確定。星野ロミ会議(無料LLM4体一致) + 世界事例調査(Explore 2体・出典付き) + 司令塔判断。
ブランチ `feature/venue-full-house`。**テスト駆動・段階リリース・各段で実機確認**。

## 背景・ユーザー要求（実機 482人配信）
- 「会場参加者482人」と表示しているのに席に出るのは約96人。残りは点描に逃がしていて顔が出ない。
- **要求=全員を抜け漏れなく顔付きで入れる。サムネ付き優遇。SHOWROOMに負けないため。**
- 「今会場にいるメンバーを視覚的に確認できる診断ボタン」が欲しい(AIも人間も検証用)。
- タイミングがずれている(参加者集計と吹き出しが別ポーリング)。
- ⚠️過去の失敗: 純関数だけ8段にしたがヒナ壇DOM(tierNodes)が5個固定で5段に詰め込み窮屈化。
  → **DOM側とCSS側を実機で確認せず純関数だけ変えると壊れる**。

## 世界の定石（調査・出典）
- **482人はDOMで十分・Canvas点描は不要**(数千人〜で初めて検討)。[Lighthouse DOM size]
- ボトルネック=「ノード数」より「画像同時デコード」と「画面外レイアウト計算」。
- **最優先=`content-visibility:auto; contain-intrinsic-size:auto <h>;`** を各アバターセルに。
  自前仮想スクロール不要でブラウザが画面外スキップ(583ms→6ms実測)。Chrome拡張なら確実。[web.dev content-visibility]
- **罠(v0.1.648で実際に踏んだ)**: 高さ可変だと placeholder とズレて白化。→ **アバターセルは高さ固定**にして適用・**入れ子二重指定しない**。
- **IntersectionObserver で顔画像を遅延ロード**(482枚同時デコード回避)。[Smashing]
- **LOD**: 前列=実サムネ顔/中列=ゆっくり顔/後列=シルエット。「サムネ前列優先」と一致。
- **grid-auto-flow:dense は避ける**(席順/タブ順を壊す・仮想化と衝突)。[MDN]
- SHOWROOM裏付け: ギフトで前列化・吹き出し・観客アバター=追憶と同型。[btrax]
- 自前仮想化が要るのは数千ノード〜。482人では content-visibility で足りる公算大。

## アーキテクチャ方針
1. **縦スクロール会場**: 全員を段組み(可変段数)で並べ、overflow-y:auto で全員を顔付き表示。
   席は「席index→固定座標(絶対配置)」で仮想化しやすく/ちらつかせない。
2. **content-visibility:auto を高さ固定のアバターセルに**(自前仮想スクロールは後回し)。
3. **サムネ優遇**: 前列N席を実サムネ専用に予約(既存 frontRow 強化)・LODでサイズ階層。
4. **診断ボタン**: buildVenueRoster(実装済) を画面に出す。誰が顔付き席/点描か一覧。
5. **タイミング**: 集計と吹き出しを単一レンダー状態に寄せる(star pattern)。※リスク高め=後半。
6. **退避境界**: 800人まで顔・それ超は点描(人数連動・純関数 resolveVenueFaceCap)。

## 実装フェーズ（1PR=1段・各PRで verify:cc + 実機確認）
- **PR0(済/このブランチ)**: tierNodes 5→8 修正(窮屈の応急)・buildVenueRoster 純関数+テスト。
- **PR1 診断ボタン配線**: 会場ヘッダに「👥 メンバー一覧」ボタン→ buildVenueRoster でモーダル表。
  ⭐これを先に出すと、Claudeが実機を見られなくても data で「全員入ったか」検証できる(再発防止)。
- **PR2 全員入れる(cap撤廃+content-visibility)**: resolveVisibleArenaCount の cap を「顔上限(800)」に。
  席セルに content-visibility:auto + contain-intrinsic-size:auto。高さ固定。縦スクロールで全員。
  tierNodes/段数も実DOMと一致させる(可変段数 or 全員ぶんプール)。
- **PR3 サムネ優遇+LOD**: 前列予約強化・サイズ階層(前列大→奥小だが顔)・実サムネ持ち必ず手前。
- **PR4 画像遅延ロード**: IntersectionObserver で顔画像を可視時のみ fetch(rootMargin先読み)。
- **PR5 タイミング統合**: 集計+吹き出しを単一状態に(star pattern)。リスク高=最後・慎重に。

## Non-Negotiables
- 各PRで実機確認(ユーザーがリロード→スクショ)。Claudeは buildVenueRoster の data でも検証。
- 純関数は必ずテスト。DOM/CSS変更は実DOM(tierNodes等)との整合を必ず確認。
- 映像セーフエリアを潰さない(中央の配信映像は見えるまま)。
- 「縮小して読めなくする」はLODの範囲で(手前は読める・奥は小さくても顔は出す)。
- background.js/persist/NDGR は触らない。

## 検証
- npm run verify:cc(test/lint/typecheck/build/bump)。
- 実機: ユーザーが会場を開く→診断ボタンで「482人中482人席」を確認→スクショ。
- ⚠️tsc: イベントハンドラ引数に @param {Event} JSDoc 必須(TS7006)。
