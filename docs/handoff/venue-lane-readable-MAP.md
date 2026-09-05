# 地図(wayfinder) — 会場/応援レーンを「332人並んでも見やすい」にする

> 作成: 司令塔(Claude) / 2026-08-12 / **コードは一切変更していない**
> お題: 匿名332人が並んでも見やすいレスポンシブ設計にする。SHOWROOM のような
> 「顔がびっしりで誰が誰か分からない」を避け、価値ある見せ方にする。
> 前提: v0.1.1375 で**匿名をたぬ姉段に出す**ようにした(ユーザー確定)。人数が一気に増えたので
> 見せ方の設計が要る、というのが本お題の出発点。

---

## 0. ユーザーの言葉(そのまま残す)

- 「たぬ姉段が匿名332人で埋まること自体は、**望ましいです**」
- 「ただ、**レスポンシブでうまく見せやすい形**を会議したほうがいい」
- 「**showroomがヒント**ですが、**ごちゃごちゃしすぎてみにくい**ので見やすい形にすれば価値が出る」

★つまり **人数を減らす方向の解は却下**。「全員居る」ことは価値であり、
問題は**密度に対する情報設計**である。

---

## 1. 入口になる画面

| # | 画面 | 開き方 | 本お題との関係 |
|---|---|---|---|
| ① | **サイドパネルの応援レーン**(5段) | Chrome サイドパネル | ★**本丸**。332人がここに並ぶ |
| ② | 応援プレビュー(dock=liveview) | 別窓 | ①の鏡。同じ描画関数を通る |
| ③ | **会場モード**(全画面アリーナ) | watch 右下の桜色ボタン | 別レイヤー(席・最大500)。①とは**別の描画系** |
| ④ | 純Web(/live-view) | ブラウザ | ①の鏡(storage 経由) |

★**①と③は別物**。①=5段のレーン(flex-wrap)、③=アリーナの席(段組み+scale)。
ユーザーの「会場モード」という語は③を指すが、**332人が並ぶのは①のたぬ姉段**。
本お題は**①が主戦場**で、③は既に段組み・LOD の仕組みを持っている(§4)。

---

## 2. 関係する主要ファイルと責務

| ファイル | 責務 |
|---|---|
| [popup-entry.js:6690](../../src/extension/popup-entry.js) `getStoryUserLaneEls` | 5段(link/gift/ad/konta/tanu)の DOM 要素を取る |
| [popup-entry.js:6808](../../src/extension/popup-entry.js) | ★`limit = STORY_USER_LANE_LIMIT_UNLIMITED`(=Infinity) |
| [popup-entry.js:6957](../../src/extension/popup-entry.js) | `bucketStoryUserLanePicks(rosteredCandidates, limit)` |
| [storyUserLaneBuckets.js](../../src/lib/storyUserLaneBuckets.js) | tier別に上限付きで分割(link/konta/tanu) |
| [domain/lane/tier.js](../../src/domain/lane/tier.js) | ★段の正本。**匿名は必ず tanu(tier1)** |
| [popup.html:965](../../extension/popup.html) `.nl-story-userlane` | ★**flex-wrap / max-height:none / overflow-y:visible** |
| [popup.html:986](../../extension/popup.html) `.nl-story-userlane-cell` | 1人=丸アイコン+名前の pill |
| [venueLaneBuckets.js](../../src/lib/venueLaneBuckets.js) | ③会場の席→レーン item 変換(v0.1.1375 で匿名除外を撤回) |
| [venueSeats.js:938](../../src/lib/venueSeats.js) `buildVenueTiers` | ③アリーナの段組み(人数連動・scale/depth) |
| [venueViewport.js:61](../../src/lib/venueViewport.js) `resolveDynamicArenaCap` | ③の人数連動上限 |

---

## 3. データが流れる順番(①レーン)

```
コメント/ギフト/広告
  → 候補生成(popup-entry.js 内)
  → applyLaneRosterKeeper (popup-entry.js:6950) 名簿で「一度出た人」を復活
  → sort compareStoryUserLaneCandidates (6955)
  → bucketStoryUserLanePicks(candidates, Infinity) (6957) ★上限なし
  → 5段の DOM へ flex-wrap で並べる (.nl-story-userlane)
```

★**間引きが一箇所も無い**。`limit=Infinity`(6808) かつ CSS も `max-height:none`(popup.html:973)。
＝332人はそのまま332個の pill になり、縦に伸び続ける。**これが「ごちゃごちゃ」の構造的原因**。

---

## 4. 既存の設計判断と、その根拠(壊してはいけない境界)

| # | 判断 | 根拠 | 壊すと何が起きるか |
|---|---|---|---|
| A | **全員表示・48上限は撤廃** | `HANDOFF-show-all-participants.md` / ユーザー確定 | 「全員居る」価値が消える。**人数を減らす解は却下** |
| B | **匿名は必ず たぬ姉段** | [tier.js:46](../../src/domain/lane/tier.js) `matchesTanuPolicy` 最優先 | 非匿名が匿名の群れに埋もれる(2024-2025に繰り返し発生) |
| C | **①POP=②プレビュー=③会場=④WEB は同じ顔ぶれ・同じ並び** | [[venue-equals-lane-same-layout]] | パリティ検査が全部赤。嘘の緑を生む |
| D | **ちらつき対策の diff-skip 機構は触らない** | `story-userlane-churn-filllanetier-v1039` (7版かけた) | ちらつき再発 |
| E | **単調増加(一度出た人は消えない)** | v0.1.1232 lane-never-drop / [[lane-has-no-roster-accumulator-2026-08-02]] | 「消えた人」が出る=今日直したばかりの症状 |
| F | ③アリーナは**段組み+scale で立体的に密度を出す** | [venueSeats.js:938](../../src/lib/venueSeats.js)・2026-06-14会議 | ①に③の仕組みをそのまま持ち込むと破綻(§6) |

