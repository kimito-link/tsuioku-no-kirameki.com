/**
 * 【層】L1 拡張の画面から呼ぶ部品(chrome.storage と fetch を外から受け取る=試験で差し替えられる)
 * 【この箱に入るもの】サポーターのコード・証明書の保存と取り直し・「マーケ HTML を開けるか」の問い合わせ
 * 【この箱に入らないもの】判定そのもの(supporterLicense.js)・画面の描画(marketing-export-entry.js)
 *
 * ★v0.1.1893(課金 第3段): 関所はまだ開けたまま(SUPPORTER_GATE_ENFORCED=false)。
 *   - お試しの14日は「初めてマーケ HTML を開いた日」から数える(最初の配信でマーケ HTML の良さを丸ごと体験してもらう)。
 *   - サーバーに届かない・Stripe が落ちている → 手元の証明書(期限+7日の猶予)で判定し、止めない。
 *   - 保存キーは nls_supporter_ で始める(YouTube 版の画面とも共有する=ytMergedIsolation が素通しする)。
 * @module supporterAccess
 */

import {
  SUPPORTER_GATE_ENFORCED,
  decideFeatureAccess,
  isValidSupporterCode,
  shouldShowCreditBadge,
  shouldRefreshLicense,
  verifyLicenseToken
} from './supporterLicense.js';

export const KEY_SUPPORTER_CODE = 'nls_supporter_code_v1';
export const KEY_SUPPORTER_LICENSE = 'nls_supporter_license_v1';
export const KEY_SUPPORTER_FIRST_SEEN_AT = 'nls_supporter_first_seen_at_v1';
/** YouTube 版と共有するキーの頭(ytMergedIsolation が「ytm:」を付けずに通す)。 */
export const SUPPORTER_SHARED_KEY_PREFIX = 'nls_supporter_';

export const SUPPORTER_API_BASE = 'https://app.tsuioku-no-kirameki.com/api/billing';
export const SUPPORTER_PAGE_URL = 'https://app.tsuioku-no-kirameki.com/supporter';

/**
 * @typedef {{
 *   get: (keys: string[]) => Promise<Record<string, any>>,
 *   set: (items: Record<string, any>) => Promise<void>,
 *   remove?: (keys: string[]) => Promise<void>
 * }} StorageLike
 */

/**
 * 証明書を取り直す(届かなければ null=手元のものを使い続ける)。
 * @param {string} code
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [opts]
 * @returns {Promise<{ active: boolean, license: string | null } | { unknownCode: true } | null>}
 */
