#!/usr/bin/env python3
"""Small loopback-only API for the shared Spiral Temple practice leaderboard."""

import hashlib
import hmac
import json
import logging
import math
import os
import re
import sqlite3
import time
import unicodedata
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

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
    {'id': 'first', 'name': '初入寺院', 'description': '完成第一轮考核。', 'icon': 'temple', 'tone': 'teal'},
]
BADGE_BY_ID = {badge['id']: badge for badge in BADGES}
# These option IDs apply only to these two explicitly checked answer keys.
MISTAKE_VERSIONS = {'peak-spiral-2026-11-18-v5', 'peak-spiral-2026-11-18-v6'}
MISTAKE_RULES = {
    'demolition': {'q036': {'b', 'd'}, 'q042': {'a'}, 'q047': {'a'}, 'q050': {'d'},
                   'q066': {'a', 'c'}, 'q089': {'a', 'c'}, 'q090': {'a'}, 'q091': {'b'}},
    'spider_keeper': {'q070': {'c', 'd'}, 'q092': {'b', 'c', 'd'}},
    'laser_runner': {'q060': {'d'}, 'q075': {'c'}, 'q093': {'a', 'b'}},
    'lamp_tourist': {'q047': {'c', 'd'}, 'q090': {'c', 'd'}},
    'doctor': {'q014': {'b', 'c', 'd'}, 'q088': {'b', 'c', 'd'}},
    'direction': {'q042': {'b'}, 'q091': {'a', 'c'}},
    'boss_healer': {'q071': {'d'}, 'q094': {'a', 'b'}},
}


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
            CREATE INDEX IF NOT EXISTS attempts_version_participant ON attempts(quiz_version, participant_id);
            CREATE INDEX IF NOT EXISTS attempts_participant_time ON attempts(participant_id, submitted_at, id);
            CREATE INDEX IF NOT EXISTS attempt_timings_elapsed ON attempt_timings(elapsed_seconds);
        ''')


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
            if elapsed is not None:
                db.execute('INSERT INTO attempt_timings VALUES (?, ?)', (attempt_id, elapsed))
            for badge_id in mistake_badges(body['answers'], submitted_version):
                db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (attempt_id, badge_id))
        triggered = {row['badge_id'] for row in db.execute(
            'SELECT badge_id FROM attempt_mistake_badges WHERE attempt_id = ?', (attempt_id,))}
        db.execute('COMMIT')
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


def badge_states(db, participant_ids):
    """Derive achievements from saved attempts and keep only eligible displayed badges."""
    participant_ids = list(dict.fromkeys(participant_ids))
    fastest = db.execute('''SELECT MIN(t.elapsed_seconds) FROM attempt_timings t
                            JOIN attempts a ON a.id = t.attempt_id''').fetchone()[0]
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
        ordered = [badge['id'] for badge in BADGES if badge['id'] in earned]
        if participant_id in saved:
            selected = list(dict.fromkeys(item for item in saved[participant_id]
                                          if isinstance(item, str) and item in earned))[:MAX_SHOWN_BADGES]
        else:
            # Wrong-answer honors are private unless their owner explicitly displays them.
            selected = [item for item in ordered if item not in MISTAKE_RULES][:MAX_SHOWN_BADGES]
        states[participant_id] = {'earned': earned, 'selected': selected}
    return states, fastest


def badge_catalog(state, fastest):
    return {'badges': [{**badge, 'earned': badge['id'] in state['earned'],
                        'selected': badge['id'] in state['selected']} for badge in BADGES],
            'selected': state['selected'], 'fastestSeconds': fastest, 'maxShown': MAX_SHOWN_BADGES}


def badges(db, body):
    device, secret_hash = credentials(body)
    authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后查看勋章。')
    states, fastest = badge_states(db, [device])
    return badge_catalog(states[device], fastest)


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
            raise ApiError('有勋章尚未获得，或最快纪录已被超越，请刷新后重新选择。')
        db.execute('''INSERT INTO badge_selections (participant_id, selections, updated_at) VALUES (?, ?, ?)
                      ON CONFLICT(participant_id) DO UPDATE SET selections=excluded.selections,
                      updated_at=excluded.updated_at''',
                   (device, json.dumps(selected, ensure_ascii=False), int(time.time() * 1000)))
        db.execute('COMMIT')
        states[device]['selected'] = selected
        return {'ok': True, **badge_catalog(states[device], fastest)}
    except Exception:
        db.execute('ROLLBACK')
        raise


def leaderboard(db, requested_version=None, latest=False):
    selected_version = VERSION if requested_version is None and not latest else requested_version
    if selected_version is not None and selected_version not in BANKS:
        raise ApiError('题库版本不存在。')
    order = sorted((version for version in BANKS if version != VERSION), key=version_order) + [VERSION]
    priorities = {version: index for index, version in enumerate(order)}
    db.create_function('quiz_version_rank', 1, lambda version: priorities.get(version, -1), deterministic=True)
    db.execute('BEGIN IMMEDIATE')
    try:
        # Older profiles can have scores but no public number.
        db.execute('''INSERT INTO participant_numbers (participant_id)
                      SELECT DISTINCT p.id FROM participants p JOIN attempts a ON a.participant_id = p.id
                      WHERE NOT EXISTS
                      (SELECT 1 FROM participant_numbers n WHERE n.participant_id = p.id)''')
        rows = db.execute('''WITH ranked AS (
                SELECT a.participant_id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at, t.elapsed_seconds,
                  ROW_NUMBER() OVER (PARTITION BY a.participant_id
                    ORDER BY quiz_version_rank(a.quiz_version) DESC, ROUND(10000.0 * a.correct_count / a.total_count) DESC,
                      (t.elapsed_seconds IS NULL), t.elapsed_seconds ASC, a.submitted_at ASC, a.id ASC) AS rn
                FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                WHERE (? IS NULL OR a.quiz_version = ?)
            ) SELECT p.id AS participant_id, n.number, p.nickname, r.quiz_version, r.correct_count, r.total_count, r.submitted_at, r.elapsed_seconds
              FROM ranked r JOIN participants p ON p.id = r.participant_id
              LEFT JOIN participant_numbers n ON n.participant_id = p.id WHERE r.rn = 1
              ORDER BY ROUND(10000.0 * r.correct_count / r.total_count) DESC,
                (r.elapsed_seconds IS NULL), r.elapsed_seconds ASC, r.submitted_at ASC, p.id ASC LIMIT 100''',
                (selected_version, selected_version)).fetchall()
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    states, _ = badge_states(db, [row['participant_id'] for row in rows])
    entries = [{'rank': index + 1, 'playerNumber': row['number'], 'nickname': row['nickname'],
                'correctCount': row['correct_count'], 'totalCount': row['total_count'],
                'quizVersion': row['quiz_version'], 'elapsedSeconds': row['elapsed_seconds'],
                'submittedAt': row['submitted_at'], 'score': score(row['correct_count'], row['total_count']),
                'badges': [BADGE_BY_ID[item] for item in states[row['participant_id']]['selected']]}
               for index, row in enumerate(rows)]
    return {'version': selected_version or VERSION, 'view': 'latest' if latest else 'version', 'entries': entries}


def history(db, body):
    device, secret_hash = credentials(body)
    cursor = body.get('cursor')
    match = re.fullmatch(r'(\d{1,15})\.([a-f0-9]{32})', cursor) if isinstance(cursor, str) else None
    if cursor is not None and not match:
        raise ApiError('历史记录页码无效。')
    authenticated(db, device, secret_hash, '请保存昵称，或恢复原来的身份后再查看记录。')
    clause = ' AND (a.submitted_at, a.id) < (?, ?)' if match else ''
    params = [device, int(match[1]), match[2]] if match else [device]
    rows = db.execute('''SELECT a.id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at, t.elapsed_seconds
                         FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id = a.id
                         WHERE a.participant_id = ?''' + clause + ' ORDER BY a.submitted_at DESC, a.id DESC LIMIT 21', params).fetchall()
    stats = db.execute('''SELECT COUNT(*) AS count,
                         MAX(CASE WHEN quiz_version = ? THEN 1.0 * correct_count / total_count END) AS best
                         FROM attempts WHERE participant_id = ?''', (VERSION, device)).fetchone()
    entries = [{'currentVersion': row['quiz_version'] == VERSION, 'quizVersion': row['quiz_version'], 'correctCount': row['correct_count'],
                'totalCount': row['total_count'], 'submittedAt': row['submitted_at'], 'elapsedSeconds': row['elapsed_seconds'],
                'score': score(row['correct_count'], row['total_count'])} for row in rows[:20]]
    next_cursor = f"{rows[19]['submitted_at']}.{rows[19]['id']}" if len(rows) > 20 else None
    return {'attemptCount': stats['count'], 'bestScore': None if stats['best'] is None else math.floor(stats['best'] * 10000 + 0.5) / 100,
            'nextCursor': next_cursor, 'entries': entries}


def delete_profile(db, body):
    device, secret_hash = credentials(body)
    db.execute('BEGIN IMMEDIATE')
    try:
        authenticated(db, device, secret_hash, '浏览器身份不匹配。')
        db.execute('DELETE FROM attempts WHERE participant_id = ?', (device,))
        db.execute('DELETE FROM participants WHERE id = ?', (device,))
        db.execute('COMMIT')
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
        if url.path != '/api/leaderboard':
            return self.respond(404, {'error': '页面不存在。'})
        try:
            requested = parse_qs(url.query, keep_blank_values=True).get('version')
            view = parse_qs(url.query, keep_blank_values=True).get('view')
            if requested and len(requested) != 1:
                raise ApiError('题库版本无效。')
            if view and (view != ['latest'] or requested):
                raise ApiError('榜单类型无效。')
            with closing(database()) as db:
                self.respond(200, leaderboard(db, requested[0] if requested else None, latest=bool(view)))
        except ApiError as error:
            self.respond(error.status, {'error': str(error)})
        except Exception:
            logging.exception('Leaderboard request failed')
            self.respond(503, {'error': '排行榜暂时不可用，请稍后重试。'})

    def do_POST(self):
        routes = {'/api/profile': profile, '/api/submit': submit, '/api/badges': badges,
                  '/api/badges/select': select_badges,
                  '/api/history': history, '/api/delete-profile': delete_profile}
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
        except ApiError as error:
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
