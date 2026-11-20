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
      const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',hasTouch:width===390,isMobile:width===390});
      await context.route('**/*',async route=>{
        const request=route.request(),url=new URL(request.url());
        if(url.origin!==origin)return route.abort();
        if(url.pathname.startsWith('/spiral-raid-quiz/admin/')) {
          if(process.env.ADMIN_LIVE_STATIC==='1')return route.continue();
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
      const page=await context.newPage(),errors=[],nativeDialogs=[];page.on('pageerror',error=>errors.push(error.message));
      page.on('dialog',dialog=>{nativeDialogs.push(dialog.type());void dialog.dismiss()});
      await page.goto(origin+'/spiral-raid-quiz/admin/');
      await page.locator('#login-view').waitFor();
      assert.equal(await page.locator('#login-view').isVisible(),true);
      assert.match(await page.locator('link[rel="icon"]').getAttribute('href'),/^data:image\/svg\+xml,/);
      if(width===1440){
        await page.locator('#password').fill('unfinished password');
        const rechecked=page.waitForResponse(response=>response.url().endsWith('/api/admin/session'));
        await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
        await (await rechecked).body();
        await page.waitForTimeout(30);
        assert.equal(await page.locator('#password').inputValue(),'unfinished password','returning to login keeps unfinished input');
      }
      if(process.env.ADMIN_SCREENSHOT_DIR&&width===390)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-login-mobile.png')});
      await page.locator('#password').fill('');
      await page.locator('#login-form button[type=submit]').click();
      assert.match(await page.locator('#login-message').textContent(),/请输入管理员密码/);
      assert.equal(await page.locator('#password').getAttribute('aria-invalid'),'true');
      await page.locator('[data-password-toggle=password]').click();assert.equal(await page.locator('#password').getAttribute('type'),'text');
      assert.equal(await page.locator('[data-password-toggle=password]').getAttribute('aria-label'),'隐藏密码');
      await page.locator('[data-password-toggle=password]').click();assert.equal(await page.locator('#password').getAttribute('type'),'password');
      await page.locator('#password').fill('wrong');await page.locator('#login-form button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelector('#login-message').textContent.includes('不正确'));
      await page.locator('#password').fill(password);await page.locator('#login-form button[type=submit]').click();
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

      await page.locator('[data-tab=players]').click();
      await page.locator('#players-content .player-row').first().waitFor();
      const searchLayout=await page.locator('.search-submit').evaluate(button=>({width:button.getBoundingClientRect().width,whiteSpace:getComputedStyle(button).whiteSpace,spanWidth:button.querySelector('span').getBoundingClientRect().width}));
      assert.equal(searchLayout.whiteSpace,'nowrap');assert.ok(searchLayout.width>searchLayout.spanWidth+20,`search button must not wrap ${width}`);
      if(process.env.ADMIN_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,`admin-players-${width}.png`)});
      await page.locator('#player-query').fill('#000001');await page.locator('#player-search button[type=submit]').click();
      await page.locator('#players-content .player-row').first().waitFor();assert.equal(await page.locator('#players-content .player-row').count(),1);
      await page.locator('#player-search-clear').click();await page.waitForFunction(()=>document.querySelectorAll('#players-content .player-row').length===2);
      await page.locator('#player-query').fill('#000001');await page.locator('#player-search button[type=submit]').click();
      await page.waitForFunction(()=>document.querySelectorAll('#players-content .player-row').length===1);
      await page.locator('#players-content .player-row').first().click();await page.locator('#player-content .record-row').first().waitFor();
      assert.match(await page.locator('#player-content').textContent(),/流云见月/);
      const chip=page.locator('#player-content .badge-chip').first();await chip.waitFor();
      assert.equal(await page.locator('[title]').count(),0,'admin must not use native title tooltips');
      await chip.hover();await page.locator('#admin-tooltip').waitFor();
      const tooltipLayout=await page.locator('#admin-tooltip').evaluate(node=>{const r=node.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}});
      assert.ok(tooltipLayout.left>=0&&tooltipLayout.right<=tooltipLayout.width&&tooltipLayout.top>=0&&tooltipLayout.bottom<=tooltipLayout.height,JSON.stringify(tooltipLayout));
      if(process.env.ADMIN_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,`admin-tooltip-${width}.png`)});
      await chip.focus();assert.equal(await chip.getAttribute('aria-describedby'),'admin-tooltip');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#admin-tooltip').isVisible(),false);
      if(width===390){
        await chip.tap();await page.locator('#admin-tooltip').waitFor();
        await page.locator('.player-title h2').tap();await page.locator('#admin-tooltip').waitFor({state:'hidden'});
      }
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
      const questionFilter=page.locator('#question-version-trigger');await questionFilter.focus();await page.keyboard.press('ArrowDown');
      assert.equal(await questionFilter.getAttribute('aria-expanded'),'true');
      assert.ok(await page.locator('#question-version-list [role=option]').count()>1);
      if(process.env.ADMIN_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,`admin-filter-${width}.png`)});
      await page.keyboard.press('End');await page.keyboard.press('Enter');
      assert.notEqual(await page.locator('#question-version').inputValue(),'');
      assert.equal(await questionFilter.getAttribute('aria-expanded'),'false');
      await questionFilter.click();await page.locator('#question-version-list [role=option]').first().click();
      await page.locator('#questions-content .question-card').first().waitFor();
      if(width===1440){
        const filtered=page.waitForResponse(response=>response.url().endsWith('/api/admin/questions')&&response.request().postDataJSON().version.endsWith('-v9'));
        await questionFilter.focus();await page.keyboard.press('v');await page.keyboard.press('9');await page.keyboard.press('Enter');
        assert.match(await questionFilter.textContent(),/v9/,'typing selects a matching option');
        await filtered;await page.getByText('暂无保存的错题统计。').waitFor();
        await questionFilter.click();await page.locator('#question-version-list [role=option]').first().click();
        await page.locator('#questions-content .question-card').first().waitFor();
      }
      if(width===390){
        await questionFilter.tap();await page.locator('#question-version-list [role=option]').nth(1).tap();
        assert.notEqual(await page.locator('#question-version').inputValue(),'','touch selection updates the filter');
        await questionFilter.tap();await page.locator('#question-version-list [role=option]').first().tap();
      }
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
      assert.equal(await page.locator('[data-kind=reports]').getAttribute('aria-pressed'),'true');
      if(width===390){
        await page.getByRole('button',{name:'下架评价'}).tap();await page.locator('#confirm-dialog').waitFor();
        if(process.env.ADMIN_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-confirm-mobile.png')});
        await page.locator('#confirm-cancel').tap();assert.equal(await page.locator('#confirm-dialog').isVisible(),false);
      }
      await page.locator('#report-status-trigger').click();
      assert.equal(await page.locator('#report-status-trigger').getAttribute('aria-expanded'),'true');
      await page.keyboard.press('Escape');assert.equal(await page.locator('#report-status-trigger').getAttribute('aria-expanded'),'false');
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
        await page.getByRole('button',{name:'下架评价'}).click();
        await page.locator('#confirm-dialog').waitFor();assert.match(await page.locator('#confirm-title').textContent(),/下架/);
        await page.locator('#confirm-cancel').click();assert.equal(await page.locator('#confirm-dialog').isVisible(),false);
        assert.equal(await page.locator('#interactions-content .report-card').count(),1,'cancel must not moderate');
        await page.getByRole('button',{name:'下架评价'}).click();await page.keyboard.press('Escape');
        assert.equal(await page.locator('#confirm-dialog').isVisible(),false,'Escape cancels the confirmation');
        await page.getByRole('button',{name:'下架评价'}).click();await page.locator('#confirm-accept').click();
        await page.getByText('没有符合条件的举报。').waitFor();
        await page.locator('[data-kind=comments]').click();
        await page.getByText('管理员下架',{exact:false}).first().waitFor();
        await page.getByRole('button',{name:'恢复',exact:true}).click();
        await page.getByText('被评价人隐藏',{exact:false}).first().waitFor();
        await page.getByRole('button',{name:'删除',exact:true}).click();
        assert.match(await page.locator('#confirm-description').textContent(),/评价和点赞将被删除/);
        if(process.env.ADMIN_SCREENSHOT_DIR)await page.screenshot({path:path.join(process.env.ADMIN_SCREENSHOT_DIR,'admin-confirm-desktop.png')});
        await page.locator('#confirm-accept').click();
        await page.getByText('暂无互动记录。').waitFor();
        await page.locator('[data-kind=reports]').click();await page.locator('#report-status-trigger').click();await page.locator('#report-status-list [role=option]').filter({hasText:'已处理'}).click();
        await page.getByText('评价已删除，举报内容为提交时的记录。').waitFor();
      }
      await page.locator('[data-kind=reactions]').click();await page.waitForFunction(()=>document.querySelector('#interactions-content').textContent.includes('🔥'));
      await page.route('**/api/admin/session',async route=>{await new Promise(resolve=>setTimeout(resolve,500));await route.fallback()});
      await page.reload({waitUntil:'domcontentloaded'});
      assert.equal(await page.locator('#login-view').isVisible(),false,'valid session reload must not flash the login form');
      assert.equal(await page.locator('#session-loading').isVisible(),true,'session is verified before either view is shown');
      await page.locator('#overview-content .metric').first().waitFor();
      await page.evaluate(()=>{window.restoredMetric=document.querySelector('#overview-content .metric');window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});
      assert.equal(await page.locator('#dashboard').isVisible(),true,'back/forward restore keeps the dashboard visible');
      assert.equal(await page.locator('#login-view').isVisible(),false,'back/forward restore does not flash login');
      await page.waitForTimeout(650);
      assert.equal(await page.evaluate(()=>window.restoredMetric===document.querySelector('#overview-content .metric')),true,'session revalidation keeps the current view mounted');
      await page.unroute('**/api/admin/session');

      if(width===1440) {
        await page.locator('#password-open').click();
        await page.locator('[data-password-toggle=current-password]').click();
        assert.equal(await page.locator('#current-password').getAttribute('type'),'text');
        await page.locator('#password-close').click();await page.locator('#password-open').click();
        assert.equal(await page.locator('#current-password').getAttribute('type'),'password','closing the dialog conceals passwords');
        await page.locator('#password-form button[type=submit]').click();
        assert.match(await page.locator('#password-message').textContent(),/请输入当前密码/);
        await page.locator('#current-password').fill(password);
        await page.locator('#new-password').fill('short');await page.locator('#password-form button[type=submit]').click();
        assert.match(await page.locator('#password-message').textContent(),/至少需要 16/);
        await page.locator('#new-password').fill('New Admin Password 2027!');
        await page.locator('#confirm-password').fill('New Admin Password 2027!');
        await page.locator('#password-form button[type=submit]').click();
        await page.waitForFunction(()=>document.querySelector('#login-message').textContent.includes('密码已更新'));
        await page.locator('#password').fill('New Admin Password 2027!');await page.locator('#login-form button[type=submit]').click();
        await page.locator('#overview-content .metric').first().waitFor();
      }
      await page.locator('#logout').click();
      await page.waitForFunction(()=>!document.querySelector('#login-view').hidden);
      assert.equal(await page.locator('#overview-content').textContent(),'','private DOM should be cleared at logout');
      if(width===1440){
        await page.route('**/api/admin/session',route=>route.abort());
        await page.reload();
        await page.waitForFunction(()=>document.querySelector('#login-message').textContent.includes('连接失败'));
        assert.equal(await page.locator('#session-loading').isVisible(),false,'network errors must not leave the page stuck loading');
        await page.unroute('**/api/admin/session');
      }
      assert.deepEqual(errors,[]);
      assert.deepEqual(nativeDialogs,[],'moderation must not use browser-native dialogs');
      await context.close();
    }
    console.log('PASS secure login, data views, password change, logout and 320–1440px admin layout');
  } finally {
    if(browser)await browser.close();if(server)server.kill();
    const resolved=path.resolve(temp);if(resolved.startsWith(path.resolve(os.tmpdir())+path.sep)&&path.basename(resolved).startsWith('raid-admin-browser-'))fs.rmSync(resolved,{recursive:true,force:true,maxRetries:10,retryDelay:100});
  }
})().catch(error=>{console.error(error);process.exitCode=1});
