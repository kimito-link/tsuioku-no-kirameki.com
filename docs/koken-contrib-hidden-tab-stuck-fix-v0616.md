# 貢献度ランキング・ギフト履歴が「裏タブだと取れない」間欠固まり 修正 (v0.1.616)

## 1. 症状（2026-06-04 ユーザー実機）

- 北極星「公式値レーン」の **貢献度ランキング** と **ギフト履歴** が「(取得中...)」のまま固まる。
- ただし**間欠的**で「とれることもある」。広告ランキング(nicoad)は取れている。
- 拡張のエラーページには koken の例外は1件も無い（出ていたのは無関係な
  「コメント送信 11.3秒」警告のみ）。

## 2. 実機での真因確定（推測なし）

### 2.1 koken API も SW fetch も健全
ユーザー配信 `lv350673796` の無認証 koken API を Claude-in-Chrome で直接叩いて確認:

```
GET https://api.koken.nicovideo.jp/v1/userperspective/contents/gift/live/lv350673796/ranking?rank=20
→ 200 {"meta":{"status":200},"data":{"rankers":[
     {"rank":1,"supporterName":"ひろ","contribution":30900,...},
     {"rank":2,"supporterName":"名無し","contribution":15000,...}, ...]}}
```

- **API はデータを満額返している**。SW(`extension/background.js`)の fetch 実装も
  `credentials:'omit'`・ヘッダ全省略・8s timeout で nicoad と同型＝健全。
- 貢献度ランキングは既に **無認証 API 直接 fetch** に移行済み（iframe scrape は廃止）。

### 2.2 真因 = 非可視タブでの fetch スキップ
`src/extension/content-entry.js` の koken/nicoad/gift 定期 fetch interval
（`KOKEN_CONTRIB_API_FETCH_MS = 30_000`）に、以下のガードが残っていた:

```js
setInterval(() => {
  if (!recording || !liveId) return;
  if (document.visibilityState === 'hidden') return;  // ★これ
  void runExternalApiFetchesAsTabLeader({ includeEventParticipation: false });
}, 30_000);
```

→ **タブが非可視（別タブ/別ウィンドウにフォーカス）だと、外部 API fetch が丸ごとスキップ**。
→ 可視に戻った瞬間の fetch だけ成功＝「とれたり取れなかったり」の間欠の正体。
→ 彼方さんの配信を見ながら他タブを見ていた時間帯に koken/gift が「取得中」で固まった。

（広告も同じガード下だが、たまたま可視だった瞬間に取れて storage に残っていたため
「取れている」ように見えていた。本質は同じ。）

## 3. 修正（ユーザー選択「未取得時のみ非可視でも叩く」）

非可視タブの一律スキップを、**「未取得のときだけは取りにいく」**に緩和:

- **可視タブ**: 従来どおり常に fetch（不変）。
- **非可視タブ**: koken 貢献度 or ギフト履歴が storage に**未取得**のときだけ、一度
  `runExternalApiFetchesAsTabLeader` を走らせる。**取れたら裏では叩かない**（リソース最小）。
- 判定は純関数 `shouldRunExternalFetchWhileHidden`
  （`src/lib/hiddenTabExternalFetchGate.js`・ユニットテスト付き）に集約。
- 取得状態は `chrome.storage.local.get([kokenContribStorageKey, giftSubAppHistoryStorageKey])`
  で同期確認（軽い get 1回／interval）。応答到着までに liveId が変わっていたら実行しない。

### リスク評価
- **多タブ点滅(retry ストーム)を悪化させない**: fetch は `runIfTabLeader` で
  liveId 単位リーダー1タブに集約済み。N タブあっても fetch は1本。
- **各 `maybeFetch...Once` は 25s min-gap の再入抑止**を内蔵＝連打にならない。
- **可視タブの挙動は完全に不変**（機能後退ゼロ）。

## 4. テスト

- 追加ユニット `src/lib/hiddenTabExternalFetchGate.test.js`（5ケース）:
  可視は常に true / 非可視は未取得が残れば true / 全取得済みなら false /
  空配列は false / 引数欠落・型外の安全側。
- `npm run verify` 全緑（4894 tests・lint・typecheck・build）。

## 5. 変更ファイル
- `src/lib/hiddenTabExternalFetchGate.js`（新規・純関数）
- `src/lib/hiddenTabExternalFetchGate.test.js`（新規・テスト）
- `src/extension/content-entry.js`（interval の非可視ガードを緩和＋import）
- `extension/manifest.json` / `package.json` / `src/lib/changelog.js`（v0.1.616 bump）

## 6. 補足: イベントレーン修正(v0.1.615, PR #218)との関係
別系統。v0.1.615 は「イベント**非参加**配信で event 2レーンが try/catch 無しの IIFE で
固まる」恒久凍結の修正。本件は「貢献度/ギフトが**非可視タブで間欠取得できない**」
取得層の修正。両者は独立。
