import { readFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const base = process.env.QUIZ_API || 'http://127.0.0.1:8787';
const bank = JSON.parse(await readFile(new URL('../lib/question-bank.json', import.meta.url),'utf8'));
const rnd = (n) => randomBytes(n).toString('hex');
const one = {deviceId:rnd(16),secret:rnd(32)}, two = {deviceId:rnd(16),secret:rnd(32)};
const nickname = `测试成员-${rnd(5)}`;
async function post(path, body) {
  const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json','origin':'https://found-l.github.io'},body:JSON.stringify(body)});
  return {status:r.status,body:await r.json(),cors:r.headers.get('access-control-allow-origin')};
}
async function ranking() { const r=await fetch(base+'/api/leaderboard',{headers:{origin:'https://found-l.github.io'}}); return {status:r.status,body:await r.json()}; }
const perfect=Object.fromEntries(bank.questions.map(q=>[q.id,q.answer]));
const incorrect=Object.fromEntries(bank.questions.map(q=>[q.id,[q.options.find(o=>!q.answer.includes(o.id))?.id || q.options[0].id]]));
const attemptId=rnd(16);
let createdOne=false,createdTwo=false;
try {
  let r=await post('/api/profile',{...one,nickname}); assert.equal(r.status,200,JSON.stringify(r.body));createdOne=true;assert.equal(r.cors,'https://found-l.github.io');
  const firstNumber=r.body.playerNumber;
  assert.ok(Number.isSafeInteger(firstNumber) && firstNumber > 0);
  r=await post('/api/profile',{...two,nickname});assert.equal(r.status,200);createdTwo=true;
  const secondNumber=r.body.playerNumber;
  assert.ok(Number.isSafeInteger(secondNumber) && secondNumber > 0);
  assert.notEqual(firstNumber,secondNumber);
  r=await post('/api/profile',{...one,secret:two.secret,nickname:'冒用'});assert.equal(r.status,403);
  r=await post('/api/submit',{...one,attemptId:rnd(16),version:bank.version,answers:{}});assert.equal(r.status,400);
  r=await post('/api/submit',{...one,attemptId,version:bank.version,answers:perfect,score:999});assert.equal(r.status,200,JSON.stringify(r.body));assert.equal(r.body.score,100);assert.equal(r.body.correctCount,bank.questions.length);
  const timestamp=r.body.submittedAt;
  r=await post('/api/submit',{...one,attemptId,version:bank.version,answers:perfect});assert.equal(r.status,200);assert.equal(r.body.submittedAt,timestamp);
  r=await post('/api/submit',{...one,attemptId,version:bank.version,answers:incorrect});assert.equal(r.status,409);
  r=await post('/api/submit',{...one,attemptId:rnd(16),version:bank.version,answers:incorrect,score:999});assert.equal(r.status,200);assert.equal(r.body.score,0);
  r=await post('/api/submit',{...two,attemptId:rnd(16),version:bank.version,answers:incorrect});assert.equal(r.status,200);
  r=await post('/api/history',{...one,secret:two.secret});assert.equal(r.status,403);
  r=await post('/api/history',{...one,cursor:'unknown'});assert.equal(r.status,400);
  r=await post('/api/history',one);assert.equal(r.status,200);assert.equal(r.body.bestScore,100);
  assert.equal(r.body.attemptCount,2);assert.equal(r.body.nextCursor,null);
  assert.deepEqual(r.body.entries.map(entry=>entry.score),[0,100]);
  assert.ok(r.body.entries.every(entry=>entry.currentVersion));
  for(let i=0;i<19;i++) {
    r=await post('/api/submit',{...one,attemptId:rnd(16),version:bank.version,answers:incorrect});assert.equal(r.status,200);
  }
  r=await post('/api/history',one);assert.equal(r.body.attemptCount,21);assert.equal(r.body.entries.length,20);
  assert.ok(r.body.nextCursor);assert.ok(r.body.entries.every(entry=>entry.score===0));
  r=await post('/api/history',{...one,cursor:r.body.nextCursor});assert.equal(r.body.entries.length,1);
  assert.equal(r.body.entries[0].score,100);assert.equal(r.body.nextCursor,null);
  r=await post('/api/history',two);assert.equal(r.body.attemptCount,1);assert.equal(r.body.bestScore,0);
  let board=await ranking();assert.equal(board.status,200);
  const sameName=board.body.entries.filter(x=>x.nickname===nickname);
  assert.deepEqual(sameName.map(x=>x.playerNumber),[firstNumber,secondNumber]);
  const renamed = nickname+'改';
  r=await post('/api/profile',{...one,nickname:renamed});assert.equal(r.status,200);assert.equal(r.body.playerNumber,firstNumber);
  board=await ranking();assert.equal(board.status,200);const entry=board.body.entries.find(x=>x.nickname===renamed);assert.ok(entry);assert.equal(entry.score,100);assert.equal(entry.playerNumber,firstNumber);assert.ok(!JSON.stringify(board).includes(one.secret));assert.ok(!JSON.stringify(board).includes(one.deviceId));assert.ok(!('gameId' in entry));
  r=await post('/api/delete-profile',{...one,secret:two.secret});assert.equal(r.status,403);
  const pre=await fetch(base+'/api/submit',{method:'OPTIONS',headers:{origin:'https://found-l.github.io','access-control-request-method':'POST','access-control-request-headers':'content-type'}});assert.equal(pre.status,204);assert.equal(pre.headers.get('access-control-allow-origin'),'https://found-l.github.io');
  console.log('PASS private attempt history, repeat submissions, pagination, highest-score ranking, nickname edits, server scoring, idempotent retry, deletion protection, CORS.');
} finally {
  if(createdOne) await post('/api/delete-profile',one);
  if(createdTwo) await post('/api/delete-profile',two);
}
