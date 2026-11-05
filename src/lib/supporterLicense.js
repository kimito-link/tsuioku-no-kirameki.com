/**
 * 【層】L0 判定層(純粋関数 + WebCrypto の署名確認だけ)
 * 【この箱に入るもの】サポーター(有料)の「権利の証明書」の形・署名の確認・マーケ HTML を開けるかの判定
 * 【この箱に入らないもの】決済会社(Stripe)との通信・証明書の発行(秘密鍵)・保存(chrome.storage / Redis)
 *
 * ★なぜ(v0.1.1893・課金 第2段 / 設計書 https://claude.ai/artifact/QeyGHyBALbVdn4bERUFhN4):
 *   有料はマーケ HTML だけ(2026-11-05 りんく)。マーケ HTML は PC の中だけで動くので、サーバーが署名した
 *   証明書を拡張が手元で確かめる。「100年後も安心」の約束:
 *   - 署名は Ed25519(公開鍵だけ拡張に入れる=中身を読まれても偽の証明書は作れない)。
 *   - 鍵には番号(kid)を付ける。鍵を替えても古い番号の公開鍵を残せば、配った証明書は有効なまま。
 *   - 確かめられない(この PC の Chrome が Ed25519 を知らない等)ときは「使える側」に倒す。
 *   - 期限が切れても GRACE_MS は使える(サーバーや決済会社が止まっても、払った人を締め出さない)。
 *   - 関所は SUPPORTER_GATE_ENFORCED 1つで開け閉めする(既定は開けたまま=今の利用者に影響なし)。
 * @module supporterLicense
 */

/** 証明書の形の版。形を変えるときは番号を上げ、古い番号も読めるように残す。 */
export const LICENSE_FORMAT_VERSION = 1;

/** 有料の機能の名前(証明書の feat に入る)。今はマーケ HTML だけ。 */
export const FEATURE_MARKETING = 'marketing';

/** 期限切れ後も使える猶予(7日)。 */
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/** お試し期間(拡張を初めて使った日から14日)。 */
export const TRIAL_MS = 14 * 24 * 60 * 60 * 1000;

/** 証明書の有効期間(サーバーが発行するとき。期限の前に拡張が取り直す)。 */
export const LICENSE_TTL_MS = 35 * 24 * 60 * 60 * 1000;

/**
 * 関所を閉めるか。★v0.1.1897(第4段・りんく「ぜんぶやって」2026-11-06)で true にした。
 *   閉めても、初めてマーケ HTML を開いた日から14日はお試しで開ける(今の利用者も同じ)。
 *   サーバー側の止め方は api/billing.js の SUPPORTER_GATE 環境変数ではなく、ここ=拡張の版で決める
 *   (拡張はサーバーに聞かずに判定するので、止めたいときは版を出す。緊急時は公開鍵を外さずに false の版を出す)。
 */
export const SUPPORTER_GATE_ENFORCED = true;

/**
 * 拡張に入れる公開鍵(kid → JWK の x)。★秘密鍵は Vercel の環境変数 LICENSE_SIGNING_JWK だけに置く。
 *   鍵を替えるときは新しい kid を足し、古い kid は消さない(配った証明書が切れるまで=最低 LICENSE_TTL_MS)。
 *   k2026a = 最初の本番の鍵(v0.1.1897・2026-11-06 作成)。秘密鍵は Vercel の LICENSE_SIGNING_JWK にだけある。
 * @type {Readonly<Record<string, string>>}
 */
export const LICENSE_PUBLIC_KEYS = Object.freeze({
  k2026a: '9Gc8DLqkTI0hJLszRwsTPUGQvItGyZeD9yuM8w6T5fI'
});

/** 利用者がコピーして拡張に入れる「サポーターのコード」の形(base64url 32〜64文字)。 */
const SUPPORTER_CODE_RE = /^[A-Za-z0-9_-]{32,64}$/;

/** @param {unknown} s */
export function isValidSupporterCode(s) {
  return typeof s === 'string' && SUPPORTER_CODE_RE.test(s.trim());
}

/**
 * 1つのコードで使える PC の数(v0.1.1896・りんく 2026-11-05「1人1台のみ」)。
 *   記録は配信した PC の中にしか無い=マーケ HTML を作れるのも実質その1台。使い回しだけを止める。
 */
export const MAX_DEVICES_PER_CODE = 1;

