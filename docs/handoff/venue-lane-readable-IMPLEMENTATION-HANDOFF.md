# 実装ハンドオフ — 応援レーン「匿名332人・段内LOD」

> **この1枚だけで着手できる粒度で書いてある。**
> 仕様: [venue-lane-readable-SPEC.md](venue-lane-readable-SPEC.md) / 地図: [venue-lane-readable-MAP.md](venue-lane-readable-MAP.md)
> 前提バージョン: v0.1.1375(匿名をたぬ姉段に出す変更が入った直後) / ブランチ `feat/sidepanel-first-layout`

---

## 0. これは何を直すのか(1段落)

v0.1.1375 で匿名がたぬ姉段に出るようになり、**332人が等価な密度で並んで「ごちゃごちゃして見にくい」**。
ユーザーは「**全員居ること自体は望ましい**」と明言しているので、**人数を減らす解は禁止**。
代わりに「**手前は読める / 奥は群れとして見せる**」遠近法を**CSSだけ**で入れる。

---

## 1. スコープ(MVP = Phase 1 だけ)

- ✅ たぬ姉段の25人目以降の**匿名タイル**をアイコンのみ表示にする(CSS 5箇所)
- ❌ JS は触らない / DOM構造は触らない / 候補生成・ソート・bucket は触らない
- ❌ Phase 2(ガイド帯の人数表示)・Phase 3(3層化)は**やらない**(効果を測ってから)

---

## 2. 着手手順

```bash
git checkout -b feat/lane-density-lod
```

### Phase 0(必須・実装前に測る)

**測らずに直さない**([[instrument-spiral-25-versions-2026-08-06]] / 今日の教訓)。

1. 出荷ビルドを実ブラウザに拡張として実ロードし、たぬ姉段が多い配信で
   `document.getElementById('sceneStoryUserLaneTanu').offsetHeight` を記録する
   ★手順は [[drive-a-real-browser-on-the-shipped-build-2026-08-10]]
2. 同時に `[data-thumb="1"]` の混在数を数える(後列にpillが点在するかの確認)
3. **この2つの数字をコミットメッセージに残す**(T1の合格判定に使う)

### Phase 1(MVP)

CSS を**5箇所すべて**に足す。**1箇所でも漏れると画面ごとに見た目が食い違う**。

| # | ファイル | 備考 |
|---|---|---|
| 1 | `extension/popup.html` | ①サイドパネル(本丸) |
| 2 | `extension/status.html` | 状態速報 |
| 3 | `app/live-view.html` | ④純Web |
| 4 | `tsuioku-no-kirameki/index.html` | LP |
| 5 | `src/extension/venueBar.js` | ③会場(CSS文字列で持っている) |

★**①と③でセレクタの形が違う**(司令塔が裏取り済み):
- ①: タイルは lane の直接子 → `#sceneStoryUserLaneTanu > .nl-story-userlane-cell:nth-child(n+25)[data-thumb="0"]`
- ③: `wrapTileEl` でラップされる([renderStoryUserLaneDom.js:402](../../src/extension/story/renderStoryUserLaneDom.js))
  → `.nlsb-venue-lane-stack ... > :nth-child(n+25) .nl-story-userlane-cell[data-thumb="0"]`

規則の中身は SPEC §2 の表のとおり(avatar 22px / meta を display:none / padding 0 / gap 4px)。

---

## 3. 機械的な完了判定

`npm run verify:cc` が緑になったうえで、**SPEC §5 の T1〜T6 を満たすこと**。

| # | 判定 | どう確かめるか |
|---|---|---|
| T1 | 段の高さ ≤700px | Phase 0 と**同じ配信・同じ幅**で再測 |
| T2 | タイル総数が不変 | `countStoryUserLaneDomTiles` が修正前後で同数 |
| T3 | repaint 回数が不変 | 速報の「段別 再描画回数」の `たぬ姉` を修正前と比較 |
| T4 | パリティ緑 | 既存 `venueLaneParity` 系テスト。**新規パリティ検査は書かない** |
| T5 | CSS配線 5箇所 | 新規 wiring テストで**件数を断言**(`toBe(5)`) |
| T6 | 層の実効 | 実ブラウザで 24人目=`flex` / 25人目=`none` |

---

## 4. ★地雷(今日実際に踏んだものを含む)

| # | 地雷 | 回避 |
|---|---|---|
| 1 | **変異が CRLF で空振り**する | 置換後に「適用できたか」を必ず assert([[mutation-must-verify-it-applied-2026-08-06]]) |
| 2 | **dist は日本語が `\uXXXX`** | 検査は **src / HTML 側**を対象にする。dist を grep しない |
| 3 | `popup-entry.js` は **max-lines 上限 22119 に張り付き** | JS を触らない本MVPなら無関係。触るなら行数に注意 |
| 4 | **wiring テストは書いた直後に変異で赤を確認** | 1ファイルからセレクタを消して赤になるか([[wiring-test-mutation-check-2026-08-01]]) |
| 5 | **検査を整形に依存させない** | regex の窓を広めに取る。今日、コメント追加で検査が壊れた実例あり |
| 6 | `personTileDom.js` は**凍結正本** | 触らない。層の判定は CSS の `:nth-child` でやる |
| 7 | **push だけでは Chrome に届かない** | pull → 拡張リロード → watch タブ F5。★`git pull` と `copy:ext` は**AIが実行する**([[never-make-user-run-commands-i-can-run]]) |

---

## 5. 実装前にユーザーへ確認すること(SPEC §7)

1. **N=24(最前列の人数)でよいか**(薄く12 / 厚く36 も可能・CSSの1定数)
2. **後列22pxで identicon の柄が区別できるか**(実機目視・機械判定不能)
3. **gap 4px化が③会場にも波及する**が美観として許容か

★1〜3は**Phase 1 を出してから実機で見て決める**のが早い(数値はCSS定数なので調整が安い)。

---

## 6. 次のチャットへの引き継ぎ方

> `docs/handoff/venue-lane-readable-IMPLEMENTATION-HANDOFF.md` を読んで、
> Phase 0(測定)→Phase 1(CSS 5箇所)の順で実装して。JS と DOM 構造は触らないこと。
