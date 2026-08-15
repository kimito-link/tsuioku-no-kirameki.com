// @ts-nocheck — レジストリ定義(凍結リテラル)を素の JS で持つ。helper の引数型は実行時に固定。
/**
 * diagnosisRegistry.js — 状態速報「網羅的完全性診断」の【真実の源泉(Source of Truth)】。
 *
 * 背景(council/completeness-diagnosis-SYNTHESIS.md): ユーザー要求「PageSpeed Insights のように、
 *   診断項目を全部網羅して、全部できたら『完全』という診断にしてほしい」。これまでは症状を1個ずつ
 *   手で aiShareFullText に挿していた=抜けが永遠に出る(非網羅)。会議の全員一致=【観点レジストリ化】:
 *   診断観点を1ファイルに定義し、観点追加=ここに1行=構造的に抜けを無くす。
 *
 * このレジストリは healthCells.js が生成する各セルの id と1対1で対応する(test で全 id の存在を強制)。
 *   各観点 = { id, label, category, weight, mandatory }。
 *   - id: healthCells のセル id と一致(ズレると集計から漏れる=網羅の穴)。
 *   - category: 5カテゴリのいずれか(1観点1カテゴリ=二重カウント防止。会議で動的多所属案は却下)。
 *   - weight: スコア集計の重み(コメント記録の完全性=北極星=最優先で重い)。
 *   - mandatory: 「完全(✅完璧)」判定で必ず ok でなければならない必須項目か。
 *
 * ★純データのみ(chrome 非依存)。判定/集計は completenessScore.js が行う(表示と分離)。
 *
 * @module diagnosisRegistry
 */

/** カテゴリ定義(表示順=この順)。id は完全性スコアのカテゴリ行に使う。 */
export const DIAGNOSIS_CATEGORIES = Object.freeze([
  Object.freeze({ id: 'record', label: 'コメント記録の完全性' }),
  Object.freeze({ id: 'ingest', label: 'データ取得の堅牢性' }),
  Object.freeze({ id: 'render', label: '描画・UI健全性' }),
  Object.freeze({ id: 'northstar', label: '外部値レーン' }),
  Object.freeze({ id: 'venue', label: '会場・読み上げ' })
]);

/** カテゴリ id の集合(検証用)。 */
export const DIAGNOSIS_CATEGORY_IDS = Object.freeze(DIAGNOSIS_CATEGORIES.map((c) => c.id));

/**
 * 観点レジストリ。healthCells の全セル id を網羅する(test で強制)。
 *   weight/mandatory はユーザーの北極星(コメント記録の完全性が最優先)に従う。
 * @type {ReadonlyArray<{ id:string, label:string, category:string, weight:number, mandatory:boolean }>}
 */
