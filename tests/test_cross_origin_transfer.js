// Exercise the actual client against two simulated browser origins and an offline queue.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const bank = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));
const old = JSON.parse(fs.readFileSync(path.join(root, 'domestic-backend/banks/peak-spiral-2026-11-18-v3.json'), 'utf8'));
const previousBank = JSON.parse(fs.readFileSync(path.join(root, 'domestic-backend/banks/peak-spiral-2026-11-18-v7.json'), 'utf8'));
const key = 'spiral-temple-quiz-v1';
const sourceIdentity = {deviceId:'a'.repeat(32), secret:'b'.repeat(64)};
const destinationIdentity = {deviceId:'d'.repeat(32), secret:'e'.repeat(64)};
const oldAttempt = {attemptId:'c'.repeat(32), version:old.version,
  answers:Object.fromEntries(old.questions.map(q => [q.id, q.answer])), localSubmittedAt:1234};
const destinationAttempt = {attemptId:'f'.repeat(32), version:bank.version,
  answers:Object.fromEntries(bank.questions.map(q => [q.id, q.answer])), localSubmittedAt:2345};

function createHarness(origin, initial, hash = '') {
  const storage = new Map(Object.entries(initial).map(([suffix, value]) => [key + suffix, JSON.stringify(value)]));
  const elements = new Map();
  const documentListeners = {}, windowListeners = {}, submissions = [];
  let online = false, failOnce = '';
  function element() {
    return {dataset:{}, style:{}, hidden:false, children:[], open:false, value:'', textContent:'', events:{},
      classList:{add(){}, remove(){}, toggle(){}}, addEventListener(name,fn){this.events[name]=fn;}, setAttribute(){},
      showModal(){this.open = true;}, close(){this.open = false;}, focus(){}, scrollIntoView(){},
      append(...children){this.children.push(...children);}, replaceChildren(...children){this.children = children;},
      querySelector(){return null;}, get firstElementChild(){return this.children[0] || null;}};
  }
  function getElement(id) {
    if (!elements.has(id)) elements.set(id, element());
    return elements.get(id);
  }
  getElement('question-bank').textContent = JSON.stringify(bank);
  const opener = {messages:[], postMessage(data, target){this.messages.push({data,target});}};
  const child = {messages:[], postMessage(data, target){this.messages.push({data,target});}};
  global.location = {origin, hostname:new URL(origin).hostname, search:'', hash, pathname:'/spiral-raid-quiz/'};
  global.localStorage = {getItem:k=>storage.get(k) ?? null, setItem(k,v){
    if (failOnce && k.endsWith(failOnce)) { failOnce=''; throw new Error('quota'); }
    storage.set(k,v);
  }, removeItem:k=>storage.delete(k)};
  global.document = {getElementById:getElement, createElement:element, querySelector:element, body:{},
    addEventListener:(name,fn)=>{documentListeners[name]=fn;}};
  global.window = {opener:hash ? opener : null, history:{replaceState(){}}, scrollTo(){},
    addEventListener:(name,fn)=>{windowListeners[name]=fn;},
    open:(url)=>{child.url=url;return child;}};
  global.confirm = () => true;
  global.QUESTION_DIAGRAMS = {}; global.drawRaidDiagram = () => ''; global.requestAnimationFrame = fn=>fn();
  global.fetch = async (url, options) => {
    if (!online) throw new TypeError('offline');
    let payload = {entries:[]};
    if (url.endsWith('/api/profile')) payload = {nickname:JSON.parse(options.body).nickname, playerNumber:7};
    if (url.endsWith('/api/submit')) {
      const body=JSON.parse(options.body); submissions.push(body);
      const selected=body.version === old.version ? old : bank;
      payload={correctCount:selected.questions.length,totalCount:selected.questions.length,score:100};
    }
    if (url.endsWith('/api/history')) payload={entries:[],attemptCount:0,bestScore:null,nextCursor:null};
    return {ok:true,status:200,json:async()=>payload};
  };
  delete require.cache[require.resolve('../app.js')]; require('../app.js');
  return {storage, opener, child, submissions, getElement, windowListeners, documentListeners,
    online:()=>{online=true;}, failOn:suffix=>{failOnce=suffix;},
    click:(action,extra={})=>documentListeners.click({target:{closest:selector=>selector==='[data-action]' ? {dataset:{action,...extra}} : null}})};
}
const read = (h,suffix) => JSON.parse(h.storage.get(key + suffix));
const wait = () => new Promise(resolve => setTimeout(resolve, 30));

