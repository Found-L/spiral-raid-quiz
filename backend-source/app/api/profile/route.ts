import { env } from 'cloudflare:workers';
import { cleanText, credentials, digest, json, parse, preflight, UserError } from '../../../lib/api';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const body = await parse(request);
    const {deviceId, secret} = credentials(body);
    const nickname = cleanText(body.nickname, '昵称');
    const hash = await digest(secret);
    if (!env.DB) return json(request, {error: '排行榜暂时不可用，请稍后重试。'}, 503);
    const current = await env.DB.prepare('SELECT secret_hash FROM participants WHERE id = ?').bind(deviceId).first<{secret_hash:string}>();
    if (current && current.secret_hash !== hash) return json(request, {error: '浏览器身份不匹配。'}, 403);
    const now = Date.now();
    if (current) await env.DB.prepare('UPDATE participants SET nickname = ?, updated_at = ? WHERE id = ?')
      .bind(nickname,now,deviceId).run();
    // Legacy columns are retained for deployed database compatibility. They
    // contain only the generated internal identifier for new participants.
    else await env.DB.prepare('INSERT INTO participants (id, secret_hash, game_id, game_id_key, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(deviceId,hash,deviceId,deviceId,nickname,now,now).run();
    return json(request, {ok:true, nickname});
  } catch (e) {
    if (e instanceof UserError) return json(request, {error:e.message}, 400);
    if (e instanceof SyntaxError) return json(request, {error:'资料格式不正确。'}, 400);
    return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
  }
}
