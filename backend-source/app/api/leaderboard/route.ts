import { env } from 'cloudflare:workers';
import { json, preflight } from '../../../lib/api';
import { version } from '../../../lib/quiz';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function GET(request: Request) {
  try {
    if (!env.DB) return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
    const result = await env.DB.prepare(`WITH ranked AS (
      SELECT participant_id,correct_count,total_count,submitted_at,
        ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY (1.0 * correct_count / total_count) DESC, submitted_at ASC, id ASC) AS rn
      FROM attempts WHERE quiz_version = ?
    ) SELECT p.nickname,r.correct_count AS correctCount,r.total_count AS totalCount,r.submitted_at AS submittedAt
      FROM ranked r JOIN participants p ON p.id = r.participant_id WHERE r.rn = 1
      ORDER BY (1.0 * r.correct_count / r.total_count) DESC, r.submitted_at ASC, p.id ASC LIMIT 100`)
      .bind(version).all<{nickname:string,correctCount:number,totalCount:number,submittedAt:number}>();
    const entries = result.results.map((r,i) => ({...r,rank:i+1,score:Math.round(r.correctCount*10000/r.totalCount)/100}));
    return json(request, {version,entries});
  } catch {
    return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
  }
}
