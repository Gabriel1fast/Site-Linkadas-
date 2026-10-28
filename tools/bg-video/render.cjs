/* Gera os quadros PNG de uma cena de fundo (6ª ou 7ª dobra) para virar vídeo em loop.
   Uso: node tools/bg-video/render.cjs <approach|finale|hero> <largura> <altura> <segundos> <fps> <pasta-de-saída> [superamostragem] [conteúdo-hero]
   (com o site servido em http://localhost:8123). Depois: tools/bg-video/encode.sh */
const { chromium } = require('playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

(async () => {

const [scene, w, h, seconds, fps, out, ss = '1', content = '0.62'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('pageerror', (e) => console.error(e.message));
await page.goto(`http://localhost:8123/tools/bg-video/render.html?scene=${scene}&w=${w}&h=${h}&ss=${ss}&content=${content}`);
await page.waitForFunction(() => window.ready);
const total = Math.round(+seconds * +fps);
for (let i = 0; i < total; i++) {
  const png = await page.evaluate((t) => window.renderFrame(t), i / +fps);
  writeFileSync(join(out, `f${String(i).padStart(4, '0')}.png`), Buffer.from(png, 'base64'));
  if (i % 30 === 0) console.log(`${scene} ${w}x${h}: ${i}/${total}`);
}
await browser.close();
})();
