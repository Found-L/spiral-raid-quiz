import { env } from 'cloudflare:workers';
import { credentials, digest, json, parse, preflight, UserError } from '../../../lib/api';
import { grade, version } from '../../../lib/quiz';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

export async function POST(request: Request) {
  try {
    const body = await parse(request);
    const {deviceId, secret} = credentials(body);
    const result = grade(body.answers, body.version);
    if (!/^[a-f0-9]{32}$/.test(body.attemptId || '')) return json(request, {error:'成绩编号无效。'}, 400);
    if (!env.DB) return json(request, {error: '排行榜暂时不可用，请稍后重试。'}, 503);
    const current = await env.DB.prepare('SELECT secret_hash FROM participants WHERE id = ?').bind(deviceId).first<{secret_hash:string}>();
    if (!current || current.secret_hash !== await digest(secret)) return json(request, {error: '请先保存你的昵称和游戏 ID。'}, 403);
    const previous = await env.DB.prepare('SELECT participant_id, quiz_version, correct_count, total_count, submitted_at FROM attempts WHERE id = ?')
      .bind(body.attemptId).first<{participant_id:string,quiz_version:string,correct_count:number,total_count:number,submitted_at:number}>();
    if (previous) {
      if (previous.participant_id !== deviceId || previous.quiz_version !== version || previous.correct_count !== result.correctCount || previous.total_count !== result.totalCount)
        return json(request, {error:'成绩编号已被使用。'}, 409);
      return json(request, {ok:true,...result,submittedAt:previous.submitted_at});
    }
    const now = Date.now();
    const id = body.attemptId;
    await env.DB.prepare('INSERT INTO attempts (id, participant_id, quiz_version, correct_count, total_count, submitted_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(id,deviceId,version,result.correctCount,result.totalCount,now).run();
    return json(request, {ok:true,...result,submittedAt:now});
  } catch (e) {
    if (e instanceof UserError) return json(request, {error:e.message}, 400);
    if (e instanceof SyntaxError) return json(request, {error:'提交格式不正确。'}, 400);
    return json(request, {error:'提交暂时不可用，请稍后重试。'}, 503);
  }
}
