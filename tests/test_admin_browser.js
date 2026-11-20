// Exercise the administration UI against a separate temporary score database.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {chromium}=require('playwright');
const {startScoreService}=require('./browser_fixture');
const root=path.resolve(__dirname,'..'),python=process.env.PYTHON_BIN||'python';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'raid-admin-browser-'));
const database=path.join(temp,'quiz.sqlite3');
const origin='https://www.lysue.com',password='Admin Test Password 2026!';

(async()=>{
  let browser,server;
  try {
    const seed=`import sys,time\nsys.path.insert(0,'domestic-backend')\nimport server,admin\nadmin.save_password(server.ADMIN_SERVICE.path,'Admin Test Password 2026!')\nserver.initialize()\ndb=server.database()\na={'deviceId':'a'*32,'secret':'1'*64}; b={'deviceId':'b'*32,'secret':'2'*64}\nserver.profile(db,{**a,'nickname':'流云见月'});server.profile(db,{**b,'nickname':'星河'})\nanswers={q['id']:list(q['answer']) for q in server.QUESTIONS}\nfor q in server.QUESTIONS:\n if q['id'] in {'q001','q010','q100'}: answers[q['id']]=[next(o['id'] for o in q['options'] if o['id'] not in q['answer'])]\nserver.submit(db,{**a,'attemptId':'f'*32,'version':server.VERSION,'answers':answers,'elapsedSeconds':1586})\nnow=int(time.time()*1000)\nfor i in range(21): db.execute('INSERT INTO attempts VALUES (?,?,?,?,?,?)',(f'{i+1:032x}',a['deviceId'],server.VERSION,100,105,now-100000-i*1000))\ndb.execute('INSERT INTO social_comments (target_id,author_id,content,created_at,updated_at,state) VALUES (?,?,?,?,?,?)',(a['deviceId'],b['deviceId'],'<img src=x onerror=window.__xss=1>',now,now,'owner_hidden'))\ndb.execute('INSERT INTO social_reactions VALUES (?,?,?,?)',(a['deviceId'],b['deviceId'],'fire',now))\ndb.close()`;
    const seeded=spawnSync(python,['-c',seed],{cwd:root,env:{...process.env,QUIZ_DATABASE:database},encoding:'utf8',windowsHide:true});
    assert.equal(seeded.status,0,seeded.stderr);
    const reportSeed=spawnSync(python,['-c',`import sqlite3,sys\ndb=sqlite3.connect(sys.argv[1])\nc=db.execute('SELECT id,content,updated_at FROM social_comments').fetchone()\ndb.execute('INSERT INTO social_reports (comment_id,reporter_id,author_id,target_id,comment_updated_at,content_snapshot,reason,details,created_at) VALUES (?,?,?,?,?,?,?,?,?)',(c[0],'a'*32,'b'*32,'a'*32,c[2],c[1],'abuse','请审核',20))\ndb.commit()`,database],{encoding:'utf8',windowsHide:true});
    assert.equal(reportSeed.status,0,reportSeed.stderr);
    const fixture=await startScoreService({python,root,database});server=fixture.server;
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_BIN||'C:/Program Files/Google/Chrome/Application/chrome.exe'});

    for(const width of [320,390,1440]) {
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!==origin)return route.abort();
        if(url.pathname.startsWith('/spiral-raid-quiz/admin/')) {
          const name=url.pathname.endsWith('/')?'index.html':url.pathname.split('/').pop();
          if(!['index.html','admin.css','admin.js'].includes(name))return route.abort();
          const contentType=name.endsWith('.html')?'text/html':name.endsWith('.css')?'text/css':'text/javascript';
          return route.fulfill({status:200,contentType:contentType+'; charset=utf-8',body:fs.readFileSync(path.join(root,'admin',name))});
        }
        if(!url.pathname.startsWith('/spiral-raid-quiz/api/'))return route.abort();
        const input=await request.allHeaders(),headers={};
        for(const name of ['origin','content-type','cookie','x-csrf-token'])if(input[name])headers[name]=input[name];
        const opts={method:request.method(),headers};if(!['GET','HEAD'].includes(request.method())&&request.postData()!==null)opts.body=request.postData();
        const response=await fetch(`http://127.0.0.1:${fixture.port}${url.pathname.slice('/spiral-raid-quiz'.length)}${url.search}`,opts);
        const returned={};for(const name of ['content-type','cache-control','set-cookie'])if(response.headers.has(name))returned[name]=response.headers.get(name);
        return route.fulfill({status:response.status,headers:returned,body:Buffer.from(await response.arrayBuffer())});
      });
      const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.goto(origin+'/spiral-raid-quiz/admin/');
      assert.equal(await page.locator('#login-view').isVisible(),true);
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-login-mobile.png')});
      await page.locator('#password').fill('wrong');await page.locator('#login-form button').click();
      await page.waitForFunction(()=>document.querySelector('#login-message').textContent.includes('不正确'));
      await page.locator('#password').fill(password);await page.locator('#login-form button').click();
      await page.locator('#overview-content .metric').first().waitFor();
      assert.equal(await page.locator('#overview-content .metric').count(),8);
      await page.evaluate(()=>{window.overviewMetric=document.querySelector('#overview-content .metric')});
      await page.route('**/api/admin/overview',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.fallback()});
      await page.locator('#refresh').click();
      await page.waitForFunction(()=>document.querySelector('#overview-content').getAttribute('aria-busy')==='true');
      assert.equal(await page.evaluate(()=>window.overviewMetric===document.querySelector('#overview-content .metric')),true,'refresh keeps existing content mounted');
      await page.waitForFunction(()=>!document.querySelector('#overview-content').hasAttribute('aria-busy'));
      assert.equal(await page.evaluate(()=>window.overviewMetric===document.querySelector('#overview-content .metric')),true,'unchanged content is not rebuilt');
      await page.unroute('**/api/admin/overview');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`overview overflow ${width}`);
      for(const button of await page.locator('.tabs button').all())assert.equal(await button.isVisible(),true);
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-overview-mobile.png'),fullPage:true});
      const cookies=await context.cookies();assert.ok(cookies.some(c=>c.name==='temple_admin_session'&&c.httpOnly&&c.secure&&c.sameSite==='Strict'));
      assert.doesNotMatch(await page.evaluate(()=>document.cookie),/temple_admin_session/);

      await page.locator('[data-tab=players]').click();await page.locator('#player-query').fill('#000001');await page.locator('#player-search button').click();
      await page.locator('#players-content .player-row').first().waitFor();assert.equal(await page.locator('#players-content .player-row').count(),1);
      await page.locator('#players-content .player-row').first().click();await page.locator('#player-content .record-row').first().waitFor();
      assert.match(await page.locator('#player-content').textContent(),/流云见月/);
      await page.locator('#player-content .record-row summary').first().click();
      await page.locator('#player-content .review-question').last().waitFor();
      assert.equal(await page.locator('#player-content .review-question').count(),3);
      assert.match(await page.locator('#player-content').textContent(),/正确答案/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`player detail overflow ${width}`);
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.locator('#player-detail').screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-player-mobile.png')});
      await page.locator('#player-pages button').last().click();await page.waitForFunction(()=>document.querySelector('#player-pages').textContent.includes('第 2 / 2 页'));
      assert.match(await page.locator('#player-content').textContent(),/错题明细未保存/);

      await page.locator('[data-tab=questions]').click();await page.locator('#questions-content .question-card').first().waitFor();
      assert.match(await page.locator('#questions-content').textContent(),/答错/);
      await page.locator('[data-tab=badges]').click();await page.locator('#badges-content .badge-card').first().waitFor();
      assert.match(await page.locator('#badges-content').textContent(),/初入寺院/);
      await page.locator('#badges-content .badge-card').filter({hasText:'初入寺院'}).click();
      await page.locator('#badge-detail-content .holder-row').first().waitFor();
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-badge-detail-mobile.png'),fullPage:true});
      assert.match(await page.locator('#badge-detail-content').textContent(),/流云见月/);
      assert.match(await page.locator('#badge-detail-content').textContent(),/按上传时间/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`badge detail overflow ${width}`);
      await page.locator('#badge-back').click();await page.locator('#badges-content .badge-card').first().waitFor();
      await page.locator('[data-tab=interactions]').click();await page.locator('#interactions-content .interaction-card').first().waitFor();
      assert.match(await page.locator('#interactions-content').textContent(),/被评价人隐藏/);
      assert.match(await page.locator('#interactions-content').textContent(),/<img src=x/);
      assert.equal(await page.evaluate(()=>window.__xss),undefined,'comment markup must not execute');
      await page.evaluate(()=>{window.savedAdminComment=document.querySelector('#interactions-content .interaction-card')});
      await page.locator('[data-kind=reports]').click();await page.locator('#interactions-content .report-card').first().waitFor();
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-reports-mobile.png'),fullPage:true});
      assert.match(await page.locator('#interactions-content').textContent(),/请审核/);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`reports overflow ${width}`);
      await page.route('**/api/admin/interactions',async route=>{await new Promise(resolve=>setTimeout(resolve,300));await route.fallback()});
      await page.locator('[data-kind=comments]').click();
      await page.waitForFunction(()=>document.querySelector('#interactions-content').getAttribute('aria-busy')==='true');
      assert.equal(await page.evaluate(()=>window.savedAdminComment===document.querySelector('#interactions-content .interaction-card')),true,'switching back keeps the cached list visible');
      await page.waitForFunction(()=>!document.querySelector('#interactions-content').hasAttribute('aria-busy'));
      assert.equal(await page.evaluate(()=>window.savedAdminComment===document.querySelector('#interactions-content .interaction-card')),true,'unchanged interaction remains mounted');
      await page.unroute('**/api/admin/interactions');
      await page.locator('[data-kind=reports]').click();await page.locator('#interactions-content .report-card').first().waitFor();
      if(width===1440){
        page.on('dialog',dialog=>dialog.accept());
        await page.getByRole('button',{name:'下架评价'}).click();
        await page.getByText('没有符合条件的举报。').waitFor();
        await page.locator('[data-kind=comments]').click();
        await page.getByText('管理员下架',{exact:false}).first().waitFor();
        await page.getByRole('button',{name:'恢复',exact:true}).click();
        await page.getByText('被评价人隐藏',{exact:false}).first().waitFor();
        await page.getByRole('button',{name:'删除',exact:true}).click();
        await page.getByText('暂无互动记录。').waitFor();
        await page.locator('[data-kind=reports]').click();await page.locator('#report-status').selectOption('resolved');
        await page.getByText('评价已删除，举报内容为提交时的记录。').waitFor();
      }
      await page.locator('[data-kind=reactions]').click();await page.waitForFunction(()=>document.querySelector('#interactions-content').textContent.includes('🔥'));
      await page.reload();await page.locator('#overview-content .metric').first().waitFor();

      if(width===1440) {
        await page.locator('#password-open').click();
        await page.locator('#current-password').fill(password);
        await page.locator('#new-password').fill('New Admin Password 2027!');
        await page.locator('#confirm-password').fill('New Admin Password 2027!');
        await page.locator('#password-form button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('#login-message').textContent.includes('密码已更新'));
        await page.locator('#password').fill('New Admin Password 2027!');await page.locator('#login-form button').click();
        await page.locator('#overview-content .metric').first().waitFor();
      }
      await page.locator('#logout').click();
      await page.waitForFunction(()=>!document.querySelector('#login-view').hidden);
      assert.equal(await page.locator('#overview-content').textContent(),'','private DOM should be cleared at logout');
      assert.deepEqual(errors,[]);
      await context.close();
    }
    console.log('PASS secure login, data views, password change, logout and 320–1440px admin layout');
  } finally {
    if(browser)await browser.close();if(server)server.kill();
    const resolved=path.resolve(temp);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('raid-admin-browser-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
