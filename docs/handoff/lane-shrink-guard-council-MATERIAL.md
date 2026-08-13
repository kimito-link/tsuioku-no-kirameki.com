# 会議材料 — 応援レーンのタイル5枚減(fail-open 7件目?) 2026-08-13

> 司令塔(Claude)が実コードで裏取りした材料。**実装はまだしていない。**
> ★前提: 黒画面は前日決着済み([[sidepanel-black-resolved-2026-08-13]])。これは次の症状。
> ★私は前回「再現できた=実機がそうだ」と読み違えて外した。**今回は先に裏取りを済ませてある。**

---

## 0. ★会議に最初に答えてほしい問い(ここが分岐点)

**この「5枚減」は本当に直すべき症状か? それとも計器の数え方の問題か?**

実機速報の同じ報告の中に、**矛盾する2つの数字**がある:

```
(A) レーンの人数 🔴 ★減った1回(最大94→89枚=5枚減・直前の供給元heavy_refresh)
    ★タイルが減った直前の供給元: heavy_refresh(確定) 94枚→89枚
    ⚠ 縮小しているのにガードが素通り(provisional=false)=タイルが消える直接原因

(B) レーンの人物: 消えた人 0人 ✅ / 来た人 累計89人(今89人)
    laneRosterDelta: everSeenMax=89 / everSeenNow=89 / droppedTotal=0
    storyUserLaneRenderProbe: domTilesPainted=89 / mirrorCells=94
```

★**名簿(roster)は「89人見た・89人いる・0人消えた」と言っている。**
　実DOMも89枚。ユーザーの実機スクショでも「いま 97 件を表示中」と正常に見えている。

★**94 は `mirrorCells`(鏡のセル数)であって、DOM のタイル数ではない可能性がある。**
　つまり「94→89 に減った」は**別々の計器の値を引き算しただけ**かもしれない。
　＝[[check-what-the-number-counts-2026-08-09]] を計器自身が踏んでいる疑い。

**もし(B)が正なら、直すべきは「レーン」ではなく「計器の数え方」である。**
逆に(A)が正なら、5枚は本当に消えている(ただしユーザーには見えていない=軽微)。

会議はまずここを判定してほしい。**私はどちらとも断定していない。**

---

## 1. 実コードで確定していること(裏取り済み)

### (a) ガードは1行目で素通りしている(事実)

`src/extension/story/renderStoryUserLaneDom.js:222`
```js
export function shouldKeepStoryUserLaneTilesOnShrink(els, currentLiveId, lastTiledLid, nextTileCount, entriesProvisional) {
  if (entriesProvisional !== true) return false;   // ★ここで即 return
```
実機は `provisional=0(false)` なので **1行目で必ず false**＝縮小を許可する。

### (b) それは【意図的な設計】である(事実)

同ファイルのコメント:
> ★settled(provisional=false)な正当減少(配信中の contamination フィルタ等)は必ず描く=false を返す。

`lightSupplyOverwriteGuard.js` の fail-safe 節にも明記:
> - 確定供給(provisional=false)は常に通す=heavy が settle したら必ず反映される。

＝**「永久 stale にしない」ための保険**。単純に塞ぐとこの設計を壊す。

### (c) 供給側の申告は正しい(事実)

`popup-entry.js:16510`
```js
syncStorySourceEntries(lv, displayEntries, laneFeedPick.entries, {
  provisional: laneFeedPick.provisional === true || !watchPopupHeavyCommentsSettled,
  origin: LANE_SUPPLY_ORIGIN.HEAVY
});
```
実機は `heavySettleState: "settled"` / `heavyEverSettled: true` なので
**provisional=false は申告として正しい**(heavy は本当に settle している)。
＝v0.1.1249 の fail-closed 化(無指定=暫定)の穴でもない。

### (d) 非常口も既にある(事実)

`laneShrinkKeepExpired` が同一配信で keep 10分継続したら縮小を許可する
(`STORY_USER_LANE_SHRINK_KEEP_MAX_MS = 10分`)。永久 stale の担保は二重にある。

---

## 2. 実機の値(2026-08-13 09:38・lv351164433)

