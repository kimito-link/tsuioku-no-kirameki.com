# 設計正本 v2: POPの内容が会場に「1つの抜けも余りもなく」載る(厳密完全一致+ロビー隔離+鏡スリム化)

- 設計=Fable(claude-fable-5) / 裏取り=司令塔(Opus) / 2026-07-08
- 3段構えワークフロー(会議4体→Fable設計→実装引き継ぎ)の手順2産物・**前回正本 [reference_pop_venue_parity_SYNTHESIS.md](reference_pop_venue_parity_SYNTHESIS.md)(v0.1.1111実装済み)の続編**
- 実装ハンドオフ: [HANDOFF-pop-venue-exact-IMPL.md](../HANDOFF-pop-venue-exact-IMPL.md)
- 司令塔の実在裏取り済み(追加分): ①の匿名顔生成=anonymousIdenticonDataUrl(u)【サイズ引数なし=既定64】(popup-entry.js:5055)→byte比較strip成立・広告段yukkuriFaceFor(roomKey・seed≠uid)(popup-entry.js:7691)はbyte比較で自然に保護・buildPersonTileEl(venueBar.js:180)/restoreLaneMirrorBuckets(:162)は会場import済み・jsonBlobはlaneMirror丸ごと相乗り(status-entry.js:238)・鏡匿名セル~3.2KB/件

---

# 設計書 v2: POPの内容が会場に「1つの抜けも余りもなく」載る(厳密完全一致+ロビー隔離+鏡スリム化)

作成: claude-fable-5 / 2026-07-08 / 対象: feat/venue-lane-mirror-parity(d271c236)
位置づけ: **reference_pop_venue_parity_SYNTHESIS.md(v0.1.1111 実装済み)の続編**。前回の P/T/X 3層・venueLaneMirrorSupply.js・venueLaneParity.js・venueBar 配線・計器は全部生かす。変える所は「T/X層の行き先」「✅の定義」「鏡に何を運ぶか」の3点だけで、すべて差分で示す。
実在確認済みの改修点(本文引用は実読): venueLaneMirrorSupply.js:107 composeVenueLaneBuckets(尾は現在 :150-160 で段末尾へ push)・venueLaneParity.js:83 buildVenueLaneParity(:164-177 で尾を「説明済み」扱い)・venueBar.js:1949(venueLaneEls.stack の挿入点)/:3978-4044(段割当と paint)/:4046(席装飾ループ)/:4180 composeVenueBaseRows/:4714(onChanged 直採用)・laneMirror.js:37 toMirrorCell(displaySrc をそのまま保存・空なら**セルごと落とす**)/:105 restoreLaneMirrorBuckets・app/live-view.js:282-329 paintLaneMirror(restoreLaneMirrorBuckets 経由)・anonymousIdenticon.js:133(uid,size→同一SVG の純関数・seed は uid のみ)。

---

## 0. 一致の「定義」v2(前回§0の改訂・ここだけ読めば全部決まる)

前回の3層は**居場所の定義**に変わる。分類は同じ、置き場所が変わる:

| 層 | v1(v0.1.1111) | **v2(本設計)** |
|---|---|---|
| P層(鏡の5段) | 段に描く | 段に描く(不変) |
| T層(①のcap外) | 段の**末尾に継ぎ足す** | **ロビー(段の外の別セクション)へ隔離** |
| X層(鏡未在籍の直近発言者) | 段の末尾(60秒窓) | **ロビーへ(60秒窓の意味は不変=鏡に載ったら段へ卒業)** |

これで **「5つの段 = 鏡 = ①の実paint」が集合・順序・件数まで厳密同一**になり、ユーザーが①と会場を並べたとき5段は1人の抜けも余りもなく同じ。「会場では全員見られる」約束(storyUserLaneGuideHtml.js:81・venue-all-faces-500)は**ロビーが受け皿**になって真のまま(L15)。

**rows(席プール)は1人も外さない**(L13)。ロビー行きは「bucketsの行き先」の変更のみ=吹き出し(venueSpeech.js の seatByKey)・群衆Canvas・「ほかN人」カウント・座席安定は無傷。

---

## A. 理想の体験フロー(受け入れ基準)

