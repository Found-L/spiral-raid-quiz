import { env } from 'cloudflare:workers';
import { credentials, digest, json, parse, preflight } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function POST(request: Request) {
  try {
    const {deviceId, secret} = credentials(await parse(request));
    if (!env.DB) return json(request, {error:'服务暂不可用。'}, 503);
    const current = await env.DB.prepare('SELECT secret_hash FROM participants WHERE id = ?').bind(deviceId).first<{secret_hash:string}>();
    if (!current || current.secret_hash !== await digest(secret)) return json(request, {error:'浏览器身份不匹配。'}, 403);
    await env.DB.batch([
      env.DB.prepare('DELETE FROM attempts WHERE participant_id = ?').bind(deviceId),
      env.DB.prepare('DELETE FROM participants WHERE id = ?').bind(deviceId),
    ]);
    return json(request, {ok:true});
  } catch { return json(request, {error:'操作失败，请稍后重试。'}, 400); }
}
