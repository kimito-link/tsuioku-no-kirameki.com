#!/usr/bin/env node
/**
 * check-no-personal-contact.mjs — 審査の連絡先(氏名・電話・メール)が repo に入っていないことを機械で守る。
 *
 * ★なぜ要るか(2026-11-10 の点検で発見)
 *   mobile/app.config.json の contact に、App Store 審査用の個人の氏名とメールが入ったまま
 *   公開リポジトリに載っていた。キットの雛形が「ここに書く」形だったので、誰が写しても同じことが起きる。
 *   「書かないでください」という文書では守れない。判定をコードに置く。
 *
 * ■ 判定(fail-closed)
 *   mobile/app.config.json の contact.firstName / lastName / phoneE164 / email は
 *   null・空・"<...>" の未記入のいずれかであること。値は GitHub Secrets から渡す:
 *     IOS_REVIEW_CONTACT_FIRST_NAME / IOS_REVIEW_CONTACT_LAST_NAME /
 *     IOS_REVIEW_CONTACT_PHONE / IOS_REVIEW_CONTACT_EMAIL / PLAY_CONTACT_EMAIL
 *   ファイルが読めない・JSON が壊れているときも赤(測れなかったを合格にしない)。
 *
 * 使い方:
 *   node scripts/check-no-personal-contact.mjs            # 検査
 *   node scripts/check-no-personal-contact.mjs --selftest # 毒で赤が出るか自分で確かめる
 *
 * 終了コード: 0=合格 / 1=赤
 */

import fs from 'node:fs';
import path from 'node:path';
import { runSelfTest } from './lib/instrument-core.mjs';

const SELFTEST = process.argv.includes('--selftest');
const CONFIG_REL = 'mobile/app.config.json';
export const PERSONAL_KEYS = ['firstName', 'lastName', 'phoneE164', 'email'];

/** 未記入とみなす値か(null / 空 / "<...>")。 */
function isEmpty(v) {
  if (v == null) return true;
  const s = String(v).trim();
  return s === '' || (s.startsWith('<') && s.endsWith('>'));
}

/**
 * 純ロジック: app.config.json の本文から問題を列挙する。
 * ★値そのものは出力しない(検査のログに個人情報を写さない)。
 * @param {string|null} jsonText
 * @returns {string[]} 問題(0件=合格)
 */
export function judgePersonalContact(jsonText) {
  if (jsonText == null) return [`${CONFIG_REL} が読めません(測れなかった=合格にしない)`];
  let cfg;
  try {
    cfg = JSON.parse(jsonText);
  } catch {
    return [`${CONFIG_REL} が JSON として読めません`];
  }
  const contact = cfg && typeof cfg === 'object' ? cfg.contact : null;
  if (contact == null || typeof contact !== 'object') return [];
  return PERSONAL_KEYS.filter((k) => !isEmpty(contact[k])).map(
    (k) => `contact.${k} に値が入っています(repo に置かず GitHub Secrets から渡す)`
  );
}

if (SELFTEST) {
  const good = JSON.stringify({ contact: { email: null, firstName: null, lastName: '', phoneE164: '<E.164>', supportUrl: 'https://example.com/' } });
  const withName = JSON.stringify({ contact: { firstName: 'Taro', lastName: 'Yamada' } });
  const withMail = JSON.stringify({ contact: { email: 'someone@example.com' } });
  const noop = () => {};
  const { ok, fails } = runSelfTest([
    { name: '氏名が入っていたら赤', poison: noop, restore: noop, isRed: () => judgePersonalContact(withName).length === 2 },
    { name: 'メールが入っていたら赤', poison: noop, restore: noop, isRed: () => judgePersonalContact(withMail).length === 1 },
    { name: '壊れた JSON は赤', poison: noop, restore: noop, isRed: () => judgePersonalContact('{').length > 0 },
    { name: '読めないときは赤', poison: noop, restore: noop, isRed: () => judgePersonalContact(null).length > 0 },
    { name: '★問題の文に値を写さない', poison: noop, restore: noop, isRed: () => !judgePersonalContact(withName).join('\n').includes('Yamada') },
    { name: '★未記入と URL だけなら赤にしない(誤検出よけ)', poison: noop, restore: noop, isRed: () => judgePersonalContact(good).length === 0 }
  ]);
  if (!ok) {
    console.error('[check-no-personal-contact] selftest FAILED');
    for (const f of fails) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log('[check-no-personal-contact] selftest OK(毒6ケース)');
  process.exit(0);
}

const root = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.cwd();
const file = path.join(root, CONFIG_REL);
const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
const problems = judgePersonalContact(text);
if (problems.length > 0) {
  console.error(`[check-no-personal-contact] 🔴 ${problems.length} 件`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('  → 直し方: 値を null にし、GitHub Secrets(IOS_REVIEW_CONTACT_* / PLAY_CONTACT_EMAIL)に入れる。');
  process.exit(1);
}
console.log(`[check-no-personal-contact] OK(${CONFIG_REL} の contact に氏名・電話・メールなし)`);
process.exit(0);