★**D と E は「見せ方を変える」実装が最も踏みやすい地雷**。
表示順や DOM 構造を変えると diff-skip キーが変わり、ちらつきが復活する。

---

## 5. 変更すると壊れうる箇所

- `.nl-story-userlane` の CSS を変えると **②プレビュー・③会場・④WEB の見た目も変わる**
  (同じクラスを共有)。パリティ検査(`venueLaneParity.js`)は**集合と順序**を見るので、
  **CSS だけの変更なら検査は通る**が、DOM 構造を変えると落ちる。
- `bucketStoryUserLanePicks` の戻り値の形(link/konta/tanu)を変えると
  ③`venueLaneBuckets.js:173` と④の鏡が同時に壊れる。
- 表示順を変えると `HANDOFF-venue-equals-lane.md` の表示順契約(SPEC §7-1)違反。
- 名簿(`applyLaneRosterKeeper`)より**後**に間引きを入れないと、
  「復活した人が間引かれて消える」=Eの違反になる(**間引きは描画層でやるべき**という示唆)。

---

## 6. 未確認の前提と、追加調査が必要な点

- **未確認**: 332人並んだときの実際のスクロール量・描画コスト。
  `storyGrowthChurn` の計器は「アイコングリッド」のもので、**レーンの pill 数とは別**。
  → 実装前に「たぬ姉段332件のときの段の高さ(px)と paint 時間」を1度測るべき。
- **未確認**: サイドパネルの実幅の分布。実測値は 461/500/515/530px(速報より)。
  **幅が狭い**ので、SHOWROOM のような「横に広い会場」の見せ方はそのままでは使えない。
- **推測**: ③アリーナの `buildVenueTiers`(段組み+scale)は①レーンには**そのまま使えない**。
  ③は「奥行きのある会場」を描くための scale/depth モデルで、①は縦に積む pill の列。
  ただし**「密度LOD(人数が増えたら奥を小さく)」という考え方は①にも移植可能**(推測)。
- ★**確認済み(司令塔が実コードで裏取り・2026-08-12)**: 匿名は**全員同じ見た目ではない**。
  [storyUserLaneMeta.js:52-59](../../src/lib/storyUserLaneMeta.js) が匿名IDに対して
  `idLine = compactNicoLaneUserId(uid)`(短縮ID) と
  `nameLine = anonymousNicknameFallback(uid, nick)` を返す。
  さらに [venueLaneBuckets.js:104](../../src/lib/venueLaneBuckets.js) が
  `anonymousIdenticonDataUrl(uid)` で**IDごとに異なる identicon**を生成する。
  ＝**個体識別の材料は既にある**(短縮ID + 固有の identicon)。
  → よって「区別できる情報が無い」のではなく、**332個が等価な密度で並ぶこと自体**が
  「ごちゃごちゃ」の主因。**情報を足すのではなく、密度と階層を設計する**のが正しい方向。
  ★ただし速報の応援コメント欄で表示名が「匿名」に見えるのは**コメント欄の話**であり、
  レーンの pill とは別経路。混同しないこと。

---

## 7. 実装前に決める必要がある質問(Fableに答えさせる)

1. **332人を全員見せつつ「見やすい」を両立する情報設計は何か。**
   人数を減らさずに密度を下げる手段(折りたたみ/サマリ行/スクロール分離/段内のLOD)のうち、
   幅461〜530px のサイドパネルで成立するのはどれか。
2. **匿名が全員同じ見た目である問題**をどう扱うか。
   identicon で色は違うが名前は全員「匿名」。**何を手がかりに「誰か」を区別させるか**
   (発言内容・貢献度・初見/常連・時刻)。それとも**個体識別を諦めて「群れとして」見せるか**。
3. **たぬ姉段だけ扱いを変えてよいか。** りんく段(名前あり)は数人〜十数人なので今のままでよい。
   段ごとに異なる表示戦略を取ることは、契約C(4画面パリティ)と両立するか。
4. **既定は「畳む」か「開く」か。** 畳むと「全員居る」実感が減り、開くとごちゃごちゃする。
   ユーザーは「全員居ること」に価値を置いている(§0)。この矛盾をどう解くか。
5. **ちらつき(契約D)と単調増加(契約E)を壊さない実装層はどこか。**
   間引き/折りたたみを「候補生成」でやると E 違反、「描画」でやると D のリスク。
   どの層で、どう実装すべきか。
6. **③会場アリーナ(全画面)にも同じ問題があるか。** ③は既に段組み+scale+入れ替え制を持つ。
   ①の解決策を③にも適用すべきか、それとも③は現状維持か。
7. **測定可能な完了条件は何か。** 「見やすくなった」を機械で判定する方法
   (段の高さ上限・スクロールせずに見える人数・初見からN秒で何が読めるか)。

---

## 8. セルフチェック

- [x] ファイル名の列挙で終わっていない(なぜそこを通るかを§3に記載)
- [x] 既存仕様を守る理由を§4に集約(A〜F・根拠付き)
- [x] ユーザー体験上の制約(§0のユーザー確定・幅461〜530px)
- [x] 失敗時の挙動(§5 パリティ検査・ちらつき・単調増加)
- [x] 事実と推測を分離(§6に未確認を明記)
