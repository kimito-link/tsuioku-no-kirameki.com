# 統合(司令塔・実コード裏取り済み): 「他配信タブの名残DOMが混乱を起こす」の根治

> COUNCIL stale-dom-bundle(2026-06-20)。会議=code 分類・4召集(deepseek-r1批判 / qwen2.5-coder実装 / nvidia qwen3.5発散 / groq速い視点)・4/4成功。
> 元ログ=council/stale-dom-bundle-log.txt / 生回答=council/stale-dom-bundle-answers.json / お題=council/stale-dom-bundle-question.txt
> 会議は素材。司令塔が Explore エージェント+実コードで裏取りして1案に収束。

## 結論(1案)

**不満の本体は「実害」でなく「診断が嘘をついて不安にさせている」こと。根治=嘘を消す。**

具体的には2点を直す(どちらも記録・表示・storage書込みに一切触れない・診断テキスト/閾値のみ):

1. **`statusActionAdvisor.js:194` の cause テキストの事実誤認を訂正**(最重要)。
   現状「記録には影響しないが**公式値レーンが混乱することがある**」=実コード上起きない嘘。
   → 「記録にも表示にも影響しません。今見ている配信のデータだけを使うため、過去タブの履歴が残っていても
   表示は混ざりません」に書き換え。severity は info のまま、action も「気になるなら閉じる」程度に弱める。

2. **`diagWarnings.js:deriveStaleDomBundleSuspected` の閾値 `>30` を LRU上限と切り離す**。
   現状 LRU上限(DEFAULT_MAX_KEEP=30)と警告閾値(>30)が**同値で結合**=prune が正常に上限30で keep した直後に
   新しい lv が1件来ただけで31→誤警告。閾値を「異常膨張」に振り直す(例 >60)+「現在lvが eventDom に無い」
   ケースのみ別途警告(本当に怪しい=自分の配信の痕跡が消えている時)。

## 根拠

- **会議4/4全員一致**: 不満の本体は (B) 不穏な警告テキスト。表示混乱の経路は実コード上存在しない。
- **司令塔の実コード裏取り(Explore + grep)で確定**:
  - 各watchタブは自 liveId の bundle だけ使用(content-entry.js:1997 lv切替で lastOfficialEventDomBundle=null
    強制初期化 / northStarLaneReason.js は単数bundleのみ受領 / 複数lv誤選択コードは無い)。
  - prune は既にある(pruneStaleEventDomLvs.js・TTL6h・LRU30)。発生源(autopatrol per-live書込み)は v0.1.801 で
    既に断ち済み。31は prune 周期(8秒coalesce)前の一時スパイク。
  - **実機で観測された公式値レーンの不調(iframe_unrendered/event_present_unscrapable/fetch_error)は
    stale DOM と無関係**(northStarLaneReason.js:13,22=cross-origin iframe Vue mount不全・NDGR unscrapable)。
    ∴ advice card の「公式値レーンが混乱」は二重に誤り(経路が無い+実際の不調は別原因)。

## 反論・リスク(司令塔が会議の各案を採点)

- 案M(メッセージ差別化)=会議全員推し。**採用**。ただし会議は「snapshotは31件だが実害なし」程度の
  汎用文言止まり。司令塔は**advice card の嘘 cause を具体訂正**まで踏み込む(会議は statusActionAdvisor.js の
  存在を知らなかった=実コード裏取りの上乗せ)。
- 案T(閾値緩和)=単独では「本質を隠すだけ」と批判役が指摘。**条件付き採用**=LRU上限との偶発結合を解く意味では
  正しい修正(隠蔽でなく誤検知の除去)。ただし「現在lvが無い時の警告」は残す(本当の異常検知として有用)。
- 案P(storage.onChanged で即prune)=**却下**。批判役・nvidia とも「onChanged 高頻度発火→共有storage stall 誘発→
  既存の『静かに諦めスロット解放』方針を壊す」と一致。hot path/storage を重くする過剰実装。星野ロミ式の罠。
- 案R(背景巡回タブの書込み抑制)=**今回は見送り**。筋は良い(書込み元を絞る)が、実コードで「背景巡回タブが
  eventDom を書く経路」を未確定(persist 元が watch 限定か要追加調査)。発生源は v0.1.801 で既に断ち済みと
  prune コメントにあり、31は一時スパイク=書込み抑制まで作るのは現時点 over-engineering。**将来 eventDomLvCount が
  恒常的に膨らむ実データが出たら案Rを実コード裏取りの上で再検討**(別タスク)。
- **やってはいけない過剰実装(会議一致)**: ①多タブ協調(リーダー選出でeventDom集約) ②storage書込み増 ③prune同期化で
  hot path重く ④閾値を消して無界蓄積を放置(prune があるので不要だが、警告だけ消して prune を弱めるのは禁)。

## 具体案(置き場所まで)

### 修正1: advice card の cause/action 訂正(src/lib/statusActionAdvisor.js:189-197)
```js
if (gift?.multiTabDiag?.staleDomBundleSuspected) {
  add({
    id: 'stale-dom',
    severity: 'info',
    symptom: '過去に開いた配信の履歴が残っています',
    cause: '記録にも表示にも影響しません。今見ている配信のデータだけを使うので、過去タブの履歴が残っていても表示は混ざりません(古い履歴は数時間で自動で消えます)',
    action: '気になる場合だけ、使っていないニコ生タブを閉じてください(閉じなくても問題ありません)',
    fixableHere: 'partly'
  });
}
```
- characterization test(statusActionAdvisor.test.js があれば)に「stale時の cause が『混乱』でなく『影響しません』を含む」を1本。

### 修正2: 警告閾値を LRU上限から切り離す(src/lib/diagWarnings.js:120-133)
```js
export function deriveStaleDomBundleSuspected(multiTabDiag) {
  if (!multiTabDiag || typeof multiTabDiag !== 'object') return false;
  if (!multiTabDiag.hasSnapshot) return false;
  const eventCount = typeof multiTabDiag.eventDomLvCount === 'number' ? multiTabDiag.eventDomLvCount | 0 : 0;
  // 本当に怪しいのは「自分が今見ている配信の痕跡が eventDom に無い」とき(=別タブの世界を見ている疑い)。
  if (multiTabDiag.currentLiveIdInEventDom === false) return true;
  // 単なる件数は LRU上限(30)直後の +1 で誤検知する。異常膨張のみ警告(prune が効かない水準)。
  if (eventCount > 60) return true;
  if (multiTabDiag.currentLiveIdInNicoad === false && eventCount > 10) return true;
  return false;
}
```
- diagWarnings.test.js に「eventDomLvCount=31 では warning が立たない(LRU上限直後の誤検知を防ぐ)」「61で立つ」
  「currentLiveIdInEventDom=false なら件数に関係なく立つ」を追加。
- 30→60 の根拠: LRU上限30の倍=prune が複数周期サボった異常時のみ。星野ロミ式「誤検知=失敗体験を除去」。

## バージョン/反映
- 1変更=patch1つ(v0.1.834予定・verify:bump 同期)。純ロジック2ファイル+テストのみ=記録/表示/storage 不変。
- build:watch は停止済(確認済)。実装後 verify:cc。
- 反映: pull→拡張リロード→status F5。「他の配信のDOMが混ざっている疑い」カードが出なくなる(or 文言が安心系に)。