/** 「この PC に移す」(登録のやり直し)ができる間隔(30日に1回)。 */
export const DEVICE_RESET_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000;

/** 拡張がこの PC 用に作る印(乱数・base64url 16〜64文字)。端末 ID(30日で消える)とは別物。 */
const DEVICE_ID_RE = /^[A-Za-z0-9_-]{16,64}$/;

/** @param {unknown} s */
export function isValidDeviceId(s) {
  return typeof s === 'string' && DEVICE_ID_RE.test(s);
}

/** 証明書の dev に入れる長さ(sha256 の16進の先頭)。 */
export const DEVICE_TAG_HEX_LEN = 24;

/**
 * PC の印から証明書の dev を作る(サーバーと拡張で同じ値になる)。中身の印そのものは証明書に入れない。
 * @param {string} deviceId
 * @param {SubtleCrypto | null | undefined} [subtle]
 * @returns {Promise<string | null>} 作れない環境では null(=呼び出し側は確かめずに通す)
 */
export async function deviceTagFor(deviceId, subtle = globalThis.crypto?.subtle) {
  if (!subtle || !isValidDeviceId(deviceId)) return null;
  try {
    const buf = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(`dev:${deviceId}`)));
    let hex = '';
    for (const b of buf) hex += b.toString(16).padStart(2, '0');
    return hex.slice(0, DEVICE_TAG_HEX_LEN);
  } catch {
    return null;
  }
}

/** @param {Uint8Array} bytes */
export function bytesToBase64url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} s */
export function base64urlToBytes(s) {
  const b64 = String(s).replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const bin = atob(b64 + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * @typedef {{
 *   v: number,
 *   kid: string,
 *   sub: string,
 *   plan: string,
 *   feat: string[],
 *   iat: number,
 *   exp: number,
 *   dev?: string
 * }} LicensePayload
 */

/**
 * 証明書の中身を取り出す(署名はまだ見ない)。形が違えば null。
 *   ★フィールドが増えても壊れない(知らないものは無視)。必須のものが無い・型が違うときだけ null。
 * @param {unknown} token
 * @returns {{ payload: LicensePayload, body: string, sig: string } | null}
 */
export function parseLicenseToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(parts[0])));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  const p = /** @type {Record<string, any>} */ (payload);
  if (!Number.isInteger(p.v) || p.v < 1) return null;
  if (typeof p.kid !== 'string' || !p.kid) return null;
  if (typeof p.sub !== 'string' || !p.sub) return null;
  if (!Number.isFinite(p.exp) || !Number.isFinite(p.iat)) return null;
  const feat = Array.isArray(p.feat) ? p.feat.filter((f) => typeof f === 'string') : [];
  return {
    payload: {
      v: p.v,
      kid: p.kid,
      sub: p.sub,
      plan: typeof p.plan === 'string' ? p.plan : '',
      feat,
      iat: p.iat,
      exp: p.exp,
      ...(typeof p.dev === 'string' && p.dev ? { dev: p.dev } : {})
    },
    body: parts[0],
    sig: parts[1]
  };
}

/**
 * 証明書の本文を作る(署名はサーバーが付ける)。
 * @param {Omit<LicensePayload, 'v'>} p
 */
export function encodeLicenseBody(p) {
  const payload = { v: LICENSE_FORMAT_VERSION, ...p };
  return bytesToBase64url(new TextEncoder().encode(JSON.stringify(payload)));
}

/**
 * @typedef {'valid' | 'expired_grace' | 'expired' | 'bad_signature' | 'malformed' | 'unknown_key' | 'unverifiable'} LicenseStatus
 */

/**
 * 証明書を確かめる。
 *   - unverifiable = この環境で Ed25519 が使えない等(=呼び出し側は使える側に倒す)
 *   - unknown_key = 知らない鍵番号。★使える側には倒さない(倒すと、でたらめな鍵番号の偽物が通る)。
 *     代わりに運用で守る: 新しい鍵で署名し始めるのは、その公開鍵を入れた拡張の版が出て 30日以上たってから。
 * @param {unknown} token
 * @param {{ nowMs: number, publicKeys?: Readonly<Record<string, string>>, subtle?: SubtleCrypto | null }} opts
 * @returns {Promise<{ status: LicenseStatus, payload: LicensePayload | null }>}
 */
