/**
 * ニコ生 watch ページのギフト周り UI から、イベント累計・番組累計（DOM 表記）・
 * イベント参加中の「現在 N 位」を innerText から抽出する（MAIN world 用）。
 * 貢献度ランキングの行は除外する（ユーザー要望）。
 */

/**
 * @param {string} raw
 * @returns {number|null}
 */
export function parseJpIntToken(raw) {
  const normalized = String(raw || '')
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 48))
    .replace(/[,，]/g, '')
    .trim();
  if (!normalized) return null;
  const n = parseInt(normalized, 10);
  return Number.isFinite(n) && n >= 0 && n <= 2_000_000_000 ? n : null;
}

/**
 * イベント・番組のラベル直後に改行だけがある場合、旧 `[^\d\n]*?` では数値に届かない。
 * ラベルから最大 gap 文字までの間で最初の数値塊を拾う。
 *
 * @param {string} text
 * @param {RegExp} labelRe キャプチャグループ1が数値
 * @returns {number|null}
 */
function matchScoreAfterLabel(text, labelRe) {
  const m = text.match(labelRe);
  if (!m || !m[1]) return null;
  return parseJpIntToken(m[1]);
}

/**
 * @param {string} text document.body.innerText 相当（複数チャンク結合可）
 * @returns {{ eventScore: number|null, programPoints: number|null }}
 */
export function parseNicoGiftHudScoresFromInnerText(text) {
  const t = String(text || '');

  /** @type {RegExp[]} */
  const eventLabelRes = [
    /イベント累計スコア\s*[:：]\s*💎\s*([0-9,，０-９]{1,16})/u,
    /イベント累計スコア\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})/u,
    /イベント累計\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})/u,
    /イベントスコア\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})/u,
    /累計イベント(?:スコア)?\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})/u,
    /イベント\s*累計\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})/u
  ];

  let eventScore = null;
  for (const re of eventLabelRes) {
    const n = matchScoreAfterLabel(t, re);
    if (n != null) {
      eventScore = n;
      break;
    }
  }

  /** @type {RegExp[]} */
  const programLabelRes = [
    /番組累計ポイント\s*[:：]\s*💎\s*([0-9,，０-９]{1,16})/iu,
    /番組累計ポイント\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})(?:\s*pt)?/iu,
    /番組累計\s*[:：]?\s*[\s\S]{0,420}?([0-9,，０-９]{1,16})(?:\s*pt)?/iu
  ];

  let programPoints = null;
  for (const re of programLabelRes) {
    const n = matchScoreAfterLabel(t, re);
    if (n != null) {
      programPoints = n;
      break;
    }
  }

  return { eventScore, programPoints };
}

/**
 * 「現在 21 位」形式。貢献度ブロック直後のものだけ弾く（イベント / ギフト文脈でない
 * 近傍の「現在 N 位」は貢献度ランキングとみなす）。
 *
 * @param {string} windowBefore
 * @returns {boolean}
 */
function isContribOnlyRankWindow(windowBefore) {
  const contribRel = windowBefore.lastIndexOf('貢献度');
  if (contribRel === -1) return false;
  const afterContrib = windowBefore.slice(contribRel);
  return !afterContrib.includes('イベント') && !afterContrib.includes('ギフト');
}

/**
 * @param {string} text
 * @returns {number|null}
 */
