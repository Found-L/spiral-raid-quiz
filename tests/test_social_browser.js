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
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-social-test-'));
const database = path.join(tmp, 'quiz.sqlite3');
const children = [];

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}
async function waitReady(url) {
  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`server did not start: ${url}`);
}
function start(args, env) {
  const child = spawn(python, args, {cwd:root, env:{...process.env, ...env}, stdio:'ignore', windowsHide:true});
  children.push(child);
  return child;
}
async function context(browser, code, viewport) {
  const ctx = await browser.newContext({viewport});
  if (code) await ctx.addInitScript(({char, nickname, number}) => {
    const key = 'spiral-temple-quiz-v1';
    localStorage.setItem(key + ':identity', JSON.stringify({deviceId:char.repeat(32), secret:(char === 'a' ? '2' : '1').repeat(64)}));
    localStorage.setItem(key + ':profile', JSON.stringify({nickname, playerNumber:number}));
  }, {char:code, nickname:'玩家' + code, number:code.charCodeAt(0) - 96});
  return ctx;
}

(async () => {
  let browser;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server, badge_metrics\nserver.initialize()\ndb=server.database()\nfor c in 'abc':\n server.profile(db,{'deviceId':c*32,'secret':('2' if c=='a' else '1')*64,'nickname':'玩家'+c})\ndb.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',('9'*32,'a'*32,server.VERSION,10,10,1000))\ndb.execute('INSERT INTO attempt_timings VALUES (?, ?)',('9'*32,200))\nbadge_metrics.record_current(db,server.honor_boards)\ndb.execute('INSERT INTO badge_record_events VALUES (?, ?, ?)',('b'*32,'quickest',2000))\ndb.close()`;
    const seeded = spawnSync(python, ['-c', seed], {cwd:root, env:{...process.env, QUIZ_DATABASE:database}, encoding:'utf8', windowsHide:true});
    assert.equal(seeded.status, 0, seeded.stderr);
    const apiPort = await freePort(), webPort = await freePort();
    start(['domestic-backend/server.py'], {QUIZ_DATABASE:database, QUIZ_PORT:String(apiPort)});
    start(['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], {});
    await waitReady(`http://127.0.0.1:${apiPort}/api/leaderboard`);
    const url = `http://127.0.0.1:${webPort}/?api=local&api-port=${apiPort}`;
    await waitReady(url);
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});

    const b = await context(browser, 'b', {width:1440, height:900});
    const page = await b.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.locator('.ranking-row').first().waitFor();
    await page.locator('.honor-card').first().waitFor();
    await page.evaluate(() => { window.beforeRefreshRow = document.querySelector('.ranking-row'); window.beforeRefreshHonor = document.querySelector('.honor-card'); });
    await page.route('**/api/leaderboard?*', async route => { await new Promise(resolve => setTimeout(resolve, 350)); await route.continue(); });
    await page.locator('[data-action="refresh-ranking"]').click();
    await page.waitForFunction(() => document.querySelector('#ranking-list').getAttribute('aria-busy') === 'true');
    assert.equal(await page.evaluate(() => window.beforeRefreshRow === document.querySelector('.ranking-row')), true, 'row remains while refreshing');
    assert.equal(await page.locator('#ranking-list .empty-state').count(), 0, 'refresh does not replace rows with a loading placeholder');
    await page.waitForFunction(() => document.querySelector('#ranking-list').getAttribute('aria-busy') === 'false');
    assert.equal(await page.evaluate(() => window.beforeRefreshRow === document.querySelector('.ranking-row')), true, 'unchanged row stays mounted');
    assert.equal(await page.evaluate(() => window.beforeRefreshHonor === document.querySelector('.honor-card')), true, 'unchanged honor card stays mounted');
    await page.unroute('**/api/leaderboard?*');
    await page.route('**/api/leaderboard?*', route => route.abort());
    await page.locator('[data-action="refresh-ranking"]').click();
    await page.waitForFunction(() => document.querySelector('#ranking-list').getAttribute('aria-busy') === 'false');
    assert.equal(await page.evaluate(() => window.beforeRefreshRow === document.querySelector('.ranking-row')), true, 'refresh failure preserves the prior row');
    await page.unroute('**/api/leaderboard?*');
    await page.locator('.rank-social-open[data-picker="false"]').first().click();
    await page.locator('#social-add-reaction').waitFor();
    assert.equal(await page.locator('#social-reactions').isVisible(), false, 'picker is initially closed');
    await page.locator('[data-action="social-toggle-picker"]').click();
    await page.locator('#social-reactions').waitFor();
    assert.equal(await page.locator('[data-action="social-reaction"]').count(), 12);
    await page.locator('[data-reaction="down"]').waitFor();
    await page.locator('[data-reaction="clown"]').waitFor();
    await page.locator('[data-action="social-reaction"][data-reaction="clap"]').click();
    await page.getByText('你贴了 👏', {exact:true}).waitFor();
    assert.equal(await page.locator('#social-reactions').isVisible(), false, 'picker closes after selection');
    await page.waitForTimeout(1100);
    await page.locator('[data-action="social-toggle-picker"]').click();
    await page.locator('[data-reaction="clap"][aria-pressed="true"]').click();
    await page.getByText('你贴了 👏', {exact:true}).waitFor({state:'hidden'});
    await page.waitForTimeout(1100);
    await page.locator('[data-action="social-toggle-picker"]').click();
    await page.locator('[data-reaction="clown"]').click();
    await page.getByText('你贴了 🤡', {exact:true}).waitFor();
    await page.locator('#social-input').fill('<img src=x onerror=alert(1)> 配合很稳');
    await page.locator('#social-submit').click();
    await page.locator('.social-comment').waitFor();
    assert.equal(await page.locator('.social-comment img').count(), 0);
    assert.match(await page.locator('.social-comment p').innerText(), /<img/);
    await page.locator('[data-action="social-close"]').click();
    await page.locator('.social-preview').waitFor();
    assert.equal(await page.evaluate(() => window.beforeRefreshRow === document.querySelector('.ranking-row')), true, 'changed contents update the same row');
    await page.locator('.rank-social-open[data-picker="true"]').first().click();
    await page.locator('#social-reactions').waitFor();
    await page.locator('[data-action="social-close"]').click();
    await page.locator('.rank-social-open').first().scrollIntoViewIfNeeded();
    if (screenshotDir) { fs.mkdirSync(screenshotDir, {recursive:true}); await page.screenshot({path:path.join(screenshotDir, 'desktop-ranking.png')}); }

    const c = await context(browser, 'c', {width:360, height:800});
    const mobile = await c.newPage();
    mobile.on('pageerror', error => errors.push(error.message));
    await mobile.goto(url);
    await mobile.locator('.rank-social-open[data-picker="false"]').first().click();
    await mobile.locator('[data-action="social-like"]').first().click();
    await mobile.locator('[data-action="social-like"][aria-pressed="true"]').waitFor();
    if (screenshotDir) await mobile.screenshot({path:path.join(screenshotDir, 'mobile-social.png')});
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'mobile horizontal overflow');
    const box = await mobile.locator('#social-dialog').boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 360, 'dialog fits mobile screen');
    await mobile.locator('[data-action="social-close"]').click();
    await mobile.locator('.social-preview b').filter({hasText:'热评'}).waitFor();

    const a = await context(browser, 'a', {width:1100, height:800});
    const owner = await a.newPage();
    await owner.goto(url);
    await owner.locator('.rank-social-open[data-picker="false"]').first().click();
    await owner.locator('[data-action="social-hide"]').click();
    await owner.getByText('已隐藏', {exact:false}).first().waitFor();
    await mobile.reload();
    await mobile.locator('.rank-social-open[data-picker="false"]').first().click();
    await mobile.getByText('还没有公开评价').waitFor();
    await owner.locator('[data-action="social-hide"]').click();
    await owner.getByText('已隐藏', {exact:false}).first().waitFor({state:'detached'});
    await owner.locator('[data-action="social-close"]').click();
    await owner.locator('[data-action="honor-show"][data-badge="quickest"]').click();
    await owner.getByText('纪录已留档', {exact:true}).waitFor();
    await owner.getByText('记录时间', {exact:false}).waitFor();
    await owner.locator('[data-action="close-honor-detail"]').click();

    await mobile.locator('[data-action="social-close"]').click();
    await mobile.locator('.rank-social-open[data-picker="false"]').first().click();
    await mobile.locator('#social-form:not([hidden])').waitFor();
    await mobile.route('**/api/social/comment', route => route.abort());
    await mobile.locator('#social-input').fill('网络恢复后再提交');
    await mobile.locator('#social-submit').click();
    await mobile.getByText('无法连接成绩服务', {exact:false}).waitFor();
    assert.equal(await mobile.locator('#social-input').inputValue(), '网络恢复后再提交');
    await mobile.unroute('**/api/social/comment');
    await mobile.locator('#social-submit').click();
    await mobile.getByText('网络恢复后再提交', {exact:true}).waitFor();

    const visitor = await context(browser, null, {width:360, height:800});
    const anonymous = await visitor.newPage();
    await anonymous.goto(url);
    await anonymous.locator('.rank-social-open[data-picker="false"]').first().click();
    await anonymous.locator('[data-action="social-toggle-picker"]').click();
    await anonymous.locator('[data-action="social-reaction"][data-reaction="fire"]').click();
    await anonymous.locator('#profile-dialog[open]').waitFor();
    await anonymous.locator('#nickname').fill('新队友');
    await anonymous.locator('#profile-form [type="submit"]').click();
    await anonymous.locator('#social-dialog[open]').waitFor();
    await anonymous.locator('[data-action="social-reaction"][data-reaction="fire"]').click();
    await anonymous.getByText('你贴了 🔥', {exact:true}).waitFor();
    assert.equal(await anonymous.locator('[data-action="social-report"]').count(), 0);
    const removedRoute = await fetch(`http://127.0.0.1:${apiPort}/api/social/report`, {method:'POST', headers:{'Content-Type':'application/json'}, body:'{}'});
    assert.equal(removedRoute.status, 404);
    await anonymous.setViewportSize({width:320, height:700});
    await anonymous.locator('[data-action="social-toggle-picker"]').click();
    await anonymous.locator('#social-reactions').waitFor();
    if (screenshotDir) await anonymous.screenshot({path:path.join(screenshotDir, 'mobile-picker.png')});
    assert.equal(await anonymous.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, '320px horizontal overflow');
    const narrowBox = await anonymous.locator('#social-dialog').boundingBox();
    assert(narrowBox && narrowBox.x >= 0 && narrowBox.x + narrowBox.width <= 320, 'dialog fits a narrow phone');

    await page.locator('.rank-social-open[data-picker="false"]').first().click();
    await page.locator('#social-delete-own:not([hidden])').waitFor();
    page.once('dialog', alert => alert.accept());
    await page.locator('#social-delete-own').click();
    await page.locator('#social-delete-own').waitFor({state:'hidden'});
    assert.equal(await page.locator('.social-comment p').filter({hasText:'配合很稳'}).count(), 0);
    await page.locator('[data-action="social-close"]').click();
    await page.locator('[data-action="open-badges"]').first().click();
    await page.locator('.badge-card[data-badge="perfect"] .badge-people').waitFor();
    assert.match(await page.locator('.badge-card[data-badge="perfect"] .badge-people').innerText(), /1 人获得/);
    if (screenshotDir) await page.screenshot({path:path.join(screenshotDir, 'desktop-badges.png')});
    assert.deepEqual(errors, []);
    console.log('PASS browser reactions, comments, safe rendering, likes, hide/restore, badge counts and mobile layout');
    await Promise.all([a.close(), b.close(), c.close(), visitor.close()]);
  } finally {
    if (browser) await browser.close();
    for (const child of children) child.kill();
    const resolved = path.resolve(tmp), base = path.resolve(os.tmpdir()) + path.sep;
    if (!resolved.startsWith(base) || !path.basename(resolved).startsWith('raid-social-test-')) throw new Error('unsafe temporary path');
    fs.rmSync(resolved, {recursive:true, force:true, maxRetries:10, retryDelay:100});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
