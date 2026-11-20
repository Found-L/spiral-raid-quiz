#!/usr/bin/env python3
"""Small loopback-only API for the shared Spiral Temple practice leaderboard."""

import hashlib
import hmac
import itertools
import json
import logging
import math
import os
import re
import secrets
import sqlite3
import time
import unicodedata
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import badge_metrics
import social

ROOT = Path(__file__).resolve().parent
BANK = json.loads((ROOT / 'questions.json').read_text(encoding='utf-8'))
QUESTIONS = BANK['questions']
VERSION = BANK['version']
BANKS = {VERSION: BANK}
for path in sorted((ROOT / 'banks').glob('*.json')):
    archived = json.loads(path.read_text(encoding='utf-8'))
    archived_version = archived['version']
    if archived_version in BANKS:
        raise RuntimeError(f'Duplicate question bank version: {archived_version}')
    BANKS[archived_version] = archived
DATABASE = Path(os.environ.get('QUIZ_DATABASE', '/var/lib/spiral-raid-quiz/quiz.sqlite3'))
PORT = int(os.environ.get('QUIZ_PORT', '8791'))
ALLOWED_ORIGINS = {'https://found-l.github.io', 'https://www.lysue.com'}
MAX_BODY = 20000
MAX_SHOWN_BADGES = 3
# Order determines the default selection for players who have not chosen badges yet.
BADGES = [
    {'id': 'quickest', 'name': '快枪手', 'description': '全站已计时答卷用时最短，不看分数；并列同得，纪录被超越后让出。', 'icon': 'bolt', 'tone': 'gold'},
    {'id': 'site_rounds', 'name': '寺院劳模', 'description': '全站累计完成轮数最多，至少完成 2 轮；并列同得，纪录被超越后让出。', 'icon': 'temple', 'tone': 'teal'},
    {'id': 'site_perfects', 'name': '满分制造机', 'description': '全站累计满分答卷最多，至少获得 1 次满分；并列同得，纪录被超越后让出。', 'icon': 'crown', 'tone': 'violet'},
    {'id': 'site_perfect_fast', 'name': '满分速通王', 'description': '全站已计时的满分答卷用时最短；并列同得，纪录被超越后让出。', 'icon': 'bolt', 'tone': 'gold'},
    {'id': 'perfect_fast', 'name': '闪电机制王', 'description': '10 分钟内完成一份满分答卷。', 'icon': 'bolt', 'tone': 'gold'},
    {'id': 'perfect', 'name': '教科书成精', 'description': '任意一轮获得满分。', 'icon': 'crown', 'tone': 'gold'},
    {'id': 'almost', 'name': '就差一丢丢', 'description': '任意一轮只错 1 题。', 'icon': 'target', 'tone': 'violet'},
    {'id': 'knowledge', 'name': '机制小抄本', 'description': '任意一轮达到 90 分。', 'icon': 'book', 'tone': 'teal'},
    {'id': 'slow_careful', 'name': '慢工出细活', 'description': '用时至少 30 分钟，且本轮达到 90 分。', 'icon': 'hourglass', 'tone': 'teal'},
    {'id': 'five_minutes', 'name': '手速在线', 'description': '5 分钟内完成一轮，不限分数。', 'icon': 'wing', 'tone': 'red'},
    {'id': 'ten_rounds', 'name': '寺院编外人员', 'description': '累计完成 10 轮。', 'icon': 'temple', 'tone': 'violet'},
    {'id': 'five_rounds', 'name': '团本打卡王', 'description': '累计完成 5 轮。', 'icon': 'flag', 'tone': 'teal'},
    {'id': 'three_rounds', 'name': '重开不算输', 'description': '累计完成 3 轮。', 'icon': 'refresh', 'tone': 'red'},
    {'id': 'steady', 'name': '稳如老 T', 'description': '累计 3 轮达到 90 分。', 'icon': 'shield', 'tone': 'teal'},
    {'id': 'twins_expert', 'name': '双剑指挥家', 'description': '一轮中双剑区间的题目全部答对。', 'icon': 'shield', 'tone': 'red'},
    {'id': 'spirit_expert', 'name': '超魔灵通关手', 'description': '一轮中超魔灵区间的题目全部答对。', 'icon': 'spark', 'tone': 'gold'},
    {'id': 'witch_expert', 'name': '魔女观察员', 'description': '一轮中黑风魔女区间的题目全部答对。', 'icon': 'target', 'tone': 'violet'},
    {'id': 'heal_expert', 'name': '抬血救场王', 'description': '同一轮答对当前题库中指定的五道双剑抬血题。', 'icon': 'heart', 'tone': 'teal'},
    {'id': 'lamp_expert', 'name': '点灯不迷路', 'description': '同一轮答对当前题库中指定的四道超魔灵染灯题。', 'icon': 'lantern', 'tone': 'gold'},
    {'id': 'spider_expert', 'name': '蜘蛛清道夫', 'description': '同一轮答对当前题库中指定的五道魔女蜘蛛题。', 'icon': 'spider', 'tone': 'violet'},
    {'id': 'right_streak', 'name': '一路连对', 'description': '按本轮试卷展示顺序，连续答对 20 题。', 'icon': 'bolt', 'tone': 'gold'},
    {'id': 'wrong_streak', 'name': '思路去散步', 'description': '按本轮试卷展示顺序，连续答错 5 题。', 'icon': 'wing', 'tone': 'violet'},
    {'id': 'repeat_wrong', 'name': '老对手又见面', 'description': '同一题库连续上传的 3 轮中，同一道题都答错。', 'icon': 'refresh', 'tone': 'red'},
    {'id': 'comeback', 'name': '咸鱼翻身', 'description': '曾有一轮低于 60 分，之后又有一轮达到 90 分。', 'icon': 'spark', 'tone': 'gold'},
    {'id': 'zero', 'name': '反向满分', 'description': '任意一轮 0 题答对。', 'icon': 'target', 'tone': 'violet'},
    {'id': 'brave', 'name': '胆大先开怪', 'description': '任意一轮低于 60 分，开荒勇气可嘉。', 'icon': 'flame', 'tone': 'red'},
    {'id': 'demolition', 'name': '爆破鬼才', 'description': '选过带着炸弹靠近队友的危险选项。烟花虽好，请远离人群。', 'icon': 'bomb', 'tone': 'red'},
    {'id': 'spider_keeper', 'name': '蜘蛛饲养员', 'description': '选过放任或乱带小蜘蛛的选项。蜘蛛还是要按分工聚好。', 'icon': 'spider', 'tone': 'violet'},
    {'id': 'laser_runner', 'name': '危险线竞速', 'description': '选过让首领横穿或碰到危险线的选项。过线可不是加速。', 'icon': 'laser', 'tone': 'red'},
    {'id': 'lamp_tourist', 'name': '灯会跟团游', 'description': '选过追着主 T 挡染灯路线的选项。赏灯请给主 T 让路。', 'icon': 'lantern', 'tone': 'gold'},
    {'id': 'doctor', 'name': '妙手回错春', 'description': '选过把治疗珠瞄错目标的选项。绿色指示要对准本侧主 T。', 'icon': 'heart', 'tone': 'teal'},
    {'id': 'direction', 'name': '方向感大师', 'description': '选过外场位面向首领抢入隔离的选项。留在外场要背对首领。', 'icon': 'compass', 'tone': 'violet'},
    {'id': 'boss_healer', 'name': '首领慈善家', 'description': '选过放任大蜘蛛给首领回血的选项。记得及时打断。', 'icon': 'heart', 'tone': 'red'},
    {'id': 'ball_crasher', 'name': '蹭球积极分子', 'description': '没有分配挡球时，选了主动挤进队友球路。请给挡球位留空间。', 'icon': 'orb', 'tone': 'red'},
    {'id': 'rush_hour', 'name': '抢跑小能手', 'description': '选了吸人还没结束就抢先过河。等吸引结束再过河。', 'icon': 'wing', 'tone': 'gold'},
    {'id': 'color_guess', 'name': '颜色盲盒', 'description': '选了碰到飞行球就断定状态已换色。记得区分碰球和挡球。', 'icon': 'orb', 'tone': 'violet'},
    {'id': 'edge_dancer', 'name': '贴线艺术家', 'description': '选了砸地前贴线或迎着危险线吃击退。先给自己留安全位置。', 'icon': 'laser', 'tone': 'red'},
    {'id': 'spider_tour', 'name': '蜘蛛旅行社', 'description': '选了把小蜘蛛拉散或带去炸弹位。请按团队分工聚怪。', 'icon': 'spider', 'tone': 'teal'},
    {'id': 'first', 'name': '初入寺院', 'description': '完成第一轮考核。', 'icon': 'temple', 'tone': 'teal'},
]
BADGE_BY_ID = {badge['id']: badge for badge in BADGES}
# These option IDs apply only to the explicitly checked answer keys.
MISTAKE_VERSIONS = {'peak-spiral-2026-11-18-v5', 'peak-spiral-2026-11-18-v6', 'peak-spiral-2026-11-18-v7', 'peak-spiral-2026-11-18-v8', 'peak-spiral-2026-11-18-v9', 'peak-spiral-2026-11-18-v10'}
MISTAKE_RULES = {
    'demolition': {'q036': {'b', 'd'}, 'q042': {'a'}, 'q047': {'a'}, 'q050': {'d'},
                   'q066': {'a', 'c'}, 'q089': {'a', 'c'}, 'q090': {'a'}, 'q091': {'b'}},
    'spider_keeper': {'q070': {'c', 'd'}, 'q092': {'b', 'c', 'd'}},
    'laser_runner': {'q060': {'d'}, 'q075': {'c'}, 'q093': {'a', 'b'}},
    'lamp_tourist': {'q047': {'c', 'd'}, 'q090': {'c', 'd'}},
    'doctor': {'q014': {'b', 'c', 'd'}, 'q088': {'b', 'c', 'd'}},
    'direction': {'q042': {'b'}, 'q091': {'a', 'c'}, 'q098': {'d'}},
    'boss_healer': {'q071': {'d'}, 'q094': {'a', 'b'}},
    'ball_crasher': {'q095': {'a', 'b'}},
    'rush_hour': {'q096': {'a', 'd'}},
    'color_guess': {'q097': {'d'}},
    'edge_dancer': {'q099': {'b', 'd'}},
    'spider_tour': {'q100': {'c', 'd'}},
}
PRIVATE_BADGES = set(MISTAKE_RULES) | {'wrong_streak', 'repeat_wrong'}
TOPIC_RULES = {
    'heal_expert': {'q014', 'q015', 'q016', 'q017', 'q103'},
    'lamp_expert': {'q045', 'q046', 'q052', 'q090'},
    'spider_expert': {'q069', 'q070', 'q071', 'q072', 'q094'},
}
TOPIC_VERSION = 'peak-spiral-2026-11-18-v10'


