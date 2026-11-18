import { env } from 'cloudflare:workers';
import { credentials, digest, json, parse, preflight, UserError } from '../../../lib/api';
import { version } from '../../../lib/quiz';

export const dynamic = 'force-dynamic';
export const OPTIONS = preflight;

const PAGE_SIZE = 20;

type Attempt = {
  id: string;
  quizVersion: string;
  correctCount: number;
  totalCount: number;
  submittedAt: number;
};

export async function POST(request: Request) {
  try {
    const body = await parse(request);
    const { deviceId, secret } = credentials(body);
    let cursor: RegExpExecArray | null = null;
    if (body.cursor != null) {
      cursor = typeof body.cursor === 'string' ? /^(\d{1,15})\.([a-f0-9]{32})$/.exec(body.cursor) : null;
      if (!cursor) throw new UserError('历史记录页码无效。');
    }
    if (!env.DB) return json(request, { error: '暂时无法读取答题记录，请稍后重试。' }, 503);
    const hash = await digest(secret);
    const participant = await env.DB.prepare('SELECT secret_hash FROM participants WHERE id = ?')
      .bind(deviceId).first<{secret_hash: string}>();
    if (!participant || participant.secret_hash !== hash) {
      return json(request, { error: '请保存昵称，或恢复原来的身份后再查看记录。' }, 403);
    }

    const pageFilter = cursor ? ' AND (submitted_at, id) < (?, ?)' : '';
    const parameters = cursor ? [deviceId, Number(cursor[1]), cursor[2], PAGE_SIZE + 1] : [deviceId, PAGE_SIZE + 1];
    const [page, stats] = await env.DB.batch<Attempt | { attemptCount: number; best: number | null }>([
      env.DB.prepare(`SELECT id, quiz_version AS quizVersion, correct_count AS correctCount,
        total_count AS totalCount, submitted_at AS submittedAt
        FROM attempts WHERE participant_id = ?${pageFilter}
        ORDER BY submitted_at DESC, id DESC LIMIT ?`).bind(...parameters),
      env.DB.prepare(`SELECT COUNT(*) AS attemptCount,
        MAX(CASE WHEN quiz_version = ? THEN 1.0 * correct_count / total_count END) AS best
        FROM attempts WHERE participant_id = ?`).bind(version, deviceId),
    ]);
    const rows = page.results as Attempt[];
    const summary = stats.results[0] as { attemptCount: number; best: number | null };
    const lastOnPage = rows[PAGE_SIZE - 1];
    return json(request, {
      attemptCount: summary.attemptCount,
      bestScore: summary.best === null ? null : Math.round(summary.best * 10000) / 100,
      nextCursor: rows.length > PAGE_SIZE ? `${lastOnPage.submittedAt}.${lastOnPage.id}` : null,
      entries: rows.slice(0, PAGE_SIZE).map(({ quizVersion, correctCount, totalCount, submittedAt }) => ({
        currentVersion: quizVersion === version,
        correctCount, totalCount, submittedAt,
        score: Math.round(correctCount * 10000 / totalCount) / 100,
      })),
    });
  } catch (error) {
    if (error instanceof UserError || error instanceof SyntaxError) {
      return json(request, { error: error instanceof UserError ? error.message : '请求格式不正确。' }, 400);
    }
    return json(request, { error: '暂时无法读取答题记录，请稍后重试。' }, 503);
  }
}
