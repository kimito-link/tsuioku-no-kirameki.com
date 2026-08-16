/**
 * healthCellGroups.js — 健全度セルを【症状の言葉】で枠に分ける(純関数)。
 *
 * ★なぜ要るか(ユーザーに10回近く同じことを言わせた)
 *   ユーザーの言葉:「この枠をコメント関連・ID・サムネ・アカウント名・紐づけ関連など
 *   で区分して枠を増やしてほしいってのが何回つたえても守られていない」
 *
 *   従来は33セルが**1枚の平坦なグリッド**に並ぶだけだった。
 *   既存の category(record/ingest/render/northstar/venue)は
 *   **完全性スコアの集計用=開発者の言葉**で、画面の区分には使われていなかった。
 *   しかも「ID・サムネ・アカウント名」は
 *     uid-rate → record / avatar → northstar / venue-yukkuri-face → venue
 *   と**3つのカテゴリに散らばっていて**、探しても1箇所にまとまらない。
 *
 * ★この module がやること: **表示用の枠だけ**を定義する。
 *   - セルの中身・判定・色は1mmも変えない(既存の buildHealthCells をそのまま使う)
 *   - registry の category も変えない(完全性スコアの集計を壊さない=二重カウント防止のため)
 *   - ここは「並べ替えと見出し」だけの層
 *
 * ■ 掟
 *   1. **1セルは1枠**(どこにも出ないセルを作らない・二重に出さない)
 *   2. 未知のセルは「その他」へ落とす(**取りこぼして消さない**)
 *      ★新セルを足した人がここへの登録を忘れても、画面から消えないこと
 *   3. ★v0.1.1401: **固定テーブル**にする(枠もセルも消さない)。
 *      ユーザー指摘:「隠れるんじゃなくて固定のテーブル組んでおくべき。
 *      DOM構造が変化するので上に行ったり下に行ったりで見づらくなる」
 *      ＝配信の状態でセルが増減すると**毎回どこにあったか探し直す**ことになる。
 *      registry の全セルを常に同じ順・同じ位置に出し、**値だけ**が変わる。
 *      観測が無いセルは ⚪「—」で置く(存在は消さない)。
 *
 * @module healthCellGroups
 */

import { DIAGNOSIS_BY_ID } from './diagnosisRegistry.js';

/**
 * 表示用の枠。**ユーザーが困ったときに使う言葉**で並べる。
 * order が小さいほど上。
 * @type {ReadonlyArray<{ id:string, label:string, hint:string, order:number, cellIds:readonly string[] }>}
 */
