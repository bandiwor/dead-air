// Растеризует public/icon.svg в PNG для манифеста (Android/Chrome требуют PNG 192 и 512 для установки).
// Запуск: node scripts/make-icons.cjs  (нужен установленный Playwright с Chromium)
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const pub = path.join(__dirname, '..', 'public');
const svg = fs.readFileSync(path.join(pub, 'icon.svg'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jobs = [
    { file: 'icon-192.png', size: 192, pad: 0 },
    { file: 'icon-512.png', size: 512, pad: 0 },
    // maskable: система обрежет до круга/скруглённого квадрата — рисунок в безопасной зоне 80%
    { file: 'icon-maskable-512.png', size: 512, pad: 0.14 },
    { file: 'apple-touch-icon.png', size: 180, pad: 0.06 },
  ];
  for (const j of jobs) {
    const inner = Math.round(j.size * (1 - j.pad * 2));
    await page.setViewportSize({ width: j.size, height: j.size });
    await page.setContent(
      `<html><body style="margin:0;background:#05080b;display:grid;place-items:center;width:${j.size}px;height:${j.size}px">` +
        `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
    );
    await page.screenshot({ path: path.join(pub, j.file), omitBackground: false });
  }
  await browser.close();
})();
