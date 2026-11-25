// supportEvidence.js — SPC_EVIDENCE_DIR があるときだけ、横の欄の応援のチップ・ギフト欄の「投げN件」・画面を残す(v0.1.2225)。
//   同じ記録(各 spec のモック配信)を前の版とこの版で流して、数字が同じか/なぜ違うかを並べるための計器。ふだんの e2e では何もしない。
import fs from 'node:fs';
import path from 'node:path';

/** @param {import('@playwright/test').Page} ext @param {string} platform */
export async function captureSupportEvidence(ext, platform) {
  const dir = process.env.SPC_EVIDENCE_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  // 数え直しは3秒ごとの読み直しで追いつく。チップが落ち着くまで待つ
  await ext.waitForTimeout(6000);
  const data = await ext.evaluate(() => {
    const chips = [...document.querySelectorAll('.nl-official-nico-stats__row [data-nl-metric]')].map((el) => ({
      key: el.getAttribute('data-nl-metric'),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim(),
      title: el.getAttribute('title') || '',
    }));
    const body = document.body.innerText || '';
    const thrown = body.match(/投げ\s*([\d,]+)\s*件/);
    return { chips, giftLaneThrows: thrown ? Number(thrown[1].replace(/,/g, '')) : null, giftHas: document.documentElement.getAttribute('data-nl-gift-has') };
  });
  fs.writeFileSync(path.join(dir, `${platform}.json`), JSON.stringify(data, null, 2));
  const row = ext.locator('.nl-official-nico-stats__row');
  if (await row.count()) await row.first().screenshot({ path: path.join(dir, `${platform}-chips.png`) }).catch(() => {});
  await ext.screenshot({ path: path.join(dir, `${platform}-panel.png`), fullPage: true }).catch(() => {});
}
