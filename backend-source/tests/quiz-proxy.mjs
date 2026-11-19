import assert from 'node:assert/strict';
import {quizProxyRequest} from '../worker/quiz-proxy.mjs';

const origin = 'https://found-l.github.io';
for (const path of ['/api/leaderboard?view=latest&page=2', '/api/honors', '/api/shares/1234', '/api/social/view']) {
  const request = new Request('https://example.test' + path, {headers:{origin}});
  const forwarded = quizProxyRequest(request);
  assert.equal(forwarded.url, 'https://www.lysue.com/spiral-raid-quiz' + path);
  assert.equal(forwarded.headers.get('origin'), origin);
}
const body = JSON.stringify({deviceId:'not-a-real-profile'});
const request = new Request('https://example.test/api/social/comment', {
  method:'POST', headers:{origin, 'content-type':'application/json', host:'example.test'}, body,
});
const forwarded = quizProxyRequest(request);
assert.equal(forwarded.method, 'POST');
assert.equal(await forwarded.text(), body);
assert.equal(forwarded.headers.get('content-type'), 'application/json');
assert.equal(forwarded.headers.get('origin'), origin);
assert.equal(forwarded.headers.get('host'), null);
const preflight = quizProxyRequest(new Request('https://example.test/api/badges', {method:'OPTIONS',headers:{origin}}));
assert.equal(preflight.method, 'OPTIONS');
assert.equal(quizProxyRequest(new Request('https://example.test/other')), null);
console.log('PASS fixed upstream, all API paths, query, body, preflight and origin preservation');
