import { env } from 'cloudflare:workers';
import { json, preflight } from '../../../lib/api';
import { version } from '../../../lib/quiz';
import { assignPlayerNumbers } from '../../../lib/player-number';

type RankedParticipant = {
  participantId: string;
  playerNumber: number | null;
  nickname: string;
  correctCount: number;
  totalCount: number;
  submittedAt: number;
};

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;
export async function GET(request: Request) {
  try {
    if (!env.DB) return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
    const rankings = env.DB.prepare(`WITH ranked AS (
      SELECT participant_id,correct_count,total_count,submitted_at,
        ROW_NUMBER() OVER (PARTITION BY participant_id ORDER BY (1.0 * correct_count / total_count) DESC, submitted_at ASC, id ASC) AS rn
      FROM attempts WHERE quiz_version = ?
    ) SELECT p.id AS participantId, n.number AS playerNumber, p.nickname,
        r.correct_count AS correctCount, r.total_count AS totalCount, r.submitted_at AS submittedAt
      FROM ranked r JOIN participants p ON p.id = r.participant_id
      LEFT JOIN participant_numbers n ON n.participant_id = p.id
      WHERE r.rn = 1
      ORDER BY (1.0 * r.correct_count / r.total_count) DESC, r.submitted_at ASC, p.id ASC LIMIT 100`)
      .bind(version);
    let {results} = await rankings.all<RankedParticipant>();
    const unnumbered = results.filter(row => row.playerNumber === null);
    if (unnumbered.length) {
      // Give existing scores numbers without asking players to sign in again.
      const [, updated] = await env.DB.batch<RankedParticipant>([
        assignPlayerNumbers(env.DB, unnumbered.map(row => row.participantId)),
        rankings,
      ]);
      results = updated.results;
    }
    const entries = results.map(({ playerNumber, nickname, correctCount, totalCount, submittedAt }, index) => ({
      playerNumber, nickname, correctCount, totalCount, submittedAt,
      rank: index + 1,
      score: Math.round(correctCount * 10000 / totalCount) / 100,
    }));
    return json(request, {version,entries});
  } catch {
    return json(request, {error:'排行榜暂时不可用，请稍后重试。'}, 503);
  }
}
