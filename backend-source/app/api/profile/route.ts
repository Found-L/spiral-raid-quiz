import { env } from 'cloudflare:workers';
import { cleanText, credentials, digest, json, parse, preflight, UserError } from '../../../lib/api';
import { assignPlayerNumbers } from '../../../lib/player-number';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const body = await parse(request);
    const {deviceId, secret} = credentials(body);
    const nickname = cleanText(body.nickname, '昵称');
    const hash = await digest(secret);
    if (!env.DB) return json(request, {error: '排行榜暂时不可用，请稍后重试。'}, 503);
    const now = Date.now();
    // Keep the legacy columns populated with the generated identifier on insert.
    const saved = await env.DB.prepare(`
      INSERT INTO participants (id, secret_hash, game_id, game_id_key, nickname, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at
      WHERE participants.secret_hash = excluded.secret_hash
      RETURNING id
    `).bind(deviceId, hash, deviceId, deviceId, nickname, now, now).first();
    if (!saved) return json(request, {error: '浏览器身份不匹配。'}, 403);

    const [, numbers] = await env.DB.batch<{playerNumber: number}>([
      assignPlayerNumbers(env.DB, [deviceId]),
      env.DB.prepare('SELECT number AS playerNumber FROM participant_numbers WHERE participant_id = ?').bind(deviceId),
    ]);
    const playerNumber = numbers.results[0]?.playerNumber;
    if (!playerNumber) return json(request, {error: '资料暂时无法保存，请重试。'}, 503);
    return json(request, {ok:true, nickname, playerNumber});
  } catch (e) {
    if (e instanceof UserError) return json(request, {error:e.message}, 400);
    if (e instanceof SyntaxError) return json(request, {error:'资料格式不正确。'}, 400);
    return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
  }
}