1. **並べて見れば厳密に同じ**: ①POPの5段(link/gift/ad/konta/tanu)と会場の5段が、**同じ顔ぶれ・同じ順序・同じ件数**。実測ケース(lv350914835)なら会場も link2 gift0 ad5 konta0 tanu198 — 尾14も暫定1も段には居ない。
2. **段の下に「ロビー」**: ①の表示枠に入りきらない人+いましゃべったばかりの人が、点線で区切られた薄めのエリアに座っている。バナーで理由が読める(誤認防止・§B-3)。会場全体では今までどおり全員が見える。
3. **しゃべった人は即ロビーに座って吹き出す**(1秒以内・従来のライブ感不変)。3〜10秒後、①のレーンに現れた瞬間、次のpaintで段へ移る。アニメはなし(§B-3の判断)。
4. **機械が言い切る**: 状態速報1行が
   `会場一致 ✅鏡(4s前) link2 gift0 ad5 konta0 tanu198 / ロビー14(暫定1) / 未説明0`
   ✅は「5段が鏡と完全等値(件数・順序・集合)」のときだけ。段に鏡外が1人でも居れば🔴。
5. **③WEBも軽くなる**: 鏡から匿名data URL(~3.2KB/セル)が消え、KEY_LANE_MIRROR ~160KB→~25KB、jsonBlob 100%→~73%(prune発動が止まり③タイムライン切詰めが解消=L16)。①③会場の顔は1ピクセルも変わらない(可逆変換・§C-3)。

---

## B. 統合アーキテクチャ(C案の具体形)

```
①POP popup-entry.js ──publishLaneMirror──▶ KEY_LANE_MIRROR(既存キー・変更は中身のスリム化のみ)
                                              │ セル: displaySrc==identicon(uid)なら ''+uid で運ぶ(§C-3)
                                              ▼
              restoreLaneMirrorBuckets(laneMirror.js:105)★読み手共通の復元点
              「displaySrc空 ∧ uid有り → anonymousIdenticonDataUrl(uid,64) 再生成」を【ここ1箇所】に足す
               ├─▶ ③ app/live-view.js(既にこれを呼ぶ=改修不要で追随)
               └─▶ 会場 venueBar.js(同上)
                     │
              composeVenueLaneBuckets(supply lib)…v2で返り値が { buckets, lobby } に
               ├ buckets = 鏡5段のみ(厳密P層)──▶ paintStoryUserLaneDomFilled(共有lib・不触=L14)
               └ lobby   = 尾+暫定 ──▶ 【新】paintVenueLobby(venueBar側で完結・buildPersonTileEl直)
                     │
              buildVenueLaneParity v2(厳密判定+lobbyフィールド)──▶ venueSeatsDiag(既存キー)──▶ 状態速報
```

**B-1. 供給は不変**: composeVenueBaseRows・onChanged 直採用・catch-up・rAF集約は1行も変えない。rows は今までどおり鏡rows+尾rows の全員(L13)。

**B-2. ロビーの実体**: venueBar.js 内で完結する新セクション(共有描画libに第6段を足さない=L14)。タイルは既存 buildPersonTileEl+既存 seatNodes の席ラップ(renderSeats の wrapTileEl と同じ node.seat.replaceChildren(tileEl))をそのまま使う=吹き出し・座席座標系が無傷(L2同型)。

**B-3. ロビーのUX(必答論点2)**:
- **位置**: venueLaneEls.stack の直後(venueBar.js:1949 の appendChild の次)。たぬ姉段の真下=「段からあふれた続き」と視線で読める。
- **視覚差**: コンテナに `border-top: 2px dashed` + 背景をわずかに暗く + タイルに `filter: saturate(.85) opacity(.92)`。**タイル部品そのものと席装飾(順位バッジ等)は同じ**=「別コンテンツ」でなく「同じ人が待っている」と読ませる(批判役の穴aへの回答)。CSSは venueBar.js の既存styleブロックに `.nlsb-lobby` として追記。
- **バナー(やさしい日本語・たぬ姉口調)**:
  `たぬ姉: ここは ロビー だよ。①の画面(いま 200人まで)に 入りきらなかった人と、たったいま しゃべった人が ここで待ってるよ。①の画面に のったら、上の段へ うつるからね。`
  ラベル行に `ロビー(立ち見) N人` を動的表示。fallbackモード(鏡なし)ではロビーごと hidden(段に全員=従来表示)。
