// Exercise the new guide and private review against an isolated score database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const {startScoreService} = require('./browser_fixture');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON_BIN || 'python';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-new-honors-'));
const database = path.join(temp, 'quiz.sqlite3');
const html = fs.readFileSync(path.join(root, 'index.html'));
const origin = 'https://www.lysue.com';
const identity = {deviceId:'a'.repeat(32),secret:'1'.repeat(64)};
const key = 'spiral-temple-quiz-v1';

async function assertGuardTextFits(page) {
  for (const svg of await page.locator('.guard-figure svg').all()) {
    const clipped = await svg.evaluate(element => {
      const view = element.viewBox.baseVal;
      return [...element.querySelectorAll('text')].map(text=>({text:text.textContent, box:text.getBBox()})).filter(({box})=>box.x < view.x || box.y < view.y || box.x + box.width > view.x + view.width || box.y + box.height > view.y + view.height).map(({text})=>text);
    });
    assert.deepEqual(clipped, [], 'diagram labels should stay inside the view box');
  }
}

(async () => {
  let browser, server;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\np={'deviceId':'a'*32,'secret':'1'*64}\nserver.profile(db,{**p,'nickname':'流云见月'})\na={q['id']:q['answer'][:] for q in server.QUESTIONS}\na['q001']=['a']\norder=[q['id'] for q in server.QUESTIONS]\nfor i in range(3): server.submit(db,{**p,'version':server.VERSION,'attemptId':f'{i+1:032x}','answers':a,'questionOrder':order})\ndb.close()`;
    const seeded = spawnSync(python, ['-c',seed], {cwd:root,env:{...process.env,QUIZ_DATABASE:database},encoding:'utf8',windowsHide:true});
    assert.equal(seeded.status, 0, seeded.stderr);
    const fixture = await startScoreService({python,root,database}); server = fixture.server;
    browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    for (const [name,width,height] of [['desktop',1440,900],['tablet',768,1024],['mobile',390,844],['narrow',320,760]]) {
      const context = await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
      await context.addInitScript(({identity,key}) => {
        localStorage.setItem(key+':identity',JSON.stringify(identity));
        localStorage.setItem(key+':profile',JSON.stringify({nickname:'流云见月',playerNumber:1}));
      },{identity,key});
      await context.route('**/*', async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.origin === origin && url.pathname === '/spiral-raid-quiz/') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
        if (url.origin !== origin || !url.pathname.startsWith('/spiral-raid-quiz/api/')) return route.abort();
        const headers = {};
        for (const name of ['origin','content-type','access-control-request-method','access-control-request-headers']) if (request.headers()[name]) headers[name] = request.headers()[name];
        const options = {method:request.method(),headers};
        if (!['GET','HEAD'].includes(request.method()) && request.postData() !== null) options.body = request.postData();
        const apiPath = url.pathname.slice('/spiral-raid-quiz'.length);
        const response = await fetch(`http://127.0.0.1:${fixture.port}${apiPath}${url.search}`, options);
        const returned = {};
        for (const name of ['content-type','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers']) if (response.headers.has(name)) returned[name] = response.headers.get(name);
        return route.fulfill({status:response.status,headers:returned,body:Buffer.from(await response.arrayBuffer())});
      });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin+'/spiral-raid-quiz/#guide-twins');
      await page.locator('.guard-card > summary').click();
      assert.match(await page.locator('.guard-card').textContent(), /金银童.*同时在场/s);
      assert.match(await page.locator('.guard-copy').textContent(), /小怪.*击杀.*地面矩形/s);
      assert.equal(await page.locator('.guard-point').count(), 3);
      assert.doesNotMatch(await page.locator('.guard-card').textContent(), /录像|服务器|来源|待.*核实/);
      assert.equal(await page.locator('.guard-figure svg').getAttribute('role'), 'img');
      await assertGuardTextFits(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.HONORS_SCREENSHOT_DIR) await page.locator('.guard-card').screenshot({path:path.join(process.env.HONORS_SCREENSHOT_DIR,`guard-twins-${name}.png`)});
      await page.goto(origin+'/spiral-raid-quiz/#guide-witch');
      await page.locator('.guard-card > summary').click();
      assert.match(await page.locator('.guard-card').textContent(), /玄冥二老.*回血.*三破战士.*跳中/s);
      assert.match(await page.locator('.guard-card').textContent(), /互相回血.*控制后绕背.*跳向场中央.*保护.*其他战士仍会攻击/s);
      assert.equal(await page.locator('.guard-point').count(), 5);
      assert.doesNotMatch(await page.locator('.guard-card').textContent(), /录像|服务器|来源|待.*核实/);
      for (const svg of await page.locator('.guard-figure svg').all()) assert.doesNotMatch(await svg.getAttribute('aria-label'), /录像|服务器|来源|待.*核实/);
      assert.equal(await page.locator('.guard-figure svg .guard-enemy').count(), 5);
      assert.equal(await page.locator('.guard-figure svg .guard-flame').count(), 1);
      await assertGuardTextFits(page);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.HONORS_SCREENSHOT_DIR) await page.locator('.guard-card').screenshot({path:path.join(process.env.HONORS_SCREENSHOT_DIR,`guard-witch-${name}.png`)});
      assert.equal(await page.locator('.guard-jumper').evaluate(node=>getComputedStyle(node).animationName), 'none');
      await page.emulateMedia({reducedMotion:'no-preference'});
      const jump = await page.locator('.guard-jumper').evaluate(node=>{
        const animation=node.getAnimations()[0];
        animation.pause(); animation.currentTime=500; const start=getComputedStyle(node).transform;
        animation.currentTime=3000; return [start,getComputedStyle(node).transform];
      });
      assert.notEqual(jump[0], jump[1], 'the warrior moves into the center before the blast');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.goto(origin+'/spiral-raid-quiz/#guide-spirit');
      await page.locator('.guard-card > summary').click();
      assert.equal(await page.locator('.guard-figure svg').count(), 2);
      assert.match(await page.locator('.guard-card').textContent(), /东方朔.*分批击杀.*灵魂损伤.*血魔灵.*连线.*直到连线消失.*红圈/s);
      await assertGuardTextFits(page);
      assert.doesNotMatch(await page.locator('.guard-card').textContent(), /录像|服务器|来源|待.*核实/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.HONORS_SCREENSHOT_DIR) await page.locator('.guard-card').screenshot({path:path.join(process.env.HONORS_SCREENSHOT_DIR,`guard-${name}.png`)});
      assert.equal(await page.locator('.guard-runner').evaluate(node=>getComputedStyle(node).animationName), 'none', 'reduced motion must stop the diagram');
      await page.emulateMedia({reducedMotion:'no-preference'});
      const movement = await page.locator('.guard-runner').evaluate(node=>{
        const animation=node.getAnimations()[0];
        animation.pause(); animation.currentTime=500; const start=getComputedStyle(node).transform;
        animation.currentTime=3000; return [start,getComputedStyle(node).transform];
      });
      assert.notEqual(movement[0], movement[1], 'the marked player moves outward during the demonstration');
      assert.notEqual(await page.locator('.guard-curse-line').evaluate(node=>getComputedStyle(node).animationName), 'none');
      await page.emulateMedia({reducedMotion:'reduce'});
      await page.locator('.profile-trigger').click();
      await page.locator('#profile-badges').click();
      await page.locator('#repeat-review:not([hidden])').waitFor();
      assert.match(await page.locator('#repeat-review-count').textContent(), /1 题/);
      await page.locator('#repeat-review > summary').click();
      await page.locator('#repeat-review-list details > summary').click();
      assert.match(await page.locator('#repeat-review-list').textContent(), /酷寒剑主 T 被击退/);
      assert.match(await page.locator('#repeat-review-list').textContent(), /正确答案/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (process.env.HONORS_SCREENSHOT_DIR) await page.locator('#repeat-review').screenshot({path:path.join(process.env.HONORS_SCREENSHOT_DIR,`repeat-${name}.png`)});
      const original = await page.locator('#repeat-review-list details').elementHandle();
      await page.locator('#badges-reload').click();
      await page.waitForFunction(() => !document.querySelector('#badges-reload').disabled);
      assert.equal(await original.evaluate(node=>node.isConnected), true, 'refresh should preserve unchanged review');
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log('PASS desktop/mobile three guard supplements, private review and quiet refresh');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    if (path.resolve(temp).startsWith(path.resolve(os.tmpdir())+path.sep) && path.basename(temp).startsWith('raid-new-honors-')) fs.rmSync(temp,{recursive:true,force:true});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