class ApiError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def database():
    connection = sqlite3.connect(DATABASE, timeout=10, isolation_level=None)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys = ON')
    connection.execute('PRAGMA busy_timeout = 10000')
    return connection


def initialize():
    DATABASE.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with closing(database()) as db:
        db.execute('PRAGMA journal_mode = WAL')
        db.executescript('''
            CREATE TABLE IF NOT EXISTS participants (
                id TEXT PRIMARY KEY, secret_hash TEXT NOT NULL, game_id TEXT NOT NULL,
                game_id_key TEXT NOT NULL, nickname TEXT NOT NULL,
                created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
            );
            CREATE UNIQUE INDEX IF NOT EXISTS participants_game_id_key ON participants(game_id_key);
            CREATE TABLE IF NOT EXISTS participant_numbers (
                number INTEGER PRIMARY KEY AUTOINCREMENT,
                participant_id TEXT NOT NULL UNIQUE REFERENCES participants(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id TEXT PRIMARY KEY, participant_id TEXT NOT NULL REFERENCES participants(id),
                quiz_version TEXT NOT NULL, correct_count INTEGER NOT NULL,
                total_count INTEGER NOT NULL, submitted_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempt_timings (
                attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
                elapsed_seconds INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempt_completion_times (
                attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE,
                completed_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS badge_selections (
                participant_id TEXT PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
                selections TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS attempt_mistake_badges (
                attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
                badge_id TEXT NOT NULL,
                PRIMARY KEY (attempt_id, badge_id)
            );
            CREATE TABLE IF NOT EXISTS attempt_analysis (
                attempt_id TEXT PRIMARY KEY REFERENCES attempts(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS attempt_wrong_questions (
                attempt_id TEXT NOT NULL REFERENCES attempt_analysis(attempt_id) ON DELETE CASCADE,
                question_id TEXT NOT NULL,
                PRIMARY KEY (attempt_id, question_id)
            );
            CREATE INDEX IF NOT EXISTS attempts_version_participant ON attempts(quiz_version, participant_id);
            CREATE INDEX IF NOT EXISTS attempts_participant_time ON attempts(participant_id, submitted_at, id);
            CREATE INDEX IF NOT EXISTS attempt_timings_elapsed ON attempt_timings(elapsed_seconds);
        ''')
        social.initialize(db)
        db.executescript('''
            CREATE TABLE IF NOT EXISTS share_cards (
                id TEXT PRIMARY KEY,
                participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
                snapshot TEXT NOT NULL, created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS share_cards_owner ON share_cards(participant_id);
        ''')
        badge_metrics.record_current(db, honor_boards)
        badge_metrics.invalidate()