(async () => {
  const source = createHarness('https://found-l.github.io', {
    ':identity':sourceIdentity, ':profile':{nickname:'旧玩家',localOnly:true}, ':pending':[oldAttempt],
    ':draft':{version:bank.version,index:0,answers:{q001:['a']}}
  });
  await wait();
  source.click('transfer-domestic');
  assert.equal(source.child.url, 'https://www.lysue.com/spiral-raid-quiz/#import-github');
  const ready = {type:'spiral-quiz-transfer-v1:ready'};
  source.windowListeners.message({origin:'https://evil.example',source:source.child,data:ready});
  source.windowListeners.message({origin:'https://www.lysue.com',source:{},data:ready});
  assert.equal(source.child.messages.length, 0);
  source.windowListeners.message({origin:'https://www.lysue.com',source:source.child,data:ready});
  assert.equal(source.child.messages[0].target, 'https://www.lysue.com');
  const transferred = source.child.messages[0].data;
  assert.deepEqual(transferred.snapshot.identity, sourceIdentity);
  assert.deepEqual(transferred.snapshot.pending, [oldAttempt]);
  // A malformed transfer must not be able to override the selected identity when submitted.
  transferred.snapshot.pending[0].deviceId = '1'.repeat(32);
  transferred.snapshot.pending[0].secret = '2'.repeat(64);

  const destination = createHarness('https://www.lysue.com', {
    ':identity':destinationIdentity, ':profile':{nickname:'原有玩家'}, ':pending':[destinationAttempt],
    ':draft':{version:bank.version,index:0,answers:{q002:['a']}}
  }, '#import-github');
  await wait();
  assert.equal(destination.opener.messages[0].target, 'https://found-l.github.io');
  destination.windowListeners.message({origin:'https://evil.example',source:destination.opener,data:transferred});
  destination.windowListeners.message({origin:'https://found-l.github.io',source:{},data:transferred});
  assert.equal(destination.getElement('transfer-confirm').hidden, true);
  destination.windowListeners.message({origin:'https://found-l.github.io',source:destination.opener,data:transferred});
  assert.equal(destination.getElement('transfer-confirm').hidden, false);
  assert.match(destination.getElement('transfer-description').textContent, /旧玩家.*1 条/);

  const before = new Map(destination.storage);
  destination.failOn(':pending'); destination.click('confirm-transfer');
  assert.deepEqual(destination.storage, before, 'a failed write must roll back every stored value');
  assert.match(destination.getElement('transfer-error').textContent, /无法保存/);
  destination.online(); destination.click('confirm-transfer'); await wait();
  assert.deepEqual(read(destination, ':identity'), sourceIdentity);
  assert.equal(read(destination, ':profile').nickname, '旧玩家');
  assert.equal(destination.submissions.length, 1);
  assert.equal(destination.submissions[0].version, old.version);
  assert.deepEqual(destination.submissions[0].answers, oldAttempt.answers);
  assert.equal(destination.submissions[0].deviceId, sourceIdentity.deviceId);
  assert.equal(destination.submissions[0].secret, sourceIdentity.secret);
  assert.equal(destination.storage.has(key + ':pending'), false);
  const archived = read(destination, ':local-profiles');
  assert.deepEqual(archived[0].snapshot.identity, destinationIdentity);
  assert.deepEqual(archived[0].snapshot.pending, [destinationAttempt]);
  assert.equal(destination.opener.messages.at(-1).target, 'https://found-l.github.io');

  destination.click('restore-local-profile', {archiveId:archived[0].id}); await wait();
  assert.deepEqual(read(destination, ':identity'), destinationIdentity);
  assert.equal(destination.submissions.length, 2);
  assert.equal(destination.submissions[1].attemptId, destinationAttempt.attemptId);
  assert.equal(read(destination, ':local-profiles')[0].snapshot.profile.nickname, '旧玩家');

  const previous = Object.fromEntries([':identity', ':profile', ':pending', ':draft', ':last-result', ':local-profiles']
    .map(suffix=>[suffix, null]));
  previous[':identity'] = JSON.stringify(sourceIdentity);
  previous[':profile'] = JSON.stringify({nickname:'恢复测试'});
  previous[':pending'] = JSON.stringify([oldAttempt]);
  const interrupted = createHarness('https://www.lysue.com', {
    ':identity':destinationIdentity, ':profile':{nickname:'不完整写入'},
    ':transfer-transaction':{schema:1,previous}
  });
  await wait();
  assert.deepEqual(read(interrupted, ':identity'), sourceIdentity);
  assert.equal(read(interrupted, ':profile').nickname, '恢复测试');
  assert.deepEqual(read(interrupted, ':pending'), [oldAttempt]);
  assert.equal(interrupted.storage.has(key + ':transfer-transaction'), false);

  const fileDestination = createHarness('https://www.lysue.com', {':identity':destinationIdentity});
  const fileData = JSON.stringify(transferred.snapshot);
  await fileDestination.getElement('transfer-file').events.change({target:{files:[{size:fileData.length,text:async()=>fileData}],value:'file'}});
  assert.equal(fileDestination.getElement('transfer-confirm').hidden, false);
  assert.match(fileDestination.getElement('transfer-description').textContent, /旧玩家.*1 条/);

  const completeAnswers = Object.fromEntries(bank.questions.map(q=>[q.id,q.answer]));
  const timed = createHarness('https://www.lysue.com', {
    ':identity':sourceIdentity, ':profile':{nickname:'计时测试'},
    ':draft':{version:bank.version,index:0,answers:completeAnswers,elapsedMs:73000}
  });
  timed.online(); timed.click('start');
  assert.match(timed.getElement('exam-timer').textContent, /01:1[34]/);
  timed.click('submit'); await wait();
  assert.ok(timed.submissions[0].elapsedSeconds >= 73 && timed.submissions[0].elapsedSeconds <= 74);
  assert.match(timed.getElement('result-detail').textContent, /用时 01:1[34]/);

  const untimed = createHarness('https://www.lysue.com', {
    ':identity':destinationIdentity, ':profile':{nickname:'旧进度'},
    ':draft':{version:bank.version,index:0,answers:completeAnswers}
  });
  untimed.online(); untimed.click('start');
  assert.equal(untimed.getElement('exam-timer').textContent, '用时 未记录');
  untimed.click('submit'); await wait();
  assert.equal(untimed.submissions[0].elapsedSeconds, null);

  const legacy = createHarness('https://www.lysue.com', {
    ':identity':destinationIdentity, ':profile':{nickname:'旧计时'},
    ':draft':{version:bank.version,index:0,answers:completeAnswers,startedAt:Date.now()-18*3600*1000}
  });
  legacy.online(); legacy.click('start');
  assert.equal(legacy.getElement('exam-timer').textContent, '用时 未记录');
  assert.match(legacy.getElement('draft-update-notice').textContent, /旧进度/);
  legacy.click('submit'); await wait();
  assert.equal(legacy.submissions[0].elapsedSeconds, null);

  const realNow = Date.now;
  let now = 1700000000000;
  Date.now = () => now;
  let active = createHarness('https://www.lysue.com', {
    ':identity':sourceIdentity, ':profile':{nickname:'随机计时测试'},
    ':draft':{version:bank.version,index:0,answers:{}}
  });
  active.online(); active.click('start');
  const initial = read(active, ':draft');
  assert.equal(new Set(initial.order).size, bank.questions.length);
  assert.notDeepEqual(initial.order, bank.questions.map(q=>q.id));
  const alphabetically = (a,b) => a.localeCompare(b);
  for (const q of bank.questions) assert.deepEqual([...initial.optionOrder[q.id]].sort(alphabetically), q.options.map(o=>o.id).sort(alphabetically));
  const firstInput = active.getElement('question-options').children[0].children[0];
  firstInput.checked = true; firstInput.events.change();
  assert.deepEqual(read(active, ':draft').answers[initial.order[0]], [firstInput.value]);
  now += 5000; active.click('leave-exam');
  now += 18 * 3600 * 1000; active.click('start');
  assert.match(active.getElement('exam-timer').textContent, /00:05/);
  assert.deepEqual(read(active, ':draft').order, initial.order);
  assert.deepEqual(read(active, ':draft').optionOrder, initial.optionOrder);
  document.hidden = true; active.documentListeners.visibilitychange();
  now += 10000;
  document.hidden = false; active.documentListeners.visibilitychange();
  assert.match(active.getElement('exam-timer').textContent, /00:05/);
  active.click('leave-exam'); active.windowListeners.pagehide();
  const reloadedDraft = read(active, ':draft');
  active = createHarness('https://www.lysue.com', {
    ':identity':sourceIdentity, ':profile':{nickname:'随机计时测试'}, ':draft':reloadedDraft
  });
  active.online(); active.click('start');
  assert.deepEqual(read(active, ':draft').order, initial.order);
  assert.deepEqual(read(active, ':draft').optionOrder, initial.optionOrder);
  assert.deepEqual(read(active, ':draft').answers[initial.order[0]], [firstInput.value]);
  active.click('restart');
  assert.equal(active.getElement('restart-dialog').open, true);
  active.click('cancel-restart');
  assert.deepEqual(read(active, ':draft').order, initial.order);
  active.click('restart'); active.click('confirm-restart');
  const fresh = read(active, ':draft');
  assert.deepEqual(fresh.answers, {});
  assert.notDeepEqual(fresh.order, initial.order);
  assert.equal(active.getElement('exam-timer').textContent, '用时 00:00');
  for (let i = 0; i < fresh.order.length; i++) {
    const q = bank.questions.find(item => item.id === fresh.order[i]);
    for (const answer of q.answer) {
      const option = active.getElement('question-options').children.find(label => label.children[0].value === answer);
      option.children[0].checked = true; option.children[0].events.change();
    }
    if (i < fresh.order.length - 1) active.click('next');
  }
  now += 7000; active.click('submit'); await wait();
  assert.deepEqual(active.submissions[0].answers, completeAnswers);
  assert.equal(active.submissions[0].elapsedSeconds, 7);
  assert.deepEqual(read(active, ':last-result').order, fresh.order);

  const oldOrder = previousBank.questions.map(q => q.id).reverse();
  const oldOptions = Object.fromEntries(previousBank.questions.map(q => [q.id, q.options.map(o => o.id).reverse()]));
  const extended = createHarness('https://www.lysue.com', {
    ':identity':sourceIdentity, ':profile':{nickname:'延续旧题'},
    ':draft':{version:previousBank.version,index:4,answers:{[oldOrder[0]]:[oldOptions[oldOrder[0]][0]]},
      order:oldOrder,optionOrder:oldOptions,elapsedMs:1000}
  });
  extended.online(); extended.click('start');
  const extendedDraft = read(extended, ':draft');
  assert.deepEqual(extendedDraft.order.slice(0,oldOrder.length),oldOrder);
  assert.deepEqual(new Set(extendedDraft.order.slice(oldOrder.length)),new Set(['q101','q102','q103']));
  assert.deepEqual(extendedDraft.optionOrder[oldOrder[0]],oldOptions[oldOrder[0]]);
  assert.equal(extendedDraft.index,4);
  assert.deepEqual(extendedDraft.answers[oldOrder[0]],[oldOptions[oldOrder[0]][0]]);
  extended.click('leave-exam'); // Stop this harness's exam timer before creating another document.

  const swap = createHarness('https://www.lysue.com', {
    ':identity':sourceIdentity, ':profile':{nickname:'切换前'},
    ':draft':{version:bank.version,index:0,answers:{}},
    ':local-profiles':[{id:'archive',snapshot:{schema:1,identity:destinationIdentity,
      profile:{nickname:'切换后'},pending:[],draft:{version:bank.version,index:0,answers:{}},lastResult:null}}]
  });
  swap.online(); swap.click('start');
  const swapChoice = swap.getElement('question-options').children[0].children[0];
  swapChoice.checked = true; swapChoice.events.change();
  now += 3500; swap.click('restore-local-profile', {archiveId:'archive'}); await wait();
  assert.deepEqual(read(swap, ':identity'), destinationIdentity);
  assert.equal(read(swap, ':local-profiles')[0].snapshot.draft.elapsedMs, 3500);
  assert.equal(Object.keys(read(swap, ':local-profiles')[0].snapshot.draft.answers).length, 1);
  Date.now = realNow;
  console.log('PASS transfer, rollback, file import and timed/untimed exam submissions');
})().catch(error=>{console.error(error);process.exitCode=1;});