```
storyUserLaneRenderProbe:
  activePath: "heavy" / started:21 / completed:21
  heavyEverSettled: true / heavySettleState: "settled"
  domTilesPainted: 89 / entriesLen: 481 / mirrorCells: 94
  shrinkDetectedCount: 1 / shrinkKeepCount: 0
  lastPaintSkipReason: "provisional-false"
  provisionalFalseCount: 1 / provisionalTrueCount: 0
  heavyRacePaintedFromCache: 20 / heavyRaceReturns: 8
  heavyReuseLastReason: "coverage"
  laneTileOscillation:
    drops:1 / worstDrop:5 / worstDropFrom:94 / worstDropTo:89
    maxTiles:89 / minTiles:89   ← ★max も min も 89(94 が入っていない!)
    samples:1 / reversals:0

laneRosterDelta:
  everSeenMax:89 / everSeenNow:89 / droppedTotal:0 / maxDroppedAtOnce:0

laneSupplyOrigin:
  heavy_refresh: { provFalse:20, provTrue:0, defaulted:0 }
  shrinkCulprit: { prevTiles:94, nextTiles:89, provisional:0, origin:"heavy_refresh" }

lightSupplyGuard: 18回見送り / worst:{ next:30, roster:89 }  ← 別ガードは正常に効いている
```

★注目: `laneTileOscillation` の **maxTiles:89 / minTiles:89 なのに worstDropFrom:94**。
　系列に94が入っていないのに「94から減った」と言っている＝
　**2つの計器が別の母数を見ている**強い傍証。

## 3. ★ユーザーへの実害(これも判断材料)

ユーザーの実機スクショ(同時刻)では応援レーンは**正常に見えている**:
- たぬ姉段に匿名アイコンがびっしり(「いま 97 件を表示中」)
- 会場参加者97人 / 記録している応援コメント540件

＝**この5枚減でユーザーが困っている様子は無い**。
★[[instrument-value-is-measured-by-fixes-2026-08-12]] の判定基準に照らすと、
　「読んでも直せない/直す必要が無い」なら**この🔴表示自体が誤誘導=価値が負**かもしれない。

## 4. 過去の経緯(同じ場所を何度も触っている・退化させたくない)

| 版 | 何をしたか |
|---|---|
| v0.1.1233 | 縮小ガードの契約変更(60%未満→1枚でも減ったら見送る) + 非常口(10分) |
| v0.1.1249 | fail-closed 化: `provisional` 無指定=暫定へ反転(申告漏れ対策) |
| v0.1.1251 | 軽い供給の上書き防止を **DOM枚数→名簿基準**へ(lightSupplyOverwriteGuard) |
| v0.1.1370 | fail-open 4件目(live-switch): 「空=切替」を分離 |
| v0.1.1380 | fail-open 5件目(roster-unestablished): 58→17枚を根治 |

★ちらつき7版(v1037-1042)の diff-skip 機構は**触らない**(確定事項)。

## 4.5 ★★会議中に司令塔が自分の見立てを潰した(必読・§0 の答えは出た)

**私の「計器のバグ説」は誤りだった。** 実コードで確定:

### (a) 94 は実DOMのタイル数である(mirrorCells ではない)

`popup-entry.js:7062`
```js
noteLaneSupplyShrink(_laneSupplyOriginDiag,
  { prevTiles: countStoryUserLaneDomTiles(els), nextTiles: nextTileCount, guardHit: _shrinkGuardHit });
```
`prevTiles` は **`countStoryUserLaneDomTiles(els)`＝実DOMの実数**。
＝**94枚は本当にDOMに存在していた**。89へ減ったのは**本物**。

### (b) maxTiles:89 と worstDropFrom:94 が食い違う理由も判明(矛盾ではない)

`laneTileOscillation` の履歴に積まれる値は `popup-entry.js:7060`:
```js
{ tiles: _shrinkGuardHit ? countStoryUserLaneDomTiles(els) : nextTileCount, ... }
```
ガードが**素通りした今回**は `nextTileCount`(=89) が積まれる。
＝**94 は履歴に入らない**ので maxTiles は89のまま。両者は別の入口の値であり、
どちらも正しい。★そして `summarizeLaneTileOscillation` は
**「履歴と食い違ったら実DOM を採る」**(v0.1.1357・同ファイル73行)と明記している
＝94→89 は**権威ある値**。

### (c) よって §0 の答えは (A) = 実際に5枚消えている

★私は「maxTiles に94が無い」を根拠に計器のバグを疑ったが、
　**それは記録の入口が違うだけ**だった。
　[[check-what-the-number-counts-2026-08-09]] を**私自身が逆向きに踏んだ**
　(数え方の違いを見て「計器が壊れている」と誤診断した)。

