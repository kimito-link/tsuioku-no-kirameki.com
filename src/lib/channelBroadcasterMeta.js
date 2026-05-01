/**
 * 公式チャンネル放送（運営・業者）の broadcaster メタを embedded-data から
 * 抽出する純粋関数。
 *
 * 設計（0.1.40 V）:
 *   ユーザー報告（lv350162154 / にじさんじオフィシャル）。公式チャンネル
 *   放送では embedded-data の構造が一般ユーザー放送と異なる:
 *
 *     - `program.supplier.name` は「提供会社名」（"株式会社ドワンゴ"）で、
 *       画面で見える本来の配信者名（チャンネル名）ではない
 *     - `program.supplier.pageUrl` は無い
 *     - 真の配信者名/URL/アイコンは `socialGroup.*` 側にある:
 *       - socialGroup.name = 'にじさんじオフィシャル ニコニコチャンネル'
 *       - socialGroup.socialGroupPageUrl = 'https://ch.nicovideo.jp/channel/ch...'
 *       - socialGroup.thumbnailImageUrl = 'https://...ch{id}.jpg'
 *
 *   既存の `collectWatchPageSnapshot` は supplier 側だけ見ていたため、
 *   broadcasterPageUrl が空になり popup 配信者タイルが kind=none で
 *   消えていた。
 *
 *   このヘルパは「チャンネル放送かどうか」を 3 経路（supplier.supplierType,
 *   program.providerType, socialGroup.type）で判定し、socialGroup から
 *   name / URL / icon を抽出して返す。
 *
 *   返却が `kind === 'channel'` なら snapshot にそのまま流し込み、
 *   `resolveBroadcasterFollowTarget` が ch.nicovideo.jp 経路で kind=channel
 *   タイルを描画する。
 */

/**
 * @typedef {{
 *   kind: 'channel' | 'none',
 *   name: string,
 *   pageUrl: string,
 *   iconUrl: string
 * }} ChannelBroadcasterMeta
 */

const NONE_RESULT = Object.freeze({
  kind: /** @type {const} */ ('none'),
  name: '',
  pageUrl: '',
  iconUrl: ''
});

/**
 * @param {unknown} v
 * @returns {string}
 */
function asTrimmedString(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {string} url
 * @returns {boolean}
 */
function isHttpUrl(url) {
  return /^https?:\/\//i.test(url);
}

/**
 * @param {Record<string, any>|null|undefined} embeddedProps
 * @returns {ChannelBroadcasterMeta}
 */
export function resolveChannelBroadcasterMeta(embeddedProps) {
  if (!embeddedProps || typeof embeddedProps !== 'object') {
    return { ...NONE_RESULT };
  }

  const program = embeddedProps.program ?? null;
  const supplier = program?.supplier ?? null;
  const socialGroup = embeddedProps.socialGroup ?? null;

  // チャンネル判定: 3 経路のいずれかで "channel"
  const supplierType = asTrimmedString(supplier?.supplierType);
  const providerType = asTrimmedString(program?.providerType);
  const sgType = asTrimmedString(socialGroup?.type);
  const isChannel =
    supplierType === 'channel' ||
    providerType === 'channel' ||
    sgType === 'channel';
  if (!isChannel) return { ...NONE_RESULT };

  if (!socialGroup || typeof socialGroup !== 'object') {
    return { ...NONE_RESULT };
  }

  // name: socialGroup.name（"にじさんじオフィシャル ニコニコチャンネル" 等）
  const name = asTrimmedString(socialGroup.name);
  if (!name) return { ...NONE_RESULT };

  // pageUrl: socialGroupPageUrl 優先 → id (ch1234) から組み立て fallback
  let pageUrl = asTrimmedString(socialGroup.socialGroupPageUrl);
  if (!isHttpUrl(pageUrl)) {
    const sgId = asTrimmedString(socialGroup.id);
    if (/^ch\d+$/.test(sgId)) {
      pageUrl = `https://ch.nicovideo.jp/channel/${sgId}`;
    } else {
      pageUrl = '';
    }
  }

  // iconUrl: thumbnailImageUrl > thumbnailSmallImageUrl > thumbnailUrl > thumbnailSmallUrl
  // （新フィールド優先、旧フィールドも後方互換で読む）
  let iconUrl = '';
  for (const key of [
    'thumbnailImageUrl',
    'thumbnailSmallImageUrl',
    'thumbnailUrl',
    'thumbnailSmallUrl'
  ]) {
    const v = asTrimmedString(socialGroup[key]);
    if (isHttpUrl(v)) {
      iconUrl = v;
      break;
    }
  }

  return { kind: 'channel', name, pageUrl, iconUrl };
}