export async function fetchSupporterLicense(code, opts = {}) {
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), opts.timeoutMs ?? 8000) : null;
  try {
    const res = await fetchImpl(`${SUPPORTER_API_BASE}?action=license`, {
      method: 'POST',
      headers: { 'x-supporter-code': code, 'Content-Type': 'application/json' },
      body: '{}',
      signal: ctl?.signal
    });
    if (res.status === 404) return { unknownCode: true };
    if (!res.ok) return null;
    /** @type {any} */
    const j = await res.json().catch(() => /** @type {any} */ (null));
    if (!j || typeof j.active !== 'boolean') return null;
    return { active: j.active, license: typeof j.license === 'string' ? j.license : null };
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * マーケ HTML を開けるか(必要なら初めての日を記録し、証明書を取り直す)。
 * @param {{
 *   storage: StorageLike,
 *   nowMs?: number,
 *   enforced?: boolean,
 *   fetchImpl?: typeof fetch,
 *   publicKeys?: Readonly<Record<string, string>>
 * }} deps
 */
export async function checkMarketingAccess(deps) {
  const nowMs = deps.nowMs ?? Date.now();
  const enforced = deps.enforced ?? SUPPORTER_GATE_ENFORCED;
  /** @type {Record<string, any>} */
  let bag = {};
  try {
    bag = (await deps.storage.get([KEY_SUPPORTER_CODE, KEY_SUPPORTER_LICENSE, KEY_SUPPORTER_FIRST_SEEN_AT])) || {};
  } catch {
    bag = {};
  }
  let firstSeenAtMs = Number.isFinite(bag[KEY_SUPPORTER_FIRST_SEEN_AT]) ? bag[KEY_SUPPORTER_FIRST_SEEN_AT] : null;
  if (firstSeenAtMs == null) {
    firstSeenAtMs = nowMs;
    try {
      await deps.storage.set({ [KEY_SUPPORTER_FIRST_SEEN_AT]: nowMs });
    } catch {
      /* 記録できなくても判定は続ける */
    }
  }
  const code = typeof bag[KEY_SUPPORTER_CODE] === 'string' ? bag[KEY_SUPPORTER_CODE] : '';
  let license = typeof bag[KEY_SUPPORTER_LICENSE] === 'string' ? bag[KEY_SUPPORTER_LICENSE] : '';
  let v = license ? await verifyLicenseToken(license, { nowMs, publicKeys: deps.publicKeys }) : null;
  const hasCode = isValidSupporterCode(code);
  if (shouldRefreshLicense({ hasCode, payload: v && v.status !== 'bad_signature' ? v.payload : null, nowMs })) {
    const got = await fetchSupporterLicense(code, { fetchImpl: deps.fetchImpl });
    if (got && 'active' in got) {
      license = got.license || '';
      try {
        if (license) await deps.storage.set({ [KEY_SUPPORTER_LICENSE]: license });
        else if (deps.storage.remove) await deps.storage.remove([KEY_SUPPORTER_LICENSE]);
      } catch {
        /* 保存できなくても今回の判定には使う */
      }
      v = license ? await verifyLicenseToken(license, { nowMs, publicKeys: deps.publicKeys }) : null;
    }
  }
  const decision = decideFeatureAccess({
    enforced,
    licenseStatus: v ? v.status : null,
    licenseFeatures: v?.payload?.feat ?? null,
    firstSeenAtMs,
    nowMs
  });
  return { ...decision, hasCode };
}

/**
 * コメビュの隅の「追憶のきらめき」の印を出すか(手元の証明書だけで決める=配信中に通信しない)。
 *   ★判定に失敗したら出さない側(配信画面に勝手にロゴが出るほうが困る)。
 * @param {{ storage: StorageLike, nowMs?: number, enforced?: boolean, publicKeys?: Readonly<Record<string, string>> }} deps
 */
export async function checkCreditBadge(deps) {
  const enforced = deps.enforced ?? SUPPORTER_GATE_ENFORCED;
  if (!enforced) return false;
  try {
    const bag = (await deps.storage.get([KEY_SUPPORTER_LICENSE])) || {};
    const license = typeof bag[KEY_SUPPORTER_LICENSE] === 'string' ? bag[KEY_SUPPORTER_LICENSE] : '';
    const v = license
      ? await verifyLicenseToken(license, { nowMs: deps.nowMs ?? Date.now(), publicKeys: deps.publicKeys })
      : null;
    return shouldShowCreditBadge({ enforced, licenseStatus: v ? v.status : null });
  } catch {
    return false;
  }
}

/**
 * 利用者が入れたコードを保存し、すぐ証明書を取りに行く。
 * @param {{ storage: StorageLike, code: string, fetchImpl?: typeof fetch }} p
 * @returns {Promise<'ok' | 'inactive' | 'unknown' | 'bad_format' | 'offline'>}
 */
export async function saveSupporterCode(p) {
  const code = String(p.code || '').trim();
  if (!isValidSupporterCode(code)) return 'bad_format';
  const got = await fetchSupporterLicense(code, { fetchImpl: p.fetchImpl });
  if (got && 'unknownCode' in got) return 'unknown';
  const lic = got && 'license' in got ? got.license : null;
  await p.storage.set({ [KEY_SUPPORTER_CODE]: code, ...(lic ? { [KEY_SUPPORTER_LICENSE]: lic } : {}) });
  if (!got || !('active' in got)) return 'offline';
  return got.active ? 'ok' : 'inactive';
}
