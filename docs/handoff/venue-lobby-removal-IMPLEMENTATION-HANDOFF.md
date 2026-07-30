# 実装ハンドオフ — ロビー完全撤去(MVP: Patch 1)

このファイル1枚で着手できる。設計の背景・全4 Patchの全体像・却下案の理由は [venue-lobby-removal-DESIGN.md](venue-lobby-removal-DESIGN.md) 参照(設計=Fable/裏取り=司令塔、2026-07-14)。

## 極めて重要な前提

前回セッションで「ロビーは撤去不可能」と判定し、実装せずにMVP(一致診断のみ)を作ったが、ユーザーから「要件を逆に解釈した誤り」と強い指摘を受けた。今回はその誤りを繰り返さない。**ロビーを実際に画面から消すこと**が目的であり、診断や計器の追加ではない。完了条件は「ロビーという文字列が実行コードに残らないこと」まで含む。

## 今回のスコープ(MVPのみ = Patch 1)

設計書には4つのPatchがあるが、**今回実装するのはPatch 1(ロビー完全撤去)のみ**。Patch 2(limit 200→48)・Patch 3(二重スクロール撤去)・Patch 4(診断軽量化)は後続タスクとして別途着手する。

## TDD順序(この順で進める)

### 1. 先に赤いテストを書く: `src/lib/noLobbyString.test.js`

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// 除外: このテスト自身とchangelog.js(過去の変更履歴=歴史記録なので書き換えない)
const EXCLUDE = new Set(['src/lib/noLobbyString.test.js', 'src/lib/changelog.js']);

function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = path.relative(repoRoot, full).replace(/\\/g, '/');
    if (statSync(full).isDirectory()) { walk(full, out); continue; }
    if (!name.endsWith('.js') || EXCLUDE.has(rel)) continue;
    out.push(full);
  }
  return out;
}