export function parseNicoEventRankFromInnerText(text) {
  const raw = String(text || '');
  const t = raw.replace(/\s+/g, ' ');
  const re = /現在\s*(\d{1,6})\s*位/g;
  let m;
  /** @type {number|null} */
  let best = null;
  while ((m = re.exec(t)) !== null) {
    const idx = m.index;
    const winStart = Math.max(0, idx - 220);
    const windowBefore = t.slice(winStart, idx);
    if (isContribOnlyRankWindow(windowBefore)) continue;
    const n = parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 999_999) best = n;
  }

  if (best != null) return best;

  const altRe = /現在(?:の)?順位\s*[:：]?\s*(\d{1,6})\s*位/;
  const alt = altRe.exec(t);
  if (alt) {
    const idx = alt.index;
    const winStart = Math.max(0, idx - 220);
    const windowBefore = t.slice(winStart, idx);
    if (isContribOnlyRankWindow(windowBefore)) return null;
    const n = parseInt(alt[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 999_999) return n;
  }

  /** イベント参加カード付近（さんが参加 / 参加しています）の順位（現在が離れた配置でも拾う） */
  const partRel = /さんが参加|参加しています/;
  const pm = partRel.exec(raw);
  if (pm) {
    const slice = raw.slice(pm.index, pm.index + 1400);
    const relaxed = slice.replace(/\s+/g, ' ');
    const rm = relaxed.match(/現在[\s\S]{0,160}?(\d{1,6})[\s\S]{0,48}?位/);
    if (rm) {
      const n = parseInt(rm[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 999_999) return n;
    }
  }

  return null;
}

/**
 * 「〇〇さんが参加」「『タイトル』」付近からイベント名を拾う（最大 100 字）。
 *
 * @param {string} text
 * @returns {string|null}
 */
export function parseNicoEventTitleFromInnerText(text) {
  const raw = String(text || '');
  const t = raw.replace(/\s+/g, ' ');
  const rel = /さんが参加|参加しています/;
  const hit = rel.exec(t);
  if (!hit) return null;
  const before = t.slice(Math.max(0, hit.index - 520), hit.index);
  const jaQuote = before.match(/「([^」]{4,100})」/);
  if (jaQuote) {
    const s = String(jaQuote[1] || '').trim();
    if (s.length >= 4) return s.slice(0, 100);
  }
  const altQuote = before.match(/『([^』]{4,100})』/);
  if (altQuote) {
    const s = String(altQuote[1] || '').trim();
    if (s.length >= 4) return s.slice(0, 100);
  }
  /** （）で囲まれたイベント名の二次フォールバック */
  const paren = before.match(/\(([^)]{6,100})\)\s*$/);
  if (paren) {
    const s = String(paren[1] || '').trim();
    if (s.length >= 6 && /イベント|ギフト|争奪|大会|月/.test(s)) {
      return s.slice(0, 100);
    }
  }
  return null;
}

/**
 * @param {string} text
 * @returns {{ eventScore: number|null, programPoints: number|null, eventRank: number|null, eventTitle: string|null }}
 */
export function parseNicoGiftHudFromInnerText(text) {
  const { eventScore, programPoints } = parseNicoGiftHudScoresFromInnerText(text);
  const eventRank = parseNicoEventRankFromInnerText(text);
  const eventTitle = parseNicoEventTitleFromInnerText(text);
  return { eventScore, programPoints, eventRank, eventTitle };
}

/**
 * script/style を除いた HTML 断片をテキストに近づけてからスコア抽出する。
 *
 * @param {string} html
 * @returns {string}
 */
export function htmlToGiftHudPlainText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 視聴ページ fetch HTML（CSR でも断片に載る場合がある）からギフト HUD を補助抽出する。
 *
 * @param {string} html
 * @returns {{ eventScore: number|null, programPoints: number|null, eventRank: number|null, eventTitle: string|null }}
 */
export function parseNicoGiftHudFromPageHtml(html) {
  const h = String(html || '').slice(0, 2_000_000);
  const plain = htmlToGiftHudPlainText(h);
  const inner = parseNicoGiftHudFromInnerText(plain);
  let eventRank = inner.eventRank;
  let eventScore = inner.eventScore;
  let programPoints = inner.programPoints;
  let eventTitle = inner.eventTitle;
  if (eventRank == null) {
    const rm = h.match(
      /現在(?:[^0-9]|<[^>]+>){0,320}?(\d{1,6})(?:[^0-9]|<[^>]+>){0,72}?位/
    );
    if (rm) {
      const n = parseInt(rm[1], 10);
      if (Number.isFinite(n) && n >= 1 && n <= 999_999) eventRank = n;
    }
  }
  if (eventScore == null) {
    const mDiamond = h.match(
      /イベント累計スコア[^0-9]{0,300}?💎[^0-9]{0,100}?([0-9,，]{1,16})/i
    );
    if (mDiamond?.[1]) {
      const n = parseJpIntToken(mDiamond[1]);
      if (n != null) eventScore = n;
    }
    if (eventScore == null) {
      const mPlain = h.match(
        /イベント累計スコア[^0-9]{0,200}?([0-9,，]{1,16})/i
      );
      if (mPlain?.[1]) {
        const n = parseJpIntToken(mPlain[1]);
        if (n != null) eventScore = n;
      }
    }
  }
  if (programPoints == null) {
    const pp = h.match(/番組累計ポイント[^0-9]{0,180}?([0-9,，]{1,16})\s*pt/i);
    if (pp?.[1]) {
      const n = parseJpIntToken(pp[1]);
      if (n != null) programPoints = n;
    }
  }
  if (eventTitle == null) {
    const et = h.match(
      /「([^」]{4,100})」[^」]{0,120}?(?:さんが参加|参加しています)/
    );
    if (et?.[1]) {
      const s = String(et[1]).trim();
      if (s.length >= 4) eventTitle = s.slice(0, 100);
    }
  }
  return {
    eventScore,
    programPoints,
    eventRank,
    eventTitle
  };
}
