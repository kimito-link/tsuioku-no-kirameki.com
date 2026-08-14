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
    id: 'comment',
    label: 'コメント記録',
    hint: 'コメントが取れているか・公式と一致しているか',
    order: 1,
    cellIds: Object.freeze(['capture-rate', 'match', 'ndgr-chats', 'ndgr', 'ingest', 'backfill', 'backfill-bottleneck'])
  }),
  Object.freeze({
    id: 'identity',
    label: '人の識別（ID・サムネ・名前の紐づけ）',
    hint: '誰が言ったかを結びつけられているか。匿名は仕様上ここに出ません',
    order: 2,
    cellIds: Object.freeze(['uid-rate', 'avatar', 'venue-yukkuri-face'])
  }),
  Object.freeze({
    id: 'lane',
    label: '応援レーン・会場の見た目',
    hint: '誰が並ぶか・何人出るか・描画が追いついているか',
    order: 3,
    cellIds: Object.freeze([
      'lane-count', 'lane-paint', 'venue-parity', 'venue-seats', 'venue-seats-visible', 'venue-broadcaster'
    ])
  }),
  Object.freeze({
    id: 'external',
    label: '公式の数字（ギフト・広告・イベント）',
    hint: 'ニコ生公式から取ってくる値。取得中は薄く出ます',
    order: 4,
    cellIds: Object.freeze([
      'gift-ad-pipeline',
      'ns-contrib', 'ns-ad', 'ns-gift-hist', 'ns-escore', 'ns-prog-pt', 'ns-erank'
    ])
  }),
  Object.freeze({
    id: 'venue',
    label: '会場モード',
    hint: '★会場は①ポップアップが書いた情報を映します。古いとここに出ます',
    order: 4.5,
    cellIds: Object.freeze(['venue-mode'])
  }),
  Object.freeze({
    id: 'voice',
    label: '読み上げ（声と吹き出しの一致）',
    hint: '★声と画面表示が同じタイミングか。個別の速さでなく「揃っているか」を見ます',
    order: 5,
    cellIds: Object.freeze(['voice-bubble-parity', 'voice-timing', 'voice-coverage'])
  }),
  Object.freeze({
    id: 'post',
    label: 'コメント送信',
    hint: '自分が送ったコメントが届いて画面に出たか',
    order: 6,
    cellIds: Object.freeze(['comment-post'])
  }),
  Object.freeze({
    id: 'effect',
    label: '演出・効果音',
    hint: '鳴るはずのものが鳴っているか',
    order: 7,
    cellIds: Object.freeze(['gift-effect', 'milestone-effect'])
  }),
  Object.freeze({
    id: 'health',
    label: '動作の健全性（重さ・描画・保存）',
    hint: '固まる・白くなる・保存できない等の土台。★黒くなる件はここの「メインスレッド」を見ます',
    order: 8,
    cellIds: Object.freeze([
      'main-thread',
      'paint', 'stale', 'console', 'scroll-whiteout', 'diag-stability',
      'storage', 'mirror-gen-stamp', 'preview-gen-sync'
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
