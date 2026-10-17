#!/usr/bin/env node
/**
 * make-dead-selector-baseline.mjs — 静的デッドセレクタ監査(static-dead-selectors.mjs)の基準値(dead-selector-baseline.json)を作る/更新する。
 *
 * 基準値は「いまある負債」の記録で、下げる方向にしか動かさない(ラチェット)。
 *   ・node scripts/audit/make-dead-selector-baseline.mjs           … 基準値を【現状の実測で書き直す】。新しいデッドが増えていても書けてしまうので、
 *                                                                    増えた場合は --allow-increase "理由" が必須(理由は基準値ファイルに残る)。
 *   ・node scripts/audit/make-dead-selector-baseline.mjs --check   … 書かずに差分だけ表示する。
 * 検査本体は src/lib/deadSelectorRatchet.test.js(CI の vitest)。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runAudit } from './static-dead-selectors.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const BASELINE = path.join(here, 'dead-selector-baseline.json');
const argv = process.argv.slice(2);
const allowIdx = argv.indexOf('--allow-increase');
const allowReason = allowIdx >= 0 ? String(argv[allowIdx + 1] || '').trim() : '';

const res = runAudit();
/** @type {Record<string, { cssRuleCount: number, jsFileCount: number, dead: Record<string, string> }>} */
const surfaces = {};
for (const s of res.surfaces) {
  const dead = {};
  for (const r of s.tokenRows) {
    if (!r.dead) continue;
    dead[`${r.kind}:${r.token}`] = `${r.rules[0].file}:${r.rules[0].line}`;
  }
  surfaces[s.id] = { cssRuleCount: s.cssRuleCount, jsFileCount: s.jsFileCount, dead };
}

const prev = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, 'utf8')) : null;
const added = [];
if (prev) {
  for (const [id, cur] of Object.entries(surfaces)) {
    const before = (prev.surfaces && prev.surfaces[id] && prev.surfaces[id].dead) || {};
    for (const k of Object.keys(cur.dead)) if (!(k in before)) added.push(`${id}: ${k} (${cur.dead[k]})`);
  }
}

if (argv.includes('--check')) {
  console.log(added.length ? `新しいデッド ${added.length} 件:\n${added.join('\n')}` : '基準値より増えていません');
  process.exit(added.length ? 1 : 0);
}
if (added.length && allowReason.length < 15) {
  console.error(`新しいデッドが ${added.length} 件あります。基準値を上げるには --allow-increase "理由(15字以上)" が必要です:\n${added.join('\n')}`);
  process.exit(1);
}

const out = {
  note: '静的デッドセレクタ監査の基準値(下げる方向にだけ動かす)。検査=src/lib/deadSelectorRatchet.test.js・更新=scripts/audit/make-dead-selector-baseline.mjs',
  createdAt: (prev && prev.createdAt) || '2026-10-17',
  increases: [...((prev && prev.increases) || []), ...(added.length ? [{ at: new Date().toISOString().slice(0, 10), reason: allowReason, added }] : [])],
  surfaces
};
fs.writeFileSync(BASELINE, `${JSON.stringify(out, null, 2)}\n`);
console.log(`wrote ${path.relative(process.cwd(), BASELINE)}`, Object.fromEntries(Object.entries(surfaces).map(([k, v]) => [k, Object.keys(v.dead).length])));
