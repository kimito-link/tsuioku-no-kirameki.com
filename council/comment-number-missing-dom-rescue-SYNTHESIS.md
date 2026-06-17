# `.comment-number` 消失 → DOM観測コメント全捨て の救済 — 設計（SYNTHESIS）

正本。司令塔の実コード裏取り + OneComme(app.asar)答え合わせ。日付 2026-06-17。
関連: [docs/person-tile-architecture.md](../docs/person-tile-architecture.md)「会場に出ない真因 #1」 / [council/person-tile-unify-SYNTHESIS.md](person-tile-unify-SYNTHESIS.md)

## 課題（確定済み）
現行ニコ生は watch ページのコメント行から `.comment-number`(番号セル)を外した(実DOM確証)。
`parseNicoLiveTableRow`(src/lib/nicoliveDom.js:829-831) が `if (!numEl || !textEl) return null;` で
**番号セルが無い行を全捨て** → `commentIngestBySource.visible=0` → userId が DOM 経由で乗らず会場/応援レーンに人が出ない。
同じ番号必須が `closestHarvestableNicoCommentRow`(:909) と `collectNicoLiveTableRows`(:931) にもある(3箇所)。

## OneComme 答え合わせ（決定的な負の結果）
OneComme(`C:\Users\info\AppData\Local\Programs\OneComme`・app.asar→out/main/index.js)を grep:
- `comment-number` / `comment-text` / `table-row` = **0 件**。querySelector もわずか8回。
- → **OneComme は watch ページの DOM を一切パースしない。NDGR(protobuf)を直接読む**(v0.1.803 で確認した parseCommentData 経路)。
- ∴ DOM 緩和そのものは OneComme で直接答え合わせできない（DOM をやっていないから）。

しかし **転用できる原則** は明確（index.js ~offset 300373 の niconico chat 受理ロジック）:
1. **構造で曖昧さを消す（ヒューリスティクスでない）**: `"chat" in t` / `"gift" in t` / `"visited"/"rankingIn"…` と
   protobuf の oneof フィールド名で分岐。system/gift を chat と取り違えない。
2. **受理の門は『番号』でなく『身元』**: chat は `hashedUserId`(匿名・anonymity:true) **または** `rawUserId`(本登録)が
   あれば comment として受理。**どちらも無ければ `emitError("missing rawUserId")` で null（捨てる）**。
3. **`no` は持ち回るが必須にしない**: `no: i.no` を出力に付けるだけ。番号が無い chat も有効なコメント。
4. **匿名は一級市民**: hashedUserId → 名前「匿名」・空アバター・anonymity:true。

→ **学び**: 番号はもともと「コメントである証」ではなく、便利だが今は消えた付随マーカー。
   コメントの本質は『身元 + 本文』。我々の DOM 問題はこの原則をそのまま当てはめればよい。

## DOM での構造マーカー = `data-comment-type`（OneComme の oneof の DOM 版）
実コードで確認: ニコ生の本物のコメント行は `<div class="table-row" data-comment-type="normal|generalSystemMessage|gift|nicoad">`。
**おすすめ生放送カードには `data-comment-type` が無い**(CSS Modules の `program-card-*`)。
既存コードも `[data-comment-type]` を「本物のコメント行」の印として多用(commentHarvest.js:99・content-entry.js:1392 など)。
∴ 番号の代わりに **`data-comment-type` 属性の存在を構造的な受理門に使える**（ヒューリスティクスでなく niconico 供給の構造ラベル）。

## 設計（番号必須を緩める・誤検知ガード必須）

### 受理条件の変更（parseNicoLiveTableRow）
従来: `numEl && textEl`(両方必須)。
新: **textEl 必須(本文は不可侵)** + 番号は **任意**。番号が無い行を救うが、以下の**全ガードを通過した行だけ**:

1. **構造ガード(最重要)**: row が `[data-comment-type]` を持つ（= niconico 供給のコメント行ラベル）。
   持たない `.table-row` は番号無しでは受理しない（おすすめカードの構造誤マッチを構造で排除）。
   ※ 番号がある行は従来どおり（後方互換・data-comment-type 無しでも従来挙動を維持し退化ゼロ）。
