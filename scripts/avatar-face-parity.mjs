/**
 * scripts/avatar-face-parity.mjs — 匿名の顔の Worker 合成が、メインスレッド合成と【画素まで同じ】であることを確かめる(v0.1.1681)。
 *   実行: node scripts/avatar-face-parity.mjs   (先に npm run build)
 *   60通りの顔で、メイン合成(canvas.toBlob)と本物の Worker(extension/dist/avatar-face-worker.js)の data URL を文字列比較する。
 *   合格=不一致 0(出力に pixelIdentical: 60 / sameDataUrl: 60 が出る)。主スレッドの長いタスクの合計も比較として出る。
 *   一時プロファイルで起動する(端末の本物のブラウザ・保存データには触れない)。
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { launchWithExtension, sleep, shutdown, REPO_ROOT } from './perf-ab/common.mjs';

const dst = fs.mkdtempSync(path.join(os.tmpdir(), 'nls-ext-face-'));
fs.cpSync(path.join(REPO_ROOT, 'extension'), dst, { recursive: true });
// ★メイン側の合成の複製(avatarPartsComposer.js の composeAvatarPartsDataUrl と同じ手順)と、座標は src/lib/avatarPartAnchors.js と同じ値。
const ANCH = { canvasSize: 128, face: { cx: 0.5, cy: 0.53, radius: 0.34, fill: '#ffe6cf', stroke: '#332a26', strokeWidth: 0.02 }, cheek: { cx: 0.5, cy: 0.6, width: 0.58 }, eyes: { cx: 0.5, cy: 0.5, width: 0.52 }, mouth: { cx: 0.5, cy: 0.66, width: 0.24 }, hair: { cx: 0.5, cy: 0.39, width: 0.92 } };



const { ctx, sw, userDataDir } = await launchWithExtension({ extDir: dst });
try {
  const extId = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/sidepanel.html`, { waitUntil: 'domcontentloaded' });
  await sleep(1500);
  const N = 60;
  const res = await page.evaluate(async ({ extId, N, ANCH }) => {
    const base = `chrome-extension://${extId}/images/avatar-parts/`;
    const hairs = ['bob', 'short-flip', 'long', 'ponytail', 'twintail', 'mushroom', 'center-part', 'wolf'];
    const eyes = ['open', 'smile', 'jito', 'sparkle', 'surprised', 'sleepy'];
    const mouths = ['omega', 'smile', 'open', 'mu', 'pokan', 'smirk'];
    const cheeks = [null, '0', '1'];
    const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
    const specs = Array.from({ length: N }, (_, i) => ({
      files: { hair: `hair-${hairs[i % 8]}.png`, eyes: `eyes-${eyes[(i * 3) % 6]}.png`, mouth: `mouth-${mouths[(i * 5) % 6]}.png`, cheek: cheeks[i % 3] == null ? null : `cheek-${cheeks[i % 3]}.png` },
      hue: hues[(i * 7) % 12]
    }));
    const lt = [];
    const po = new PerformanceObserver((l) => { for (const e of l.getEntries()) lt.push(e.duration); });
    po.observe({ type: 'longtask', buffered: true });
    let maxGap = 0; let last = performance.now();
    const iv = setInterval(() => { const t = performance.now(); maxGap = Math.max(maxGap, t - last - 10); last = t; }, 10);
    const loadImg = (f) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = base + f; });
    const loadImg2 = (u) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = u; });
    const drawPart = (c2, img, a, size) => { const w = a.width * size; const asp = img.naturalWidth > 0 ? img.naturalHeight / img.naturalWidth : null; const h = asp != null ? w * asp : a.width * size; c2.drawImage(img, (a.cx * size) - (w / 2), (a.cy * size) - (h / 2), w, h); };
    const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); });
    const mainCompose = async (s) => {
      const [hair, ey, mo, ch] = await Promise.all([loadImg(s.files.hair), loadImg(s.files.eyes), loadImg(s.files.mouth), s.files.cheek ? loadImg(s.files.cheek) : null]);
      const size = 128; const c = document.createElement('canvas'); c.width = size; c.height = size; const x = c.getContext('2d');
      const f = ANCH.face; x.beginPath(); x.arc(f.cx * size, f.cy * size, f.radius * size, 0, Math.PI * 2); x.fillStyle = f.fill; x.fill(); x.lineWidth = f.strokeWidth * size; x.strokeStyle = f.stroke; x.stroke();
      if (ch) drawPart(x, ch, ANCH.cheek, size); drawPart(x, ey, ANCH.eyes, size); drawPart(x, mo, ANCH.mouth, size);
      const hc = document.createElement('canvas'); hc.width = size; hc.height = size; const hx = hc.getContext('2d'); drawPart(hx, hair, ANCH.hair, size);
      hx.globalCompositeOperation = 'multiply'; hx.fillStyle = `hsl(${s.hue} 72% 58%)`; hx.fillRect(0, 0, size, size);
      hx.globalCompositeOperation = 'destination-in'; drawPart(hx, hair, ANCH.hair, size); hx.globalCompositeOperation = 'source-over';
      x.drawImage(hc, 0, 0);
      const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
      return blobToDataUrl(blob);
    };
    const out = {};
    lt.length = 0; maxGap = 0; let t0 = performance.now();
    const mainUrls = [];
    for (const s of specs) mainUrls.push(await mainCompose(s));
    out.main = { elapsed: Math.round(performance.now() - t0), longTaskSum: Math.round(lt.reduce((a, b) => a + b, 0)), longTasks: lt.length, maxGap: Math.round(maxGap) };
    await new Promise((r) => setTimeout(r, 400));
    const worker = new Worker(chrome.runtime.getURL('dist/avatar-face-worker.js'));
    const pend = new Map();
    worker.onmessage = (e) => { const p = pend.get(e.data.id); if (p) p(e.data); };
    const ask = (s, id) => new Promise((res) => { pend.set(id, res); worker.postMessage({ id, baseUrl: base, files: s.files, hairHue: s.hue }); });
    lt.length = 0; maxGap = 0; t0 = performance.now();
    const wUrls = await Promise.all(specs.map((s, i) => ask(s, i).then((r) => (r.ok ? r.dataUrl : 'ERR:' + r.error))));
    out.worker = { elapsed: Math.round(performance.now() - t0), longTaskSum: Math.round(lt.reduce((a, b) => a + b, 0)), longTasks: lt.length, maxGap: Math.round(maxGap) };
    const decode = async (u) => { const img = await loadImg2(u); const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d'); x.drawImage(img, 0, 0); return x.getImageData(0, 0, 128, 128).data; };
    let identical = 0; let maxDiff = 0; let diffVals = 0; let sameString = 0; let errs = 0;
    for (let i = 0; i < N; i++) {
      if (String(wUrls[i]).startsWith('ERR')) { errs++; continue; }
      if (mainUrls[i] === wUrls[i]) sameString++;
      const a = await decode(mainUrls[i]); const b = await decode(wUrls[i]);
      let same = true;
      for (let k = 0; k < a.length; k++) { const d = Math.abs(a[k] - b[k]); if (d) { same = false; if (d > maxDiff) maxDiff = d; diffVals++; } }
      if (same) identical++;
    }
    out.pixels = { faces: N, workerErrors: errs, sameDataUrl: sameString, pixelIdentical: identical, maxChannelDiff: maxDiff, differingChannelValues: diffVals, bytesMain: mainUrls[0].length, bytesWorker: String(wUrls[0]).length };
    clearInterval(iv);
    return out;
  }, { extId, N, ANCH });
  console.log(JSON.stringify(res, null, 1));
} catch (e) { console.error('ERR', e.message); } finally { await shutdown(ctx, userDataDir).catch(() => {}); fs.rmSync(dst, { recursive: true, force: true }); }
process.exit(0);
