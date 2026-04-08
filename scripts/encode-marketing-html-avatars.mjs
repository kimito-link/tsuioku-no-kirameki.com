/**
 * extension/images/marketing-html-avatars/*.png を data URI にし、
 * src/lib/marketingHtmlAdvisorAvatars.js を上書きする。
 * 先に scripts/resize-marketing-html-avatars.ps1 を実行すること。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'extension', 'images', 'marketing-html-avatars');
const outFile = path.join(root, 'src', 'lib', 'marketingHtmlAdvisorAvatars.js');

const files = [
  ['rink', 'rink-72.png'],
  ['konta', 'konta-72.png'],
  ['tanu', 'tanu-72.png']
];

let body = `/**
 * マーケ分析HTML内のキャラアイコン（単体HTMLで表示するため data URI）。
 * 生成: node scripts/encode-marketing-html-avatars.mjs（72px 元画像は resize-marketing-html-avatars.ps1）
 */
export const MKT_ADVISOR_AVATAR_DATA_URI = {
`;

for (const [key, name] of files) {
  const p = path.join(dir, name);
  if (!fs.existsSync(p)) {
    throw new Error(`missing ${p} — run scripts/resize-marketing-html-avatars.ps1`);
  }
  const b64 = fs.readFileSync(p).toString('base64');
  body += `  ${key}: 'data:image/png;base64,${b64}',\n`;
}
body += `};
`;

fs.writeFileSync(outFile, body, 'utf8');
console.log('wrote', outFile);