2. **既存の section ガードは維持**: `isInsideRecommendedLiveSection` / `isInsideRecommendedUserSection`（撤去しない）。
3. **本文の質ガード**: 本文が空/空白のみは従来どおり null。
4. **persist 前フィルタは不可侵**: `isCommentUiScraperPollutionRow`(isRecommendedLivePollutionRow +
   isRecommendedUserChipPollutionRow) が persist 前の最終防波堤として残る（二重防御）。

### 番号が無いときの出力 commentNo
`commentNo: ''`(空文字)で返す。**理由**: 下流は既に番号無しに対応済み:
- `harvestVirtualCommentList`(commentHarvest.js:255) は `k = no ? \`${no}\\t${text}\` : text` で番号無しを dedup。
- `mergeVirtualHarvestRows`(commentHarvest.js:36) は `commentNo` 欠落を許容。
- `extractCommentsFromNode`(nicoliveDom.js:968) の seen キーは `${commentNo}\t${text}` →
  番号無し同士は text で集約される（要確認: 同一本文の別人を潰さないか）。
  ⚠️ ここは **userId を dedup キーに含める**改善を検討（番号無し時のみ text+userId で分離・別タスク NDGR 側の buildDedupeKey と整合）。

### 3箇所を同じ純関数に正本化（ドリフト防止・星野ロミ式）
番号必須が散らばる3箇所(parseNicoLiveTableRow / closestHarvestableNicoCommentRow / collectNicoLiveTableRows)を
**単一の受理判定 `isHarvestableNicoCommentRow(row)`**(純関数)に寄せる。OneComme の「受理門を1箇所に」に倣う。
- 入力: row 要素。出力: boolean(本物のコメント行として収穫可か)。
- 中身: `.table-row` かつ `.comment-text` あり かつ (`.comment-number` あり OR `[data-comment-type]` あり) かつ
  not recommended-live/user section。
- 3経路はこの1関数を呼ぶだけにする。テストは番号有/番号無+type有/番号無+type無(=拒否)/おすすめ(=拒否)を固定。

## 退化ガード（厳守）
- **番号がある行の挙動は1バイトも変えない**（既存 characterization test 全緑を最優先）。
- 構造ガード(`data-comment-type` 必須・番号無し時)で、おすすめカードの番号無し誤マッチを構造的に排除。
- 既存の section ガード・persist 前 pollution フィルタは撤去しない（多層防御）。
- 記録本体(IndexedDB)不可侵・新規 storage 書き込みゼロ。
- hot path: 受理判定は属性参照 + closest 1回で軽量（既存 COMBINED_SELECTOR の負荷増やさない）。
- verify:cc 全緑・dist content.js 同梱確認。

## 段階導入
- **第1コミット**: `isHarvestableNicoCommentRow` 純関数を新設(+characterization test)。
  まだ呼び出し側は差し替えず**挙動完全不変**（番号必須の現行ロジックと同値の判定を関数化）。
- **第2コミット**: parseNicoLiveTableRow / closestHarvestableNicoCommentRow / collectNicoLiveTableRows を
  この関数に差し替え + 「番号無し + data-comment-type あり」を受理に開放。テストで番号無し行が拾えることを固定。
  実機で visible>0・会場/レーンに番号無しコメント主が並ぶことをユーザー目視。
- **第3コミット(任意)**: 番号無し時の dedup キーに userId を含める（同一本文の別人衝突を防ぐ・要実データ確認）。

## 未確定 / 要検証（実機・実データ）
- 番号無し行が実際に `data-comment-type` を持つか（doc の実DOMでは `data-comment-type="normal"` が付いている例）→ **第2コミット前に実機 DOM で再確証**。
  もし type も消えていたら、構造ガードを `content-area`/`comment-text` の親構造など別の構造特徴へ調整（番号同様、単独で誤検知しない狭い形に限定）。
- extractCommentsFromNode の text-only dedup が番号無し別人を潰さないか（第3で userId 込みキー検討）。