- **移動アニメ: なし(MVP判断)**。コンテナをまたぐ FLIP は「消す側」の再導入=ちらつき7版(story-userlane-churn)の轍。ロビーが段の直下なので連続性は視線で追える。要望が出たら「段に新規入場したタイルへ1.2秒のハイライトclass付与」だけを venueBar 側 post-paint で足せる(共有lib不触)と申し送る。
- **churnガード**: paintVenueLobby は sig=(ロビーkey列+暫定フラグ)で diff-skip。60秒窓で暫定→尾に変わる時だけ1回再描画。

---

## C. 具体機構(差分・ファイル/関数粒度)

### C-1. venueLaneMirrorSupply.js — composeVenueLaneBuckets の返り値変更

```js
// v2: 尾/暫定を段末尾に push しない。lobby として返す。
composeVenueLaneBuckets({ mirrorBuckets, fallbackBuckets, seatIndexByUid, transientKeys })
→ { buckets: { link, gift, ad, konta, tanu },   // 鏡セル由来の行のみ(現実装のまま)
    lobby: LobbyItem[] }                          // 現在の尾 rows.push を lobby.push に変える
```
- LobbyItem = 現在の尾item と同一({...fallbackItem, _venueTail:true, _venueTransient:bool})。順序 = fallbackBuckets の段順(link→gift→ad→konta→tanu)×既存comparator順=決定的。
- 匿名identicon の再生成はここでは**しない**(mirrorBuckets が restoreLaneMirrorBuckets 済みで来るため=§C-3)。
- 呼び出し元は venueBar.js と単体テストのみ=返り値変更の影響範囲は2箇所。

### C-2. venueLaneParity.js — 厳密判定への締め(必答論点1・5)

buildVenueLaneParity の差分:
1. **入力に `lobby: string[]`(ロビーのkey列)を追加**。
2. **段内の鏡外は全部🔴**: 現在の「capOverflowPossible なら tail=説明済み」分岐を mirror モードでは**削除**し、`pop に居ない drawn` は transient含め全て `unexplained`(サンプル `${tier}:余${k}`)。**厳密✅の判定式**:
   `mode==='mirror' ∧ 鏡fresh(≤180s・同一liveId) ∧ 全段 drawn.length===pop.length ∧ 全段prefixOk ∧ unexplained===0 ∧ !mirrorPruned ∧ lobbyInMirror===0`
3. **lobby の突合**: `lobbyInMirror = |lobby ∩ popKeys|`(compose のdedupe起因で構造上0のはずだが、0でなければ「同一人物が段とロビーに二重=余り」なので unexplained へ・嘘の緑防止)。`lobbyTransient = |lobby ∩ transientKeys|`。
4. **出力の後方互換**: perTier のフィールド名は不変。mirror モードの tail/transient は「段内に居る鏡外」=期待値0(>0なら必ず unexplained>0 で🔴)。fallback モードは現行どおり(尾扱い・⚪)=意味が壊れない。**トップレベルに `lobby: { total, transient, inMirror }` を追加**し、toVenueLaneParityDiag にも lobby 数を足す。
5. **line v2**: `会場一致 ✅鏡(4s前) link2 gift0 ad5 konta0 tanu198 / ロビー14(暫定1) / 未説明0`。段の `+尾n` 表記は mirror モードでは消える(段に尾が居ないから)。fallback は従来表記。

### C-3. 鏡スリム化(laneMirror.js・可逆変換・必答論点3)

**書き手(toMirrorCell)**:
```js
// displaySrc が「その uid の identicon と byte一致」する時だけ '' に落とす(可逆の証明付き)
const uid = String(it.entry?.userId || '').trim();
if (uid && displaySrc === anonymousIdenticonDataUrl(uid, 64)) displaySrc = '';
// ★現在の「!displaySrc → return null(セル削除)」は「uid も無い時のみ削除」に変える
```
- 比較一致のときだけ落とすので、**uid≠seed の data URL(広告段の yukkuriFaceFor(roomKey)由来・popup-entry.js:7691)は絶対に落とさない**=顔が変わる事故が構造的に不可能。anonymousIdenticon.js は純関数(seed=uid のみ・v702から不変)なので laneMirror.js から直接 import してよい(葉lib同士・循環なし)。コスト=publish毎に匿名セル数ぶんのSVG文字列生成(200×~3KB・3秒毎)は文字列連結のみで無視できる。
- **司令塔注(実装時の急所)**: ①の実生成は `anonymousIdenticonDataUrl(u)`(引数なし=既定64・popup-entry.js:5055)。比較は既定サイズと完全一致が前提=**「①経路の実displaySrcとstrip比較が一致する」fixtureテスト必須**。
- **版刻印**: buildLaneMirrorSnapshot の出力に `avatarGen: 2` を追加(既存キー内・数十B・L11)。判定ゲートには使わず、状態速報で「鏡v2」と見えるだけの診断用。