### (d) ただし「名簿は0人消失」との整合は**未解決**

`laneRosterDelta: everSeenMax=89 / everSeenNow=89 / droppedTotal=0`
DOMは94→89で5枚減ったのに、名簿は「消えた人0」と言っている。
★**名簿が消失を検知できない構造なのか**、それとも
　**94枚のうち5枚が「名簿に載らない種類のタイル」だったのか**は**未確認**。
　(候補: ギフト段/広告段は名簿(ユーザー段)に載らない可能性)
　会議はここを実コードで詰めてほしい。**ここが直し方を決める。**

## 4.6 ★★矛盾は解けた(反証役の指摘 + 司令塔の裏取り・実コードで確定)

### (a) 名簿が「消えた人0」と言う理由 = **見る器官が無い**(3つの盲点・すべて実コードで確認)

| # | 盲点 | 実コード |
|---|---|---|
| 1 | **gift/ad 段を数えない** | `noteLaneRoster(...picks: picked)` は **6975行**。`buckets.gift`/`buckets.ad` の代入は **6981/6986行=後**。縮小判定の母数は `picked + gift + ad`(7046行) |
| 2 | **匿名(userId無し)を数えない** | `laneUserIdSet`(laneRosterDelta.js:50) `if (uid) out.add(uid);` ＝**uid が無い候補は集合に入らない** |
| 3 | **paint前に計測** | 6975行は描画判断(7046-7064行)の**87行手前**。どこで return しても名簿は「候補」を記録済み |

★`droppedTotal=0` は「消えていない」ではなく **「消えたものを見ていない」**。
　[[zero-count-may-mean-unmeasured-2026-08-04]] の型。**私はこの沈黙を否定と読み違えた。**

### (b) ★消えた5枚は gift/ad ではない(実機の段別内訳で確定)

反証役は「消えた5枚が課金者(gift/ad)かもしれない=最も重い」と警告したが、
**この配信に限れば否定できる**:

```
応援レーン: りんく3 / こん太0 / たぬ姉91 / ギフト0 / 広告1  計95
ギフト: 0pt / state=no_program_gift   ← ギフト段は0枚
北極星 広告: apiRows=1 / 鏡1          ← 広告段は1枚
```
gift+ad = **最大1枚**。5枚減の主因にはなりえない。
＝消えたのは **たぬ姉段(ユーザー段)** とほぼ確定。

### (c) しかし たぬ姉段は【匿名だらけ】＝盲点2 が効く

実機: `identityAcquisition: anonymous=86 / identifiable=3 / total=89`
＝たぬ姉段91枚のほとんどが**匿名(userId無し)**。
→ **名簿は最初から数えていない**ので、5枚消えても `droppedTotal=0` のまま。
★**矛盾は完全に解けた**: DOM 94→89 は本物 / 名簿0人も嘘ではない(見ていないだけ)。

### (d) ★結論: 5枚は実際に消えており、しかも【誰が消えたか永久に分からない】

この配信は匿名主体なので、**現状の名簿では原理的に追跡できない**。
＝反証役の「5枚が誰かを見えるようにするのが先」は**正しい**。
ただし優先度の根拠は「課金者かもしれない」ではなく
**「匿名参加者が消えても誰も気づけない構造」**である(会議はここを踏まえて判断すること)。

## 5. 出してほしいもの

1. **§0 の判定**: (A)実際に5枚消えている / (B)計器の数え方の問題 / (C)どちらとも言えない
   → 根拠は**実コード**で。`mirrorCells` と `domTilesPainted` と
     `laneTileOscillation` が**それぞれ何を数えているか**を読んで答えること
2. (B)なら: **計器のどこを直すか**(症状ではなく計器を直す版になる)
3. (A)なら: **意図的な保険(確定供給は必ず通す)を壊さずに塞ぐ方法**
   ＝「永久stale」と「5枚消失」のどちらを選ぶかではなく、両立する設計を出す
4. **やらない理由があるなら、それを最優先で**
   (ユーザーに実害が無いなら「触らない」も正当な結論。9版重ねた直後なので特に)
5. 次の1版に入れる/入れないの線引きと、機械的な合否判定

★**推測で埋めないこと**。確認できないことは「未確認」と明記してください。
★**ラテラルに考えてよい**(前回それで「問題の再定義」が効いた)。
