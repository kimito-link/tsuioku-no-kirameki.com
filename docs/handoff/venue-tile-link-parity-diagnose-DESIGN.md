# 設計書 — 会場タイルのリンク欠落: 診断先行アプローチ(実害確定計器)

- 設計: Fable(claude-fable-5サブエージェント) / 裏取り・統合: 司令塔(Claude Code) / 素材: 会議ハーネス(5モデル)
- 日付: 2026-07-14
- 位置づけ: `/council-fable` 3段構え(会議ハーネス→Fable設計→実装引き継ぎ)の手順2の産物
- **重要**: 前身の[[diagnostic-architecture-strengthen-design-2026-07-14]]のPatch①(桁レンジ統一解除)は**誤った前提に基づく設計だったため撤回**。本設計書がPatch①の正しい後継。

## 経緯(訂正の記録)

前回、会場タイルのリンク欠落の真因を「isNumericNicoUserId(^\d{5,14}$)とnicoUserPageUrl(^\d{1,18}$)の桁レンジのズレ」と特定したが、実装直前の再調査で誤りと判明。既存のcharacterization test(personTileDom.test.js)自体がこの桁数制限を意図的な仕様として固定しており、popup/venue両方で既に統一済みだった。ニコニコの実際のID桁数分布(概ね2〜10桁)ではこの境界問題はほぼ発生しない。

再調査の結果、真の構造は「タイル実体(`<a>`/`<span>`)は鏡由来uid、席の見た目クラス`nlsb-seat-link`はroster由来uidという**二重ソース**」であることが判明したが、実害の頻度は不明。

## 設計方針: 診断先行(diagnose-first)

会議が「実害の証拠がないまま構造修正するのはリスクが高い」と収束。特にgpt-oss-120bが「席クラス判定を鏡uidへ単純統一すると、rosterが唯一の正確な情報源であるケースで逆に新しいリンク欠落を作る」と指摘し、単純修正案を却下した。**今回のゴールは「直す」ことではなく「実害の有無・頻度を計測する診断計器を作ること」**。

## 不変条件(INV)

- INV-1(uid一致): タイル実体を決めた鏡uidと、席クラスを決めたroster uidが同一
- INV-2(リンク可否の一致): 席クラスnlsb-seat-linkのON/OFFと、タイル実体が`<a>`か`<span>`かが一致(ユーザーが見た症状の直接観測)
- INV-3(href鮮度): タイルが`<a>`のとき、hrefが指すuidが今回paintの鏡uidと同一(diff-skip残骸の検出)

## 具体機構(詳細はFable回答参照・実装時に再取得)

**新規lib**: `src/lib/venueSeatLinkParity.js`(venueDomCensus.jsと同じ「数えるだけ」規律の純関数)。累積カウンタ(paints/checked/uidMismatch/affordanceMismatch/hrefStale)+直近不一致サンプル1件を保持。

**配線**: `venueBar.js`の席装飾ループ(4228〜4268行)内、`nlsb-seat-link`のtoggle直後に観測を追加。判定に使う`seatLinkOn`変数を装飾とcalcで共有(判定ロジックの二重実装を避ける)。観測は毎paint(3秒期日ゲートに入れない=過渡的不一致も取り逃さない)。publishは既存の`publishVenueSeatsDiag`の3秒min-gapサイクルに相乗り(新規タイマー・storage read/writeなし)。

`venueSeatsDiag.js`のwhitelistに`seatLinkParity`を追加、`aiShareFullText.js`に状態速報1行を追加(`会場一致`/`scene`と同型パターン)。

## 偽陽性潰し
- 席未割当(`_venueSeatIndex<0`)・タイル未検出は観測対象外(正常スキップ系を汚染しない)
- uid比較は両側非空のときのみ
- 匿名/非数値uidは両側とも同じ判定関数を通るため、桁レンジ仕様自体は不一致として出ない
- fallbackモードは理論上ゼロになる自己校正(ゼロでなければ計器自体のバグ)

## MVP
INV-2(実体≠)のみでも良いが、実装コスト差がほぼ無いため3つとも一緒に実装するのが実態。削るならINV-3→INV-1の順。

## 捨てた案
1. 席クラス判定を鏡uidへ単純統一 — 却下(rosterが正確な情報源であるケースで新規リンク欠落を作るリスク)
2. MutationObserver/独立RAFループ — 却下(hot path保護の掟に反する重さ)
3. 不一致の全件ログ — 却下(jsonBlob容量問題の教訓)
4. paint毎カウンタリセット — 却下(過渡的不一致の証拠が消える)

## 地雷
1. 観測を3秒期日ゲートの中に置く誤り(過渡不一致を取り逃す)。観測は毎paint・publishだけ相乗りという非対称を明記
2. venueSeatsDiag whitelist落ち(登録漏れで永久に空欄)。wiring testでCI赤にする
3. statusFastDiagLiteには載らない(liteはstoryDiagMirrorのみ通す)。状態速報本文はaiShareFullText経由で届くので問題なし、と実装コミットに明記
4. Date.now()(壁時計)とperformance.now()の取り違えに注意(過去の56年前表示バグと同型)
5. 出荷ゲートはverify:cc一本

## 実機確認の手順(この計器を使った実害確定の判定基準)
反映3手順後、実配信で(a)配信序盤・(b)コメント滝の最中・(c)配信終盤の3回、状態速報の「席リンク一致」行をコピペ。
- ①3回とも`✅ 検N(紙M)`でNが数千規模 → **実害なし確定**。本設計のまま閉件、構造は触らない
- ②`🔴 uid≠>0` → INV-1が実際に破れている。構造修正の設計を別途起票
- ③`🔴 実体≠>0`かつ`uid≠0` → uidは一致しているのにDOMが古い(diff-skip再利用の問題)。二重ソースは冤罪、churn系の教訓([[story-userlane-churn-filllanetier-v1039]])で別途調査
- ④`href古>0` → 別人リンクの実害。優先度最高で即修正