**読み手(restoreLaneMirrorBuckets)— ここ1箇所が③と会場の共通復元点**:
```js
// displaySrc が空で userId が有る → anonymousIdenticonDataUrl(userId, 64) を再生成
const displaySrc = String(cell.displaySrc || '') ||
  (String(cell.userId || '').trim() ? anonymousIdenticonDataUrl(String(cell.userId).trim(), 64) : '');
```
- ③(app/live-view.js)も会場(venueBar.js)もこの関数を既に呼んでいる=**呼び出し側の変更ゼロで両読み手が対応**。①のタイル描画・getCachedAnonymousIdenticonDataUrl は不触(L12)。

**版ずれ挙動表(全4組合せ)**:

| 鏡 \ 読み手 | 旧restore(再生成なし) | 新restore(再生成あり) |
|---|---|---|
| **旧鏡**(data URL入り) | 現状どおり | displaySrc非空→再生成パス不発=**byte同一出力**(退行ゼロ) |
| **新鏡**(''+uid) | 匿名がグレー顔に**劣化**(空白/崩れではない) | identicon再生成=**①と同じ顔** |

読み手と書き手は同一リポだが、**③本番のデプロイと拡張リロードは独立**。危険な組合せは左下(新鏡×旧③)だけ→§Eの2段デプロイ順で潰す。会場の読み手と①の書き手は同一拡張バージョンで原子的に切り替わるため会場側に版ずれは存在しない。

### C-4. venueBar.js の差分(3箇所+新関数1)

1. **DOM**: `lobbyHost`(div.nlsb-lobby=バナー+ラベル+list)を `seatsHost.appendChild(venueLaneEls.stack)` の直後に append。CSSは既存styleブロックへ。
2. **renderSeats**: `const { buckets: laneBuckets, lobby: lobbyItems } = lanePaintSnap ? composeVenueLaneBuckets({...}) : { buckets: fallbackLaneBuckets, lobby: [] }`。`emptyMessage.hidden = (visibleLaneItems.length + lobbyItems.length) > 0`(L19)。paint後に `paintVenueLobby(lobbyItems)`(sig-guard付き・buildPersonTileEl+席ラップ)。**席装飾ループは `[...visibleLaneItems, ...lobbyItems]` を回す**(忘れるとロビー席が空白=L17)。
3. **parity呼び出し**: `lobby: lobbyItems.map(venueLaneParityKey)` を追加で渡す。
4. **wiring test**: 既存 venueLaneParity.wiring.test.js に `paintVenueLobby(` と `lobby:` 受け渡しの存在assertを追加(配線忘れ=CI赤)。

### C-5. Phase C(200→500)の受け口(前回§C-5を継承)

laneDisplayLimit.js に `STORY_USER_LANE_MAX_TOTAL=200` を新設し popup-entry.js:6566(limit)と :7260(鏡cap)が同一定数をimport(v1051-1052の轍=L4を構造的に殺す)。スリム化後の cap500 鏡は概算 60〜130KB=512KB自衛内の見込みだが、**実配信実測が通過条件**(§E)。

---

## D. 偽陽性潰し(嘘の緑/嘘の赤なし)

**嘘の緑の防止(v1の全条件ANDに3条件追加)**:
1. 段別件数の**完全等値**(`drawn.length===pop.length`)— prefix一致だけだと「鏡+余り1人」が緑になる穴を塞ぐ。
2. `lobbyInMirror===0` — 段とロビーの二重在籍(=余り)を🔴に。
3. mirrorPruned(512KB自衛の cap半減)時は従来どおり ⚪「鏡縮退」— スリム化後は発動自体がほぼ消えるが判定は残す。
4. TOCTOU排除は v1 のまま(lanePaintSnap 固定)。✅でもロビー数は必ず1行に併記=「説明済みでも隠さない」原則継続。

