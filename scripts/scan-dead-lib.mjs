// scripts/scan-dead-lib.mjs — lib/ の死蔵ファイルを entry から到達性スキャンして報告
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const libDir = path.join(root, 'src/lib');

const entryFiles = [
  'src/extension/popup-entry.js',
  'src/extension/content-entry.js',
  'src/extension/comeview-entry.js',
  'src/extension/status-entry.js',
  'src/extension/offscreen-entry.js',
  'src/extension/background.js',
  'src/extension/page-intercept-entry.js',
].map(f => path.join(root, f));

// libの全実装ファイル収集
const allLibFiles = fs.readdirSync(libDir)
  .filter(f => f.endsWith('.js') && !f.endsWith('.test.js'))
  .map(f => path.join(libDir, f));

// entryから再帰的にimportを追う
const reached = new Set();

function scan(filePath) {
  if (reached.has(filePath)) return;
  if (!fs.existsSync(filePath)) return;
  reached.add(filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  // from '../lib/foo.js' or from './foo.js' パターン
  const re = /from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    const rel = m[1];
    // lib相対パスのみ追う
    const resolved = path.resolve(path.dirname(filePath), rel.endsWith('.js') ? rel : rel + '.js');
    if (resolved.startsWith(libDir)) {
      scan(resolved);
    } else if (resolved.startsWith(path.join(root, 'src'))) {
      scan(resolved);
    }
  }
}

for (const entry of entryFiles) scan(entry);

// 未到達ファイル
const dead = allLibFiles.filter(f => !reached.has(f));

console.log('=== 死蔵候補（どのentryからも到達されないlib実装ファイル）===');
dead.forEach(f => console.log(' ', path.basename(f)));
console.log('\n合計:', dead.length, '件 /', allLibFiles.length, '件中');
console.log('\n=== 到達済み ===', reached.size, '件');
