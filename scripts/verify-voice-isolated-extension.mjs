// 偽エンジンだけを向く拡張の一時コピーで、既存のverify:extensionを実行する。
// node scripts/verify-voice-isolated-extension.mjs 。普段のプロファイル・50021・配布元の拡張は変更しない。
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
const root = process.cwd();
const artifactDir = path.join(root, '.artifacts/voice-silent-busy');
fs.mkdirSync(artifactDir, { recursive: true });
const relativeTarget = `.artifacts/voice-silent-busy/extension-isolated-${Date.now()}`;
const target = path.resolve(root, relativeTarget);
if (!target.startsWith(artifactDir + path.sep)) throw new Error('Invalid isolation directory');
fs.cpSync(path.join(root, 'extension'), target, { recursive: true });
function rewrite(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) rewrite(file);
    else if (/\.(js|json|html)$/.test(entry.name)) {
      const source = fs.readFileSync(file, 'utf8');
      if (source.includes('50021')) fs.writeFileSync(file, source.replaceAll('50021', '50141'));
    }
  }
}
rewrite(target);
const requests = [];
const engine = http.createServer((req, res) => {
  requests.push({ at: new Date().toISOString(), url: req.url });
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(req.url === '/version' ? 'fake-0.26.1' : req.url === '/speakers' ? [] : req.url?.startsWith('/is_initialized_speaker') ? true : { accent_phrases: [], speedScale: 1, supported_features: {}, cpu: true, cuda: false }));
});
await new Promise((resolve, reject) => { engine.once('error', reject); engine.listen(50141, '127.0.0.1', resolve); });
try {
  // relativeTargetには空白を含めない。Windowsのnpm起動に必要なshellを使い、入力をコマンドへ混ぜない。
  const child = spawn('npm', ['run', 'verify:extension', '--', '--extension-dir', relativeTarget], {
    cwd: root, shell: true, stdio: 'inherit',
    env: { ...process.env, NODE_OPTIONS: ((process.env.NODE_OPTIONS || '') + ' --preserve-symlinks-main').trim() }
  });
  process.exitCode = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => resolve(code ?? 1)); });
} finally {
  fs.writeFileSync(path.join(artifactDir, 'extension-isolated-requests.json'), JSON.stringify({ extensionCopy: relativeTarget, requests }, null, 2));
  await new Promise(resolve => engine.close(resolve));
}