def credentials(body):
    device = body.get('deviceId')
    secret = body.get('secret')
    if not isinstance(device, str) or not re.fullmatch(r'[a-f0-9]{32}', device):
        raise ApiError('浏览器身份无效，请重新打开页面。')
    if not isinstance(secret, str) or not re.fullmatch(r'[a-f0-9]{64}', secret):
        raise ApiError('浏览器身份无效，请重新打开页面。')
    return device, hashlib.sha256(secret.encode('utf-8')).hexdigest()


def validate_nickname(value):
    if not isinstance(value, str):
        raise ApiError('请输入昵称。')
    value = ' '.join(unicodedata.normalize('NFKC', value).split())
    if not 1 <= len(value) <= 24 or any(ord(c) <= 31 or 127 <= ord(c) <= 159 for c in value):
        raise ApiError('昵称请填写 1 至 24 个字符。')
    return value


def score(correct, total):
    return math.floor(correct * 10000 / total + 0.5) / 100


def grade(answers, submitted_version):
    bank = BANKS.get(submitted_version) if isinstance(submitted_version, str) else None
    if not bank:
        raise ApiError('题库已更新，请刷新页面后重新答题。')
    questions = bank['questions']
    if not isinstance(answers, dict):
        raise ApiError('答案格式不正确。')
    if len(answers) != len(questions):
        raise ApiError('请完成全部题目后提交。')
    correct = 0
    for question in questions:
        answer = answers.get(question['id'])
        options = {item['id'] for item in question['options']}
        if (not isinstance(answer, list) or not answer or len(answer) > len(options)
                or any(not isinstance(item, str) or item not in options for item in answer)
                or len(set(answer)) != len(answer)):
            raise ApiError('请完成全部题目后提交。')
        if set(answer) == set(question['answer']):
            correct += 1
    return {'correctCount': correct, 'totalCount': len(questions), 'score': score(correct, len(questions))}


def authenticated(db, device, secret_hash, message):
    row = db.execute('SELECT secret_hash FROM participants WHERE id = ?', (device,)).fetchone()
    if not row or not hmac.compare_digest(row['secret_hash'], secret_hash):
        raise ApiError(message, 403)


def mistake_badges(answers, version):
    if version not in MISTAKE_VERSIONS:
        return set()
    return {badge_id for badge_id, rules in MISTAKE_RULES.items()
            if any(set(answers.get(question_id, [])) & options for question_id, options in rules.items())}


def analyze_attempt(answers, version, order):
    """Only use checked answers; older clients may omit their display order."""
    questions = BANKS[version]['questions']
    ids = [question['id'] for question in questions]
    if order is not None and (not isinstance(order, list) or len(order) != len(ids)
                              or any(not isinstance(item, str) for item in order)
                              or len(set(order)) != len(ids) or set(order) != set(ids)):
        raise ApiError('试卷顺序无效，请刷新后重试。')
    wrong = {question['id'] for question in questions
             if set(answers[question['id']]) != set(question['answer'])}
    earned = set()
    for section, badge_id in (('twins', 'twins_expert'), ('spirit', 'spirit_expert'),
                              ('witch', 'witch_expert')):
        section_ids = {question['id'] for question in questions if question['section'] == section}
        if section_ids and not (section_ids & wrong):
            earned.add(badge_id)
    if version == TOPIC_VERSION:
        earned.update(badge_id for badge_id, group in TOPIC_RULES.items()
                      if group <= set(ids) and not group & wrong)
    if order is not None:
        right_run = wrong_run = 0
        for question_id in order:
            if question_id in wrong:
                wrong_run += 1
                right_run = 0
            else:
                right_run += 1
                wrong_run = 0
            if right_run >= 20:
                earned.add('right_streak')
            if wrong_run >= 5:
                earned.add('wrong_streak')
    return wrong, earned


def repeated_wrong_questions(db, participant_id):
    """A missing analysis or different bank breaks the upload-order sequence."""
    recent = db.execute('''SELECT a.id, a.quiz_version, x.attempt_id AS analyzed
                           FROM attempts a LEFT JOIN attempt_analysis x ON x.attempt_id = a.id
                           WHERE a.participant_id = ? ORDER BY a.rowid DESC LIMIT 3''',
                        (participant_id,)).fetchall()
    if len(recent) != 3 or any(row['quiz_version'] != recent[0]['quiz_version'] or not row['analyzed'] for row in recent):
        return None, set()
    wrong_sets = [{row['question_id'] for row in db.execute(
        'SELECT question_id FROM attempt_wrong_questions WHERE attempt_id = ?', (attempt['id'],))}
                  for attempt in recent]
    return recent[0]['quiz_version'], set.intersection(*wrong_sets)


def repeated_review(db, participant_id):
    version, wrong = repeated_wrong_questions(db, participant_id)
    bank = BANKS.get(version)
    if not bank or not wrong:
        return []
    return [{'id': q['id'], 'section': q['section'], 'question': q['question'],
             'answer': '；'.join(option['text'] for option in q['options'] if option['id'] in q['answer']),
             'explanation': q['explanation'], 'currentVersion': version == VERSION}
            for q in bank['questions'] if q['id'] in wrong]


def profile(db, body):
    device, secret_hash = credentials(body)
    nickname = validate_nickname(body.get('nickname'))
    now = int(time.time() * 1000)
    db.execute('BEGIN IMMEDIATE')
    try:
        old = db.execute('SELECT secret_hash FROM participants WHERE id = ?', (device,)).fetchone()
        if old:
            if not hmac.compare_digest(old['secret_hash'], secret_hash):
                raise ApiError('浏览器身份不匹配。', 403)
            db.execute('UPDATE participants SET nickname = ?, updated_at = ? WHERE id = ?', (nickname, now, device))
        else:
            db.execute('INSERT INTO participants VALUES (?, ?, ?, ?, ?, ?, ?)',
                       (device, secret_hash, device, device, nickname, now, now))
        row = db.execute('SELECT number FROM participant_numbers WHERE participant_id = ?', (device,)).fetchone()
        if not row:
            db.execute('INSERT INTO participant_numbers (participant_id) VALUES (?)', (device,))
            row = db.execute('SELECT number FROM participant_numbers WHERE participant_id = ?', (device,)).fetchone()
        db.execute('COMMIT')
        return {'ok': True, 'nickname': nickname, 'playerNumber': row['number']}
    except Exception:
        db.execute('ROLLBACK')
        raise


