# 実装ハンドオフ: 診断計器の強化(Phase 0 + Phase 1 MVP)

> 正本設計書: [`diagnostic-instrument-strengthen-2-DESIGN.md`](diagnostic-instrument-strengthen-2-DESIGN.md)
> このファイル1枚だけで着手できる粒度で書く。実装は別モデル/次チャットが担当。

## スコープ(このハンドオフで着手するのはPhase 0 + Phase 1のみ)

- **Phase 0**: `healthCells.js`の`HEALTH_CELL_IDS`静的マニフェスト + `diagnosisRegistry.test.js`
  契約テスト3種。ランタイム負荷ゼロ。
- **Phase 1 (MVP)**: ①popup DOM census + self-parity(`popLaneSelfParity.js`)。fastDiag full→lite
  passthrough→healthCellsセル→diagnosisRegistry登録まで一気通貫。

Phase 2(幾何指紋)・Phase 3(provenance)は**このハンドオフのスコープ外**。Phase 0+1が実機で
効果確認・master マージされてから、新しいハンドオフとして着手すること(設計書のE節に段階表あり)。

## 読む順

1. [`diagnostic-instrument-strengthen-2-DESIGN.md`](diagnostic-instrument-strengthen-2-DESIGN.md)の
   A(体験フロー)・C1(具体機構)・G(地雷)を読む。
2. `src/lib/venueDomCensus.js`(特に`collectVenueLaneDomCensus`128行・「数えるだけ」の掟コメント)。
3. `src/lib/venueLaneParity.js`(`venueLaneParityKey`45行・Tri-Parity突合の既存パターン)。
4. `src/extension/popup-entry.js`の以下3箇所:
   - `laneAd: $('sceneStoryUserLaneAd')`等(6496行付近)= ①のlaneEls構造
   - `STORY_USER_LANE_STEPS.PAINTED`到達点(6804行)= supplied keysを取るべき正しい位置
   - `publishLaneMirror`(7285行)= published keysの出所
5. `src/lib/statusFastDiagLite.js`(passthroughの現在の実装・新フィールドをどう通すか)
6. `src/lib/healthCells.js`(`pctCell`/`stateCell`パターン・セルidのリテラル散在箇所)
7. `src/lib/diagnosisRegistry.js`(`DIAGNOSIS_REGISTRY`39行・`DIAGNOSIS_CATEGORY_IDS`32行)

## 着手手順(ブランチ+TDD)

### Phase 0(先に単独コミット・即日完了可)

```
git checkout -b feat/diag-registry-contract-test
```

1. `src/lib/healthCells.js`に`HEALTH_CELL_IDS`を追加。既存の`stateCell('xxx', ...)`/
   `pctCell('xxx', ...)`呼び出し全箇所からidを目視収集(grep `stateCell\(|pctCell\(`で洗い出す)。
2. 新規`src/lib/diagnosisRegistry.test.js`をTDDで書く:
   - test1: `HEALTH_CELL_IDS`の各要素が`DIAGNOSIS_REGISTRY`のidに存在する(逆方向も)。
   - test2: `fs.readFileSync(path.join(__dirname, 'healthCells.js'), 'utf8')`して
     正規表現`/(?:pctCell|stateCell)\(\s*['"]([^'"]+)['"]/g`でid抽出→全て`HEALTH_CELL_IDS`に含まれる
     ことを断言(fixtureに依存しない静的スキャンが核心=これがv0.1.1054の教訓への直接の回答)。
   - test3: `DIAGNOSIS_REGISTRY`のid一意性・`category`が`DIAGNOSIS_CATEGORY_IDS`内・`weight>0`。
3. `npm run test:cc` → 3テストとも通ることを確認。既存セルの登録漏れがあれば**このタイミングで
   発覚する**(先に直してからコミット)。
4. `npm run verify:cc` 一発。tree-map/feature-map再生成があれば同コミットに含める。

### Phase 1 MVP(Phase 0マージ後に着手)

```
git checkout -b feat/pop-lane-self-parity
```

