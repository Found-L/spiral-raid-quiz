// Exercise profile and history with synthetic identities and an isolated local database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON_BIN || 'python';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-history-test-'));
const resolved = path.resolve(temp), tempRoot = path.resolve(os.tmpdir()) + path.sep;
if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('raid-history-test-')) throw new Error('unsafe temporary path');
const database = path.join(temp, 'quiz.sqlite3');
const html = fs.readFileSync(path.join(root, 'index.html'));
const origin = 'https://www.lysue.com';
const identity = {deviceId:'a'.repeat(32),secret:'1'.repeat(64)};
const key = 'spiral-temple-quiz-v1';

async function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port=server.address().port; server.close(() => resolve(port)); });
  });
}
async function ready(url) {
  for (let i=0; i<80; i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw new Error('Test score service did not start');
}

(async () => {
  let browser, server;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\nplayer={'deviceId':'a'*32,'secret':'1'*64}\nserver.profile(db,{**player,'nickname':'流云见月'})\nfor i in range(24):\n ident=f'{i+1:032x}'\n version=server.VERSION if i!=4 else 'older-bank'\n correct=[98,103,101,105,94,99][i%6]\n db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',(ident,player['deviceId'],version,correct,105,1794931200000+i*3600000))\n if i!=4: db.execute('INSERT INTO attempt_timings VALUES (?, ?)',(ident,720+i*37))\ndb.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)',(f'{1:032x}','demolition'))\ndb.close()`;
    const seeded = spawnSync(python, ['-c',seed], {cwd:root,env:{...process.env,QUIZ_DATABASE:database},encoding:'utf8',windowsHide:true});
    assert.equal(seeded.status,0,seeded.stderr);
    const port=await freePort();
    server=spawn(python,['domestic-backend/server.py'],{cwd:root,env:{...process.env,QUIZ_DATABASE:database,QUIZ_PORT:String(port)},stdio:'ignore',windowsHide:true});
    await ready(`http://127.0.0.1:${port}/api/leaderboard`);
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});
    const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    await context.addInitScript(({identity,key}) => {
      localStorage.setItem(key+':identity',JSON.stringify(identity));
      localStorage.setItem(key+':profile',JSON.stringify({nickname:'流云见月',playerNumber:1}));
    },{identity,key});
    let gate=null, release=null, fail=false, calls=0;
    await context.route('**/*', async route => {
      const request=route.request(), url=new URL(request.url());
      if (url.origin===origin && url.pathname==='/spiral-raid-quiz/') return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
      if (url.origin!==origin || !url.pathname.startsWith('/spiral-raid-quiz/api/')) return route.abort();
      const apiPath=url.pathname.slice('/spiral-raid-quiz'.length);
      if (apiPath==='/api/history') {
        calls++;
        if (gate) await gate;
        if (fail) return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'测试连接失败'})});
      }
      const headers={};
      for (const name of ['origin','content-type','access-control-request-method','access-control-request-headers']) if (request.headers()[name]) headers[name]=request.headers()[name];
      const options={method:request.method(),headers};
      if (!['GET','HEAD'].includes(request.method()) && request.postData()!==null) options.body=request.postData();
      try {
        const response=await fetch(`http://127.0.0.1:${port}${apiPath}${url.search}`,options);
        const returned={};
        for (const name of ['content-type','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-max-age']) if (response.headers.has(name)) returned[name]=response.headers.get(name);
        return route.fulfill({status:response.status,headers:returned,body:Buffer.from(await response.arrayBuffer())});
      } catch { return route.abort(); }
    });
    const page=await context.newPage(), errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/spiral-raid-quiz/');
    await page.locator('.profile-trigger').click();
    assert.equal(await page.locator('#profile-title').textContent(),'我的资料');
    assert.equal(await page.locator('#nickname').inputValue(),'流云见月');
    assert.match(await page.locator('#profile-player-number').textContent(),/#000001/);
    const screenshots=process.env.ACCOUNT_SCREENSHOT_DIR;
    if (screenshots) await page.screenshot({path:path.join(screenshots,'profile-desktop.png')});
    await page.locator('#profile-history').click();
    await page.locator('#history-list li').first().waitFor();
    assert.equal(await page.locator('#history-list li').count(),20);
    assert.equal(await page.locator('#history-count').textContent(),'24 次');
    assert.match(await page.locator('#history-list li').first().textContent(),/答对/);
    if (screenshots) await page.screenshot({path:path.join(screenshots,'history-desktop.png')});

    const first=await page.locator('#history-list li').first().elementHandle();
    gate=new Promise(resolve=>{release=resolve;});
    const before=calls;
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => document.querySelector('#history-refresh').disabled);
    assert.equal(await page.locator('#history-list li').count(),20);
    assert.equal(await page.locator('#history-summary').isVisible(),true);
    assert.equal(await first.evaluate(node=>node.isConnected),true);
    await page.locator('#history-refresh').evaluate(node=>node.click());
    assert.equal(calls,before+1,'repeated clicks must not start extra requests');
    release(); gate=null;
    await page.waitForFunction(() => !document.querySelector('#history-refresh').disabled);
    assert.equal(await first.evaluate(node=>node.isConnected),true,'unchanged rows should be preserved');

    await page.locator('#history-more').click();
    await page.waitForFunction(() => document.querySelectorAll('#history-list li').length===24);
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#history-refresh').disabled);
    assert.equal(await page.locator('#history-list li').count(),24,'refresh should retain loaded pages when unchanged');
    assert.equal(await first.evaluate(node=>node.isConnected),true);

    fail=true;
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#history-refresh').disabled);
    assert.equal(await page.locator('#history-list li').count(),24);
    assert.match(await page.locator('#history-status').textContent(),/保留原有记录/);
    fail=false;
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#history-refresh').disabled);
    assert.equal(await page.locator('#history-list li').count(),24);
    assert.equal(await page.locator('#connection-notice').isVisible(),false);

    const add = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\ndb=server.database()\ndb.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',('f'*32,'a'*32,server.VERSION,105,105,1795017600000))\ndb.close()`;
    const added=spawnSync(python,['-c',add],{cwd:root,env:{...process.env,QUIZ_DATABASE:database},encoding:'utf8',windowsHide:true});
    assert.equal(added.status,0,added.stderr);
    await page.locator('#history-refresh').click();
    await page.waitForFunction(() => !document.querySelector('#history-refresh').disabled);
    assert.equal(await page.locator('#history-count').textContent(),'25 次');
    assert.equal(await page.locator('#history-list li').count(),20);
    assert.equal(await first.evaluate(node=>node.isConnected),false,'new records should replace the old page');
    assert.match(await page.locator('#history-list li').first().textContent(),/105 \/ 105/);

    await page.setViewportSize({width:390,height:844});
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth<=innerWidth),true);
    if (screenshots) await page.screenshot({path:path.join(screenshots,'history-mobile.png')});
    await page.locator('.profile-trigger').click();
    if (screenshots) await page.screenshot({path:path.join(screenshots,'profile-mobile.png')});
    await page.locator('#nickname').fill('云间同行');
    await page.locator('#profile-form [type="submit"]').click();
    await page.waitForFunction(() => !document.querySelector('#profile-dialog').open);
    assert.equal(await page.locator('#header-profile').textContent(),'云间同行');
    await page.locator('.profile-trigger').click();
    await page.locator('#profile-badges').click();
    await page.locator('.badge-card[data-badge="demolition"] .badge-people').waitFor();
    assert.equal(await page.locator('.badge-card[data-badge="demolition"] .badge-people').textContent(),'1 人获得');
    assert.equal(await page.locator('.badge-card[data-badge="quickest"] .badge-people').textContent(),'历史 1 人');
    assert.deepEqual(errors,[]);
    console.log('PASS profile, history refresh and pagination, failures, exact badge counts and mobile layout');
    await context.close();
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
