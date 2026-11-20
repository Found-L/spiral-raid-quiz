// Verify private per-attempt review on narrow screens and with real, isolated API data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {chromium} = require('playwright');
const {startScoreService} = require('./browser_fixture');

const root = path.resolve(__dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-history-review-'));
const database = path.join(temp, 'quiz.sqlite3');
const python = process.env.PYTHON_BIN || 'python';
const html = fs.readFileSync(path.join(root, 'index.html'));
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const origin = 'https://www.lysue.com', key = 'spiral-temple-quiz-v1';
const identity = {deviceId:'a'.repeat(32), secret:'1'.repeat(64)};
const lastId = '4'.padStart(32, '0');
const answers = Object.fromEntries(bank.questions.map(q => [q.id, ['q001','q010','q100'].includes(q.id)
  ? [q.options.find(option => !q.answer.includes(option.id)).id] : q.answer]));

(async () => {
  let browser, server;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\np={'deviceId':'a'*32,'secret':'1'*64}\nserver.profile(db,{**p,'nickname':'流云见月'})\ndef add(i,wrong,version=None):\n version=version or server.VERSION\n bank=server.BANKS[version]\n answers={q['id']:list(q['answer']) for q in bank['questions']}\n for q in bank['questions']:\n  if q['id'] in wrong: answers[q['id']]=[next(o['id'] for o in q['options'] if o['id'] not in q['answer'])]\n server.submit(db,{**p,'attemptId':f'{i:032x}','version':version,'answers':answers})\n db.execute('UPDATE attempts SET submitted_at=? WHERE id=?',(1794800000000+i*1000,f'{i:032x}'))\nadd(1,set())\nadd(2,{'q001'},'peak-spiral-2026-11-18-v9')\ndb.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',(f'{3:032x}',p['deviceId'],server.VERSION,102,105,1794800003000))\nadd(4,{'q001','q010','q100'})\ndb.close()`;
    const seeded = spawnSync(python, ['-c', seed], {cwd:root, env:{...process.env, QUIZ_DATABASE:database}, encoding:'utf8', windowsHide:true});
    assert.equal(seeded.status, 0, seeded.stderr);
    const fixture = await startScoreService({python, root, database}); server = fixture.server;
    browser = await chromium.launch({headless:true, executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});

    for (const width of [320, 390, 1440]) {
      const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce'});
      await context.addInitScript(({identity,key,answers,lastId}) => {
        if (!sessionStorage.getItem('history-review-seeded')) {
          localStorage.setItem(key+':identity', JSON.stringify(identity));
          localStorage.setItem(key+':profile', JSON.stringify({nickname:'流云见月',playerNumber:1}));
          localStorage.setItem(key+':last-result', JSON.stringify({attemptId:lastId,answers}));
          sessionStorage.setItem('history-review-seeded', 'yes');
        }
      }, {identity,key,answers,lastId});
      let failReview = false;
      await context.route('**/*', async route => {
        const request=route.request(), url=new URL(request.url());
        if (url.origin===origin && url.pathname==='/spiral-raid-quiz/') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
        if (url.origin!==origin || !url.pathname.startsWith('/spiral-raid-quiz/api/')) return route.abort();
        const apiPath=url.pathname.slice('/spiral-raid-quiz'.length);
        if (failReview && apiPath==='/api/history/review') return route.fulfill({status:503,json:{error:'测试连接失败'}});
        const headers={};
        for (const name of ['origin','content-type','access-control-request-method','access-control-request-headers']) if (request.headers()[name]) headers[name]=request.headers()[name];
        const options={method:request.method(),headers};
        if (!['GET','HEAD'].includes(request.method()) && request.postData()!==null) options.body=request.postData();
        const response=await fetch(`http://127.0.0.1:${fixture.port}${apiPath}${url.search}`,options);
        const returned={};
        for (const name of ['content-type','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers']) if (response.headers.has(name)) returned[name]=response.headers.get(name);
        return route.fulfill({status:response.status,headers:returned,body:Buffer.from(await response.arrayBuffer())});
      });
      const page=await context.newPage(), errors=[];
      page.on('pageerror', error=>errors.push(error.message));
      await page.goto(origin+'/spiral-raid-quiz/');
      await page.locator('#header-profile-button').click();
      await page.locator('#profile-history').click();
      await page.locator('#history-list > li').first().waitFor();
      const rows=page.locator('#history-list > li');
      assert.equal(await rows.count(),4);
      assert.match(await rows.nth(0).textContent(),/查看错题 · 3 题/);
      assert.match(await rows.nth(1).textContent(),/没有保存错题明细/);
      assert.match(await rows.nth(3).textContent(),/本轮全部答对/);
      await rows.nth(0).locator('summary').click();
      await rows.nth(0).locator('.history-review-question').last().waitFor();
      assert.equal(await rows.nth(0).locator('.history-review-question').count(),3);
      const first=rows.nth(0).locator('.history-review-question').first();
      assert.match(await first.textContent(),/你的选择/);
      assert.match(await first.textContent(),/正确答案/);
      assert.match(await first.textContent(),/解析/);
      assert.ok((await first.textContent()).includes(bank.questions.find(q=>q.id==='q001').question));
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true, `expanded review fits at ${width}`);
      if (process.env.HISTORY_REVIEW_SCREENSHOT_DIR && width===390) await rows.nth(0).screenshot({path:path.join(process.env.HISTORY_REVIEW_SCREENSHOT_DIR,'history-review-mobile.png')});

      failReview=true;
      await rows.nth(2).locator('summary').click();
      await rows.nth(2).locator('.history-review-retry').waitFor();
      failReview=false;
      await rows.nth(2).locator('.history-review-retry').click();
      await rows.nth(2).locator('.history-review-question').waitFor();
      assert.match(await rows.nth(2).textContent(),/旧题库/);
      assert.match(await rows.nth(2).textContent(),/本次选择未保留/);

      await page.evaluate(key=>localStorage.removeItem(key+':last-result'),key);
      await page.reload();
      await page.locator('#header-profile-button').click();
      await page.locator('#profile-history').click();
      const restored=page.locator('#history-list > li').first();
      await restored.locator('summary').click();
      await restored.locator('.history-review-question').last().waitFor();
      assert.match(await restored.textContent(),/本次选择未保留/);
      assert.equal(await restored.locator('.history-review-question').count(),3);
      assert.deepEqual(errors,[]);
      await context.close();
    }

    const offline=await browser.newContext({viewport:{width:390,height:900},reducedMotion:'reduce'});
    await offline.addInitScript(({identity,key,answers,lastId,version})=>{
      localStorage.setItem(key+':identity',JSON.stringify(identity));
      localStorage.setItem(key+':profile',JSON.stringify({nickname:'流云见月',playerNumber:1}));
      localStorage.setItem(key+':pending',JSON.stringify([{attemptId:lastId,version,answers,elapsedSeconds:500,localSubmittedAt:1794800004000}]));
    },{identity,key,answers,lastId,version:bank.version});
    await offline.route('**/*',route=>{
      const url=new URL(route.request().url());
      if (url.origin===origin && url.pathname==='/spiral-raid-quiz/') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
      if (url.pathname.startsWith('/spiral-raid-quiz/api/')) return route.fulfill({status:503,json:{error:'服务暂时不可用'}});
      return route.abort();
    });
    const page=await offline.newPage();
    await page.goto(origin+'/spiral-raid-quiz/');
    await page.locator('#header-profile-button').click();
    await page.locator('#profile-history').click();
    const pending=page.locator('#history-list > li').first();
    await pending.locator('summary').click();
    await pending.locator('.history-review-question').last().waitFor();
    assert.match(await pending.textContent(),/待上传/);
    assert.equal(await pending.locator('.history-review-question').count(),3);
    assert.match(await pending.textContent(),/你的选择/);
    await offline.close();
    console.log('PASS per-attempt private review, old/missing records, retry, offline and 320–1440px layout');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    const resolved=path.resolve(temp), tempRoot=path.resolve(os.tmpdir())+path.sep;
    if (resolved.startsWith(tempRoot) && path.basename(resolved).startsWith('raid-history-review-')) fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
