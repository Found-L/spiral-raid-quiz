// Check the public honor dialog against an isolated database with multiple pages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const {startScoreService} = require('./browser_fixture');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON_BIN || 'python';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-honor-dialog-'));
const database = path.join(temp, 'quiz.sqlite3');

(async () => {
  let browser, api, web;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\nfor i in range(28):\n identity={'deviceId':f'{i+100:032x}','secret':'f'*64}\n server.profile(db,{**identity,'nickname':f'玩家{i:02d}'})\n attempt=f'{i+1000:032x}'\n db.execute('INSERT INTO attempts VALUES (?,?,?,?,?,?)',(attempt,identity['deviceId'],server.VERSION,5,10,1700000000000+i*3600000))\n if i<27: db.execute('INSERT INTO attempt_timings VALUES (?,?)',(attempt,3000-i*50))\ndb.close()`;
    const seeded = spawnSync(python, ['-c', seed], {cwd:root, env:{...process.env, QUIZ_DATABASE:database}, encoding:'utf8', windowsHide:true});
    assert.equal(seeded.status, 0, seeded.stderr);
    const fixture = await startScoreService({python, root, database});
    api = fixture.server;
    const net = require('node:net');
    const socket = net.createServer();
    await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
    const webPort = socket.address().port;
    await new Promise(resolve => socket.close(resolve));
    web = spawn(python, ['-m', 'http.server', String(webPort), '--bind', '127.0.0.1'], {cwd:root, stdio:'ignore', windowsHide:true});
    const url = `http://127.0.0.1:${webPort}/?api=local&api-port=${fixture.port}`;
    for (let i = 0; i < 80; i++) {
      try { if ((await fetch(url)).ok) break; } catch {}
      if (i === 79) throw new Error('Test web server did not start');
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for (const viewport of [{width:1440,height:900}, {width:390,height:800}, {width:320,height:480}, {width:700,height:360}]) {
      const context = await browser.newContext({viewport, reducedMotion:'reduce'});
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(url);
      await page.locator('[data-action="honor-show"][data-badge="quickest"]').click();
      await page.waitForFunction(() => document.querySelector('#honor-detail-status').textContent.includes('27 人曾达成'));
      assert.equal(await page.locator('#honor-detail-list li').count(), 20);
      assert.equal(await page.locator('#honor-detail-list li').first().locator('strong').first().textContent(), '玩家26');
      assert.match(await page.locator('#honor-detail-list li').first().textContent(), /首次达成/);
      const layout = await page.evaluate(() => {
        const dialog = document.querySelector('#honor-dialog'), list = document.querySelector('#honor-detail-list');
        const next = document.querySelector('#honor-detail-next').getBoundingClientRect();
        return {outerOverflow:dialog.scrollHeight-dialog.clientHeight, outerWidth:dialog.scrollWidth-dialog.clientWidth,
          listOverflow:list.scrollHeight-list.clientHeight, listWidth:list.scrollWidth-list.clientWidth,
          nextTop:next.top, nextBottom:next.bottom, viewport:innerHeight};
      });
      assert.ok(layout.outerOverflow <= 1, `dialog must not have a second scroll area ${JSON.stringify({viewport,layout})}`);
      assert.ok(layout.outerWidth <= 1 && layout.listWidth <= 1, `dialog must not overflow horizontally ${JSON.stringify({viewport,layout})}`);
      assert.ok(layout.listOverflow > 0, `the list should scroll for a full page ${JSON.stringify({viewport,layout})}`);
      assert.ok(layout.nextTop >= 0 && layout.nextBottom <= layout.viewport, `pagination must stay visible ${JSON.stringify({viewport,layout})}`);
      if (process.env.HONOR_SCREENSHOT_DIR && viewport.width !== 700) {
        fs.mkdirSync(process.env.HONOR_SCREENSHOT_DIR,{recursive:true});
        await page.screenshot({path:path.join(process.env.HONOR_SCREENSHOT_DIR,`history-${viewport.width}.png`)});
      }
      await page.locator('#honor-detail-list').evaluate(list => { list.scrollTop = list.scrollHeight; });
      await page.locator('#honor-detail-next').click();
      await page.waitForFunction(() => document.querySelector('#honor-detail-page').textContent.includes('2 / 2'));
      assert.equal(await page.locator('#honor-detail-list li').count(), 7);
      assert.equal(await page.locator('#honor-detail-list li').last().locator('strong').first().textContent(), '玩家00');
      assert.equal(await page.locator('#honor-detail-list').evaluate(list => list.scrollTop), 0);
      await page.locator('[data-action="honor-mode"][data-mode="current"]').click();
      await page.waitForFunction(() => document.querySelector('#honor-detail-status').textContent.includes('27 人上榜'));
      assert.match(await page.locator('#honor-detail-note').textContent(), /每个身份只列一次/);
      assert.equal(await page.locator('#honor-detail-list li').count(), 20);
      assert.equal(await page.locator('#honor-detail-list li').first().locator('strong').first().textContent(), '玩家26');
      if (process.env.HONOR_SCREENSHOT_DIR && viewport.width !== 700) await page.screenshot({path:path.join(process.env.HONOR_SCREENSHOT_DIR,`current-${viewport.width}.png`)});
      await page.locator('#honor-detail-next').click();
      await page.waitForFunction(() => document.querySelector('#honor-detail-page').textContent.includes('2 / 2'));
      assert.equal(await page.locator('#honor-detail-list li').count(), 7);
      assert.doesNotMatch(await page.locator('#honor-detail-list').textContent(), /玩家27/);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS newest-first history, complete pagination, timed eligibility and single-scroll desktop/mobile dialog');
  } finally {
    if (browser) await browser.close();
    if (web) web.kill();
    if (api) api.kill();
    if (path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep) && path.basename(temp).startsWith('raid-honor-dialog-')) fs.rmSync(temp,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
