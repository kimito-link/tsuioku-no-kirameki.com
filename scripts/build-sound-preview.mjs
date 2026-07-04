// build-sound-preview.mjs
// 開発用: extension/sound/ 配下の全効果音を1枚のHTMLで試聴できるページを生成する。
//   ユーザー要望(2026-07-04)「使う音をhtmlで確認できるように。あくまで開発用で」。
//   拡張本体には同梱しない(docs/ 配下・file:// で開く)。実再生と同じ音量
//   (ギフト系1.0/その他0.7=effectSoundPlayer.defaultVolumeForEffectSoundKind と同値)で鳴らす。
// 実行: npm run sound:preview → docs/dev-sound-preview.html を再生成
import { writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOUND_DIR = join(ROOT, 'extension', 'sound');
const OUT = join(ROOT, 'docs', 'dev-sound-preview.html');

/** どのイベントで鳴るかの説明(ファイル名プレフィックス→用途)。 */
const USAGE = [
  [/^gift-small/, 'ギフト小(〜100pt級)・音量1.0'],
  [/^gift-medium/, 'ギフト中・音量1.0'],
  [/^gift-large/, 'ギフト大・音量1.0'],
  [/^gift-mega/, 'ギフト特大・音量1.0'],
  [/^milestone-soft/, 'コメント節目100/200件・音量0.7'],
  [/^milestone-hard/, 'コメント節目500件・音量0.7'],
  [/^milestone-jackpot/, 'コメント節目1000件+(大当たり)・音量0.7'],
  [/^reach/, 'リーチ(Phase2で配線予定)・音量0.7'],
  [/^effect-gift/, 'ギフト(ティア不明時のフォールバック)・音量1.0'],
  [/^effect-ad/, '広告・音量0.7'],
  [/^effect-rank-up/, 'イベント順位UP・音量0.7'],
  [/^effect-rank-down/, 'イベント順位DOWN・音量0.7'],
  [/^effect-milestone/, '(旧)節目単一音・音量0.7']
];

const usageOf = (name) => (USAGE.find(([re]) => re.test(name)) || [null, ''])[1];
const volOf = (name) => (/^(gift-|effect-gift)/.test(name) ? 1.0 : 0.7);

const rows = [];
const addDir = (rel) => {
  const dir = join(SOUND_DIR, rel);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.mp3')).sort()) {
    rows.push({ path: `../extension/sound/${rel ? rel + '/' : ''}${f}`, name: f, usage: usageOf(f), vol: volOf(f) });
  }
};
addDir('');
addDir('tiers');

const tr = (r) =>
  `<tr><td><button data-src="${r.path}" data-vol="${r.vol}">▶</button></td>` +
  `<td>${r.name}</td><td class="u">${r.usage}</td><td class="d" data-dur="${r.path}">…</td></tr>`;

const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>効果音 試聴(開発用)</title>
<style>
body{font-family:sans-serif;max-width:860px;margin:24px auto;padding:0 12px;background:#1b1b22;color:#eee}
h1{font-size:18px} .note{color:#aaa;font-size:12px}
table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #333;padding:6px 8px;font-size:13px;text-align:left}
button{font-size:15px;padding:2px 12px;cursor:pointer;border-radius:6px;border:1px solid #555;background:#2c2c38;color:#eee}
button:hover{background:#3a3a4c} .u{color:#9fd} .d{color:#fd9;text-align:right}
</style></head><body>
<h1>効果音 試聴ページ(開発用・拡張には同梱しない)</h1>
<p class="note">実再生と同じ音量(ギフト系1.0/その他0.7)で鳴ります。file:// でこのまま開けます。音源を差し替えたら <code>npm run sound:preview</code> で再生成。生成: ${new Date().toISOString()}</p>
<table><tr><th></th><th>ファイル</th><th>用途</th><th>長さ</th></tr>
${rows.map(tr).join('\n')}
</table>
<script>
let cur=null;
document.querySelectorAll('button[data-src]').forEach(b=>{
  b.addEventListener('click',()=>{
    if(cur){try{cur.pause()}catch(e){}}
    const a=new Audio(b.dataset.src); a.volume=Number(b.dataset.vol)||0.7; cur=a; a.play();
  });
});
document.querySelectorAll('td[data-dur]').forEach(td=>{
  const a=new Audio(td.dataset.dur);
  a.addEventListener('loadedmetadata',()=>{td.textContent=a.duration.toFixed(2)+'s';});
});
</script></body></html>`;

writeFileSync(OUT, html);
console.log(`[sound-preview] ${OUT} を生成しました(${rows.length}ファイル)。`);
