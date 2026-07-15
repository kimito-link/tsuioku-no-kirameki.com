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
  reg('venue-parity', '会場一致', 'venue', 2, false)
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
