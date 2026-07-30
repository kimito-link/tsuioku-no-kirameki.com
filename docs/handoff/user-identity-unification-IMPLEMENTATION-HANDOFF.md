# 実装ハンドオフ: ユーザー識別情報解決の一元化(MVP)

> 正本設計: [`user-identity-unification-DESIGN.md`](user-identity-unification-DESIGN.md)
> 日付: 2026-07-17。3段構えワークフロー手順3の産物。実装はこのファイルを読めば着手できる粒度。

## 背景(1行)

①popup/会場/広告列で「ユーザーID→表示名→サムネURL→リンク」の解決ロジックが画面ごとに
バラバラに実装されており、会場サムネ白丸バグ・りんく列出没ちらつきバグを繰り返し生んでいる。
設計書のFableが裏取りで発見: UID→サムネURL計算式が**実際に7箇所**に重複実装されている。

## MVP スコープ(今回はこれだけ)

設計書の**§E MVP**通り、**[C2] broadcasterUidTracker**のみを実装する。理由:

- 3実例のうち唯一の**未修正・ユーザー可視バグ**(りんく列出没)を根治する
- `inferBroadcasterUserIdFromComments`を**wrapper化**(既存関数の出力は不変)するだけなので
  既存テストを1本も壊さない
- popup-entryの大改修(STORY_SOURCE_STATE)に踏み込まない

**今回やらないこと**(設計書には書かれているが次フェーズ): [C1]識別プリミティブ正本への
7実装の委譲統合、[C3]resolveUserIdentity関所の新設、[C4]CI構造ガードテスト。これらは
MVPが実機で効果を確認できてから着手する。

## 着手手順

### 1. ブランチを切る

```bash
git checkout -b feat/broadcaster-uid-tracker
```

### 2. TDD: `src/lib/broadcasterUidTracker.js` + `.test.js` を新規作成

設計書の「D. broadcasterUid揺れの安定化」セクションの型定義・遷移規則5つをそのまま実装する。

```js
/**
 * @typedef {{
 *   uid: string,
 *   confidence: 0|1|2,
 *   source: 'none'|'inferred'|'pageUrl'|'explicit',
 *   liveId: string,
 *   heldSinceMs: number,
 *   diag: { emptyStreak: number, conflictCount: number }
 * }} BroadcasterUidState
 */
export function createBroadcasterUidTracker(nowFn = Date.now) { /* ... */ }
```

**遷移規則5つ(設計書§D参照、これ以上増やさない)**:
1. liveId変化で全リセット
2. explicit/pageUrl(conf=2)は無条件採用(格上は常に勝つ)
3. inferred一意(conf=1): 保持がconf=2なら無視。保持が空なら採用。保持と同uidなら維持。
   保持と異なるuidなら**先勝ち**で保持維持+`diag.conflictCount++`
4. inferred空(候補0件or2件以上): **保持を維持**(sticky の核心)+`diag.emptyStreak++`
5. 降格なし(confは上がるだけ、liveId変更以外でuidは消えない)

**テストケース(境界値、設計書のE節に列挙済み)**:
- 揺れ1→0で保持維持
- 揺れ1→2候補で保持維持
- liveId切替で即時リセット
- conf=2出現で保持を上書き(矯正)
- conf=1で異なるuidが来ても先勝ちで保持維持

### 3. `src/lib/inferBroadcasterUserIdFromComments.js`にdetailed版を加法追加

既存の`inferBroadcasterUserIdFromComments`は**wrapperに変える**(出力は完全に不変、既存
`.test.js`はそのまま緑になるはず=変更後にテスト実行して確認):

```js
/** @returns {{ uid: string, source: 'explicit'|'pageUrl'|'inferred'|'none', candidateCount: number }} */
export function inferBroadcasterUserIdDetailed(entries, snapshot) {
  // 既存ロジックを分岐印付きで書き直す(explicit/pageUrl/inferred/noneのどれで確定したか返す)
}
export function inferBroadcasterUserIdFromComments(entries, snapshot) {
  return inferBroadcasterUserIdDetailed(entries, snapshot).uid;
}
```

### 4. `src/extension/popup-entry.js` の6箇所を置換(必ず全部同時)

呼び出し箇所(grep実測済み・行番号は多少ズレている可能性があるので着手前に再grepすること):
`inferBroadcasterUserIdFromComments(`で検索。

- 6034行目
- 6586行目
- 7562行目
- 7777行目
- 13123行目
- 16123行目

モジュールスコープに`const broadcasterUidTracker = createBroadcasterUidTracker();`を1個追加し、
6箇所すべてを`broadcasterUidTracker.update({ liveId, entries, snapshot }).uid`に置換する。

**地雷(設計書§Gより再掲・最重要)**: 6箇所の**部分置換は禁止**。ガードだけstickyにして鏡publishは
生値のまま、という状態になると①と会場の判定が割れる(パリティ嘘の再発)。必ず一括で置換し、
置換直後に`npm run test:cc`で既存のlane関連テストが壊れていないか確認する。

### 5. 状態速報への診断追加(任意だが推奨)

`bcTrack:{uid,conf,src,empty,conflict}`のような診断値を状態速報に追加する場合、
**statusFastDiagLiteのpassthroughを忘れないこと**(`fastdiag-lite-is-the-printer-subset`の
教訓・liteに通さないと永久にコピペに出ない)。

## 機械的な完了判定

- [ ] `broadcasterUidTracker.js`のテストが遷移規則5つの境界値を全てカバーし緑
- [ ] `inferBroadcasterUserIdFromComments`の既存テストが無変更で緑のまま
- [ ] popup-entry.jsの6箇所が**全て**`broadcasterUidTracker.update().uid`経由になっている
      (grepで`inferBroadcasterUserIdFromComments(`の直接呼び出しがpopup-entry.js内に
      残っていないことを確認)
- [ ] `npm run verify:cc`全緑
- [ ] 新規ファイル追加のためtree-map/feature-map再生成をコミットに含める
- [ ] 実機確認: チャンネル放送(または配信者コメントが少ない配信)で、りんく列の記名ユーザーが
      出没しなくなっていることを確認

## 地雷(設計書§Gより実装時に特に注意すべきもの再掲)

- popup-entryに**ほぼ同一のループが2本ある**(6621行目付近と7595行目付近)。broadcasterUidの
  使用箇所を直すときは両方を確認すること。片方だけ直すと「直ったのに再発」報告になる。
- displayEntriesのメモ化キャッシュキーに`broadcasterUid`が含まれている場合、tracker導入で
  invalidation頻度が変わる可能性がある。置換前に該当キャッシュの比較キー構成を確認すること。
- popup再オープンでtrackerはリセットされる(in-memory、意図的・storage永続化はしない)。
  初回paintは現行と同じ未確定挙動になるが、これは退行ではない。
- 新規lib追加時は`npm run verify:cc`一本(test+lint+typecheck+build+tree-map/feature-map:check+
  verify:bump)で確認し、個別コマンドのpiecemeal実行に頼らない。
- 検証エージェント実行中はcommitしない(detached HEAD不完全コミット事故の実績あり)。

## 次フェーズ(MVP完了後、このハンドオフのスコープ外)

設計書の[C1](7実装の委譲統合)・[C3](resolveUserIdentity関所)・[C4](CI構造ガード)は、
MVPの実機効果確認後に別途着手する。特に[C4]のガードテストは、7実装の再増殖を機械的に防ぐ
ために重要度が高いので、MVP完了後なるべく早く着手することを推奨する。