def submit(db, body):
    device, secret_hash = credentials(body)
    submitted_version = body.get('version')
    result = grade(body.get('answers'), submitted_version)
    wrong, analysis_badges = analyze_attempt(body['answers'], submitted_version, body.get('questionOrder'))
    attempt_id = body.get('attemptId')
    if not isinstance(attempt_id, str) or not re.fullmatch(r'[a-f0-9]{32}', attempt_id):
        raise ApiError('成绩编号无效。')
    elapsed = body.get('elapsedSeconds')
    if elapsed is not None and (type(elapsed) is not int or not 0 <= elapsed <= 365 * 24 * 3600):
        raise ApiError('答题用时无效。')
    db.execute('BEGIN IMMEDIATE')
    try:
        authenticated(db, device, secret_hash, '请先保存昵称，或恢复原来的身份。')
        previous = db.execute('''SELECT a.*, t.elapsed_seconds FROM attempts a
            LEFT JOIN attempt_timings t ON t.attempt_id = a.id WHERE a.id = ?''', (attempt_id,)).fetchone()
        if previous:
            if (previous['participant_id'] != device or previous['quiz_version'] != submitted_version
                    or previous['correct_count'] != result['correctCount']
                    or previous['total_count'] != result['totalCount']
                    or (previous['elapsed_seconds'] is not None and previous['elapsed_seconds'] != elapsed)):
                raise ApiError('成绩编号已被使用。', 409)
            now = previous['submitted_at']
            elapsed = previous['elapsed_seconds']
        else:
            now = int(time.time() * 1000)
            db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                       (attempt_id, device, submitted_version, result['correctCount'], result['totalCount'], now))
            completed_at = body.get('completedAt')
            if type(completed_at) is int and 946684800000 <= completed_at <= now + 300000:
                db.execute('INSERT INTO attempt_completion_times VALUES (?, ?)', (attempt_id, completed_at))
            if elapsed is not None:
                db.execute('INSERT INTO attempt_timings VALUES (?, ?)', (attempt_id, elapsed))
            db.execute('INSERT INTO attempt_analysis VALUES (?)', (attempt_id,))
            db.executemany('INSERT INTO attempt_wrong_questions VALUES (?, ?)',
                           ((attempt_id, question_id) for question_id in wrong))
            if repeated_wrong_questions(db, device)[1]:
                analysis_badges.add('repeat_wrong')
            for badge_id in mistake_badges(body['answers'], submitted_version) | analysis_badges:
                db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (attempt_id, badge_id))
        triggered = {row['badge_id'] for row in db.execute(
            'SELECT badge_id FROM attempt_mistake_badges WHERE attempt_id = ?', (attempt_id,))}
        badge_metrics.record_current(db, honor_boards)
        db.execute('COMMIT')
        badge_metrics.invalidate()
        return {'ok': True, **result, 'submittedAt': now, 'elapsedSeconds': elapsed,
                'triggeredBadges': [badge for badge in BADGES if badge['id'] in triggered]}
    except Exception:
        db.execute('ROLLBACK')
        raise


def version_order(version):
    match = re.search(r'(\d{4}-\d{2}-\d{2})-v(\d+)$', version)
    return (match.group(1), int(match.group(2))) if match else ('', 0)


def saved_badge_selections(db, participant_ids, placeholders):
    selections = db.execute('SELECT participant_id, selections FROM badge_selections WHERE participant_id IN ('
                            + placeholders + ')', participant_ids).fetchall()
    saved = {}
    for row in selections:
        try:
            value = json.loads(row['selections'])
            saved[row['participant_id']] = value if isinstance(value, list) else []
        except (TypeError, ValueError):
            saved[row['participant_id']] = []
    return saved


def attempt_badges(row, fastest):
    correct, total, elapsed = row['correct_count'], row['total_count'], row['elapsed_seconds']
    high = correct * 100 >= 90 * total
    timed = elapsed is not None
    conditions = {
        'perfect': correct == total,
        'perfect_fast': correct == total and timed and elapsed <= 600,
        'almost': total - correct == 1,
        'knowledge': high,
        'slow_careful': high and timed and elapsed >= 1800,
        'brave': correct * 100 < 60 * total,
        'zero': correct == 0,
        'five_minutes': timed and elapsed <= 300,
        'quickest': timed and fastest is not None and elapsed == fastest,
    }
    return {badge_id for badge_id, matches in conditions.items() if matches}


def has_comeback(rows):
    had_low = False
    for row in rows:
        correct, total = row['correct_count'], row['total_count']
        if had_low and correct * 100 >= 90 * total:
            return True
        if correct * 100 < 60 * total:
            had_low = True
    return False


def earned_badges(rows, fastest):
    thresholds = {'first': 1, 'three_rounds': 3, 'five_rounds': 5, 'ten_rounds': 10}
    earned = {badge_id for badge_id, count in thresholds.items() if len(rows) >= count}
    if sum(row['correct_count'] * 100 >= 90 * row['total_count'] for row in rows) >= 3:
        earned.add('steady')
    if has_comeback(rows):
        earned.add('comeback')
    for row in rows:
        earned.update(attempt_badges(row, fastest))
    return earned


def honor_statistics(db):
    """One row per player; only uploaded attempts and recorded timings are used."""
    rows = db.execute('''WITH stats AS (
                           SELECT p.id AS participant_id, p.nickname, n.number,
                                  COUNT(a.id) AS rounds,
                                  SUM(CASE WHEN a.correct_count = a.total_count THEN 1 ELSE 0 END) AS perfects,
                                  MIN(t.elapsed_seconds) AS fastest,
                                  MIN(CASE WHEN a.correct_count = a.total_count THEN t.elapsed_seconds END) AS perfect_fastest,
                                  MAX(COALESCE(c.completed_at, a.submitted_at)) AS rounds_at,
                                  MAX(CASE WHEN a.correct_count = a.total_count THEN COALESCE(c.completed_at, a.submitted_at) END) AS perfects_at
                           FROM participants p JOIN attempts a ON a.participant_id = p.id
                           LEFT JOIN participant_numbers n ON n.participant_id = p.id
                           LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                           LEFT JOIN attempt_completion_times c ON c.attempt_id = a.id
                           GROUP BY p.id, p.nickname, n.number
                         ) SELECT stats.*,
                           (SELECT MIN(COALESCE(c2.completed_at, a2.submitted_at))
                            FROM attempts a2 JOIN attempt_timings t2 ON t2.attempt_id = a2.id
                            LEFT JOIN attempt_completion_times c2 ON c2.attempt_id = a2.id
                            WHERE a2.participant_id = stats.participant_id AND t2.elapsed_seconds = stats.fastest) AS fastest_at,
                           (SELECT MIN(COALESCE(c2.completed_at, a2.submitted_at))
                            FROM attempts a2 JOIN attempt_timings t2 ON t2.attempt_id = a2.id
                            LEFT JOIN attempt_completion_times c2 ON c2.attempt_id = a2.id
                            WHERE a2.participant_id = stats.participant_id AND a2.correct_count = a2.total_count
                              AND t2.elapsed_seconds = stats.perfect_fastest) AS perfect_fastest_at
                         FROM stats''').fetchall()
    return [dict(row) for row in rows]


HONOR_CATEGORIES = (
    ('quickest', 'fastest', 'asc', 0),
    ('site_rounds', 'rounds', 'desc', 2),
    ('site_perfects', 'perfects', 'desc', 1),
    ('site_perfect_fast', 'perfect_fastest', 'asc', 0),
)


