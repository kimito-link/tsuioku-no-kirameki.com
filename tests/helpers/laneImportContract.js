/**
 * 応援レーンの「輸入契約」(テスト専用の定数・実装コードは import しない)。
 *
 * ■ 何か
 *   /live/ などから輸入した表示項目(stats=内訳・pulse=増分/熱い人)が、鏡 → 復元 → 会場の組み立てのどこを
 *   通り、どの名前で運ばれるかの宣言。laneImportContract.test.js が「各段のキー集合が契約と完全一致」を
 *   断言する。新しい項目を toMirrorCell に足したのに契約へ書かなければ赤・契約に書いたのに運ばれなければ赤。
 *   =『1つ忘れると、①には出るが②③に出ない』が黙って起きない(個別列挙の3箇所の足し忘れを構造で止める)。
 * ■ 実装に import しない理由: 出荷バンドルを汚さない・契約が実装と同じ書き手(同じ思い込み)にならない。
 *
 * @module laneImportContract
 */

/** 輸入項目が無い素のタイルが鏡セルに持つキー(laneMirror.js toMirrorCell の基本形)。 */
export const BASE_MIRROR_CELL_KEYS = Object.freeze(['displaySrc', 'title', 'idLine', 'nameLine', 'userId', 'recentTexts']);
/** 復元後(paintStoryUserLaneDomFilled が受ける形)の基本キー。 */
export const BASE_RESTORED_ITEM_KEYS = Object.freeze(['displaySrc', 'title', 'meta', 'entry']);
/**
 * 鏡セルの基本形のうち、【発言があるときだけ】復元後・会場の組み立てまで運ばれるキー(2026-10-12)。
 *   以前は復元・組み立てが落としていた(=ホバーカードのセリフが、会場自前の在席名簿にしか無い人にしか出なかった)ため、
 *   この定数は空だった。ここに宣言して、②復元と④会場の組み立ての期待に含める(落とす実装に戻したら赤)。
 *   値は文字列の配列(輸入契約の枠 LANE_IMPORT_CONTRACT はオブジェクト型の項目専用なので、枠には入れない)。
 */
export const CARRIED_WHEN_PRESENT_KEYS = Object.freeze(['recentTexts']);
/** 会場の組み立て(composeVenueLaneBuckets)が付ける内部キー。輸入項目ではない。 */
export const VENUE_INTERNAL_KEYS = Object.freeze([
  'entryIndex', 'profileTier', 'thumbScore', 'displaySrc', 'title', 'entry', 'meta',
  '_venueSeatIndex', '_venueIsVip', '_venueMirror'
]);

/**
 * 輸入項目 1件 = 1エントリ。
 *   itemKey   : buckets のアイテム上のキー(attach 関数が付ける)
 *   mirrorKey : 鏡セル上のキー(短縮形でもよい)
 *   syncInPlace: 描かない経路(属性だけ更新)が追従する項目か。true は鍵(bodyKey/署名/scene hash)に入れてはいけない
 *   sampleItem : 全部入りfixture用の値(各項目の【全部のサブ項目】を埋める=足し忘れを空振りで通さない)
 */
export const LANE_IMPORT_CONTRACT = Object.freeze([
  Object.freeze({
    id: 'stats',
    itemKey: 'stats',
    mirrorKey: 'stats',
    syncInPlace: true,
    sampleItem: Object.freeze({ commentCount: 12, giftPt: 1200, adPt: 500 })
  }),
  Object.freeze({
    id: 'pulse',
    itemKey: 'pulse',
    mirrorKey: 'pulse',
    syncInPlace: true,
    sampleItem: Object.freeze({ giftDelta: 500, giftTier: 'large', heat: 7, heatTier: 'large' })
  })
]);

export const contractItemKeys = () => LANE_IMPORT_CONTRACT.map((c) => c.itemKey);
export const contractMirrorKeys = () => LANE_IMPORT_CONTRACT.map((c) => c.mirrorKey);
