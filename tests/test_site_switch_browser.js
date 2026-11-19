// Exercise navigation, both origins, and the score service with an isolated database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const {spawn, spawnSync} = require('node:child_process');
const {chromium} = require('playwright');

const root = path.resolve(__dirname, '..');
const python = process.env.PYTHON_BIN || 'python';
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'raid-site-switch-'));
const resolved = path.resolve(temp), tempRoot = path.resolve(os.tmpdir()) + path.sep;
if (!resolved.startsWith(tempRoot) || !path.basename(resolved).startsWith('raid-site-switch-')) throw new Error('unsafe temporary path');
const database = path.join(temp, 'quiz.sqlite3');
const html = fs.readFileSync(path.join(root, 'index.html'));
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const old = JSON.parse(fs.readFileSync(path.join(root, 'domestic-backend/banks/peak-spiral-2026-11-18-v3.json'), 'utf8'));
const domestic = 'https://www.lysue.com', overseas = 'https://found-l.github.io';
const apiHost = 'spiral-raid-quiz-api.foundliny.chatgpt.site';
const key = 'spiral-temple-quiz-v1';
const a = {deviceId:'a'.repeat(32),secret:'1'.repeat(64)};
const b = {deviceId:'b'.repeat(32),secret:'2'.repeat(64)};

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer(); server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port=server.address().port; server.close(() => resolve(port)); });
  });
}
async function ready(url) {
  for (let i=0;i<80;i++) {
    try { if ((await fetch(url)).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve,100));
  }
  throw new Error('Test score service did not start');
}

