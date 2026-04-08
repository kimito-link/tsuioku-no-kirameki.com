/**
 * リポジトリに 256px アイコンしか無い環境向け: manifest 用の小さめ PNG を生成する。
 * 通常は manifest で images/logo/konta-yukkuri-icon-{16,32,48,128}.png を指定すれば不要。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..', 'extension', 'images', 'logo');
const src256 = path.join(root, 'kimito-rinku-app-icon-256.png');

if (!fs.existsSync(src256)) {
  console.error('Missing', src256);
  process.exit(1);
}
const buf = fs.readFileSync(src256);
fs.mkdirSync(root, { recursive: true });
for (const size of ['16', '32', '48', '128']) {
  fs.writeFileSync(path.join(root, `kimito-rinku-app-icon-${size}.png`), buf);
}
console.log('Copied 256.png to kimito-rinku-app-icon-{16,32,48,128}.png');
