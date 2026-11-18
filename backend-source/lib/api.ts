const origins = new Set(['https://found-l.github.io']);
export class UserError extends Error {}

export function headers(request: Request) {
  const origin = request.headers.get('Origin');
  const h = new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
  });
  if (origin && (origins.has(origin) || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) {
    h.set('Access-Control-Allow-Origin', origin);
    h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    h.set('Access-Control-Allow-Headers', 'Content-Type');
    h.set('Access-Control-Max-Age', '600');
  }
  return h;
}
export function json(request: Request, body: unknown, status=200) {
  return new Response(JSON.stringify(body), {status, headers: headers(request)});
}
export function preflight(request: Request) { return new Response(null, {status: 204, headers: headers(request)}); }
export async function parse(request: Request) {
  if (Number(request.headers.get('Content-Length') || 0) > 20000) throw new UserError('提交内容过大。');
  const raw = await request.text();
  if (raw.length > 20000) throw new UserError('提交内容过大。');
  return JSON.parse(raw) as Record<string, any>;
}
export function credentials(body: Record<string, any>) {
  if (!/^[a-f0-9]{32}$/.test(body.deviceId || '') || !/^[a-f0-9]{64}$/.test(body.secret || '')) {
    throw new UserError('浏览器身份无效，请重新打开页面。');
  }
  return {deviceId: String(body.deviceId), secret: String(body.secret)};
}
export async function digest(secret: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret));
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');
}
export function cleanText(value: unknown, label: string) {
  if (typeof value !== 'string') throw new UserError(`请输入${label}。`);
  const s = value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(s) || [...s].length < 1 || [...s].length > 24) {
    throw new UserError(`${label}请填写 1 至 24 个字符。`);
  }
  return s;
}