1. **TDD**: `src/lib/popLaneSelfParity.js`を新規作成。設計書C1のシグネチャに従う:
   ```js
   export function buildPopLaneSelfParity({ census, suppliedKeys, publishedKeys, nowMs })
   ```
   - `census`: `collectVenueLaneDomCensus`の戻り値(`perSection`から`keys`を使う)。
   - `suppliedKeys`/`publishedKeys`: `Record<'link'|'gift'|'ad'|'konta'|'tanu', string[]>`
   - 段ごとに`supplied`(件数)・`dom`(件数)・`published`(件数)・`domExtra`(dom∖supplied件数)・
     `domMissing`(supplied∖dom件数)を出す。
   - verdict: 全段`domExtra===0 && domMissing===0` → `'✅'`。`census.measured===false`(未計測)
     → `'⚪'`(fail-closed、🔴を出さない=設計書D節の必須ゲート)。それ以外 → `'🔴'`。
   - `extraSample`: domExtraの実キーから先頭5件だけ、`u:`(数値uid)/`c:`(合成キー)のプレフィックス
     に丸めてから返す(生uidをstorageに出さない=G節の地雷5)。
2. `src/lib/popLaneSelfParity.test.js`を先に書く(一致/DOM余/DOM欠/measured:false→⚪の4ケース最低限)。
3. **popup-entry.js配線**(3箇所・すべて既存パターンへの相乗り):
   - lane paint末尾、`STORY_USER_LANE_STEPS.PAINTED`が記録される直後(6804行付近)で
     `collectVenueLaneDomCensus({ laneEls: 既存のlaneEls, stackEl: ... })`を呼ぶ。
   - suppliedKeysは`PAINTED`ステップに実際に渡された配列(paint関数の入口で取らない・G節地雷6)。
   - `publishLaneMirror`(7285行)直前のsnapshotから`venueLaneParityKey`で同様にpublishedKeysを作る。
   - `buildPopLaneSelfParity`を呼び、結果をfastDiag full生成箇所の既存オブジェクトに
     `popLaneSelfParity`フィールドとして追加。
4. `src/lib/statusFastDiagLite.js`のpassthrough対象に`popLaneSelfParity`(verdict+perTier件数のみ、
   extraSampleは含めるかは任意だが200Bを超えないこと)を追加。**このステップを飛ばすと状態速報に
   永久に出ない**(G節地雷1・最重要)。
5. `src/lib/healthCells.js`に`pop-lane-parity`セル(state型)を追加。verdict→'ok'/'na'/'bad'にマップ。
6. `src/lib/diagnosisRegistry.js`に同じidを**Phase 1と同一コミットで**登録(Phase 0のテストが
   これを強制する)。
7. `npm run test:cc && npm run lint && npm run typecheck` → 全緑を確認してから
   `npm run verify:cc`一発。

## 機械的な完了判定

- [ ] `npm run verify:cc`が全緑(test/lint/typecheck/build/tracked-imports/tree-map/site-health/
      feature-map/verify:bump)
- [ ] `diagnosisRegistry.test.js`の3テストが通る(Phase 0)
- [ ] `popLaneSelfParity.test.js`が通る(Phase 1・最低4ケース)
- [ ] `statusFastDiagLite`のwiring断言テストで`popLaneSelfParity`がlite出力に存在することを確認
- [ ] 実機確認: 状態速報に新しい1行(「①レーン一致」等)が表示され、通常時は✅、意図的にDOMを
      壊した場合(devtoolsで手動でタイル追加/削除)に🔴/⚪へ切り替わることを目視確認

## 地雷(設計書G節から再掲・特に重要な3点)

1. lite passthrough忘れ(最重要・過去実績あり)
2. セル追加とレジストリ登録を別コミットにしない(Phase 0が既に防御)
3. suppliedKeysをpaint入口でなくPAINTEDステップ到達後から取る(shrink-kept等のearly-returnで
   偽🔴になるのを防ぐ)

## このハンドオフの前提として裏取り済みの実在ファイル/関数

司令塔がFableの設計案を実コードと突合し、以下を実在確認済み(Fableの原案では関数名が一部略記
`collectVenueDomCensus`だったが、正しくは`collectVenueLaneDomCensus`):

- `src/lib/venueDomCensus.js:128` `collectVenueLaneDomCensus`
- `src/lib/venueLaneParity.js:22` `VENUE_TILE_GEOMETRY_TOLERANCE` / `:45` `venueLaneParityKey`
- `src/extension/popup-entry.js:6496` laneEls構造(`laneAd: $('sceneStoryUserLaneAd')`等)
- `src/extension/popup-entry.js:6804` `STORY_USER_LANE_STEPS.PAINTED`到達点
- `src/extension/popup-entry.js:7285` `publishLaneMirror`
- `src/lib/diagnosisRegistry.js:32` `DIAGNOSIS_CATEGORY_IDS` / `:39` `DIAGNOSIS_REGISTRY`
- `src/lib/healthCells.js` `pctCell`/`stateCell`パターン(id散在の実例多数確認済み)

`HEALTH_CELL_IDS`は現状未実在(Phase 0で新規追加する)。
