/**
 * customSoundPreset.js
 * 対応する効果音・操作音・結果発表音の No.→音種キー割り当てを JSON 化した
 *   プリセットメタデータ。**音声データ(mp3/wav等)は一切含まない**
 *   (タイトル/No.は事実メタデータでライセンス対象外だが、音声本体はユーザーのIndexedDBにのみ存在する)。
 *
 * id は `as_<No.>`(audiostock_<No.> のファイル名から機械導出)。
 * キーごとの配列順=設計書の「変奏順」をそのまま踏襲(customSoundStore.js の rotationRng が
 *   この順で1→2→3→…と巡回する)。
 *
 */

/**
 * @typedef {{ id: string, no: number, title: string }} PresetAsset
 */

/**
 * No.→音種キーの割り当て表(配列順=変奏順)。
 * @type {Readonly<Record<string, ReadonlyArray<PresetAsset>>>}
 */
export const CUSTOM_SOUND_PRESET = Object.freeze({
  // ---- §2.1 既存SEキー(effectSoundPlayer 配線済み) ----
  gift_small: Object.freeze([
    Object.freeze({ id: 'as_141689', no: 141689, title: 'コインやアイテムなどの獲得音.02' }),
    Object.freeze({ id: 'as_942162', no: 942162, title: 'アイテム獲得 明るいチャララン' }),
    Object.freeze({ id: 'as_134475', no: 134475, title: 'コイン、アイテム獲得 かわいいシンセ' }),
    Object.freeze({ id: 'as_269776', no: 269776, title: 'パチンコ的アイテム獲得音02(電子音)' }),
    Object.freeze({ id: 'as_270466', no: 270466, title: 'パチンコ的アイテム獲得音08(電子音)' })
  ]),
  gift_medium: Object.freeze([
    Object.freeze({ id: 'as_812926', no: 812926, title: 'キュイーン(魔法の音)' }),
    Object.freeze({ id: 'as_1587171', no: 1587171, title: 'キュイーン(輝く時の音)' }),
    Object.freeze({ id: 'as_198238', no: 198238, title: 'キュイーン スピードを感じる高い音' }),
    Object.freeze({ id: 'as_1210523', no: 1210523, title: 'パチンコっぽいキュイン' })
  ]),
  gift_large: Object.freeze([
    Object.freeze({ id: 'as_1211063', no: 1211063, title: 'パチンコ キュイン音強め' }),
    Object.freeze({ id: 'as_204361', no: 204361, title: '【キュイーン】パチンコの演出に' }),
    Object.freeze({ id: 'as_1586075', no: 1586075, title: 'ドドドキュイーン(パチンコのあたり音等)' })
  ]),
  gift_mega: Object.freeze([
    Object.freeze({ id: 'as_949044', no: 949044, title: 'パチスロ大当たりの電子音ファンファーレ' }),
    Object.freeze({ id: 'as_910103', no: 910103, title: '大当たり!!' }),
    Object.freeze({ id: 'as_983125', no: 983125, title: '大当たりのファンファーレ' })
  ]),
  milestone_soft: Object.freeze([
    Object.freeze({ id: 'as_1148459', no: 1148459, title: 'パチンコ スロット 小役 保留音' }),
    Object.freeze({ id: 'as_817331', no: 817331, title: '表示発生、保留変化時の音' }),
    Object.freeze({ id: 'as_1236635', no: 1236635, title: '汎用1(パチンコ、パチスロ)' })
  ]),
  milestone_hard: Object.freeze([
    Object.freeze({ id: 'as_1452576', no: 1452576, title: '【パチンコ】あおり音_シンセ系01' }),
    Object.freeze({ id: 'as_1452579', no: 1452579, title: '【パチンコ】あおり音_激アツ系' }),
    Object.freeze({ id: 'as_1452581', no: 1452581, title: '【パチンコ】あおり音_心音付き' }),
    Object.freeze({ id: 'as_139021', no: 139021, title: 'ドドドド' }),
    Object.freeze({ id: 'as_988080', no: 988080, title: 'ドカーン ドドドド' })
  ]),
  milestone_jackpot: Object.freeze([
    Object.freeze({ id: 'as_147795', no: 147795, title: 'パチンコの大当たり確定インパクト音' }),
    Object.freeze({ id: 'as_1311575', no: 1311575, title: 'パチンコ パチスロ 大当たり' }),
    Object.freeze({ id: 'as_1603124', no: 1603124, title: 'パチスロの演出成功の告知音です!' })
  ]),
  reach: Object.freeze([
    Object.freeze({ id: 'as_84370', no: 84370, title: '中_テンパイ_アイキャッチ_01' }),
    Object.freeze({ id: 'as_1148594', no: 1148594, title: 'パチンコ スロット 激アツ 効果音' }),
    Object.freeze({ id: 'as_1153500', no: 1153500, title: 'カットイン音1(パチスロ)' })
  ]),
  ad: Object.freeze([
    Object.freeze({ id: 'as_104491', no: 104491, title: 'レジスターの清算音(昭和レジスター)' }),
    Object.freeze({ id: 'as_104492', no: 104492, title: 'レジスターの清算音(ガチーン)' })
  ]),
  rank_up: Object.freeze([
    Object.freeze({ id: 'as_1608854', no: 1608854, title: '近未来的なランクアップ音' }),
    Object.freeze({ id: 'as_1602232', no: 1602232, title: 'テレレレシュイーン(ランクアップ)' })
  ]),
  rank_down: Object.freeze([
    Object.freeze({ id: 'as_1076277', no: 1076277, title: 'パワーダウン・下降' }),
    Object.freeze({ id: 'as_62247', no: 62247, title: 'トゥルルルー 失敗 残念' })
  ]),

  // ---- §5.1 新設操作音キー(op_*・Phase D1・視聴イベントキーと不共有) ----
  // council/operation-sound-SYNTHESIS.md §5.1: 基本音種の同一No.を複数キーから参照する
  //   (IndexedDB assignments は同じ blob id を別キーに割り当て可能=重複購入ゼロ)。
  // v0.1.1079: op_handle/op_shot_1〜3 は D1 実装時に Audiostock 定額で5本追加DL済み
  //   (計90本)だったのにプリセット配線が漏れて「永遠に未割当=無音」だった修正。
  //   役割は §5.2 の意図(接触クリック/軽い単発/バネ発射/重厚メカ)に対応させた。
  op_handle: Object.freeze([
    Object.freeze({ id: 'as_861221', no: 861221, title: 'ピコリン(操作の接触クリック)' })
  ]),
  op_shot_1: Object.freeze([
    Object.freeze({ id: 'as_1652750', no: 1652750, title: 'メダル投入(軽い単発)' })
  ]),
  op_shot_2: Object.freeze([
    Object.freeze({ id: 'as_1260384', no: 1260384, title: '玉発射(バネの打ち出し)' })
  ]),
  op_shot_3: Object.freeze([
    Object.freeze({ id: 'as_258054', no: 258054, title: 'リール変動開始(重厚メカ)' })
  ]),
  op_shot_4: Object.freeze([
    Object.freeze({ id: 'as_970774', no: 970774, title: 'カキーン(スロット確定音)' })
  ]),
  op_self_milestone: Object.freeze([
    Object.freeze({ id: 'as_371385', no: 371385, title: '特殊シンボル払い出し音' })
  ]),
  op_toggle_on: Object.freeze([
    Object.freeze({ id: 'as_141689', no: 141689, title: 'コインやアイテムなどの獲得音.02' })
  ]),
  op_toggle_off: Object.freeze([
    Object.freeze({ id: 'as_224302', no: 224302, title: 'ピコン(タップ・通知音)' })
  ]),
  op_panel_open: Object.freeze([
    Object.freeze({ id: 'as_141839', no: 141839, title: 'タッチ,クリック音(ピコン)' }),
    // v0.1.1079: D1追加DL分の5本目。「扉」音はパネルopenの意味に合うため変奏2で順繰り。
    Object.freeze({ id: 'as_108443', no: 108443, title: 'ガチャ扉(パネル開)' })
  ]),
  op_panel_close: Object.freeze([
    Object.freeze({ id: 'as_224302', no: 224302, title: 'ピコン(タップ・通知音)' })
  ]),
  op_seat: Object.freeze([
    Object.freeze({ id: 'as_476302', no: 476302, title: 'ピコーン(診断・ボタン音)' })
  ]),
  op_copy: Object.freeze([
    Object.freeze({ id: 'as_134475', no: 134475, title: 'コイン、アイテム獲得 かわいいシンセ' })
  ]),
  op_publish: Object.freeze([
    Object.freeze({ id: 'as_104491', no: 104491, title: 'レジスターの清算音(昭和レジスター)' })
  ]),

  // ---- SC3新設スコアキー(score_*・council/broadcast-scoring-SYNTHESIS.md §4・結果発表演出専用) ----
  // 2026-07-06: Audiostock定額で追加DL済み(D2追加DL分・計6本)。scoreAnnounce.js の
  //   結果発表シーケンス(ドラムロール→カウントアップ→ジャーン→拍手/Sジングル→ハイライト)で
  //   buildEffectSoundDeps 経由(effectSoundPlayer.js無改変)で再生する。
  score_drumroll: Object.freeze([
    Object.freeze({ id: 'as_811438', no: 811438, title: 'ドラムロール(結果発表前)' }),
    Object.freeze({ id: 'as_52577', no: 52577, title: 'ドラムロール(緊張感)' })
  ]),
  score_tick: Object.freeze([
    Object.freeze({ id: 'as_57770', no: 57770, title: 'カウントアップ電子音(ピッ)' }),
    Object.freeze({ id: 'as_174486', no: 174486, title: 'スコアカウント効果音' })
  ]),
  score_result: Object.freeze([
    Object.freeze({ id: 'as_1511523', no: 1511523, title: '結果発表ジャーン(通常)' }),
    Object.freeze({ id: 'as_233383', no: 233383, title: '発表ファンファーレ(短め)' })
  ]),
  score_applause: Object.freeze([
    Object.freeze({ id: 'as_877975', no: 877975, title: '拍手歓声(スタジオ)' }),
    Object.freeze({ id: 'as_53069', no: 53069, title: '観客拍手(短め)' })
  ]),
  score_swoosh: Object.freeze([
    Object.freeze({ id: 'as_91798', no: 91798, title: 'スウィッシュ(画面切替)' })
  ]),
  score_jingle_s: Object.freeze([
    Object.freeze({ id: 'as_1048482', no: 1048482, title: 'Sランク締めジングル(豪華ファンファーレ)' })
  ])
});