(async () => {
  let browser, server;
  try {
    const seed = `import sys\nsys.path.insert(0,'domestic-backend')\nimport server\nserver.initialize()\ndb=server.database()\nfor c,s,n in [('a','1','国内玩家'),('b','2','国外玩家')]:\n server.profile(db,{'deviceId':c*32,'secret':s*64,'nickname':n})\ndb.close()`;
    const seeded = spawnSync(python,['-c',seed],{cwd:root,env:{...process.env,QUIZ_DATABASE:database},encoding:'utf8',windowsHide:true});
    assert.equal(seeded.status,0,seeded.stderr);
    const port=await freePort();
    server=spawn(python,['domestic-backend/server.py'],{cwd:root,env:{...process.env,QUIZ_DATABASE:database,QUIZ_PORT:String(port)},stdio:'ignore',windowsHide:true});
    await ready(`http://127.0.0.1:${port}/api/leaderboard`);
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe'});

    async function setup(states, viewport={width:1280,height:900}) {
      const context=await browser.newContext({viewport,acceptDownloads:true});
      const requests=[];
      await context.addInitScript(({states,key}) => {
        if (localStorage.getItem('site-switch-test-seeded')) return;
        for (const [suffix,value] of Object.entries(states[location.origin] || {})) localStorage.setItem(key + suffix,JSON.stringify(value));
        localStorage.setItem('site-switch-test-seeded','yes');
      },{states,key});
      await context.route('**/*', async route => {
        const request=route.request(), url=new URL(request.url());
        if ([domestic,overseas].includes(url.origin) && url.pathname === '/spiral-raid-quiz/') {
          return route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html});
        }
        let apiPath='';
        if (url.origin === domestic && url.pathname.startsWith('/spiral-raid-quiz/api/')) apiPath=url.pathname.slice('/spiral-raid-quiz'.length);
        if (url.hostname === apiHost && url.pathname.startsWith('/api/')) apiPath=url.pathname;
        if (!apiPath) return route.abort();
        requests.push({host:url.hostname,path:apiPath,method:request.method()});
        const headers={};
        for (const name of ['origin','content-type','access-control-request-method','access-control-request-headers']) {
          if (request.headers()[name]) headers[name]=request.headers()[name];
        }
        const options={method:request.method(),headers};
        if (!['GET','HEAD'].includes(request.method()) && request.postData() !== null) options.body=request.postData();
        try {
          const response=await fetch(`http://127.0.0.1:${port}${apiPath}${url.search}`,options);
          const returned={};
          for (const name of ['content-type','access-control-allow-origin','access-control-allow-methods','access-control-allow-headers','access-control-max-age']) {
            if (response.headers.has(name)) returned[name]=response.headers.get(name);
          }
          return route.fulfill({status:response.status,headers:returned,body:Buffer.from(await response.arrayBuffer())});
        } catch { return route.abort(); }
      });
      return {context,requests};
    }
    const stateA={':identity':a,':profile':{nickname:'国内玩家',playerNumber:1},':draft':{version:bank.version,index:0,answers:{q001:['a']}}};
    const stateB={':identity':b,':profile':{nickname:'国外玩家',playerNumber:2},':draft':{version:bank.version,index:0,answers:{q002:['a']}}};

    for (const [source,target,sourceState,targetState,button,expectedApi] of [
      [domestic,overseas,stateA,stateB,'overseas',apiHost],
      [overseas,domestic,stateA,stateB,'domestic','www.lysue.com'],
    ]) {
      const {context,requests}=await setup({[source]:sourceState,[target]:targetState});
      const page=await context.newPage(), errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(source+'/spiral-raid-quiz/');
      await page.locator('#site-switch summary').click();
      assert.equal(await page.locator('#site-'+(source === domestic ? 'domestic' : 'overseas')).isDisabled(),true);
      const [popup]=await Promise.all([context.waitForEvent('page'),page.locator('#site-'+button).click()]);
      popup.on('pageerror',error=>errors.push(error.message));
      await popup.locator('#transfer-dialog[open] #transfer-confirm:not([hidden])').waitFor();
      assert.match(await popup.locator('#transfer-description').textContent(),/国内玩家/);
      await popup.locator('#transfer-confirm').click();
      await popup.waitForFunction(key => JSON.parse(localStorage.getItem(key+':identity')).deviceId === 'a'.repeat(32),key);
      const saved=await popup.evaluate(key=>JSON.parse(localStorage.getItem(key+':local-profiles')),key);
      assert.equal(saved[0].snapshot.profile.nickname,'国外玩家');
      assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key+':identity')).deviceId,key),a.deviceId);
      await popup.waitForFunction(() => !document.querySelector('#transfer-dialog').open);
      assert(requests.some(item=>item.host===expectedApi && item.path==='/api/leaderboard'));
      assert.deepEqual(errors,[]);
      await context.close();
    }

    const draftOnly={':identity':a,':draft':{version:bank.version,index:0,answers:{q001:['a']}}};
    const draftContext=await setup({[overseas]:draftOnly,[domestic]:{':identity':b}});
    const draftPage=await draftContext.context.newPage(); await draftPage.goto(overseas+'/spiral-raid-quiz/');
    await draftPage.locator('#site-switch summary').click();
    const [draftPopup]=await Promise.all([draftContext.context.waitForEvent('page'),draftPage.locator('#site-domestic').click()]);
    await draftPopup.locator('#transfer-dialog[open] #transfer-confirm:not([hidden])').waitFor();
    assert.match(await draftPopup.locator('#transfer-description').textContent(),/未设置昵称/);
    await draftPopup.locator('#transfer-confirm').click();
    assert.deepEqual(await draftPopup.evaluate(key=>JSON.parse(localStorage.getItem(key+':draft')).answers.q001,key),['a']);
    await draftContext.context.close();

    const empty=await setup({});
    const emptyPage=await empty.context.newPage(); await emptyPage.goto(domestic+'/spiral-raid-quiz/');
    await emptyPage.locator('#site-switch summary').click();
    await Promise.all([emptyPage.waitForURL(overseas+'/spiral-raid-quiz/'),emptyPage.locator('#site-overseas').click()]);
    assert.equal(await emptyPage.locator('#transfer-dialog').evaluate(node=>node.open),false);
    assert.equal(await emptyPage.locator('#site-current').textContent(),'国外站');
    await empty.context.close();

    const pending={attemptId:'c'.repeat(32),version:old.version,answers:Object.fromEntries(old.questions.map(q=>[q.id,q.answer])),localSubmittedAt:1234};
    const upload=await setup({[overseas]:{':identity':a,':profile':{nickname:'国内玩家',playerNumber:1,localOnly:true},':pending':[pending]}});
    const uploadPage=await upload.context.newPage(); await uploadPage.goto(overseas+'/spiral-raid-quiz/');
    await uploadPage.waitForFunction(key => !localStorage.getItem(key+':pending'),key,{timeout:15000});
    assert(upload.requests.some(item=>item.host===apiHost && item.path==='/api/profile' && item.method==='POST'));
    assert(upload.requests.some(item=>item.host===apiHost && item.path==='/api/submit' && item.method==='POST'));
    await upload.context.close();

    const longName={...stateA,':profile':{nickname:'长昵称测试'.repeat(4)+'队友',playerNumber:1}};
    const layout=await setup({[domestic]:longName});
    const page=await layout.context.newPage(); await page.goto(domestic+'/spiral-raid-quiz/');
    for (const width of [320,360,390,680,768,1024,1100,1101,1280,1440]) {
      await page.setViewportSize({width,height:900});
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`page overflows at ${width}px`);
      const boxes=[];
      for (const selector of ['.brand','#main-nav','#site-switch summary','.profile-trigger','#nav-toggle']) {
        const item=page.locator(selector);
        if (!await item.isVisible()) continue;
        const rect=await item.boundingBox();
        assert(rect && rect.x >= 0 && rect.x+rect.width <= width,`${selector} clipped at ${width}px`);
        boxes.push({selector,rect});
      }
      for (let i=1;i<boxes.length;i++) assert(boxes[i-1].rect.x+boxes[i-1].rect.width <= boxes[i].rect.x+1, `${boxes[i-1].selector} overlaps ${boxes[i].selector} at ${width}px`);
      await page.locator('#site-switch summary').click();
      const panel=await page.locator('.site-switch-panel').boundingBox();
      assert(panel && panel.x >= 0 && panel.x+panel.width <= width,`site menu clipped at ${width}px`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#site-switch').evaluate(node=>node.open),false);
      if (await page.locator('#nav-toggle').isVisible()) {
        await page.locator('#nav-toggle').click();
        assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'),'true');
        await page.locator('#main-nav [data-action="open-badges"]').click();
        assert.equal(await page.locator('#nav-toggle').getAttribute('aria-expanded'),'false');
        await page.locator('[data-action="close-badges"]').click();
      }
    }
    const screenshots=process.env.SITE_NAV_SCREENSHOT_DIR;
    if (screenshots) {
      await page.setViewportSize({width:1440,height:900}); await page.goto(domestic+'/spiral-raid-quiz/');
      await page.locator('.hero-landscape').evaluate(img=>img.decode()); await page.waitForTimeout(700);
      await page.locator('#site-switch summary').click();
      await page.screenshot({path:path.join(screenshots,'site-navigation-desktop.png')});
      await page.setViewportSize({width:390,height:844}); await page.locator('#site-switch summary').click();
      await page.locator('#nav-toggle').click();
      await page.screenshot({path:path.join(screenshots,'site-navigation-mobile.png')});
    }
    await page.locator('#site-switch summary').click();
    await page.locator('[data-action="download-transfer"]').click();
    assert.equal(await page.locator('#backup-dialog').evaluate(node=>node.open),true);
    const [backup]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="confirm-download-transfer"]').click()]);
    const savedBackup=JSON.parse(fs.readFileSync(await backup.path(),'utf8'));
    assert.deepEqual(savedBackup.identity,a);
    assert.equal(await page.locator('#backup-dialog').evaluate(node=>node.open),false);
    assert.equal(await page.locator('#transfer-notice').count(),0);
    await layout.context.close();
    console.log('PASS site navigation, both transfer directions, offline upload and responsive menus');
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