def honor_eligible(stats, metric, direction, minimum):
    eligible = [row for row in stats if row[metric] is not None and row[metric] >= minimum]
    eligible.sort(key=lambda row: (row[metric] if direction == 'asc' else -row[metric],
                                   row[metric + '_at'] if row[metric + '_at'] is not None else float('inf'),
                                   row['number'] if row['number'] is not None else float('inf'),
                                   row['participant_id']))
    return eligible


def honor_entries(eligible, metric, offset, limit):
    entries, previous, rank = [], None, 0
    for index, row in enumerate(eligible):
        if index == 0 or row[metric] != previous:
            rank = index + 1
        previous = row[metric]
        if offset <= index < offset + limit:
            entries.append({'rank': rank, 'nickname': row['nickname'], 'playerNumber': row['number'],
                            'value': row[metric]})
        if index >= offset + limit:
            break
    return entries


def honor_boards(db):
    """Show five players per board while awarding every tied record holder."""
    stats = honor_statistics(db)
    boards, winners = [], {}
    for badge_id, metric, direction, minimum in HONOR_CATEGORIES:
        eligible = honor_eligible(stats, metric, direction, minimum)
        best = eligible[0][metric] if eligible else None
        winners[badge_id] = {row['participant_id'] for row in eligible if row[metric] == best}
        boards.append({'badge': BADGE_BY_ID[badge_id], 'entries': honor_entries(eligible, metric, 0, 5),
                       'valueType': 'time' if direction == 'asc' else 'count',
                       'holderCount': len(winners[badge_id]), 'total': len(eligible)})
    return {'boards': boards}, winners


def honor_page(db, badge_id, page=1, page_size=20):
    category = next((item for item in HONOR_CATEGORIES if item[0] == badge_id), None)
    if not category:
        raise ApiError('趣味榜类型无效。')
    if not 1 <= page <= 100000000 or not 1 <= page_size <= 100:
        raise ApiError('趣味榜页码无效。')
    _, metric, direction, minimum = category
    eligible = honor_eligible(honor_statistics(db), metric, direction, minimum)
    total = len(eligible)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    best = eligible[0][metric] if eligible else None
    return {'badge': BADGE_BY_ID[badge_id], 'entries': honor_entries(eligible, metric, (page - 1) * page_size, page_size),
            'valueType': 'time' if direction == 'asc' else 'count',
            'holderCount': sum(row[metric] == best for row in eligible),
            'page': page, 'pageSize': page_size, 'total': total, 'pages': pages}


