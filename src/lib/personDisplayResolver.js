/**
 * v0.1.2268: ニコ生以外のサービス(YouTube・Twitch・Kick・TwitCasting・SHOWROOM …)の人物タイルに、
 *   内部の疑似ID(8 から始まる 10 桁・ニコ生版の画面に合わせるための写し)と ニコニコのユーザーページ URL を出さないための
 *   「表示の決め手」差し込み口。
 *
 * ・登録が無いとき(=ニコ生の画面)は何も変えない: 呼ぶ側は今までの経路そのまま(バイト同一)。
 * ・登録は ytNicoShim(ニコ生以外の画面を動かす入口)が初期化時に 1 回だけ行う。
 * ・同期の純関数だけ。ネットワーク・タイマー・監視は持たない。
 */

/**
 * @typedef {{ title: string, href: string, idLine: string, nameLine: string }} PersonDisplay
 * @typedef {(uid: string, ctx: { title: string, idLine: string, nameLine: string }) => PersonDisplay | null} PersonDisplayResolver
 */

/** @type {PersonDisplayResolver | null} */
let resolver = null;

/** @param {PersonDisplayResolver | null} fn */
export function setPersonDisplayResolver(fn) {
  resolver = typeof fn === 'function' ? fn : null;
}

/** @returns {PersonDisplayResolver | null} 登録中の決め手(テストが付け外しのあと戻すため) */
export function getPersonDisplayResolver() {
  return resolver;
}

/**
 * 登録された決め手があり、かつその人が「内部ID の人」なら表示を返す。それ以外は null(=今までどおり)。
 * @param {unknown} uid
 * @param {{ title?: unknown, idLine?: unknown, nameLine?: unknown }} [ctx]
 * @returns {PersonDisplay | null}
 */
export function resolvePersonDisplay(uid, ctx) {
  if (!resolver) return null;
  const u = String(uid || '').trim();
  if (!u) return null;
  try {
    const c = ctx || {};
    return resolver(u, { title: String(c.title ?? ''), idLine: String(c.idLine ?? ''), nameLine: String(c.nameLine ?? '') }) || null;
  } catch {
    return null; // 決め手の失敗で描画を止めない
  }
}

/** 内部の疑似ID(8 + 9 桁) */
export const INTERNAL_UID_RE = /(?<!\d)8\d{9}(?!\d)/g;

/**
 * 文字の中の内部の疑似ID を、出してよい公開ラベル(@ハンドル等)に置き換える。無ければ取り除く。
 *   「名前（8004919137）」→「名前（@handle）」/ ラベルなしなら「名前」。「名前 | 8004919137」→「名前」(付け足しはしない)。
 * @param {unknown} text
 * @param {string} [label] その人の公開ラベル(分からなければ空)
 */
export function stripInternalNumericId(text, label = '') {
  const l = String(label || '');
  return String(text ?? '')
    .replace(/\s*[|｜]\s*(?<!\d)8\d{9}(?!\d)/g, '')
    .replace(/\s*[（(]\s*(?<!\d)8\d{9}(?!\d)\s*[)）]/g, l ? `（${l}）` : '')
    .replace(/(ID[:：]\s?)?(?<!\d)8\d{9}(?!\d)/g, (_all, idTag) => (l ? `${idTag || ''}${l}` : ''))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** サービスごとに、人のページとして認める https のホスト */
const HOSTS = {
  youtube: ['www.youtube.com', 'youtube.com', 'm.youtube.com'],
  twitch: ['www.twitch.tv', 'twitch.tv'],
  kick: ['kick.com', 'www.kick.com'],
  twitcasting: ['twitcasting.tv', 'www.twitcasting.tv'],
  whowatch: ['whowatch.tv', 'www.whowatch.tv'],
  mixch: ['mixch.tv', 'www.mixch.tv'],
  tiktok: ['www.tiktok.com', 'tiktok.com'],
  abema: ['abema.tv', 'www.abema.tv']
};

/**
 * 人のページ URL として出してよいか。https かつ、そのサービスのホストだけ。
 * javascript: ・ほかのサービス(ニコニコ含む)・資格情報つき URL は通さない。SHOWROOM は人のページを出さない。
 * @param {unknown} url
 * @param {string} platformId 'youtube' | 'twitch' | 'kick' | 'twitcasting' | …
 */
export function isSafeForeignProfileUrl(url, platformId) {
  const s = String(url || '').trim();
  if (!s || platformId === 'showroom') return false;
  const hosts = /** @type {Record<string, string[]>} */ (HOSTS)[platformId];
  if (!hosts) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !u.username && !u.password && hosts.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * 内部ID の人の表示を決める(純関数)。内部の数字は絶対に出さず、後ろへ付け足しもしない。
 * @param {{ uid: string, title?: string, idLine?: string, nameLine?: string, url?: string, publicLabel?: string, platformId?: string }} i
 * @returns {PersonDisplay}
 */
export function foreignPersonDisplay(i) {
  const label = String(i.publicLabel || '');
  const title = stripInternalNumericId(i.title, label).replace(/[（(]\s*[)）]/g, '').trim();
  let nameLine = stripInternalNumericId(i.nameLine, label);
  const rawId = String(i.idLine ?? '');
  let idLine = rawId;
  if (/(?<!\d)8\d{9}(?!\d)/.test(rawId)) {
    // 人物タイルは 1 行目=名前・2 行目=公開ラベル(@ハンドル)。1 行目が内部ID で、名前と公開ラベルが分かるときは入れ替えて出す
    //   (今まで ytNicoShim の画面の直しが後から同じ形にしていたのを、タイルを作る時点で決める)。
    const nm = stripInternalNumericId(i.nameLine, '');
    if (label && nm && nm !== label) {
      idLine = nm;
      nameLine = label;
    } else {
      idLine = stripInternalNumericId(rawId, label).replace(/^ID[:：]\s?/, '');
    }
  }
  const pid = String(i.platformId || '');
  return {
    title: title || nameLine || '名前未取得',
    href: isSafeForeignProfileUrl(i.url, pid) ? String(i.url).trim() : '',
    idLine,
    nameLine
  };
}

/**
 * 会場の席の外側の title。内部ID の人だけ決め手の title にし、それ以外(ニコ生を含む)は渡された名前のまま。
 * @param {unknown} uid
 * @param {string} name
 */
export function seatTitleFor(uid, name) {
  const d = resolvePersonDisplay(uid, { title: name, idLine: '', nameLine: '' });
  return d ? d.title : name;
}

/**
 * 会場の席をリンク扱い(nlsb-seat-link)にするか。内部ID の人は「出してよい人のページがあるか」、
 * それ以外(ニコ生を含む)は渡された今までの判定のまま。
 * @param {unknown} uid
 * @param {boolean} legacyLink
 */
export function seatLinkFor(uid, legacyLink) {
  const d = resolvePersonDisplay(uid, { title: '', idLine: '', nameLine: '' });
  return d ? d.href !== '' : legacyLink;
}
