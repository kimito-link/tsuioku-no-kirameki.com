# 引き継ぎ 2026-08-14 — ★反映先の誤りと「診断が開かない」の再現

> **次のセッションはこの1枚から始める。**
> ブランチ **`feat/lane-density-lod`** / v0.1.1387 / push済
> ★**master に切り替えないこと**(理由は §1。Chrome がリポの extension/ を直接読む)

---

## 0. ★最重要: 今日いちばんの失敗(必ず最初に読む)

**私は7版ぶん、ユーザーに何も届けていなかった。**

```
Chrome が読む場所 : <リポ>/extension/          ← Secure Preferences で確認(Profile 45)
私がコピーしていた : C:\nicolive-ext           ← 誰も見ていない
```

ユーザーの実機はずっと **v0.1.1283 / build 0807-101955**(8月7日)。
その間に出した v1381〜1387 は**1つも反映されていない**。
ユーザーは何度も「なにもかわってない」「診断のエリアがまだ1つしかない」と報告したが、
それは**正しかった**。私の「✅反映OK」が嘘だった。

★照合スクリプト(`npm run verify:deploy`)を作ったのに、**照合先が間違っていたので無意味**だった。
　v0.1.1387 で既定を `extension`(実際の読み込み先)に修正済み。

### ★反映の正しい手順(今後これだけ)

```bash
git branch --show-current          # feat/lane-density-lod であること
npm run build                      # ★リポの extension/dist を直接更新する
npm run verify:deploy              # version + buildId + サイズを照合
```
その後**ユーザーに拡張のリロードだけ依頼**(私の devtools は別インスタンスで届かない)。

★**ブランチを切り替えるとユーザーの拡張の版が変わる**(master に戻すと v0.1.1283 に戻る)。
　作業が終わっても **feat/lane-density-lod のまま置く**こと。

---

## 1. ★いま再現できている症状(次の一手はここから)

ユーザー: 「とりあえずはじめくろい 診断おもくてひらかない」

### 再現条件(chrome-devtools で確定)

| 条件 | 結果 |
|---|---|
| storage 34.8MB / **配信なし** | 診断は **89ms で開く**・イベントループ遅延1ms(健全) |
| storage 34.8MB / **実配信を1つ開く** | ★**診断が180秒経っても開かない**(navigate timeout) |
| 同上でページに script を投げる | ★**Runtime.callFunctionOn timeout**(ページが応答しない) |

＝**「視聴中」が加わった瞬間に詰まる**。storage の量だけでは再現しない。

### 再現手順(そのまま使える)

```
1. mcp__chrome-devtools__install_extension { path: "<リポ>/extension" }
2. status.html を開く                      → この時点では速い
3. evaluate_script で storage を 34.8MB に太らせる
   (コメント24,000件×2配信 + chunk48 + summary/tail)
4. https://live.nicovideo.jp/watch/<実配信> を開く
5. status.html を reload  → ★開かない(180s timeout)
```

### 分かっていないこと(推測で埋めない)

- 詰まっているのが **status 側の read** か、**content(記録エンジン)の write** か未確定
  (ページに script を投げても応答しないので、page 内計測が取れなかった)
- 次は **SW(background) 側**か **content 側**から測る必要がある
  (`mcp__chrome-devtools__evaluate_script` の `serviceWorkerId` 経由 / または
   performance trace `performance_start_trace` で reload 中を丸ごと採る)

★**やってはいけない**: ページ内 evaluate で測ろうとする(応答しないので必ず timeout)。

---

## 2. 今日出した版(すべて push 済・v1381〜1387)

| 版 | 内容 | 状態 |
|---|---|---|
| v1381 | 幕の判定共有 / シェード締切を可視起点へ / 停止計器 | ユーザー未検証(未反映だったため) |
| v1382 | storage全件読みの根治(migration 4本を getKeys 経由へ) | 同上 |
| v1383 | **計器の嘘を除去**(3時間半フリーズの誤報・観測列の無界増殖) | 同上 |
| v1384 | 自動タブリロードの計器(`nls_last_auto_tab_reload`) | 同上 |
| v1385 | **症状別の判定(複数)** `symptomVerdicts.js` | 同上 |
| v1386 | サムネ実在確認の**記録**(`verifiedAvatarRegistry.js`) | 同上 |
| v1387 | 実在確認を**描画判定(thumbScore)に配線** + `verify:deploy` | 同上 |

★**全部「未検証」**。反映されていなかったので、効果はまだ誰も見ていない。
　次のセッションは**まず反映を確認**してから、効いたかを判定すること。

## 3. 黒画面の現状(v1383 時点の実測)

```
中身が見えなかった合計 = 815ms (幕560ms / シェード815ms)
最大タイマー遅延 = 276ms ✅健全
```
12,773ms → 4,277ms → **815ms** まで下がっている(ただし**古いビルドでの計測**)。
ユーザーは「はじめくろい」と言っており、**0.8秒でも黒は見える**。

## 4. ★ユーザーの作業を壊さない(2回やらかした)

- `scripts/meeting.mjs` にユーザーの未コミット変更(**41行**)がある
- 今日**2回**消した(`git checkout --` と `stash pop` のコンフリクト)。両方バックアップから復元
- バックアップ: `/tmp/sv/meeting.mjs.USER`(md5: fab70b243ef1dbc250cf52d335c7a348)
- ★**現在この変更は stash に退避中**(`USER-WIP(Claude退避6回目)`)。
  **master に戻すときは必ず `git stash pop` して md5 を照合する**

## 5. 次にやること(優先順)

1. **反映が届いたか確認**(ユーザーの速報で `build 0814-*` になっているか)
2. **診断が開かない**の真因特定 — §1 の再現手順で、**SW側/trace から**測る
3. 黒画面の残り 815ms(主因=初回シェード)
4. ユーザーの stash を返す

## 6. 今日確立した掟(守ること)

- **計器を足して満足しない**。数えたら直すところまで([[counting-is-not-fixing-2026-08-13]])
- **記録を作ったら同じ版で読み手も配線する**([[unwired-judgement-is-systemic-2026-08-12]])
- **ユーザーに手作業を頼まない**。頼む前に自分の手段が尽きたか考える
- **反映したら buildId を照合する**。version だけでは足りない
- **質問を並べて選ばせない**。疲れているときは特に、決めて進める