def honor_history_page(db, badge_id, page=1, page_size=20):
    """Combine inferred historical holders with recorded holder events."""
    category = next((item for item in HONOR_CATEGORIES if item[0] == badge_id), None)
    if not category:
        raise ApiError('趣味榜类型无效。')
    if not 1 <= page <= 100000000 or not 1 <= page_size <= 100:
        raise ApiError('趣味榜页码无效。')
    _, _, direction, minimum = category
    rows = db.execute('''SELECT a.participant_id, COALESCE(c.completed_at, a.submitted_at) AS completed_at, a.correct_count, a.total_count,
                                t.elapsed_seconds, p.nickname, n.number
                         FROM attempts a JOIN participants p ON p.id = a.participant_id
                         LEFT JOIN participant_numbers n ON n.participant_id = p.id
                         LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                         LEFT JOIN attempt_completion_times c ON c.attempt_id = a.id
                         ORDER BY COALESCE(c.completed_at, a.submitted_at), a.id''')
    values, metadata, achieved = {}, {}, {}
    record = None
    # Completions sharing a millisecond are evaluated together; their ID ordering
    # cannot prove which happened first.
    for completed_at, batch in itertools.groupby(rows, key=lambda row: row['completed_at']):
        changed = set()
        for row in batch:
            participant = row['participant_id']
            metadata[participant] = (row['nickname'], row['number'])
            perfect = row['correct_count'] == row['total_count']
            elapsed = row['elapsed_seconds']
            previous = values.get(participant)
            if badge_id == 'site_rounds':
                value = (previous or 0) + 1
            elif badge_id == 'site_perfects':
                if not perfect:
                    continue
                value = (previous or 0) + 1
            else:
                if elapsed is None or (badge_id == 'site_perfect_fast' and not perfect):
                    continue
                value = elapsed if previous is None else min(previous, elapsed)
                if previous is not None and elapsed > previous:
                    continue
            values[participant] = value
            if value < minimum:
                continue
            changed.add(participant)
            if record is None or (value < record if direction == 'asc' else value > record):
                record = value
        for participant in changed:
            if values[participant] == record:
                achieved.setdefault(participant, (completed_at, values[participant]))
    for event in db.execute('''SELECT e.participant_id, e.achieved_at, p.nickname, n.number
                               FROM badge_record_events e JOIN participants p ON p.id=e.participant_id
                               LEFT JOIN participant_numbers n ON n.participant_id=e.participant_id
                               WHERE e.badge_id=?''', (badge_id,)):
        participant = event['participant_id']
        metadata.setdefault(participant, (event['nickname'], event['number']))
        achieved.setdefault(participant, (event['achieved_at'], None))
    ordered = sorted(achieved, key=lambda participant: (achieved[participant][0],
                     metadata[participant][1] if metadata[participant][1] is not None else float('inf'), participant))
    total = len(ordered)
    pages = max(1, (total + page_size - 1) // page_size)
    page = min(page, pages)
    entries = []
    for participant in ordered[(page - 1) * page_size:page * page_size]:
        nickname, number = metadata[participant]
        when, value = achieved[participant]
        entries.append({'nickname': nickname, 'playerNumber': number, 'value': value,
                        'achievedAt': when, 'recordedOnly': value is None,
                        'current': record is not None and values.get(participant) == record})
    return {'badge': BADGE_BY_ID[badge_id], 'entries': entries,
            'valueType': 'time' if direction == 'asc' else 'count',
            'holderCount': sum(value == record for value in values.values()) if record is not None else 0,
            'page': page, 'pageSize': page_size, 'total': total, 'pages': pages}


def badge_states(db, participant_ids):
    """Derive achievements from saved attempts and keep only eligible displayed badges."""
    participant_ids = list(dict.fromkeys(participant_ids))
    boards, winners = honor_boards(db)
    fastest_entries = boards['boards'][0]['entries']
    fastest = fastest_entries[0]['value'] if fastest_entries else None
    if not participant_ids:
        return {}, fastest
    placeholders = ','.join('?' for _ in participant_ids)
    attempts = db.execute('''SELECT a.participant_id, a.correct_count, a.total_count,
                                    a.submitted_at, a.id, t.elapsed_seconds
                             FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                             WHERE a.participant_id IN (''' + placeholders + ''')
                             ORDER BY a.submitted_at, a.id''', participant_ids).fetchall()
    by_player = {participant_id: [] for participant_id in participant_ids}
    for attempt in attempts:
        by_player[attempt['participant_id']].append(attempt)
    mistakes = {participant_id: set() for participant_id in participant_ids}
    for row in db.execute('''SELECT DISTINCT a.participant_id, m.badge_id FROM attempts a
                             JOIN attempt_mistake_badges m ON m.attempt_id = a.id
                             WHERE a.participant_id IN (''' + placeholders + ')', participant_ids):
        if row['badge_id'] in BADGE_BY_ID:
            mistakes[row['participant_id']].add(row['badge_id'])
    saved = saved_badge_selections(db, participant_ids, placeholders)
    states = {}
    for participant_id, rows in by_player.items():
        earned = earned_badges(rows, fastest) | mistakes[participant_id]
        earned.update(badge_id for badge_id, holders in winners.items() if participant_id in holders)
        ordered = [badge['id'] for badge in BADGES if badge['id'] in earned]
        if participant_id in saved:
            selected = list(dict.fromkeys(item for item in saved[participant_id]
                                          if isinstance(item, str) and item in earned))[:MAX_SHOWN_BADGES]
        else:
            # Wrong-answer honors are private unless their owner explicitly displays them.
            selected = [item for item in ordered if item not in PRIVATE_BADGES][:MAX_SHOWN_BADGES]
        states[participant_id] = {'earned': earned, 'selected': selected}
    return states, fastest


def badge_catalog(state, fastest, counts):
    return {'badges': [{**badge, 'earned': badge['id'] in state['earned'],
                        'selected': badge['id'] in state['selected'], 'stats': counts[badge['id']]} for badge in BADGES],
            'selected': state['selected'], 'fastestSeconds': fastest, 'maxShown': MAX_SHOWN_BADGES}


def badges(db, body):
    device, secret_hash = credentials(body)
    authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后查看勋章。')
    states, fastest = badge_states(db, [device])
    counts = badge_metrics.counts(db, BADGES, MISTAKE_RULES, badge_states, honor_boards, HONOR_CATEGORIES)
    return {**badge_catalog(states[device], fastest, counts), 'repeatQuestions': repeated_review(db, device)}


def select_badges(db, body):
    device, secret_hash = credentials(body)
    selected = body.get('selected')
    if (not isinstance(selected, list) or len(selected) > MAX_SHOWN_BADGES
            or any(not isinstance(item, str) or item not in BADGE_BY_ID for item in selected)
            or len(set(selected)) != len(selected)):
        raise ApiError(f'请选择不超过 {MAX_SHOWN_BADGES} 枚不同的勋章。')
    db.execute('BEGIN IMMEDIATE')
    try:
        authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后设置勋章。')
        states, fastest = badge_states(db, [device])
        if any(item not in states[device]['earned'] for item in selected):
            raise ApiError('有勋章尚未获得，或全站纪录已被超越，请刷新后重新选择。')
        db.execute('''INSERT INTO badge_selections (participant_id, selections, updated_at) VALUES (?, ?, ?)
                      ON CONFLICT(participant_id) DO UPDATE SET selections=excluded.selections,
                      updated_at=excluded.updated_at''',
                   (device, json.dumps(selected, ensure_ascii=False), int(time.time() * 1000)))
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    states[device]['selected'] = selected
    counts = badge_metrics.counts(db, BADGES, MISTAKE_RULES, badge_states, honor_boards, HONOR_CATEGORIES)
    return {'ok': True, **badge_catalog(states[device], fastest, counts),
            'repeatQuestions': repeated_review(db, device)}


def ranked_leaderboard_rows(db, selected_version, limit, offset=0, participant_id=None):
    """Use one ordering for public pages and an individual player's share card."""
    order = sorted((version for version in BANKS if version != VERSION), key=version_order) + [VERSION]
    priorities = {version: index for index, version in enumerate(order)}
    db.create_function('quiz_version_rank', 1, lambda version: priorities.get(version, -1), deterministic=True)
    return db.execute('''WITH ranked AS (
            SELECT a.participant_id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at, t.elapsed_seconds,
              ROW_NUMBER() OVER (PARTITION BY a.participant_id
                ORDER BY quiz_version_rank(a.quiz_version) DESC, ROUND(10000.0 * a.correct_count / a.total_count) DESC,
                  (t.elapsed_seconds IS NULL), t.elapsed_seconds ASC, a.submitted_at ASC, a.id ASC) AS rn
            FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id = a.id
            WHERE (? IS NULL OR a.quiz_version = ?)
        ), numbered AS (
            SELECT p.id AS participant_id, n.number, p.nickname, r.quiz_version, r.correct_count,
              r.total_count, r.submitted_at, r.elapsed_seconds,
              ROW_NUMBER() OVER (ORDER BY ROUND(10000.0 * r.correct_count / r.total_count) DESC,
                (r.elapsed_seconds IS NULL), r.elapsed_seconds ASC, r.submitted_at ASC, p.id ASC) AS position
            FROM ranked r JOIN participants p ON p.id = r.participant_id
            LEFT JOIN participant_numbers n ON n.participant_id = p.id WHERE r.rn = 1
        ) SELECT * FROM numbered WHERE (? IS NULL OR participant_id = ?)
          ORDER BY position LIMIT ? OFFSET ?''',
        (selected_version, selected_version, participant_id, participant_id, limit, offset)).fetchall()


def leaderboard(db, requested_version=None, latest=False, page=1, page_size=100):
    selected_version = VERSION if requested_version is None and not latest else requested_version
    if selected_version is not None and selected_version not in BANKS:
        raise ApiError('题库版本不存在。')
    if (not isinstance(page, int) or isinstance(page, bool) or page < 1 or
            not isinstance(page_size, int) or isinstance(page_size, bool) or not 1 <= page_size <= 100):
        raise ApiError('榜单页码无效。')
    db.execute('BEGIN IMMEDIATE')
    try:
        # Older profiles can have scores but no public number.
        db.execute('''INSERT INTO participant_numbers (participant_id)
                      SELECT DISTINCT p.id FROM participants p JOIN attempts a ON a.participant_id = p.id
                      WHERE NOT EXISTS
                      (SELECT 1 FROM participant_numbers n WHERE n.participant_id = p.id)''')
        total = db.execute('''SELECT COUNT(DISTINCT a.participant_id)
                              FROM attempts a JOIN participants p ON p.id = a.participant_id
                              WHERE (? IS NULL OR a.quiz_version = ?)''',
                           (selected_version, selected_version)).fetchone()[0]
        pages = max(1, (total + page_size - 1) // page_size)
        page = min(page, pages)
        offset = (page - 1) * page_size
        rows = ranked_leaderboard_rows(db, selected_version, page_size, offset)
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    states, _ = badge_states(db, [row['participant_id'] for row in rows])
    interactions = social.summaries(db, [row['participant_id'] for row in rows])
    entries = [{'rank': row['position'], 'playerNumber': row['number'], 'nickname': row['nickname'],
                'correctCount': row['correct_count'], 'totalCount': row['total_count'],
                'quizVersion': row['quiz_version'], 'elapsedSeconds': row['elapsed_seconds'],
                'submittedAt': row['submitted_at'], 'score': score(row['correct_count'], row['total_count']),
                'badges': [BADGE_BY_ID[item] for item in states[row['participant_id']]['selected']],
                'social': interactions[row['participant_id']]}
               for row in rows]
    return {'version': selected_version or VERSION, 'view': 'latest' if latest else 'version', 'entries': entries,
            'page': page, 'pageSize': page_size, 'total': total, 'pages': pages}


def share_badge(db, participant_id, badge_id):
    if not isinstance(badge_id, str) or badge_id not in BADGE_BY_ID:
        raise ApiError('勋章不存在。')
    states, _ = badge_states(db, [participant_id])
    if badge_id not in states[participant_id]['earned']:
        raise ApiError('这枚勋章尚未获得，或纪录已被超越。')
    return {'badge': BADGE_BY_ID[badge_id]}


def share_ranking(db, participant_id):
    rows = ranked_leaderboard_rows(db, None, 1, participant_id=participant_id)
    if not rows:
        raise ApiError('上传成绩后即可分享综合排名。')
    row = rows[0]
    total = db.execute('''SELECT COUNT(DISTINCT a.participant_id) FROM attempts a
                          JOIN participants p ON p.id=a.participant_id''').fetchone()[0]
    return {'rank': row['position'], 'total': total,
            'score': score(row['correct_count'], row['total_count']),
            'elapsedSeconds': row['elapsed_seconds'], 'quizVersion': row['quiz_version']}


def share_honor(db, participant_id, badge_id):
    category = next((item for item in HONOR_CATEGORIES if item[0] == badge_id), None)
    if not category:
        raise ApiError('趣味榜类型无效。')
    _, metric, direction, minimum = category
    eligible = honor_eligible(honor_statistics(db), metric, direction, minimum)
    index = next((i for i, row in enumerate(eligible) if row['participant_id'] == participant_id), None)
    if index is None:
        raise ApiError('暂未进入这个趣味榜，继续练习后再来分享吧。')
    entry = honor_entries(eligible, metric, index, 1)[0]
    return {'badge': BADGE_BY_ID[badge_id], 'rank': entry['rank'], 'total': len(eligible),
            'value': entry['value'], 'valueType': 'time' if direction == 'asc' else 'count'}


def create_share(db, body):
    device, secret_hash = credentials(body)
    kind, badge_id = body.get('kind'), body.get('badgeId')
    if kind not in ('badge', 'ranking', 'honor'):
        raise ApiError('分享类型无效。')
    db.execute('BEGIN IMMEDIATE')
    try:
        authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后分享。')
        db.execute('''INSERT INTO participant_numbers (participant_id)
                      SELECT id FROM participants WHERE id=? AND NOT EXISTS
                      (SELECT 1 FROM participant_numbers WHERE participant_id=?)''', (device, device))
        player = db.execute('''SELECT p.nickname, n.number FROM participants p JOIN participant_numbers n
                               ON n.participant_id=p.id WHERE p.id=?''', (device,)).fetchone()
        if kind == 'badge':
            details = share_badge(db, device, badge_id)
        elif kind == 'honor':
            details = share_honor(db, device, badge_id)
        else:
            details = share_ranking(db, device)
        snapshot = {'kind': kind, 'nickname': player['nickname'], 'playerNumber': player['number'], **details}
        encoded = json.dumps(snapshot, ensure_ascii=False, sort_keys=True, separators=(',', ':'))
        existing = db.execute('''SELECT id, created_at FROM share_cards
                                 WHERE participant_id=? AND snapshot=? LIMIT 1''', (device, encoded)).fetchone()
        if existing:
            share_id, created_at = existing['id'], existing['created_at']
        else:
            share_id, created_at = secrets.token_hex(16), int(time.time() * 1000)
            db.execute('INSERT INTO share_cards VALUES (?, ?, ?, ?)', (share_id, device, encoded, created_at))
        db.execute('COMMIT')
        return {'id': share_id, 'snapshot': {**snapshot, 'createdAt': created_at}}
    except Exception:
        db.execute('ROLLBACK')
        raise


def read_share(db, share_id):
    if not re.fullmatch(r'[a-f0-9]{32}', share_id):
        raise ApiError('分享链接无效或已失效。', 404)
    row = db.execute('SELECT snapshot, created_at FROM share_cards WHERE id=?', (share_id,)).fetchone()
    if not row:
        raise ApiError('分享链接无效或已失效。', 404)
    return {'id': share_id, 'snapshot': {**json.loads(row['snapshot']), 'createdAt': row['created_at']}}


def history(db, body):
    device, secret_hash = credentials(body)
    cursor = body.get('cursor')
    match = re.fullmatch(r'(\d{1,15})\.([a-f0-9]{32})', cursor) if isinstance(cursor, str) else None
    if cursor is not None and not match:
        raise ApiError('历史记录页码无效。')
    authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后再查看记录。')
    clause = ' AND (a.submitted_at, a.id) < (?, ?)' if match else ''
    params = [device, int(match[1]), match[2]] if match else [device]
    rows = db.execute('''SELECT a.id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at, t.elapsed_seconds,
                                x.attempt_id AS analyzed
                         FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                         LEFT JOIN attempt_analysis x ON x.attempt_id = a.id
                         WHERE a.participant_id = ?''' + clause + ' ORDER BY a.submitted_at DESC, a.id DESC LIMIT 21', params).fetchall()
    stats = db.execute('''SELECT COUNT(*) AS count,
                         MAX(CASE WHEN quiz_version = ? THEN 1.0 * correct_count / total_count END) AS best
                         FROM attempts WHERE participant_id = ?''', (VERSION, device)).fetchone()
    entries = [{'attemptId': row['id'], 'reviewAvailable': bool(row['analyzed'] and row['quiz_version'] in BANKS),
                'currentVersion': row['quiz_version'] == VERSION, 'quizVersion': row['quiz_version'], 'correctCount': row['correct_count'],
                'totalCount': row['total_count'], 'submittedAt': row['submitted_at'], 'elapsedSeconds': row['elapsed_seconds'],
                'score': score(row['correct_count'], row['total_count'])} for row in rows[:20]]
    next_cursor = f"{rows[19]['submitted_at']}.{rows[19]['id']}" if len(rows) > 20 else None
    return {'attemptCount': stats['count'], 'bestScore': None if stats['best'] is None else math.floor(stats['best'] * 10000 + 0.5) / 100,
            'nextCursor': next_cursor, 'entries': entries}


def history_review(db, body):
    device, secret_hash = credentials(body)
    attempt_id = body.get('attemptId')
    if not isinstance(attempt_id, str) or not re.fullmatch(r'[a-f0-9]{32}', attempt_id):
        raise ApiError('成绩编号无效。')
    authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后再查看记录。')
    attempt = db.execute('''SELECT a.quiz_version, a.correct_count, a.total_count, x.attempt_id AS analyzed
                            FROM attempts a LEFT JOIN attempt_analysis x ON x.attempt_id = a.id
                            WHERE a.id = ? AND a.participant_id = ?''', (attempt_id, device)).fetchone()
    if not attempt:
        raise ApiError('没有找到这条答题记录。', 404)
    bank = BANKS.get(attempt['quiz_version'])
    current = attempt['quiz_version'] == VERSION
    if not attempt['analyzed'] or not bank:
        return {'available': False, 'currentVersion': current}
    wrong = {row['question_id'] for row in db.execute(
        'SELECT question_id FROM attempt_wrong_questions WHERE attempt_id = ?', (attempt_id,))}
    questions = [q for q in bank['questions'] if q['id'] in wrong]
    if len(questions) != len(wrong) or len(wrong) != attempt['total_count'] - attempt['correct_count']:
        return {'available': False, 'currentVersion': current}
    fields = ('id', 'section', 'role', 'type', 'question', 'options', 'answer', 'explanation')
    return {'available': True, 'currentVersion': current,
            'questions': [{key: question[key] for key in fields if key in question} for question in questions]}


def delete_profile(db, body):
    device, secret_hash = credentials(body)
    db.execute('BEGIN IMMEDIATE')
    try:
        authenticated(db, device, secret_hash, '浏览器身份不匹配。')
        db.execute('DELETE FROM attempts WHERE participant_id = ?', (device,))
        db.execute('DELETE FROM participants WHERE id = ?', (device,))
        badge_metrics.record_current(db, honor_boards)
        db.execute('COMMIT')
        badge_metrics.invalidate()
        return {'ok': True}
    except Exception:
        db.execute('ROLLBACK')
        raise


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, _format, *_args):
        # Credentials and answers must not be logged.
        return

    def respond(self, status, data=None):
        body = b'' if data is None else json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Vary', 'Origin')
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS or re.fullmatch(r'http://(?:localhost|127\.0\.0\.1):\d+', origin):
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', 'Content-Type')
            self.send_header('Access-Control-Max-Age', '600')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self.respond(204)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path.startswith('/api/shares/'):
            try:
                with closing(database()) as db:
                    self.respond(200, read_share(db, url.path.removeprefix('/api/shares/')))
            except ApiError as error:
                self.respond(error.status, {'error': str(error)})
            except Exception:
                logging.exception('Share request failed')
                self.respond(503, {'error': '分享内容暂时不可用，请稍后重试。'})
            return
        if url.path == '/api/honors':
            try:
                params = parse_qs(url.query, keep_blank_values=True)
                badge = params.get('badge')
                with closing(database()) as db:
                    if badge is None:
                        self.respond(200, honor_boards(db)[0])
                    else:
                        if len(badge) != 1:
                            raise ApiError('趣味榜类型无效。')
                        def honor_number(name, default):
                            value = params.get(name)
                            if value is None:
                                return default
                            if len(value) != 1 or not re.fullmatch(r'[0-9]{1,9}', value[0]):
                                raise ApiError('趣味榜页码无效。')
                            return int(value[0])
                        mode = params.get('mode', ['current'])
                        if mode not in (['current'], ['history']):
                            raise ApiError('趣味榜类型无效。')
                        action = honor_history_page if mode == ['history'] else honor_page
                        self.respond(200, action(db, badge[0], honor_number('page', 1), honor_number('pageSize', 20)))
            except ApiError as error:
                self.respond(error.status, {'error': str(error)})
            except Exception:
                logging.exception('Honor board request failed')
                self.respond(503, {'error': '趣味榜暂时不可用，请稍后重试。'})
            return
        if url.path != '/api/leaderboard':
            return self.respond(404, {'error': '页面不存在。'})
        try:
            params = parse_qs(url.query, keep_blank_values=True)
            requested = params.get('version')
            view = params.get('view')
            if requested and len(requested) != 1:
                raise ApiError('题库版本无效。')
            if view and (view != ['latest'] or requested):
                raise ApiError('榜单类型无效。')
            def positive_param(name, default):
                value = params.get(name)
                if value is None:
                    return default
                if len(value) != 1 or not re.fullmatch(r'[0-9]{1,9}', value[0]):
                    raise ApiError('榜单页码无效。')
                return int(value[0])
            page = positive_param('page', 1)
            page_size = positive_param('pageSize', 100)
            with closing(database()) as db:
                self.respond(200, leaderboard(db, requested[0] if requested else None, latest=bool(view),
                                              page=page, page_size=page_size))
        except ApiError as error:
            self.respond(error.status, {'error': str(error)})
        except Exception:
            logging.exception('Leaderboard request failed')
            self.respond(503, {'error': '排行榜暂时不可用，请稍后重试。'})

    def do_POST(self):
        routes = {'/api/profile': profile, '/api/submit': submit, '/api/badges': badges,
                  '/api/badges/select': select_badges,
                  '/api/history': history, '/api/history/review': history_review, '/api/delete-profile': delete_profile,
                  '/api/social/view': social.view, '/api/shares': create_share}
        routes.update({f'/api/social/{name}': (lambda db, body, name=name: social.mutate(db, body, name))
                       for name in ('reaction', 'comment', 'like', 'delete', 'hide')})
        action = routes.get(urlsplit(self.path).path)
        if not action:
            return self.respond(404, {'error': '页面不存在。'})
        try:
            length = self.headers.get('Content-Length', '')
            if not length.isdigit() or int(length) > MAX_BODY:
                self.close_connection = True
                raise ApiError('提交内容过大。')
            raw = self.rfile.read(int(length))
            data = json.loads(raw.decode('utf-8'))
            if not isinstance(data, dict):
                raise ApiError('请求格式不正确。')
            with closing(database()) as db:
                result = action(db, data)
            self.respond(200, result)
        except (json.JSONDecodeError, UnicodeDecodeError):
            self.respond(400, {'error': '请求格式不正确。'})
        except (ApiError, social.SocialError) as error:
            self.respond(error.status, {'error': str(error)})
        except (BrokenPipeError, ConnectionResetError):
            return
        except Exception:
            logging.exception('API request failed')
            self.respond(503, {'error': '服务暂时不可用，请稍后重试。'})


class QuizServer(ThreadingHTTPServer):
    daemon_threads = True
    request_queue_size = 128


if __name__ == '__main__':
    initialize()
    server = QuizServer(('127.0.0.1', PORT), Handler)
    server.serve_forever()