export const DIAGNOSIS_REGISTRY = Object.freeze([
  // ① コメント記録の完全性(最重要)。記録系は mandatory。
  reg('capture-rate', '取得率', 'record', 2, true),
  reg('match', '記録↔公式一致', 'record', 2, true),
  reg('uid-rate', 'userId付き保存', 'record', 1, false),
  reg('ndgr-chats', 'NDGRコメント', 'record', 1, false),
  // ② データ取得の堅牢性。接続/保存の土台は mandatory。
  reg('ndgr', 'NDGR接続', 'ingest', 2, true),
  reg('ingest', 'リアルタイム取込', 'ingest', 1, false),
  reg('backfill', '過去ログ取得', 'ingest', 1, false),
  // ★v0.1.1362: 取り込みの【律速】を名指しするセル(裏タブ/譲りすぎ/空区画/計器沈黙)。
  //   weight=1・mandatory=false: 取り込みが走っていない時間帯は na なので、
  //   達成率の分母に固定で入れると「取り込みしていない=未達」に見えてしまう。
  reg('backfill-bottleneck', '取り込み律速', 'ingest', 1, false),
  reg('storage', 'storage安定', 'ingest', 2, true),
  // ③ 描画・UI健全性。
  reg('paint', '描画', 'render', 1, false),
  reg('stale', '多タブ名残', 'render', 1, false),
  reg('console', 'エラー', 'render', 1, false),
  reg('scroll-whiteout', 'スクロール白化', 'render', 1, false),
  reg('diag-stability', '診断カウンタの安定性', 'render', 1, false),
  // ④ 外部値レーン(北極星6レーン + アバター + 応援レーン人数)。
  reg('ns-contrib', 'ギフト貢献度', 'northstar', 1, false),
  reg('ns-ad', '広告ランキング', 'northstar', 1, false),
  reg('ns-gift-hist', 'ギフト履歴', 'northstar', 1, false),
  reg('ns-escore', 'イベントスコア', 'northstar', 1, false),
  reg('ns-prog-pt', '番組累計pt', 'northstar', 1, false),
  reg('ns-erank', 'イベント順位', 'northstar', 1, false),
  reg('avatar', 'アバター解決', 'northstar', 1, false),
  reg('lane-count', '応援レーン', 'northstar', 1, false),
  // v0.1.1054: レジストリ・ドリフト是正(healthCells.js にはv1048から実装済みだったがここへの
  //   登録漏れで completenessScore.js:76 の `if (!meta) continue` により黙って集計対象外だった。
  //   completenessScore.test.js の網羅性テストが両セルを発生させる入力を渡していなかったため
  //   見逃されていた=「網羅を強制するテスト」自体に穴があった実例)。
  reg('lane-paint', 'レーン描画速度', 'northstar', 1, false),
  // v0.1.1054: ギフト/広告の「検知→演出→効果音」整合(giftEffectDiag)。
  reg('gift-effect', 'ギフト演出/効果音', 'northstar', 1, false),
  // v0.1.1056: パリティ根本修正(①②の世代同期)自体が動いているかの自己診断。
  reg('mirror-gen-stamp', '鏡世代スタンプ', 'render', 1, false),
  reg('preview-gen-sync', '②世代同期', 'render', 1, false),
  // v0.1.1058: コメント数マイルストーンの「検知→演出→効果音」整合(milestoneEffectDiag)。
  //   giftEffectDiag(v0.1.1054)と同型の片翼統合を繰り返さないよう、healthCells.js への
  //   セル追加と同時にここへも登録する。
  reg('milestone-effect', 'マイルストーン演出/効果音', 'northstar', 1, false),
  // ⑤ 会場・読み上げ(使用時のみセルが出る)。
  reg('voice-timing', '読み上げ追従', 'venue', 1, false),
  reg('voice-coverage', '読み上げ漏れ', 'venue', 1, false),
  reg('venue-broadcaster', '配信者混入', 'venue', 1, false),
  reg('venue-seats', '会場座席', 'venue', 1, false),
  reg('venue-seats-visible', '会場席の網羅', 'venue', 1, false),
  // v0.1.1113: 会場一致(Tri-Parity=鏡データ=段割当データ=段実DOM)。従来はテキスト1行のみで
  //   レジストリ未登録=完全性スコア100%でも会場一致🔴がありうる盲点(穴f)だった。healthCells の
  //   venue-parity セルと同時に登録する(v0.1.1054 のレジストリ・ドリフトを繰り返さない)。
  reg('venue-parity', '会場一致', 'venue', 2, false),
  // 2026-07-15 診断先行(venue-yukkuri-named-diagnose): 「名前ありゆっくり顔」実害計器。
  reg('venue-yukkuri-face', '名前ありゆっくり顔', 'venue', 1, false),
  // ★v0.1.1390(ユーザー要望): 読み上げ特化。「よみあげと吹き出しはリアルタイム一致がいい」
  //   個別の速さでなく【2つが揃っているか】を1セルで見る(voiceBubbleRealtimeParity.js)。
  reg('voice-bubble-parity', '読み上げ⇄吹き出し', 'venue', 1, false),
  // ★v0.1.1390(ユーザー要望): コメント送信特化。従来は「操作音」等と混ざって埋もれていた。
  reg('comment-post', 'コメント送信', 'render', 1, false),
  // ★v0.1.1390: メインスレッドを止めた【当人】。速報は「探すこと」で終わっており
  //   誰が止めたかを名指ししていなかった(mainThreadBlockerCensus.js)。
  reg('main-thread', 'メインスレッド', 'render', 1, false),
  // ★v0.1.1390(ユーザー要望): 会場モード専用。会場は鏡ごしにしか見えないので
  //   「鏡が古い」を会場の言葉で出す(venueModeCensus.js)。
  reg('venue-mode', '会場モードの鮮度', 'venue', 1, false),
  // ★v0.1.1390(ユーザー要望): ギフト/広告の通り道(取得→反映→演出)。
  //   「取得中」のまま数分続くのは詰まり、を名指しする(giftAdPipelineCensus.js)。
  reg('gift-ad-pipeline', 'ギフト/広告の通り道', 'northstar', 1, false),
  /*
   * ★v0.1.1400: 速報の本文に埋もれていた判定を掘り起こしてセル化(在庫の棚卸し)。
   *   判定は buriedInstrumentCells.js が正本。weight=1・mandatory=false
   *   (どれも「観測できたときだけ出る」補助情報なので、達成率の分母を歪めない)。
   */
  reg('lane-tick', 'レーン描画の起動', 'render', 1, false),
  reg('lane-dropped', 'レーンから消えた人', 'northstar', 1, false),
  reg('lane-supply-guard', 'レーン保護', 'render', 1, false),
  reg('lane-settle', 'レーンの読み切り', 'northstar', 1, false),
  reg('lane-oscillation', 'レーンの増減', 'render', 1, false),
  reg('boot-shade', '起動時のシェード', 'render', 1, false),
  reg('grid-rebuild', 'アイコングリッド', 'render', 1, false),
  reg('pickup-write', 'PICK UPの更新', 'render', 1, false),
  reg('click-affordance', 'クリックの見た目', 'render', 1, false),
  reg('avatar-cache', 'サムネの記憶', 'northstar', 1, false),
  reg('dedupe-seed', '重複の見分け', 'record', 1, false),
  reg('host-move', '記録役の引っ越し', 'ingest', 1, false),
  reg('northstar-render', '公式値の描画', 'northstar', 1, false),
  reg('mirror-publish', '鏡の書き出し', 'render', 1, false),
  /*
   * ★v0.1.1403 第1弾「無音で死ぬ」故障(silentFailureCells.js が判定の正本)。
   *   会議3席が独立に一致した最優先群=**既に測れているのに画面が無言**だったもの。
   *   例: customSoundDiag.dbAvailable=false は '-' としか出ておらず、
   *   カスタム音源が全滅しても誰も気づけなかった。
   *   weight=1・mandatory=false: 使っていない機能で達成率を下げないため。
   */
  reg('custom-sound-db', 'マイ効果音の保管庫', 'render', 1, false),
  reg('voice-start-fail', '読み上げのON失敗', 'venue', 1, false),
  reg('voice-audio-blocked', '音の再生ブロック', 'venue', 1, false),
  reg('gift-sound-fail', 'ギフト音の失敗', 'northstar', 1, false),
  reg('comment-revert', '送信の取り消し', 'render', 1, false),
  /*
   * ★v0.1.1404 第2弾: 黒画面の【当人】と、ビルドの古さ。
   *   どちらも「過去に往復を何度も生んだ症状」を1行で終わらせるための計器
   *   (blackScreenOwnerCells.js / buildAgeCell.js が判定の正本)。
   */
  reg('mt-owner', '止めている当人', 'render', 1, false),
  reg('mt-total', '止まった合計時間', 'render', 1, false),
  reg('mt-resume', 'スリープ明けの詰まり', 'render', 1, false),
  reg('build-age', 'このビルドの新しさ', 'render', 1, false),
  /*
   * ★v0.1.1405: 会場が鏡を受け取れているか。
   *   (a)通知が来ない /(b)別配信の鏡を見ている /(c)関所で全却下 を名指しする。
   *   未解決の「会場一致が鏡stale(656s)で固定」を肯定/否定できる唯一の計器。
   */
  reg('venue-intake', '会場の鏡うけとり', 'venue', 1, false),
  /*
   * ★v0.1.1406 第4弾: 既存プローブを【打ち手が変わる単位】に割る。
   *   laneDetailCells.js / effectDetailCells.js が判定の正本。
   *   ★単独では打ち手の無い内訳(docHidden 等)はセルにしない(会議の判定)。
   */
  reg('lane-last-run', 'レーンの最終描画', 'render', 1, false),
  reg('lane-capped', '上限で表示できなかった人', 'northstar', 1, false),
  reg('lane-drop-burst', '一度に消えた最大人数', 'northstar', 1, false),
  reg('lane-amplitude', 'レーンの振れ幅', 'render', 1, false),
  reg('lane-worst-drop', '一番大きく減った瞬間', 'render', 1, false),
  reg('lane-publish-skip', 'レーンの書き出し見送り', 'render', 1, false),
  reg('arrival-effect', '到着の演出', 'northstar', 1, false),
  reg('effect-throttle', '演出の間引き', 'northstar', 1, false),
  reg('comment-echo', '送信から表示まで', 'render', 1, false),
  reg('comment-retry', '送信の再試行', 'render', 1, false),
  reg('instant-reject', '即時表示の取りこぼし', 'render', 1, false)
]);

/** id → 観点 の索引(集計で O(1) 参照)。 */
export const DIAGNOSIS_BY_ID = Object.freeze(
  DIAGNOSIS_REGISTRY.reduce((acc, e) => {
    acc[e.id] = e;
    return acc;
  }, Object.create(null))
);

/** @returns {{ id:string, label:string }} カテゴリ定義(無ければ未分類)。 */
export function categoryById(id) {
  return DIAGNOSIS_CATEGORIES.find((c) => c.id === id) || { id: 'other', label: 'その他' };
}

/** 1観点を作る(凍結)。 */
function reg(id, label, category, weight, mandatory) {
  return Object.freeze({ id, label, category, weight, mandatory: !!mandatory });
}
