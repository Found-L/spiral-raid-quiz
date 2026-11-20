// Exercise actual MP3 playback, browser autoplay restrictions, persistence, and mobile layout.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const preference = 'spiral-temple-quiz-v1:music-enabled';
let musicRequests = 0;

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (!pathname.startsWith('/spiral-raid-quiz/')) { res.writeHead(404).end(); return; }
  let file = path.resolve(root, '.' + pathname.slice('/spiral-raid-quiz'.length));
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
  const types = {'.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mp3':'audio/mpeg', '.webp':'image/webp'};
  const size = fs.statSync(file).size;
  if (path.extname(file) === '.mp3') musicRequests++;
  const headers = {'Content-Type':types[path.extname(file)] || 'application/octet-stream', 'Accept-Ranges':'bytes', 'Cache-Control':'no-store'};
  const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
  const start = match ? Number(match[1]) : 0;
  const end = match && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (start >= size || end < start) { res.writeHead(416, {'Content-Range':`bytes */${size}`}).end(); return; }
  headers['Content-Length'] = end - start + 1;
  if (match) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  res.writeHead(match ? 206 : 200, headers);
  if (req.method === 'HEAD') res.end(); else fs.createReadStream(file, {start, end}).pipe(res);
});

async function playing(page) {
  await page.waitForFunction(() => {
    const audio = document.getElementById('background-music');
    return !audio.paused && audio.readyState >= 2 && audio.currentTime > .15;
  }, null, {timeout:15000});
  assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'true');
}

async function layout(page, width) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}`);
  const button = page.locator('#music-toggle');
  const box = await button.boundingBox();
  assert.ok(box && box.width >= 40 && box.height >= 40 && box.x >= 0 && box.x + box.width <= width, `music button fits at ${width}`);
  const other = page.locator('#header-profile-button');
  if (await other.count()) {
    const profile = await other.boundingBox();
    assert.ok(box.x + box.width <= profile.x + 1, `music and profile do not overlap at ${width}`);
  }
  assert.equal(await page.locator('.music-credit a').count(), 2, 'music credit and license are available');
}

(async () => {
  let browser;
  try {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}/spiral-raid-quiz/`;
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});

    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({viewport:{width, height:900}, reducedMotion:'reduce'});
      await context.addInitScript(key => {
        if (!sessionStorage.getItem('music-test-seeded')) {
          localStorage.setItem(key, 'off');
          sessionStorage.setItem('music-test-seeded', 'yes');
        }
      }, preference);
      await context.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
      const page = await context.newPage();
      const before = musicRequests;
      await page.goto(url, {waitUntil:'load'});
      await layout(page, width);
      assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'false');
      assert.equal(await page.locator('#background-music').evaluate(el => el.volume), .08);
      assert.equal(await page.locator('#background-music').evaluate(el => el.loop), true);
      assert.equal(musicRequests, before, 'disabled music should not be downloaded');
      await page.locator('#music-toggle').click();
      await playing(page);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), preference), 'on');
      if (width === 390) {
        await page.evaluate(() => { location.hash = 'guide-twins'; });
        await page.waitForTimeout(400);
        assert.equal(await page.locator('#background-music').evaluate(el => el.paused), false, 'guide navigation should not interrupt music');
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:true}); document.dispatchEvent(new Event('visibilitychange')); });
        assert.equal(await page.locator('#background-music').evaluate(el => el.paused), true, 'music pauses in the background');
        await page.evaluate(() => { Object.defineProperty(document, 'hidden', {configurable:true, value:false}); document.dispatchEvent(new Event('visibilitychange')); });
        await playing(page);
      }
      await page.locator('#music-toggle').click();
      assert.equal(await page.locator('#background-music').evaluate(el => el.paused), true);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), preference), 'off');
      const requestsBeforeReload = musicRequests;
      await page.reload({waitUntil:'load'});
      assert.equal(await page.locator('#music-toggle').getAttribute('aria-pressed'), 'false', 'manual off survives reload');
      assert.equal(musicRequests, requestsBeforeReload, 'off remains lazy after reload');
      if (process.env.MUSIC_SCREENSHOT_DIR && width === 320) await page.screenshot({path:path.join(process.env.MUSIC_SCREENSHOT_DIR, 'music-mobile.png')});
      await context.close();
    }

    const blocked = await browser.newContext({viewport:{width:390,height:900}, reducedMotion:'reduce'});
    await blocked.addInitScript(() => {
      let activated = false;
      document.addEventListener('pointerdown', () => { activated = true; }, true);
      const original = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function() {
        return activated ? original.call(this) : Promise.reject(new DOMException('blocked', 'NotAllowedError'));
      };
    });
    await blocked.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    const page = await blocked.newPage();
    await page.goto(url, {waitUntil:'load'});
    await page.waitForFunction(() => document.querySelector('#music-toggle').dataset.state === 'ready');
    assert.equal(await page.locator('#background-music').evaluate(el => el.paused), true);
    await page.locator('.hero h1').click();
    await playing(page);
    const second = await blocked.newPage();
    await second.goto(url + 'guides/twins/', {waitUntil:'load'});
    await layout(second, 390);
    await page.locator('#music-toggle').click();
    await second.waitForFunction(() => document.querySelector('#music-toggle').dataset.state === 'off');
    assert.equal(await second.locator('#background-music').evaluate(el => el.paused), true, 'turning music off also stops other tabs');
    await second.locator('#music-toggle').click();
    await playing(second);
    await second.locator('#music-toggle').click();
    await second.goto(url, {waitUntil:'load'});
    assert.equal(await second.locator('#music-toggle').getAttribute('aria-pressed'), 'false', 'static guides share the preference with the main site');
    await blocked.close();

    const retry = await browser.newContext({reducedMotion:'reduce'});
    await retry.addInitScript(key => localStorage.setItem(key, 'off'), preference);
    await retry.route('**/api/**', route => route.fulfill({json:{entries:[], boards:[]}, headers:{'Access-Control-Allow-Origin':'*'}}));
    await retry.route('**/assets/temple-ripples.mp3', route => route.fulfill({status:404, body:'unavailable'}));
    const retryPage = await retry.newPage();
    await retryPage.goto(url, {waitUntil:'load'});
    await retryPage.locator('#music-toggle').click();
    await retryPage.waitForFunction(() => document.querySelector('#music-toggle').dataset.state === 'error');
    assert.match(await retryPage.locator('#music-toggle').getAttribute('title'), /重试/);
    await retry.unroute('**/assets/temple-ripples.mp3');
    await retryPage.locator('#music-toggle').click();
    await playing(retryPage);
    await retry.close();
    console.log('Background music: playback, autoplay fallback, retry, cross-tab preference, guides and responsive layout passed.');
  } finally {
    if (browser) await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
