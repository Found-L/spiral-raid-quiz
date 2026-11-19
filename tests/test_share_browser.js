const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON_BIN || 'python';
const screenshotDir = process.env.SOCIAL_SCREENSHOT_DIR;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-share-test-'));
const resolvedTmp = path.resolve(tmp), tmpBase = path.resolve(os.tmpdir()) + path.sep;
if (!resolvedTmp.startsWith(tmpBase) || !path.basename(resolvedTmp).startsWith('raid-share-test-')) throw new Error('unsafe temporary path');
const database = path.join(tmp, 'quiz.sqlite3');
const children = [];

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function ready(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Server did not start: ' + url);
}
function start(args, env) {
  const child = spawn(python, args, {cwd:root, env:{...process.env, ...env}, stdio:'ignore', windowsHide:true});
  children.push(child);
}
function shareId(url) { return new URL(url).searchParams.get('share'); }

(async () => {
  let browser;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\nfor c in 'ab':\n server.profile(db,{'deviceId':c*32,'secret':'1'*64,'nickname':'玩家'+c})\nfor i,c in enumerate('ab',1):\n db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',(str(i)*32,c*32,server.VERSION,10 if c=='a' else 8,10,1000+i))\n db.execute('INSERT INTO attempt_timings VALUES (?, ?)',(str(i)*32,100+i))\ndb.close()`;
    const seeded = spawnSync(python, ['-c', seed], {cwd:root, env:{...process.env, QUIZ_DATABASE:database}, encoding:'utf8', windowsHide:true});
    assert.equal(seeded.status, 0, seeded.stderr);
    const apiPort = await freePort(), webPort = await freePort();
    start(['domestic-backend/server.py'], {QUIZ_DATABASE:database, QUIZ_PORT:String(apiPort)});
    start(['-m','http.server',String(webPort),'--bind','127.0.0.1'], {});
    await ready(`http://127.0.0.1:${apiPort}/api/leaderboard`);
    const url = `http://127.0.0.1:${webPort}/?api=local&api-port=${apiPort}`;
    await ready(url);
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const owner = await browser.newContext({viewport:{width:1280,height:950}, acceptDownloads:true});
    await owner.addInitScript(() => {
      const key = 'spiral-temple-quiz-v1';
      localStorage.setItem(key + ':identity', JSON.stringify({deviceId:'a'.repeat(32),secret:'1'.repeat(64)}));
      localStorage.setItem(key + ':profile', JSON.stringify({nickname:'玩家a',playerNumber:1}));
    });
    const page = await owner.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto(url);
    await page.locator('.ranking-row').first().waitFor();
    await page.locator('[data-action="share-ranking"]').click();
    await page.locator('#share-content:not([hidden])').waitFor();
    assert.equal(await page.locator('#share-artwork').getAttribute('data-kind'), 'ranking');
    assert.equal(await page.locator('.share-orbit-inner').evaluate(node => getComputedStyle(node).animationName), 'share-orbit');
    const beforeOrbit = await page.locator('.share-orbit-inner').evaluate(node => getComputedStyle(node).transform);
    await page.waitForFunction(before => getComputedStyle(document.querySelector('.share-orbit-inner')).transform !== before, beforeOrbit, {timeout:5000});
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('.share-orbit-inner').evaluate(node => getComputedStyle(node).animationName), 'none', 'reduced motion disables decorative animation');
    await page.emulateMedia({reducedMotion:'no-preference'});
    const colors = await page.locator('#share-poster').evaluate(canvas => {
      const context = canvas.getContext('2d'), found = new Set();
      for (let x = 130; x < 950; x += 40) found.add([...context.getImageData(x, 210, 1, 1).data].join(','));
      return found.size;
    });
    assert(colors > 10, 'the exported poster includes the detailed illustrated background');
    assert(fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('data:image/webp;base64,'), 'poster background is bundled for offline rendering');
    const rankUrl = await page.locator('#share-link').inputValue();
    assert.match(shareId(rankUrl), /^[a-f0-9]{32}$/);
    assert(!rankUrl.includes('a'.repeat(32)) && !rankUrl.includes('1'.repeat(64)), 'share URL contains no identity');
    const rank = await (await fetch(`http://127.0.0.1:${apiPort}/api/shares/${shareId(rankUrl)}`)).json();
    assert.equal(rank.snapshot.kind, 'ranking'); assert.equal(rank.snapshot.rank, 1); assert.equal(rank.snapshot.score, 100);
    const posterLabel = await page.locator('#share-poster').getAttribute('aria-label');
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#share-download').click()]);
    const png = path.join(tmp, 'card.png'); await download.saveAs(png);
    const bytes = fs.readFileSync(png);
    assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(bytes.readUInt32BE(16), 1080); assert.equal(bytes.readUInt32BE(20), 1350);
    if (screenshotDir) await page.screenshot({path:path.join(screenshotDir, 'share-rank-desktop.png')});
    await page.locator('#share-close').click();
    await page.locator('[data-action="open-badges"]').first().click();
    await page.locator('.badge-shell[data-badge="first"] .badge-share').click();
    await page.locator('#share-content:not([hidden])').waitFor();
    assert.equal(await page.locator('#share-artwork').getAttribute('data-kind'), 'badge');
    const badgeUrl = await page.locator('#share-link').inputValue();
    const badge = await (await fetch(`http://127.0.0.1:${apiPort}/api/shares/${shareId(badgeUrl)}`)).json();
    assert.equal(badge.snapshot.kind, 'badge'); assert.equal(badge.snapshot.badge.id, 'first');
    assert.match(await page.locator('#share-poster').getAttribute('aria-label'), /初入寺院/);
    await page.locator('#share-close').click();
    await page.locator('[data-action="close-badges"]').click();
    await page.locator('[data-action="share-honor"][data-badge="quickest"]').click();
    await page.locator('#share-content:not([hidden])').waitFor();
    assert.equal(await page.locator('#share-artwork').getAttribute('data-kind'), 'honor');
    const honorUrl = await page.locator('#share-link').inputValue();
    const honor = await (await fetch(`http://127.0.0.1:${apiPort}/api/shares/${shareId(honorUrl)}`)).json();
    assert.equal(honor.snapshot.kind, 'honor'); assert.equal(honor.snapshot.badge.id, 'quickest'); assert.equal(honor.snapshot.rank, 1);

    const visitor = await browser.newContext({viewport:{width:320,height:700}});
    const visitorPage = await visitor.newPage();
    await visitorPage.goto(rankUrl);
    await visitorPage.locator('#share-dialog[open] #share-content:not([hidden])').waitFor();
    assert.equal(await visitorPage.locator('#share-poster').getAttribute('aria-label'), posterLabel, 'recipient sees the same snapshot');
    assert.equal(await visitorPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const box = await visitorPage.locator('#share-dialog').boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 320, 'share dialog fits a narrow screen');
    if (screenshotDir) await visitorPage.screenshot({path:path.join(screenshotDir, 'share-rank-mobile.png')});
    await visitorPage.goto(badgeUrl);
    await visitorPage.locator('#share-dialog[open] #share-content:not([hidden])').waitFor();
    assert.match(await visitorPage.locator('#share-poster').getAttribute('aria-label'), /初入寺院/);
    await visitorPage.goto(honorUrl);
    await visitorPage.locator('#share-dialog[open] #share-content:not([hidden])').waitFor();
    assert.match(await visitorPage.locator('#share-poster').getAttribute('aria-label'), /快枪手/);
    const invalid = new URL(rankUrl); invalid.searchParams.set('share', 'invalid');
    await visitorPage.goto(invalid.href);
    await visitorPage.getByText('分享链接无效或已失效。').waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS sharing badges, rankings and honors, PNG download, recipient links and mobile layout');
    await Promise.all([owner.close(),visitor.close()]);
  } finally {
    if (browser) await browser.close();
    for (const child of children) child.kill();
    fs.rmSync(resolvedTmp, {recursive:true, force:true, maxRetries:10, retryDelay:100});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
