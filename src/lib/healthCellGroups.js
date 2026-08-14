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
 *   3. 空の枠は出さない(その配信で対象外のセルしか無い枠はノイズ)
 *
 * @module healthCellGroups
 */

/**
 * 表示用の枠。**ユーザーが困ったときに使う言葉**で並べる。
 * order が小さいほど上。
 * @type {ReadonlyArray<{ id:string, label:string, hint:string, order:number, cellIds:readonly string[] }>}
 */
export const HEALTH_CELL_GROUPS = Object.freeze([
  Object.freeze({
    id: 'comment', label: 'コメント記録', order: 1,
    hint: 'コメントが取れているか・公式と一致しているか',
    cellIds: Object.freeze(['capture-rate', 'match', 'ndgr-chats'])
  }),
  Object.freeze({
    id: 'ingest', label: '取り込み（接続・過去ログ）', order: 2,
    hint: '今つながっているか・過去のコメントを追えているか',
    cellIds: Object.freeze(['ndgr', 'ingest', 'backfill', 'backfill-bottleneck'])
  }),
  Object.freeze({
    id: 'identity', label: '人の識別（ID・サムネ・名前の紐づけ）', order: 3,
    hint: '誰が言ったかを結びつけられているか。匿名は仕様上ここに出ません',
    cellIds: Object.freeze(['uid-rate', 'avatar', 'venue-yukkuri-face'])
  }),
  Object.freeze({
    id: 'lane', label: '応援レーン（誰が並ぶか）', order: 4,
    hint: '何人出るか・描画が追いついているか',
    cellIds: Object.freeze(['lane-count', 'lane-paint'])
  }),
  Object.freeze({
    id: 'venue', label: '会場モード', order: 5,
    hint: '★会場は①ポップアップが書いた情報を映します。席・一致・鮮度をここで見ます',
    cellIds: Object.freeze([
      'venue-mode', 'venue-seats', 'venue-seats-visible', 'venue-parity', 'venue-broadcaster'
    ])
  }),
  Object.freeze({
    id: 'gift', label: 'ギフト', order: 6,
    hint: 'ギフトが取れて・出て・鳴っているか',
    cellIds: Object.freeze(['ns-contrib', 'ns-gift-hist', 'gift-ad-pipeline'])
  }),
  Object.freeze({
    id: 'ad', label: '広告', order: 7,
    hint: 'ニコニ広告のランキングが取れているか',
    cellIds: Object.freeze(['ns-ad'])
  }),
  Object.freeze({
    id: 'event', label: 'イベント・番組ポイント', order: 8,
    hint: 'イベント順位・スコア・番組累計pt（イベント無しの配信では出ません）',
    cellIds: Object.freeze(['ns-escore', 'ns-erank', 'ns-prog-pt'])
  }),
  Object.freeze({
    id: 'voice', label: '読み上げ（声と吹き出しの一致）', order: 9,
    hint: '★声と画面表示が同じタイミングか。個別の速さでなく「揃っているか」を見ます',
    cellIds: Object.freeze(['voice-bubble-parity', 'voice-timing', 'voice-coverage'])
  }),
  Object.freeze({
    id: 'post', label: 'コメント送信', order: 10,
    hint: '自分が送ったコメントが届いて画面に出たか',
    cellIds: Object.freeze(['comment-post'])
  }),
  Object.freeze({
    id: 'effect', label: '演出・効果音', order: 11,
    hint: '鳴るはずのものが鳴っているか',
    cellIds: Object.freeze(['gift-effect', 'milestone-effect'])
  }),
  Object.freeze({
    id: 'speed', label: '重さ・黒画面', order: 12,
    hint: '★黒くなる・固まる件はここ。「メインスレッド」が止めている当人を名指しします',
    cellIds: Object.freeze(['main-thread', 'paint', 'scroll-whiteout'])
  }),
  Object.freeze({
    id: 'health', label: '保存・内部の整合', order: 13,
    hint: '記録が保存できているか・画面どうしの同期がずれていないか',
    cellIds: Object.freeze([
      'storage', 'stale', 'console', 'diag-stability', 'mirror-gen-stamp', 'preview-gen-sync'
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
  /** @type {Record<string, any[]>} */
  const bucket = Object.create(null);
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    const gid = groupIdForCell(c.id);
    (bucket[gid] || (bucket[gid] = [])).push(c);
  }
  const defs = [...HEALTH_CELL_GROUPS, FALLBACK_GROUP].sort((a, b) => a.order - b.order);
  const out = [];
  for (const g of defs) {
    const got = bucket[g.id];
    if (!got || got.length === 0) continue; // 空の枠は出さない
    out.push({ id: g.id, label: g.label, hint: g.hint, cells: got });
  }
  return out;
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
