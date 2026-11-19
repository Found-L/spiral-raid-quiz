// Exercise visible motion, manual control and responsive layouts in a real browser.
const assert = require('node:assert/strict');
const {spawn} = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const {chromium} = require('playwright');

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function waitReady(url) {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('preview server did not start');
}
(async () => {
  const port = await freePort(), url = `http://127.0.0.1:${port}/`;
  const server = spawn(process.env.PYTHON_BIN || 'python', ['-m','http.server',String(port),'--bind','127.0.0.1'],
    {cwd:path.resolve(__dirname,'..'),stdio:'ignore',windowsHide:true});
  let browser;
  try {
    await waitReady(url);
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for (const width of [320,390,768,1440]) {
      const page = await browser.newPage({viewport:{width,height:900}}), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url, {waitUntil:'load'});
      assert.equal(await page.locator('.hero-landscape').evaluate(img => img.complete && img.naturalWidth > 0), true);
      assert.equal(await page.locator('.chapter-art[data-sequence]').count(), 3);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `page overflow at ${width}`);
      for (const button of await page.locator('.chapter-step-controls button').all()) {
        const box = await button.boundingBox();
        assert.ok(box && box.width >= 25 && box.x >= 0 && box.x + box.width <= width, `clipped control at ${width}`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    for (const width of [320,390,560,768,1024]) {
      const page = await browser.newPage({viewport:{width,height:900}});
      for (const [chapter,count] of [['spirit',4],['witch',5]]) {
        await page.goto(url + '#guide-' + chapter);
        const nav = page.locator('#guide-timeline');
        const buttons = nav.locator('button');
        assert.equal(await buttons.count(), count);
        assert.equal(await nav.evaluate(el => el.scrollWidth <= el.clientWidth), true, `hidden stages at ${width}`);
        const navBox = await nav.boundingBox();
        for (const button of await buttons.all()) {
          const box = await button.boundingBox();
          assert.ok(box && box.x >= navBox.x - 1 && box.x + box.width <= navBox.x + navBox.width + 1,
            `clipped stage control at ${width}`);
        }
        await buttons.last().click();
        await page.waitForFunction(index => document.querySelector(`#guide-stage-${index} h2`) === document.activeElement, count - 1);
        assert.equal(await buttons.last().getAttribute('aria-current'), 'step');
      }
      await page.close();
    }
    const page = await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto(url);
    const spiderQuestion = await page.evaluate(() => drawRaidDiagram('witch-spiders','蜘蛛示意','q071'));
    assert.match(spiderQuestion, /首领方向/);
    assert.doesNotMatch(spiderQuestion, />首领<\/text>/, 'flight question must not place the boss on the ground');
    const scene = page.locator('[data-sequence="overview-twins"]');
    await scene.scrollIntoViewIfNeeded();
    const before = await scene.getAttribute('data-step');
    await page.waitForTimeout(5600);
    assert.notEqual(await scene.getAttribute('data-step'), before, 'visible overview should advance');
    await scene.locator('[data-action="toggle-diagram-motion"]').click();
    const paused = await scene.getAttribute('data-step');
    assert.equal(await scene.locator('[data-action="toggle-diagram-motion"]').getAttribute('aria-pressed'), 'true');
    await page.waitForTimeout(5200);
    assert.equal(await scene.getAttribute('data-step'), paused, 'paused overview should remain still');
    await scene.locator('[data-action="sequence-next"]').click();
    assert.notEqual(await scene.getAttribute('data-step'), paused, 'manual step should still work');
    await scene.locator('[data-action="toggle-diagram-motion"]').click();
    assert.equal(await scene.locator('[data-action="toggle-diagram-motion"]').getAttribute('aria-pressed'), 'false');
    await page.close();

    const reduced = await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await reduced.goto(url);
    const reducedScene = reduced.locator('[data-sequence="overview-twins"]');
    await reducedScene.scrollIntoViewIfNeeded();
    assert.equal(await reducedScene.evaluate(el => el.classList.contains('motion-paused')), true);
    await reducedScene.locator('[data-action="sequence-next"]').click();
    assert.equal(await reducedScene.getAttribute('data-step'), '1', 'reduced-motion users can still step');
    await reduced.close();
    console.log('PASS cinematic motion, pause, manual steps, reduced motion and responsive widths');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode=1; });
