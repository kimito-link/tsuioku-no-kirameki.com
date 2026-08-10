// 3ラウンド分の council JSON を1つの Markdown 議事録に統合する。
// 同一 label は「最も長い有効回答」を採用（中断/失敗を捨てる）。
// Node は readFileSync(..., 'utf8') で明示的に UTF-8 を読むため、PowerShell の
// コードページ依存（日本語文字化け）を回避できる。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const council = process.argv[2];
if (!council) { console.error('usage: node _merge-council.mjs <councilDir>'); process.exit(1); }

const files = [
  'romi-spec-answers.json',
  'romi-spec-answers-local.json',
  'romi-spec-answers-gemma.json',
].map((f) => path.join(council, f));

/** @type {Map<string, any>} */
const best = new Map();
for (const f of files) {
  if (!existsSync(f)) continue;
  const j = JSON.parse(readFileSync(f, 'utf8'));
  for (const r of j.results) {
    const len = r.answer ? r.answer.length : 0;
    const cur = best.get(r.label);
    const curLen = cur && cur.answer ? cur.answer.length : -1;
    if (len > curLen) best.set(r.label, r);
  }
}

const labels = [...best.keys()].sort();
let md = '# 会議議事録: 「ロミ」が喜ぶ次の目玉機能\n\n';
md += '> COUNCIL-HOWTO.md の汎用会議ハーネス(meeting.mjs)を役割注入ONで3ラウンド実行し、\n';
md += '> 各モデルの最良回答を統合した。最終統合・裏取りは司令塔(Claude)が担当。\n\n';

let ok = 0, fail = 0;
for (const label of labels) {
  const r = best.get(label);
  if (r.answer) {
    ok++;
    md += `## ${r.label}  [${r.role}]\n\n${r.answer}\n\n---\n\n`;
  } else { fail++; }
}
md += '## 取得できなかったメンバー\n\n';
for (const label of labels) {
  const r = best.get(label);
  if (!r.answer) md += `- ${r.label} [${r.role}] — ${r.error}\n`;
}

const outMd = path.join(council, 'romi-spec-minutes.md');
writeFileSync(outMd, md, 'utf8');
console.log('WROTE: ' + outMd);
console.log(`OK=${ok} FAIL=${fail} UNIQUE_LABELS=${best.size}`);