**嘘の赤の防止**:
1. ロビーは判定対象の「段」ではない=尾14+暫定1が居ても✅(v1で🔴要因ではなかったがユーザー体感で「不一致」だった問題を、置き場所ごと解消)。
2. **版ずれ時の判定**: 新鏡×旧読み手の劣化(グレー顔)は**メンバー集合には影響しない**(uid列は同一)ので parity は緑のまま=顔の劣化を一致判定が誤検知しない。顔の異常は状態速報の `avatarGen` 刻印で切り分け。
3. fallback モードは常に⚪+段は従来表示(全員)=①一致を主張しない。①パネル閉鎖→180s後に⚪へ自動降格・再開で復帰(v1実装済みの挙動を変えない)。
4. X層60秒窓は不変。鏡に載った人の `venueTransientFirstSeen` 卒業処理も不変。

---

## E. MVP と Phase 分割(機械的完了判定つき)

**順序は A→B1→B2→C。A が最優先**(ユーザーの根本欲求「厳密同一」が会場内で完結・版ずれゼロで即達成)。B は独立価値(jsonBlob 100%の実害止血=L16)があり A と入れ替え可能だが、A が1患部(venue)で済むのに対し B は2段デプロイを跨ぐため A 先行が安全。

| Phase | 内容 | 機械的完了判定 |
|---|---|---|
| **A ロビー隔離(MVP)** | supply の返り値変更+parity厳密化+venueBar(DOM/paint/装飾ループ/wiring)。1 patch | `npm run verify:cc` 全緑・supply/parity 単体テスト(尾がbucketsに混入しない/lobbyInMirror検知/厳密✅式)緑。実配信で token が `✅ … / ロビーN(暫定M) / 未説明0` かつ**全段件数=鏡と等値**。reality-checker: ロビー人物の吹き出し表示・鏡出現→段への移動・fallback降格/復帰・①との並べ見比べスクショで5段同一 |
| **B-1 読み手先行** | restoreLaneMirrorBuckets に再生成フォールバック(+avatarGen許容)。1 patch。**Webデプロイ**+拡張反映 | 単体テスト: 旧鏡入力→byte同一出力(退行ゼロ)/''+uid→identicon再生成が anonymousIdenticonDataUrl(uid,64) と一致。**本番③の配信ビルドに B-1 が入っていることを確認してから B-2 に進む**(これが2段デプロイの関所) |
| **B-2 書き手スリム化** | toMirrorCell の比較strip+「uid無しの空だけ削除」+avatarGen:2。1 patch | 単体テスト: strip→restore の往復がbyte同一(可逆性)/広告段data URLは不変。実配信: KEY_LANE_MIRROR 実測 ≤40KB・jsonBlob ≤87%(prune止まる)・①③会場で同一uidの顔が同一(reality-checker目視)・状態速報に鏡v2 |
| **C 200→500** | laneDisplayLimit.js 定数集約→1箇所で500へ | (i)cap500鏡の実測JSON≤256KB (ii)jsonBlob≤87%維持 (iii)mirrorPruned不発 (iv)①③会場の3面token緑。3条件実測が通るまで着手禁止 |

storage 増分: 全Phase通して**書き込みキー増ゼロ**。A は venueSeatsDiag に+数十B(lobbyフィールド)、B は**マイナス~130KB**。

---

## F. 捨てた案と理由