export const HEALTH_CELL_GROUPS = Object.freeze([
  Object.freeze({
    id: 'comment', label: 'コメント記録', order: 1,
    hint: 'コメントが取れているか・公式と一致しているか',
    cellIds: Object.freeze([
      'capture-rate', 'match', 'ndgr-chats', 'dedupe-seed', 'ndgr-persist', 'uid-detail'
    ])
  }),
  Object.freeze({
    id: 'ingest', label: '取り込み（接続・過去ログ）', order: 2,
    hint: '今つながっているか・過去のコメントを追えているか',
    cellIds: Object.freeze([
      'ndgr', 'ingest', 'backfill', 'backfill-bottleneck', 'host-move', 'multi-tab'
    ])
  }),
  Object.freeze({
    id: 'identity', label: '人の識別（ID・サムネ・名前の紐づけ）', order: 3,
    hint: '誰が言ったかを結びつけられているか。匿名は仕様上ここに出ません',
    cellIds: Object.freeze([
      'uid-rate', 'avatar', 'venue-yukkuri-face', 'avatar-cache',
      // ★v0.1.1408: 匿名は分母から外して見る(匿名にサムネ/名前は原理的に無い=仕様)
      'identity-anon', 'identity-name', 'identity-thumb', 'identity-complete'
    ])
  }),
  /*
   * ★v0.1.1406: レーンを【症状の言葉】で3枠に割る(会議 UX の判定)。
   *   1枠に10個以上並べると探せない。打ち手が違うものを分ける:
   *     人の出入り = 誰が消えた/入れなかった
   *     タイルの揺れ = ちらつき(見た目が落ち着かない)
   *     描画が動いたか = そもそも描かれているか
   *   ★既存14枠の相対順は動かさず、小数 order で隣に挿す。
   */
  Object.freeze({
    id: 'lane', label: '応援レーン（人の出入り）', order: 4,
    hint: '誰が並ぶか・消えていないか',
    cellIds: Object.freeze([
      'lane-count', 'lane-dropped', 'lane-drop-burst', 'lane-capped'
    ])
  }),
  Object.freeze({
    id: 'lane-flicker', label: '応援レーン（ちらつき・増減）', order: 4.3,
    hint: '★人数が増えたり減ったりして落ち着かないときはここ',
    cellIds: Object.freeze([
      'lane-oscillation', 'lane-amplitude', 'lane-worst-drop', 'lane-settle'
    ])
  }),
  Object.freeze({
    id: 'lane-paint-group', label: '応援レーン（描画が動いたか）', order: 4.6,
    hint: '★レーンが空・古いままのときはここ。最後に描かれた時刻を見ます',
    cellIds: Object.freeze([
      'lane-tick', 'lane-last-run', 'lane-paint', 'lane-publish-skip', 'lane-supply-guard'
    ])
  }),
  Object.freeze({
    id: 'venue', label: '会場モード', order: 5,
    hint: '★会場は①ポップアップが書いた情報を映します。席・一致・鮮度をここで見ます',
    cellIds: Object.freeze([
      // ★v0.1.1405: 「鏡が古い」の原因を名指しするセルを鮮度の直後に置く。
      'venue-mode', 'venue-intake', 'venue-seats', 'venue-seats-visible', 'venue-parity', 'venue-broadcaster'
    ])
  }),
  Object.freeze({
    id: 'gift', label: 'ギフト', order: 6,
    hint: 'ギフトが取れて・出て・鳴っているか',
    cellIds: Object.freeze([
      'ns-contrib', 'ns-gift-hist', 'gift-ad-pipeline', 'fetch-koken'
    ])
  }),
  Object.freeze({
    id: 'ad', label: '広告', order: 7,
    hint: 'ニコニ広告のランキングが取れているか',
    cellIds: Object.freeze(['ns-ad', 'fetch-nicoad'])
  }),
  Object.freeze({
    id: 'event', label: 'イベント・番組ポイント', order: 8,
    hint: 'イベント順位・スコア・番組累計pt（イベント無しの配信では出ません）',
    cellIds: Object.freeze(['ns-escore', 'ns-erank', 'ns-prog-pt'])
  }),
  /*
   * ★v0.1.1407: 公式値が「そもそも取れているか」を1枠に集める。
   *   個別レーンの state(上の3枠)とは別で、
   *   **取得の実績と外部APIの生死**=拡張の外の問題を切り分ける層。
   */
  Object.freeze({
    id: 'northstar-fetch', label: '公式値の取得（外部から取れているか）', order: 8.5,
    hint: '★ギフト/広告/イベントの数字が出ないときはここ。拡張の外の問題かが分かります',
    cellIds: Object.freeze(['ns-ever-got', 'ns-pending', 'fetch-leader'])
  }),
  /*
   * ★v0.1.1403: 読み上げを【始まらない】と【ずれる】で分ける。
   *   打ち手が正反対なので同じ枠に置くと探せない
   *   (始まらない=接続/権限の問題・ずれる=速度と量の問題)。
   */
  Object.freeze({
    id: 'voice-start', label: '読み上げ（始まらない・音が出ない）', order: 8.8,
    hint: '★声が出ないときはここ。ONにできない理由と、音がブロックされていないかを見ます',
    cellIds: Object.freeze([
      'voice-start-fail', 'voice-audio-blocked', 'voice-synth-fail', 'voice-synth-null'
    ])
  }),
  Object.freeze({
    id: 'voice', label: '読み上げ（声と吹き出しの一致）', order: 9,
    hint: '★声と画面表示が同じタイミングか。個別の速さでなく「揃っているか」を見ます',
    cellIds: Object.freeze(['voice-bubble-parity', 'voice-timing', 'voice-coverage'])
  }),
  /*
   * ★v0.1.1407: 「全部読まれない/遅れる」の原因を分ける枠。
   *   読み飛ばしは理由で打ち手が変わる(件数上限=設定で直る / 鮮度切れ=合成が追いつかない)。
   */
  Object.freeze({
    id: 'voice-flow', label: '読み上げ（追いつきと読み飛ばし）', order: 9.2,
    hint: '★コメントが多いときに読まれない・遅れる場合はここ',
    cellIds: Object.freeze([
      'voice-drop-reason', 'voice-catchup', 'voice-queue', 'voice-playback-timeout'
    ])
  }),
  Object.freeze({
    id: 'display', label: '画面の見せ方（PICK UP・クリック）', order: 9.5,
    hint: '大きく出す帯や、押せる見た目になっているか',
    cellIds: Object.freeze(['pickup-write', 'click-affordance'])
  }),
  Object.freeze({
    id: 'post', label: 'コメント送信', order: 10,
    hint: '自分が送ったコメントが届いて画面に出たか',
    cellIds: Object.freeze([
      'comment-post', 'comment-revert', 'comment-echo', 'comment-retry', 'instant-reject'
    ])
  }),
  Object.freeze({
    id: 'effect', label: '演出・効果音', order: 11,
    hint: '鳴るはずのものが鳴っているか。鳴らないときは「保管庫」と「失敗」を見ます',
    cellIds: Object.freeze([
      'gift-effect', 'milestone-effect', 'arrival-effect',
      'custom-sound-db', 'gift-sound-fail', 'effect-throttle',
      'op-sound', 'bgm-phase'
    ])
  }),
  Object.freeze({
    id: 'speed', label: '重さ・黒画面', order: 12,
    hint: '★黒くなる・固まる件はここ。「メインスレッド」が止めている当人を名指しします',
    cellIds: Object.freeze([
      // ★v0.1.1404: 「誰が止めているか」を先頭に置く(黒画面はここから読む)。
      // ★v0.1.1408: 2番目・種類数・平均・起動段階・作り直しを追加。
      'mt-owner', 'mt-owner2', 'mt-total', 'mt-average', 'mt-spread', 'mt-resume',
      'boot-phase', 'boot-remount',
      'main-thread', 'paint', 'scroll-whiteout', 'whiteout-culprit', 'boot-shade', 'grid-rebuild'
    ])
  }),
  Object.freeze({
    id: 'health', label: '保存・内部の整合', order: 13,
    hint: '記録が保存できているか・画面どうしの同期がずれていないか',
    cellIds: Object.freeze([
      // ★v0.1.1404: 「いま動いている版はいつのものか」を先頭に。
      //   「なにもかわってない」の第一容疑者を最初に潰せるようにする。
      'build-age',
      'storage', 'stale', 'console', 'diag-stability', 'mirror-gen-stamp', 'preview-gen-sync',
      'mirror-publish', 'northstar-render'
    ])
  })
]);

