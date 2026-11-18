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
            CREATE INDEX IF NOT EXISTS attempts_version_participant ON attempts(quiz_version, participant_id);
            CREATE INDEX IF NOT EXISTS attempts_participant_time ON attempts(participant_id, submitted_at, id);
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
        db.execute('COMMIT')
        return {'ok': True, **result, 'submittedAt': now, 'elapsedSeconds': elapsed}
    except Exception:
        db.execute('ROLLBACK')
        raise


def version_order(version):
    match = re.search(r'(\d{4}-\d{2}-\d{2})-v(\d+)$', version)
    return (match.group(1), int(match.group(2))) if match else ('', 0)


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
            ) SELECT n.number, p.nickname, r.quiz_version, r.correct_count, r.total_count, r.submitted_at, r.elapsed_seconds
              FROM ranked r JOIN participants p ON p.id = r.participant_id
              LEFT JOIN participant_numbers n ON n.participant_id = p.id WHERE r.rn = 1
              ORDER BY ROUND(10000.0 * r.correct_count / r.total_count) DESC,
                (r.elapsed_seconds IS NULL), r.elapsed_seconds ASC, r.submitted_at ASC, p.id ASC LIMIT 100''',
                (selected_version, selected_version)).fetchall()
        db.execute('COMMIT')
    except Exception:
        db.execute('ROLLBACK')
        raise
    entries = [{'rank': index + 1, 'playerNumber': row['number'], 'nickname': row['nickname'],
                'correctCount': row['correct_count'], 'totalCount': row['total_count'],
                'quizVersion': row['quiz_version'], 'elapsedSeconds': row['elapsed_seconds'],
                'submittedAt': row['submitted_at'], 'score': score(row['correct_count'], row['total_count'])}
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
        routes = {'/api/profile': profile, '/api/submit': submit,
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