1. **A案(「会場で全員」の約束破棄=会場も200で切る)** — venue-all-faces-500 のユーザー確定方針とフッター文言(storyUserLaneGuideHtml.js:81)の両方に違反。却下(会議全会一致)。
2. **B案(①を即500に上げて一致)** — jsonBlob 実測100%・prune発動中に容量を積む方向は不可。スリム化(B)と容量ゲート(C)の後なら可能=Phase C に隔離。
3. **D案(段末尾に置いたまま表示トグルで隠す)** — 一致定義が二重化し✅が「どっちのモードの✅?」になる。嘘の緑の温床。
4. **共有描画lib(paintStoryUserLaneDomFilled)に第6段「ロビー」を追加** — L14/L2の轍。①③にはロビー概念が無いので共有libに入れると3画面で意味が割れる。venueBar側の別セクションで完結。
5. **鏡から匿名を無条件strip(uid有りなら全data URL落とし)** — 広告段の yukkuriFaceFor(roomKey) 由来 data URL(seed≠uid)を落とすと読み手が別の顔を再生成=①と顔が変わる。**byte比較一致のときだけ落とす可逆版**を採用。
6. **avatarGen を判定ゲートに使う(版不一致なら描画拒否)** — 旧③が新鏡を拒否したら空白=劣化(グレー顔)より悪い。刻印は診断表示のみ、挙動は displaySrc の中身で決める(自己記述的)。
7. **ロビー→段の移動アニメ(FLIP)** — コンテナ跨ぎの transform 追跡は「消す/動かす側」の計器なし変更=ちらつき7版の再演リスク。MVPは無アニメ、ハイライトclassだけ将来オプション。
8. **storage 新キー(KEY_LANE_LOBBY等)・WebSocket・npm化・CDNロールバック** — 会議段階で司令塔が棄却済み(制約違反/過剰)。ロビーは compose の返り値と venueBar ローカルで完結し、永続化する状態が存在しない。
9. **③WEBにもロビーを出す** — ③は「①の丸写し」が規約(R-1系)。①に無いものを③に足すと丸写しdrift検知の思想に反する。③は鏡=①のみでよい。

---

## G. 地雷と回避策(L11-L19)

- **L11(版ずれ)**: §C-3の2段デプロイ+4組合せ表。読み手変更(B-1)は「旧鏡入力でbyte同一出力」のテストで退行ゼロを証明してから出す。B-2 の関所=本番③にB-1が載っている実確認。会場は書き手と同一拡張なので原子的=版ずれ非存在。
- **L12(①の見た目不変)**: 触るのは laneMirror.js の運搬形式のみ。popup-entry.js の displaySrc 決定・タイル描画・①のフッターは1行も変えない。
- **L13(rowsから外さない)**: composeVenueBaseRows は不変=尾も暫定も rows/席に居る。変わるのは buckets の行き先だけ。吹き出しはロビー席の上に出る(seatByKey は席DOMの位置に依存し、その席はロビーコンテナ内に実在)。
- **L14(共有libに第6段禁止)**: paintVenueLobby は venueBar 内関数。buildPersonTileEl と seatNodes ラップの再利用のみ。
- **L15(フッター約束)**: 「ほか M人は会場モードで全員見られます」は真のまま(ロビー=会場内)。ロビーのバナーが「なぜ段に居ないか+いつ段に移るか」を先回りで説明(§B-3の文言)。
- **L16(jsonBlob 100%は独立の実害)**: Phase B は A と独立に出荷可能。prune はしごの commentTimelineMirror 切詰めが止まるのが実測ゲート(≤87%)。
- **L17(席装飾ループの取り残し)**: venueBar.js の席装飾ループを lane+lobby の合成列に変えないと、ロビー席が empty リセット後に復活せず**白円空白の再演**(venue-thumb-missing と同型)になる。wiring test と reality-checker の目視項目に明記。
- **L18(ロビーのchurn)**: ロビーは「毎paint作り直し」にせず sig(key列+暫定フラグ)diff-skip 必須。「消す側」(fallback降格でロビーを畳む経路)にも計器(venueLobbyResetCount)を1個付ける(story-userlane-churn の鉄則)。
- **L19(emptyMessage の条件)**: 段0人+ロビーN人のとき「まだ参加者がいません」を出さない(visibleLaneItems+lobbyItems の合算で判定)。
- **L4系(limitと鏡capの同期)**: Phase C は laneDisplayLimit.js の単一定数化を先行させ、数値変更が構造的に1箇所になってから上げる。

**実装役への申し送り**: 着手は Phase A の supply 返り値変更からTDD(fixture=実測ケース: 鏡205人+尾14+暫定1 → buckets205/lobby15/✅、二重在籍を仕込んだら🔴)。venueBar の差し替えは §C-4 の3箇所+新関数1に閉じる。各Phase 1変更=1 patch bump・`npm run verify:cc`・reality-checker(実機: 並べ見比べ/吹き出し/段への卒業/fallback降格復帰)を出荷ゲートに。反映3手順(pull→拡張リロード→watchタブF5)+B-1のみ Webデプロイ確認が先、を push 報告のたびに併記すること。
