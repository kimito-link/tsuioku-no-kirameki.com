# 会議材料 — 「拡張リロードのたびに手作業が要る」を無くす 2026-08-13

> ★これは**バグ報告ではなくユーザー体験の課題**。ユーザーの実際の言葉:
>   「なんか動作させるために毎回ここを読み込みして繰り返すことが多いなんとかならない？」
>   「サービスワーカーが無効になっている状態を戻したりする作業が大変」
> ★司令塔が「拡張リロード→watch F5」を**今日だけで4回**依頼している。これが常態化している。

---

## 0. 症状(実測で再現済み)

司令塔が chrome-devtools で watch タブを直接測った結果:

```
extensionContextAlive: false   ← 拡張と話せない(chrome.runtime.id が null)
runtimeId: null
panelPresent: true             ← ★パネルのDOMは画面に残っている
```

**パネルは見えているのに中身が死んでいる。**
ユーザーが見る `Service Worker（無効）` の正体はこれ(SWが寝ているのとは別問題)。

★ユーザーは毎回これを手作業で戻している:
`chrome://extensions` を開く → 🔄 を押す → watch タブへ戻る → F5

## 1. ★既に自動化の仕組みは在る(が効いていない)

`extension/background.js:1008`
```js
if (details?.reason === 'update') {
  await reloadExistingWatchTabs();   // ← タブを自動リロードする
} else {
  await injectIntoExistingTabs();
}
```

そして **Chrome 公式の挙動**(裏取り済み・下記出典):
> **unpacked 拡張のリロードは update として扱われ、`onInstalled` は `reason:"update"` で発火する**

＝**`reloadExistingWatchTabs()` は呼ばれているはず**。`MATCH_PATTERNS` も
`https://*.nicovideo.jp/*` を含み、ユーザーの watch タブにマッチする。
`chrome.tabs.reload` に必要な `tabs` 権限も manifest に在る。

★**コードは正しく見えるのに、症状が出ている。ここが謎。**

## 2. 会議に解いてほしい問い

### Q1(最重要). なぜ自動リロードが効かないのか

仮説候補(★どれも未検証・推測で埋めないこと):
- (a) `onInstalled` の非同期IIFE内で、`reloadExistingWatchTabs` の**手前で await が詰まって到達していない**
  (`migrateFloatingPanelToDockProfileOnce` / `sweepOrphanAutopatrolTabsOnce` 等が先に走る)
  ★[[unbounded-await-at-boot-makes-page-blank-2026-08-12]] と同じ型ではないか
- (b) SW が onInstalled 完了前に停止し、途中で切れている
- (c) `chrome.tabs.reload` は成功しているが、**リロード後の content script が再び orphan になる**
  (＝1回のリロードでは回復しない=ユーザーが「繰り返す」と言っている実態かもしれない)
- (d) そもそも今日の症状は司令塔が **install_extension で入れ直した**ことが原因で、
  ユーザーの手動リロードとは経路が違う(＝実は自動リロードは効いていて、別の何かが問題)

★**(d) は司令塔の測定が症状を作っていた可能性**なので、最初に潰すこと。

### Q2. ユーザーの手作業をゼロにする設計

「自動リロードを直す」以外の道も出すこと(ラテラルに):
- **orphan を検知したら content 側が自力で回復する**(location.reload() を自分で呼ぶ)
  ★ただし配信視聴中の勝手なリロードは**視聴を中断する**=許容できるか要検討
- **パネルに「復帰」ボタンを出す**(F5より1手少ない・押す場所が目の前)
- **orphan のまま動ける範囲で動かす**(記録だけは継続する等)
- そもそも**開発フローを変える**(手動リロードが要らない仕組み)

### Q3. 「繰り返す」の正体

ユーザーは「繰り返すことが多い」と言っている。**1回で直らない**のかもしれない。
コードから、1回のリロードで回復しない経路があるか読み解くこと。

## 3. 制約(壊してはいけないもの)

- **配信視聴中に勝手にタブをリロードしない**(記録が飛ぶ/視聴が止まる)
  ★ただし orphan 状態では**そもそも記録できていない**ので、天秤の判断が要る
- `sweepOrphanAutopatrolTabsOnce`(孤児裏タブ掃除)の意図を壊さない
- MV3 の SW は**待機中に止まるのが正常**。「止まらないようにする」は誤った目標
  (keepalive の常時稼働はバッテリー/CPUを食う=過去に「重い」と叱られた経緯がある)

## 4. 出してほしいもの

1. **Q1 の答え**(実コードで。確認できないなら「未確認」と明記)
2. Q2 の設計案を複数(**手作業ゼロ**が理想。ただし視聴中断とのトレードオフを明示)
3. 推奨1本と、その理由
4. 次の1版に入れる/入れないの線引き
5. 機械的な合否判定(★「ユーザーが手で直す回数が0になったか」で測れる形に)
6. ★**やらない理由があるならそれを最優先で**

★[[never-make-user-run-commands-i-can-run]]: ユーザーにやらせている作業は、
　原則として**AIか拡張自身がやるべき**。これはその原則の延長線上の課題。

## 出典(Q1の前提)
- Chrome for Developers / chromium-extensions グループ:
  unpacked のリロードは update 扱いで onInstalled が reason:"update" で発火。
  ただし content script は orphan 化する既知の問題があり、明示的な対処が要る。
