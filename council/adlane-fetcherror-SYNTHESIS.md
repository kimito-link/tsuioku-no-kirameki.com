# SYNTHESIS: 公式値レーン state を3状態に正本化(fetch_error の誤称を根治) — 2026-06-21

> お題=council/adlane-fetcherror-question.txt / 会議=COUNCIL_FAST routed(design・3/3 diverge/fast/critic)
> 司令塔が実コード(northStarLaneReason.js / content-entry.js:13991 / healthCells.js)で裏取り済み。
> ユーザー指示=根本治療・根底から改善 / 新 state 名 = no_ranking_data。

## 真因(実コードで確定)
- northStarLaneReason.js `adRanking`(167-177): nicoadApiRows 0 && DOM 0 → 一律 `fetch_error`。
- だが実機 lv350746231: nicoadLastOk:true / status:200 / errorMessages:[] = 通信成功、ただ広告ランキングが0件。
- content-entry.js:13993 `nicoadLastRowsArr = rows.length>0 ? rows : null` ∴ **成功0件と未取得が両方 null=区別不能**。
- でも nicoadLastOk(true/false/null)・nicoadLastStatus(200/null) は別々に取れている=3状態を分けられる。
- 同型バグが貢献度(kokenApiRows / kokenLastOk / kokenLastStatus)にもある。

## 会議の結論(全員一致・批判役も賛成)
state の「混同(State Conflation)」を分解する。fetch_error を本物の通信失敗だけに限定し、成功0件は別 state(na)。
判定に nicoadLastOk/Status を渡す。makeLaneResult({ok,status,rows}) で呼び出し側を1行ラップ。
3年後楽ガード=純関数の分岐拡張+characterization test を3状態に拡張(優先度テーブル API→DOM→mirror は不変)。

## 確定仕様(ユーザー承認: 新 state `no_ranking_data`)
- `fetch_error` = 本物の取得失敗のみ(`ok===false`=通信失敗/HTTPエラー/lastError)。healthCells=bad(赤・隠さない)。
- `no_ranking_data`(新) = 通信成功(`ok===true`)だが rows 0件 かつ DOM/mirror も無い=この配信にランキングが無いだけ。
   healthCells=na(対象外・灰・「—」)。status速報の北極星レーンにも誤った赤を出さない。
- ok = rows>0 / DOM / mirror いずれかあり(従来どおり)。
- **未取得(まだ fetch していない=ok が null)** は fetch_error にしない=`not_yet`(取得前・既存 state)へ。
   ここが重要: 初動の「まだ叩いていない」を赤にしない。ok===false(明示的失敗)だけ赤。

## 実装(最小・保護ファイルの意図を強化)
1. **新ファイル src/lib/northStarLaneResult.js**: `makeLaneResult({ok,status,rows})` 純関数
   = {ok:boolean|null, status:number|null, rows:any[]|null} を正規化。+ unit test。
2. **northStarLaneReason.js**: determineNorthStarLaneState の opts に `adResult`/`contribResult`
   (= makeLaneResult の戻り)を追加で受ける。**後方互換**: 未指定なら従来の nicoadApiRows/kokenApiRows
   で動く(既存テスト不変)。adRanking/contributionRanking の分岐を:
   - result があれば: rows>0||DOM||mirror→ok / ok===true&&rows空→no_ranking_data / ok===false→fetch_error / それ以外(ok==null未取得)→not_yet(or iframe_unrendered の既存挙動維持)
   - result 無し(旧経路): 従来の nicoadApiRows 経路のまま(等価)。
   typedef NorthStarLaneState に 'no_ranking_data' を追加。
3. **content-entry.js:6076 stateOf**: adRanking/contributionRanking に makeLaneResult(
   {ok:nicoadLastOk,status:nicoadLastStatus,rows:nicoadLastRowsArr}) を渡す(koken も同様)。
   ※ nicoadLastRowsArr は0件で null=「成功0件」は ok:true & rows:null で表現=判定可能。
4. **healthCells.js northStarLevel**: 'no_ranking_data' → na('—' or「ランキング無し」)。
   'fetch_error' は bad のまま(本物の失敗)。'not_yet' は processing(取得中)に寄せる(初動を赤/黄にしない)。
5. **characterization test**: ①成功0件→no_ranking_data→na ②ok===false→fetch_error→bad
   ③rows>0→ok ④未取得(ok=null)→赤にしない。northStarLaneReason / healthCells 両方。

## 不変の制約(星野ロミ式 / self-verifying)
- 嘘の診断語を消す(fetch_error は本当に失敗した時だけ=「取れてないのに取れたフリ」も「取れてるのにエラー」も出さない)。
- 該当無し(0件)を赤にしない=失敗体験の除去。だが本物の通信失敗は赤で隠さない。
- northStarLaneReason の優先度テーブル(API→DOM→mirror)・既存 state の意味は壊さない=後方互換引数で移行。
- 記録/コメント取得 不可侵・新 storage 書き込みゼロ・hot path 不変。
