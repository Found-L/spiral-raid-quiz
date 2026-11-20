// Verify the homepage's wide-screen layout, motion preference and main controls.
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
  const port = await freePort(), url = `http://127.0.0.1:${port}/?api=local`;
  const server = spawn(process.env.PYTHON_BIN || 'python', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    {cwd:path.resolve(__dirname, '..'), stdio:'ignore', windowsHide:true});
  let browser;
  try {
    await waitReady(url);
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for (const width of [320, 390, 768, 1101, 1440, 1920, 2560, 3840]) {
      const page = await browser.newPage({viewport:{width, height:Math.min(2160, Math.max(900, Math.round(width * 9 / 16)))}});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
      await page.goto(url, {waitUntil:'load'});
      await page.locator('.hero-landscape').waitFor({state:'visible'});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `horizontal overflow at ${width}`);
      assert.equal(await page.locator('.site-shell').evaluate(el => Math.round(el.getBoundingClientRect().width)), width, `shell width at ${width}`);
      assert.equal(await page.locator('footer .footer-signature').innerText(), '相逢何必曾相识');
      assert.equal(await page.locator('footer .footer-signature').isVisible(), true);
      assert.ok(await page.locator('#temple-particles').evaluate(el => el.width * el.height <= 6050000), `particle canvas budget at ${width}`);
      assert.ok(await page.locator('#splash-cursor').evaluate(el => el.width * el.height <= 2410000), `ink canvas budget at ${width}`);
      assert.doesNotMatch(await page.locator('body').innerText(), /魔女试卷/);
      assert.match(await page.locator('.sources-section').innerText(), /根据巅峰服螺旋寺院上线后的实战资料整理/);
      const hero = await page.locator('.hero').boundingBox();
      const art = await page.locator('.hero-art').boundingBox();
      const title = await page.locator('.hero h1 em').boundingBox();
      assert.ok(Math.abs(art.width - hero.width) < 2 && Math.abs(art.height - hero.height) < 2, `scenery must fill the opening at ${width}`);
      assert.ok(title.x + title.width <= width - 10, `headline should not overflow at ${width}`);
      if (width >= 1101) {
        const copy = await page.locator('.hero-copy').boundingBox();
        const guide = await page.locator('.guide-section').boundingBox();
        assert.ok(Math.abs(copy.x - guide.x) < 2, `content alignment at ${width}`);
        if (width >= 2560) assert.ok(guide.width >= 1900, `wide-screen content is too narrow at ${width}`);
      }
      if (width >= 1920) {
        for (const card of await page.locator('.guide-card').all()) {
          const box = await card.boundingBox();
          const heading = await card.locator('.chapter-heading').boundingBox();
          const scene = await card.locator('.sequence-svg').boundingBox();
          assert.ok(heading.y + heading.height <= scene.y + 1, `heading overlaps diagram at ${width}`);
          for (const control of await card.locator('.chapter-step-controls button').all()) {
            const button = await control.boundingBox();
            assert.ok(button.x >= box.x && button.x + button.width <= box.x + box.width, `clipped diagram control at ${width}`);
          }
        }
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
    const page = await browser.newPage({viewport:{width:1440, height:900}});
    await page.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await page.goto(url);
    const cloud = await page.locator('.entrance-cloud-left').evaluate(el => {
      const animation = el.getAnimations().find(item => item.animationName === 'cloud-open-left');
      if (!animation) return null;
      animation.pause();
      animation.currentTime = 0;
      const start = Number(getComputedStyle(el).opacity);
      animation.currentTime = 2800;
      return {start, end:Number(getComputedStyle(el).opacity), pointerEvents:getComputedStyle(el).pointerEvents};
    });
    assert.ok(cloud && cloud.start > .8 && cloud.end === 0, 'entrance clouds should part and disappear');
    assert.equal(cloud.pointerEvents, 'none', 'decorative clouds must not block interaction');
    const canvas = page.locator('#temple-particles');
    await page.waitForFunction(() => {
      const el = document.querySelector('#temple-particles');
      if (!el.width || !el.height) return false;
      const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
      return false;
    });
    const firstFrame = await canvas.evaluate(el => el.toDataURL());
    const trace = page.locator('.formation-trace');
    const first = await trace.evaluate(el => getComputedStyle(el).strokeDashoffset);
    await page.waitForTimeout(500);
    const second = await trace.evaluate(el => getComputedStyle(el).strokeDashoffset);
    assert.notEqual(first, second, 'formation energy should move');
    assert.notEqual(await canvas.evaluate(el => el.toDataURL()), firstFrame, 'particles should move');
    assert.equal(await canvas.evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'particles must not intercept controls');
    assert.equal(await page.locator('#splash-cursor').evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'ink must not intercept controls');
    await page.mouse.move(1100, 350);
    assert.notEqual(await page.locator('.hero-art').evaluate(el => el.style.getPropertyValue('--depth-x')), '', 'hero responds to pointer');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await canvas.evaluate(el => {
      const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return false;
      return true;
    }), true, 'particles should stop while the page is hidden');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:false}); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForFunction(() => {
      const el = document.querySelector('#temple-particles'), pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
      return false;
    });
    await page.locator('.overview strong').first().scrollIntoViewIfNeeded();
    const metric = await page.locator('.overview strong').first().boundingBox();
    await page.mouse.move(metric.x + 3, metric.y + metric.height / 2);
    await page.mouse.down();
    await page.mouse.move(metric.x + metric.width - 3, metric.y + metric.height / 2, {steps:8});
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.getSelection().toString()), '', 'dragging over display text should not select it');
    const image = page.locator('.hero-landscape');
    await image.evaluate(el => el.scrollIntoView({behavior:'instant', block:'center'}));
    assert.equal(await image.getAttribute('draggable'), 'false');
    assert.equal(await page.locator('.chapter-scene-image').first().getAttribute('draggable'), 'false');
    await page.evaluate(() => { window.dragStarts = 0; document.addEventListener('dragstart', () => window.dragStarts++, {once:true}); });
    const imageBox = await image.boundingBox();
    await page.mouse.move(imageBox.x + imageBox.width / 2, imageBox.y + imageBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(imageBox.x + imageBox.width / 2 + 100, imageBox.y + imageBox.height / 2 + 60, {steps:8});
    await page.mouse.up();
    assert.equal(await page.evaluate(() => window.dragStarts), 0, 'decorative images should not start native drags');
    await page.locator('.hero-actions [data-action="start"]').click();
    assert.equal(await page.locator('#profile-dialog').evaluate(el => el.open), true, 'start button should open profile');
    const nickname = page.locator('#nickname');
    await nickname.fill('12345678');
    const inputBox = await nickname.boundingBox();
    await page.mouse.move(inputBox.x + 12, inputBox.y + inputBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(inputBox.x + 110, inputBox.y + inputBox.height / 2, {steps:8});
    await page.mouse.up();
    assert.equal(await nickname.evaluate(el => el.selectionEnd > el.selectionStart), true, 'input text should remain selectable');
    await page.locator('#profile-dialog .recovery summary').first().click();
    await page.locator('#identity-code').fill('example-identity-code');
    await page.locator('#identity-code').evaluate(el => el.select());
    assert.equal(await page.locator('#identity-code').evaluate(el => el.selectionEnd - el.selectionStart), 21, 'identity code should remain selectable');
    await page.close();

    const scroll = await browser.newPage({viewport:{width:1440, height:900}});
    await scroll.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await scroll.goto(url);
    await scroll.evaluate(() => {
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, document.querySelector('.guide-grid').getBoundingClientRect().top + scrollY - innerHeight * .7);
    });
    await scroll.waitForFunction(() => [...document.querySelectorAll('.guide-card')].every(el => el.classList.contains('motion-enter')));
    assert.equal(await scroll.locator('.guide-card').first().evaluate(el => getComputedStyle(el).animationName), 'temple-card-in');
    assert.equal(await scroll.locator('.guide-card').first().evaluate(el => getComputedStyle(el, '::after').animationName), 'chapter-arrival-flare');
    await scroll.locator('.guide-card').first().hover();
    assert.notEqual(await scroll.locator('.guide-card').first().evaluate(el => el.style.getPropertyValue('--edge-x')), '', 'card edge light follows the pointer');
    assert.equal(await scroll.locator('.card-light-edge').first().evaluate(el => getComputedStyle(el).pointerEvents), 'none', 'card light must not block diagram controls');
    const preview = scroll.locator('[data-sequence="overview-twins"]');
    const previousStep = await preview.getAttribute('data-step');
    await preview.locator('[data-action="sequence-next"]').click({timeout:1800});
    assert.notEqual(await preview.getAttribute('data-step'), previousStep, 'manual controls should work during the reveal');
    assert.equal(await preview.locator('[data-action="toggle-diagram-motion"]').getAttribute('aria-pressed'), 'true');
    await scroll.evaluate(() => { location.hash = '#guide-spirit'; });
    await scroll.waitForFunction(() => document.querySelector('#guide-title').textContent.includes('超魔灵'));
    assert.equal(await scroll.locator('body').evaluate(el => el.classList.contains('intro-seen')), true);
    await scroll.locator('#guide-stage-0').scrollIntoViewIfNeeded();
    await scroll.waitForFunction(() => document.querySelector('#guide-stage-0')?.classList.contains('motion-enter'));
    await scroll.evaluate(() => { location.hash = '#guide-witch'; });
    await scroll.waitForFunction(() => document.querySelector('#guide-title').textContent.includes('黑风'));
    await scroll.waitForFunction(() => document.querySelector('#guide-view').classList.contains('view-emerging') && document.querySelector('.site-shell').classList.contains('view-shifting'));
    assert.equal(await scroll.locator('.site-shell').evaluate(el => getComputedStyle(el, '::after').animationName), 'gate-sweep');
    await scroll.locator('#guide-stage-0').scrollIntoViewIfNeeded();
    await scroll.waitForFunction(() => document.querySelector('#guide-stage-0')?.classList.contains('motion-enter'));
    await scroll.locator('.brand').click();
    await scroll.waitForFunction(() => !document.querySelector('#home-view').classList.contains('hidden'));
    assert.equal(await scroll.locator('.entrance-cloud-left').evaluate(el => getComputedStyle(el).animationName), 'none', 'returning home must not replay the entrance');
    await scroll.emulateMedia({reducedMotion:'reduce'});
    await scroll.waitForFunction(() => !document.querySelector('.motion-enter'));
    assert.equal(await scroll.locator('.entrance-cloud-left').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await scroll.locator('#temple-particles').evaluate(el => {
      const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return false;
      return true;
    }), true, 'particles should stop when the system requests reduced motion');
    await scroll.close();

    const fallback = await browser.newPage({viewport:{width:1440, height:900}});
    await fallback.addInitScript(() => { window.IntersectionObserver = undefined; });
    await fallback.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await fallback.goto(url);
    assert.equal(await fallback.locator('.guide-card').first().evaluate(el => getComputedStyle(el).opacity), '1', 'content must remain visible without IntersectionObserver');
    await fallback.close();

    const navigation = await browser.newPage({viewport:{width:2560, height:1440}, reducedMotion:'reduce'});
    await navigation.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await navigation.goto(url);
    await navigation.locator('.hero-actions a[href="#guide"]').click();
    assert.equal(new URL(navigation.url()).hash, '#guide');
    const heading = await navigation.locator('#guide .section-heading').boundingBox();
    const header = await navigation.locator('.topbar').boundingBox();
    assert.ok(heading.y >= header.y + header.height, 'sticky navigation must not cover the guide heading');
    await navigation.close();

    const reduced = await browser.newPage({viewport:{width:1440, height:900}, reducedMotion:'reduce'});
    await reduced.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await reduced.goto(url);
    assert.equal(await reduced.locator('.formation-trace').evaluate(el => getComputedStyle(el).animationName), 'none');
    assert.equal(await reduced.locator('.entrance-cloud-left').evaluate(el => getComputedStyle(el).opacity), '0');
    assert.equal(await reduced.locator('.hero-copy').evaluate(el => getComputedStyle(el).opacity), '1');
    await reduced.close();

    const ink = await browser.newPage({viewport:{width:1200, height:800}});
    await ink.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await ink.goto(url);
    await ink.addStyleTag({content:'* { animation-play-state: paused !important; transition: none !important } #temple-particles { visibility: hidden !important } .entrance-cloud,.entrance-light { opacity: 0 !important } .hero-landscape { animation: none !important; transform: none !important }'});
    await ink.waitForTimeout(300);
    const beforeInk = await ink.screenshot();
    await ink.mouse.move(650, 360);
    for (let i = 1; i <= 18; i++) await ink.mouse.move(650 + i * 12, 360 + Math.sin(i / 3) * 45);
    await ink.waitForTimeout(150);
    assert.equal(beforeInk.equals(await ink.screenshot()), false, 'moving the pointer should leave a visible particle trail');
    const trailPixels = await ink.locator('#splash-cursor').evaluate(el => {
      const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      let visible = 0, opaque = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 10) visible++;
        if (pixels[i] > 180) opaque++;
      }
      return {visible, opaque, total:el.width * el.height};
    });
    assert.ok(trailPixels.visible > 100, 'the trail contains visible fine particles and light strands');
    assert.ok(trailPixels.opaque < trailPixels.total * .002, 'the trail must not accumulate into large opaque blobs');
    await ink.close();

    const inkFallback = await browser.newPage({viewport:{width:900, height:700}});
    await inkFallback.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type === 'webgl' || type === 'webgl2') return null;
        return getContext.call(this, type, ...args);
      };
    });
    await inkFallback.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await inkFallback.goto(url);
    await inkFallback.mouse.move(500, 350);
    await inkFallback.mouse.move(550, 380, {steps:6});
    await inkFallback.waitForFunction(() => {
      const el = document.querySelector('#splash-cursor'), context = el.getContext('2d');
      if (!context) return false;
      const pixels = context.getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
      return false;
    });
    await inkFallback.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await inkFallback.locator('#splash-cursor').evaluate(el => {
      const pixels = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return false;
      return true;
    }), true, 'particle trails should clear when the page is hidden');
    await inkFallback.close();

    const noCanvas = await browser.newPage({viewport:{width:900, height:700}});
    const noCanvasErrors = [];
    noCanvas.on('pageerror', error => noCanvasErrors.push(error.message));
    await noCanvas.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (this.id === 'splash-cursor' && type === '2d') return null;
        return getContext.call(this, type, ...args);
      };
    });
    await noCanvas.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await noCanvas.goto(url);
    await noCanvas.locator('.hero-actions [data-action="start"]').click();
    assert.equal(await noCanvas.locator('#profile-dialog').evaluate(el => el.open), true, 'site controls remain usable if the decorative canvas is unavailable');
    assert.deepEqual(noCanvasErrors, []);
    await noCanvas.close();

    const exam = await browser.newPage({viewport:{width:1440, height:900}});
    const examErrors = [];
    exam.on('pageerror', error => examErrors.push(error.message));
    await exam.addInitScript(() => {
      localStorage.setItem('spiral-temple-quiz-v1:identity', JSON.stringify({deviceId:'a'.repeat(32), secret:'b'.repeat(64)}));
      localStorage.setItem('spiral-temple-quiz-v1:profile', JSON.stringify({nickname:'测试', playerNumber:1}));
    });
    await exam.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await exam.goto(url);
    await exam.locator('.hero-actions [data-action="start"]').click();
    await exam.locator('#question-options label').first().click();
    assert.equal(await exam.locator('#answered-count').innerText(), '1', 'an answer should be saved while effects are running');
    await exam.locator('#next-button').click();
    await exam.locator('#question-card [data-action="previous"]').click();
    assert.equal(await exam.locator('#question-options input').first().isChecked(), true, 'returning to the question should restore its answer');
    await exam.reload();
    await exam.locator('.hero-actions [data-action="start"]').click();
    assert.equal(await exam.locator('#question-options input').first().isChecked(), true, 'saved answers should survive a reload');
    assert.equal(await exam.locator('#answered-count').innerText(), '1');
    assert.deepEqual(examErrors, []);
    await exam.close();
    console.log('PASS homepage motion, reduced motion, start action and 320–3840px layout');
  } finally {
    await browser?.close();
    server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