describe('「ロビー」文字列が実行コードに残っていないことの機械保証', () => {
  it('src/ 配下に lobby / ロビー が0件', () => {
    const files = walk(path.join(repoRoot, 'src'), []);
    const hits = [];
    for (const f of files) {
      const content = readFileSync(f, 'utf8');
      if (/lobby|ロビー/i.test(content)) hits.push(path.relative(repoRoot, f));
    }
    expect(hits).toEqual([]);
  });
});
```

このテストが赤(多数のヒット)であることを確認してから、以下の削除作業に着手する。

### 2. `src/lib/venueLaneBuckets.js`

- `bucketVenueLaneSeats(seatEntries, opts)`(L148-168付近): `opts.anonymousToLobby`を削除。`isLobbyBound`を`isAnonymousEntry`に改名し、常に`candidates.filter((it) => !isAnonymousEntry(it))`で段候補を作る(匿名は常に除外・段には出さない)。戻り値から`lobby`配列を削除。
- L139-142・L157-165のロビー関連コメントも削除・書き換え。

### 3. `src/lib/venueLaneMirrorSupply.js`

- `composeVenueLaneBuckets({ mirrorBuckets, fallbackBuckets, fallbackLobby, seatIndexByUid, transientKeys })`: `fallbackLobby`引数と`lobby`配列を削除。戻り値`{ buckets }`のみ。

### 4. `src/extension/venueBar.js`

- L2156-2187付近: `lobbyHost`/`lobbyBanner`/`lobbyFace`/`lobbyBannerText`/`lobbyLabel`/`lobbyList`/`_lobbyPaintSig`/`_venueLobbyResetCount`の構築を丸ごと削除(`seatsHost.appendChild(lobbyHost)`含む)。
- L4102-4157付近: `paintVenueLobby`関数を丸ごと削除。
- L4304-4331付近: `bucketVenueLaneSeats`呼び出しから`anonymousToLobby`行を削除。`composeVenueLaneBuckets`呼び出しから`fallbackLobby`を削除。`const lobbyItems = ...`を削除。
- L4335付近: `emptyMessage.hidden = visibleLaneItems.length > 0;`に単純化(lobbyItemsとの合算判定をやめる)。
- L4372付近: `paintVenueLobby(lobbyItems, ...)`呼び出しを削除。
- L4376付近: 席装飾ループを`for (const item of visibleLaneItems)`に単純化(`...lobbyItems`を外す)。
- CSS L1282-1321・L1776付近: `.nlsb-lobby*`一式(`.nlsb-lobby`/`.nlsb-lobby-banner`/`.nlsb-lobby-face`/`.nlsb-lobby-label`/`.nlsb-lobby-list`等)を削除。

**注意**: 匿名発言者のコメントバブルが lobby 席DOMにアンカーしていた場合、撤去後に`seatByKey` missでnull参照する可能性がある(地雷3)。`seatByKey`経由のバブル配置コードをgrepし、席なし時の既存フォールバック(素通し/非表示)が効くことを確認する。

### 5. 診断3ファイル

- `src/lib/venueLaneParity.js`: `lobby`入力・ロビー突合ブロック・verdict文字列のロビー表記・`lobbyReference`幾何比較を削除。✅条件を「全段件数完全等値∧重複0∧迷子0∧空可視0∧無鍵0」に再定義。
- `src/lib/venueDomCensus.js`: lobbyセクションのcensusを削除。
- `src/lib/venueSeatsDiag.js`: lobbyフィールドを削除。**同じpatchで`statusFastDiagLite`側のpassthroughも削除すること**(既知の地雷: fullから消してliteに残すとundefined印字/wiring断言が赤になる)。

### 6. フッター文言

`src/lib/storyUserLaneGuideHtml.js`の`buildStoryUserLaneGuideFootAndRecordedHtml`: 「ほか M人は会場モードで全員見られます」という文言を、ロビー撤去後も嘘にならない表現(例: 「いま N件を表示中(ほか M人・直近アクティブ順)」)に変更する。`storyUserLaneGuideHtml.test.js`も更新。

### 7. 既存テストの更新

以下のテストファイルのlobby関連ケースを削除、または「lobbyが存在しないこと」の断言に書き換える:
- `venueLaneParity.test.js`
- `venueDomCensus.test.js`
- `venueLaneBuckets.test.js`
- `venueLaneMirrorSupply.test.js`
- `completenessScore.test.js`
- `venueBarPopupOcclusion.wiring.test.js`
- `venueLaneParity.wiring.test.js`(lobby断言の削除のみ。移設・occlusion関連の断言は触らない)

### 8. `noLobbyString.test.js`が緑になることを確認

## 完了条件

1. `npm run verify:cc`が緑
2. `noLobbyString.test.js`が緑(src/配下に`lobby`/`ロビー`が0件・除外はchangelog.jsのみ)
3. 既存テスト(手順7で列挙したファイル)が全部緑
4. version bump 3点セット同期(AGENTS.md §12.5)
5. changelogに新エントリを追加: 「ロビーを廃止しました。会場は応援レーンと完全に同じ顔ぶれだけを表示します」
6. **実機確認**: 会場モードを開いて、ロビー(立ち見エリア)が画面に表示されないことを確認する。匿名ユーザーがどこにも表示されないことも確認する。これは自動化不可(ユーザー手動)なので、⏳実機待ちとして1行残し、司令塔は別領域の作業に進んでよい。

## 地雷(設計書G節から再掲・最低限)

- 匿名発言者のコメントバブルがlobby席DOMにアンカーしていた場合のnull参照(地雷3・手順4で対応)。
- `fastDiagLite`へのpassthrough削除漏れ(地雷4・手順5で対応)。
- `emptyMessage`判定でlobbyItems参照を消し忘れるとReferenceErrorで会場全体が死ぬ(地雷5)。lintのno-undefが捕捉するはずだが、`npm run verify:cc`を必ず通すこと。
- host/iframe誤爆: diffをロビー関連箇所(L2156-2187/L4102-4157/L4304-4380/CSS)に限定し、移設ガード(`shouldSkipInlineHostMoveForVenue`)・occlusionコードには一切触れない。
- 検証エージェント並走中はcommitしない(detached HEAD事故の既知地雷)。

## このハンドオフの後にすること(今回はやらない)

- Patch 2(limit 200→48+鏡cap追随)
- Patch 3(INLINE二重スクロール撤去・popup.html:928-935のCSS削除)
- Patch 4(診断ページのlazy details化)
- 白化の実修正(W-2)は、Patch 3後にscrollWhiteoutProbeで再実測してから着手する

## 実装は誰が

`src/lib/`内の複数ファイル横断のリファクタ+`venueBar.js`への削除+テスト更新という規模。次チャットで`cursor-impl`(複数ファイル横断の局所実装)に委譲するか、司令塔本体で直接実装してもよい。委譲する場合は`council/_TEMPLATE-impl-prompt.md`を使い、この「TDD順序」節をそのまま「やること」欄に転記する形で引き渡すこと。**ユーザーの完了条件(ロビー文字列ゼロ)を却下・軽視しないこと**を引き渡しプロンプトに明記すること。