export async function verifyLicenseToken(token, opts) {
  const parsed = parseLicenseToken(token);
  if (!parsed) return { status: 'malformed', payload: null };
  const keys = opts.publicKeys || LICENSE_PUBLIC_KEYS;
  const x = keys[parsed.payload.kid];
  if (!x) return { status: 'unknown_key', payload: parsed.payload };
  const subtle = opts.subtle === undefined ? globalThis.crypto?.subtle : opts.subtle;
  if (!subtle) return { status: 'unverifiable', payload: parsed.payload };
  let ok = false;
  try {
    const key = await subtle.importKey('jwk', { kty: 'OKP', crv: 'Ed25519', x }, { name: 'Ed25519' }, false, ['verify']);
    ok = await subtle.verify(
      { name: 'Ed25519' },
      key,
      base64urlToBytes(parsed.sig),
      new TextEncoder().encode(parsed.body)
    );
  } catch {
    return { status: 'unverifiable', payload: parsed.payload };
  }
  if (!ok) return { status: 'bad_signature', payload: null };
  const { exp } = parsed.payload;
  if (opts.nowMs <= exp) return { status: 'valid', payload: parsed.payload };
  if (opts.nowMs <= exp + GRACE_MS) return { status: 'expired_grace', payload: parsed.payload };
  return { status: 'expired', payload: parsed.payload };
}

/**
 * @typedef {'gate_open' | 'licensed' | 'grace' | 'unverifiable' | 'trial' | 'locked'} AccessReason
 */

/**
 * マーケ HTML を開けるか。
 * @param {{
 *   enforced: boolean,
 *   licenseStatus: LicenseStatus | null,
 *   licenseFeatures?: string[] | null,
 *   firstSeenAtMs: number | null,
 *   nowMs: number,
 *   feature?: string
 * }} input
 * @returns {{ allowed: boolean, reason: AccessReason, trialDaysLeft: number }}
 */
export function decideFeatureAccess(input) {
  const feature = input.feature || FEATURE_MARKETING;
  const trialLeftMs =
    input.firstSeenAtMs != null && Number.isFinite(input.firstSeenAtMs)
      ? Math.max(0, input.firstSeenAtMs + TRIAL_MS - input.nowMs)
      : TRIAL_MS;
  const trialDaysLeft = Math.ceil(trialLeftMs / (24 * 60 * 60 * 1000));
  if (!input.enforced) return { allowed: true, reason: 'gate_open', trialDaysLeft };
  const st = input.licenseStatus;
  const hasFeature = !input.licenseFeatures || input.licenseFeatures.includes(feature);
  if (st === 'valid' && hasFeature) return { allowed: true, reason: 'licensed', trialDaysLeft };
  if (st === 'expired_grace' && hasFeature) return { allowed: true, reason: 'grace', trialDaysLeft };
  if (st === 'unverifiable') return { allowed: true, reason: 'unverifiable', trialDaysLeft };
  if (trialLeftMs > 0) return { allowed: true, reason: 'trial', trialDaysLeft };
  return { allowed: false, reason: 'locked', trialDaysLeft: 0 };
}

/**
 * コメビュ(OBS)の隅の「追憶のきらめき」の印を出すか(v0.1.1894・りんく 2026-11-05)。
 *   無料の人には出し、サポーター(有効・猶予中・確かめられない)には出さない。お試し期間は関係ない。
 *   関所が開いているあいだは誰にも出さない(=今の利用者にある日突然ロゴが出ない)。
 * @param {{ enforced: boolean, licenseStatus: LicenseStatus | null }} input
 */
export function shouldShowCreditBadge(input) {
  if (!input.enforced) return false;
  const st = input.licenseStatus;
  return !(st === 'valid' || st === 'expired_grace' || st === 'unverifiable');
}

/** 期限まで残りがこれ未満なら取り直す(10日)。 */
export const LICENSE_REFRESH_BEFORE_MS = 10 * 24 * 60 * 60 * 1000;

/**
 * 証明書を取り直すべきか(コードを持っていて、期限が近い/切れている/無い)。
 * @param {{ hasCode: boolean, payload: LicensePayload | null, nowMs: number }} p
 */
export function shouldRefreshLicense(p) {
  if (!p.hasCode) return false;
  if (!p.payload) return true;
  return p.payload.exp - p.nowMs < LICENSE_REFRESH_BEFORE_MS;
}