/** 未知セルの受け皿(登録漏れでも画面から消さない)。 */
export const FALLBACK_GROUP = Object.freeze({
  id: 'other',
  label: 'その他',
  hint: 'まだ分類していない項目',
  order: 99
});

/** cellId → groupId の索引。 */
const GROUP_BY_CELL = Object.freeze(
  HEALTH_CELL_GROUPS.reduce((acc, g) => {
    for (const cid of g.cellIds) acc[cid] = g.id;
    return acc;
  }, Object.create(null))
);

/**
 * セル id が属する枠 id。未登録は 'other'。
 * @param {unknown} cellId
 * @returns {string}
 */
export function groupIdForCell(cellId) {
  const k = String(cellId || '');
  return GROUP_BY_CELL[k] || FALLBACK_GROUP.id;
}

/**
 * セル配列を枠ごとに束ねる。**空の枠は返さない**。
 *
 * @param {ReadonlyArray<{ id?: string }>} cells buildHealthCells の出力
 * @returns {Array<{ id:string, label:string, hint:string, cells:any[] }>} order 順
 */
export function groupHealthCells(cells) {
  const list = Array.isArray(cells) ? cells : [];
  /** @type {Record<string, any>} */
  const byId = Object.create(null);
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    if (c.id != null) byId[String(c.id)] = c;
  }

  /*
   * ★v0.1.1401 固定テーブル: 枠の cellIds の【定義順】に並べる。
   *   出力に無いセルは ⚪「—」のプレースホルダで埋める=位置が動かない。
   *   ＝いつ見ても同じ場所に同じ項目があり、値だけが変わる。
   */
  const out = [];
  for (const g of [...HEALTH_CELL_GROUPS].sort((a, b) => a.order - b.order)) {
    const cellsInGroup = g.cellIds.map((cid) => byId[cid] || {
      id: cid, label: labelForCellId(cid), kind: 'state', value: null, level: 'na', text: '—'
    });
    out.push({ id: g.id, label: g.label, hint: g.hint, cells: cellsInGroup });
  }

  /*
   * 枠に未登録のセル(将来の追加漏れ)は「その他」へ。
   * ★ここは動的=登録漏れが無ければ空になり、枠ごと出ない。
   *   固定テーブルの原則より「消さない」を優先する例外。
   */
  const stray = Object.keys(byId).filter((id) => groupIdForCell(id) === FALLBACK_GROUP.id);
  if (stray.length > 0) {
    out.push({
      id: FALLBACK_GROUP.id, label: FALLBACK_GROUP.label, hint: FALLBACK_GROUP.hint,
      cells: stray.map((id) => byId[id])
    });
  }
  return out;
}

/**
 * セル id の表示名(プレースホルダ用)。registry を正本にする。
 * @param {string} cellId
 * @returns {string}
 */
function labelForCellId(cellId) {
  const meta = DIAGNOSIS_BY_ID[cellId];
  return meta && meta.label ? meta.label : cellId;
}

/**
 * 枠の見出しに出す要約(異常が何件か)。**枠を畳んでも異常を見落とさない**ため。
 * @param {ReadonlyArray<{ level?: string }>} cells
 * @returns {{ bad:number, warn:number, level:'bad'|'warn'|'ok' }}
 */
export function summarizeGroup(cells) {
  const list = Array.isArray(cells) ? cells : [];
  let bad = 0;
  let warn = 0;
  for (const c of list) {
    const lv = String(c?.level || '');
    if (lv === 'bad') bad += 1;
    else if (lv === 'warn') warn += 1;
  }
  return { bad, warn, level: bad > 0 ? 'bad' : warn > 0 ? 'warn' : 'ok' };
}
