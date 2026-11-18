import bank from './question-bank.json';
import { UserError } from './api';

export const version = bank.version;
export const total = bank.questions.length;

// Scores are computed on the server; the public bank is inspectable, so this is
// a friendly practice leaderboard, not an anti-cheat examination.
export function grade(answers: unknown, submittedVersion: unknown) {
  if (submittedVersion !== version) throw new UserError('题库已更新，请刷新页面后重新答题。');
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) throw new UserError('答案格式不正确。');
  const supplied = answers as Record<string, unknown>;
  if (Object.keys(supplied).length !== total) throw new UserError('请完成全部题目后提交。');
  let correctCount = 0;
  for (const question of bank.questions) {
    const answer = supplied[question.id];
    if (!Array.isArray(answer) || !answer.length || answer.length > question.options.length ||
      answer.some((v) => typeof v !== 'string' || !question.options.some((o) => o.id === v)) ||
      new Set(answer).size !== answer.length) throw new UserError('请完成全部题目后提交。');
    if (answer.length === question.answer.length && answer.every((v) => question.answer.includes(v))) correctCount++;
  }
  return { correctCount, totalCount: total, score: Math.round(correctCount * 10000 / total) / 100 };
}
