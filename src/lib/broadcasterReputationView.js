import { escapeHtml, escapeAttr } from './htmlEscape.js';

/**
 * 配信者の評判チェック - 表示ビューモデル + アラート HTML (純関数)
 *
 * dns-osint-pro の ReputationAlert.js を追憶用に再構成 (PR R3)。
 * 会議結論 ([[reference_broadcaster_reputation_check_from_dns_osint]] §2 視点2):
 *   - ❌ 営業CTA(リバースハック/LINE/@reph) は持ち込まない (非営利方針)
 *   - ❌ 誹謗中傷サイト(5ch/爆サイ)への誘導リンクは持ち込まない
 *   - 位置づけは「配信者本人の自己診断」。3キャラが結果を案内するだけ。
 *
 * リスクレベル → キャラの出し分け:
 *   safe         → りんく (褒める)
 *   low / medium → こん太 (やさしく助言)
 *   high         → たぬ姉 (深刻として警告)
 *
 * DOM 非依存の HTML 文字列組み立て。innerHTML 代入は呼び出し側(popup/sidepanel)。
 */

const IMG_BASE = 'images/yukkuri-charactore-english';

/** リスクレベル別のキャラ定義 (画像/色/見出しトーン) */
export const REPUTATION_CHARACTERS = {
  safe: {
    name: 'りんく',
    img: `${IMG_BASE}/link/link-yukkuri-smile-mouth-closed.png`,
    color: '#16a34a',
    headline: 'いい感じだよ！変なキーワードは見つからなかったよ✨',
    note: '検索しても、応援してくれる人が安心して見つけてくれそう。'
  },
  low: {
    name: 'こん太',
    img: `${IMG_BASE}/konta/kitsune-yukkuri-normal.png`,
    color: '#ca8a04',
    headline: 'ちょっとだけ気になるキーワードがあったよ',
    note: '今のところ軽いものだけど、気になるなら中身を見てみてね。'
  },
  medium: {
    name: 'こん太',
    img: `${IMG_BASE}/konta/kitsune-yukkuri-normal.png`,
    color: '#ea580c',
    headline: 'ネガティブなキーワードが見つかったよ',
    note: 'どんな文脈で出ているか、一度確認しておくと安心だよ。'
  },
  high: {
    name: 'たぬ姉',
    img: `${IMG_BASE}/tanunee/tanuki-yukkuri-normal-mouth-closed.png`,
    color: '#dc2626',
    headline: '強めのネガティブキーワードが見つかったわ',
    note: '内容をよく確認してね。事実無根なら落ち着いて対処を。'
  }
};

/** @type {Record<string, number>} */
const LEVEL_RANK = { high: 3, medium: 2, low: 1 };

/**
 * @typedef {Object} ReputationCharacter
 * @property {string} name
 * @property {string} img
 * @property {string} color
 * @property {string} headline
 * @property {string} note
 */

/**
 * リスクレベルから案内キャラを解決する。未知は safe(りんく)。
 * @param {unknown} level
 * @returns {ReputationCharacter}
 */
export function resolveReputationCharacter(level) {
  if (level === 'high' || level === 'medium' || level === 'low' || level === 'safe') {
    return REPUTATION_CHARACTERS[level];
  }
  return REPUTATION_CHARACTERS.safe;
}

/**
 * 解析済みサジェスト配列から表示ビューモデルを組み立てる。
 * @param {{ query?: string, analyzed?: Array<{text:string, level:(string|null), keyword?:(string|null)}> }} input
 * @returns {{
 *   query: string,
 *   overall: ('safe'|'low'|'medium'|'high'),
 *   character: ReputationCharacter,
 *   hits: Array<{text:string, level:string, keyword:(string|null)}>,
 *   total: number,
 *   negativeCount: number
 * }}
 */
export function buildReputationViewModel(input) {
  const query = String(input?.query ?? '');
  const analyzed = Array.isArray(input?.analyzed) ? input.analyzed : [];

  const hits = analyzed
    .filter((s) => s && (s.level === 'high' || s.level === 'medium' || s.level === 'low'))
    .map((s) => ({ text: String(s.text ?? ''), level: String(s.level), keyword: s.keyword ?? null }))
    .sort((a, b) => (LEVEL_RANK[b.level] || 0) - (LEVEL_RANK[a.level] || 0));

  /** @type {'safe'|'low'|'medium'|'high'} */
  let overall = 'safe';
  if (hits.some((h) => h.level === 'high')) overall = 'high';
  else if (hits.some((h) => h.level === 'medium')) overall = 'medium';
  else if (hits.some((h) => h.level === 'low')) overall = 'low';

  return {
    query,
    overall,
    character: resolveReputationCharacter(overall),
    hits,
    total: analyzed.length,
    negativeCount: hits.length
  };
}

/**
 * ビューモデルからアラート HTML を組み立てる。全ユーザー入力はエスケープ。
 * @param {ReturnType<typeof buildReputationViewModel>|null|undefined} vm
 * @returns {string}
 */
export function buildReputationAlertHtml(vm) {
  if (!vm || typeof vm !== 'object') return '';
  /** @type {ReputationCharacter} */
  const c = vm.character || REPUTATION_CHARACTERS.safe;
  const queryHtml = escapeHtml(String(vm.query ?? ''));

  const hitsHtml =
    Array.isArray(vm.hits) && vm.hits.length > 0
      ? `<ul class="nl-reputation__hits">` +
        vm.hits
          .map(
            (h) =>
              `<li class="nl-reputation__hit nl-reputation__hit--${escapeAttr(h.level)}">` +
              `${escapeHtml(h.text)}` +
              `</li>`
          )
          .join('') +
        `</ul>`
      : '';

  return (
    `<div class="nl-reputation nl-reputation--${escapeAttr(vm.overall || 'safe')}" ` +
    `style="border-left:4px solid ${escapeAttr(c.color)};">` +
    `<div class="nl-reputation__head">` +
    `<img class="nl-reputation__avatar" alt="" src="${escapeAttr(c.img)}">` +
    `<div class="nl-reputation__headtext">` +
    `<strong class="nl-reputation__name" style="color:${escapeAttr(c.color)};">${escapeHtml(c.name)}</strong>` +
    `<span class="nl-reputation__headline">${escapeHtml(c.headline)}</span>` +
    `</div>` +
    `</div>` +
    `<div class="nl-reputation__query">「${queryHtml}」の検索サジェスト</div>` +
    hitsHtml +
    `<div class="nl-reputation__note">${escapeHtml(c.note)}</div>` +
    `</div>`
  );
}