/** プリセットに載っている全キー(順序は宣言順=キー表の掲載順)。 */
export const CUSTOM_SOUND_PRESET_KEYS = Object.freeze(Object.keys(CUSTOM_SOUND_PRESET));

/**
 * プリセットの全アセット数(検算用)。
 * @returns {number}
 */
export function countPresetAssets() {
  return Object.values(CUSTOM_SOUND_PRESET).reduce((sum, list) => sum + list.length, 0);
}

/**
 * ファイル名(拡張子・パス問わず)から `audiostock_<No.>` パターンでNo.を機械導出する純関数。
 * 例: 'audiostock_204361.mp3' → 204361 / 'C:/x/audiostock_1587171.wav' → 1587171。
 * マッチしなければ null(呼び出し側は「割り当てできなかったファイル」として扱う)。
 * @param {string} filename
 * @returns {number|null}
 */
export function parseAudiostockNoFromFilename(filename) {
  const name = String(filename || '');
  const m = name.match(/audiostock_(\d+)/i);
  if (!m) return null;
  const no = Number(m[1]);
  return Number.isFinite(no) && no > 0 ? no : null;
}

/**
 * No. → id('as_<No.>')の機械導出。parseAudiostockNoFromFilename とセットで使う。
 * @param {number} no
 * @returns {string}
 */
export function presetIdForNo(no) {
  return `as_${Math.floor(Number(no) || 0)}`;
}

/**
 * プリセット全体を No.→{key, variantIndex, title} の逆引きテーブルにした純関数(取込UIの
 *   「ファイル名からNo.をパースして自動割り当て」で使う)。
 * @returns {Map<number, { key: string, variantIndex: number, title: string, id: string }>}
 */
export function buildPresetNoIndex() {
  /** @type {Map<number, { key: string, variantIndex: number, title: string, id: string }>} */
  const idx = new Map();
  for (const [key, list] of Object.entries(CUSTOM_SOUND_PRESET)) {
    list.forEach((asset, variantIndex) => {
      idx.set(asset.no, { key, variantIndex, title: asset.title, id: asset.id });
    });
  }
  return idx;
}
