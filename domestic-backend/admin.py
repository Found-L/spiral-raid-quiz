"""Read-only administration, protected by a separate password and short-lived sessions."""

import hashlib
import hmac
import json
import math
import os
import re
import secrets
import tempfile
import threading
import time
from datetime import datetime, timedelta, timezone
from http.cookies import CookieError, SimpleCookie
from pathlib import Path


ORIGIN = 'https://www.lysue.com'
COOKIE_NAME = 'temple_admin_session'
COOKIE_PATH = '/spiral-raid-quiz/api/admin/'
ITERATIONS = 600_000
SESSION_LIFETIME = 8 * 60 * 60
SESSION_IDLE = 30 * 60
LOGIN_WINDOW = 15 * 60
LOGIN_LIMIT = 6
PAGE_SIZE = 20


class AdminError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def password_record(password):
    if not isinstance(password, str) or not 16 <= len(password) <= 128:
        raise AdminError('管理员密码请设置为 16 至 128 个字符。')
    try:
        encoded = password.encode('utf-8')
    except UnicodeEncodeError:
        raise AdminError('密码包含无法识别的字符。')
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac('sha256', encoded, salt, ITERATIONS)
    return {'version': 1, 'iterations': ITERATIONS, 'salt': salt.hex(), 'digest': digest.hex()}


def save_password(path, password):
    path = Path(path)
    record = password_record(password)
    fd, temp_name = tempfile.mkstemp(prefix='.admin-auth-', dir=path.parent)
    try:
        if hasattr(os, 'fchmod'):
            os.fchmod(fd, 0o600)
        else:
            os.chmod(temp_name, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(record, stream, separators=(',', ':'))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temp_name, path)
    finally:
        if os.path.exists(temp_name):
            os.unlink(temp_name)


def page_number(body):
    page = body.get('page', 1)
    if type(page) is not int or not 1 <= page <= 1_000_000:
        raise AdminError('页码无效。')
    return page


def paging(total, page):
    pages = max(1, math.ceil(total / PAGE_SIZE))
    return min(page, pages), pages


def score(correct, total):
    return math.floor(correct * 10000 / total + .5) / 100 if total else None


def attempt_summary(row, current_version, banks):
    return {'id': row['id'], 'quizVersion': row['quiz_version'],
            'currentVersion': row['quiz_version'] == current_version,
            'correctCount': row['correct_count'], 'totalCount': row['total_count'],
            'score': score(row['correct_count'], row['total_count']),
            'submittedAt': row['submitted_at'], 'completedAt': row['completed_at'],
            'elapsedSeconds': row['elapsed_seconds'],
            'reviewAvailable': bool(row['analyzed'] and row['quiz_version'] in banks)}


def overview(db, context):
    now = int(time.time() * 1000)
    totals = db.execute('''SELECT COUNT(*) AS attempts, COUNT(DISTINCT participant_id) AS active_players,
                           SUM(CASE WHEN correct_count = total_count THEN 1 ELSE 0 END) AS perfects,
                           AVG(100.0 * correct_count / NULLIF(total_count, 0)) AS average,
                           SUM(CASE WHEN submitted_at >= ? THEN 1 ELSE 0 END) AS week_attempts
                           FROM attempts''', (now - 7 * 86400000,)).fetchone()
    counts = {name: db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0] for name, table in (
        ('players', 'participants'), ('comments', 'social_comments'), ('reactions', 'social_reactions'),
        ('shares', 'share_cards'), ('analyzed', 'attempt_analysis'))}
    recent = db.execute('''SELECT a.id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at,
                                  t.elapsed_seconds, c.completed_at, x.attempt_id AS analyzed, p.nickname, n.number
                           FROM attempts a JOIN participants p ON p.id=a.participant_id
                           LEFT JOIN participant_numbers n ON n.participant_id=p.id
                           LEFT JOIN attempt_timings t ON t.attempt_id=a.id
                           LEFT JOIN attempt_completion_times c ON c.attempt_id=a.id
                           LEFT JOIN attempt_analysis x ON x.attempt_id=a.id
                           ORDER BY a.submitted_at DESC, a.id DESC LIMIT 8''').fetchall()
    tz = timezone(timedelta(hours=8))
    today = datetime.now(tz).date()
    dates = [(today - timedelta(days=i)).isoformat() for i in range(6, -1, -1)]
    first_midnight = datetime.combine(today - timedelta(days=6), datetime.min.time(), tz)
    daily = {row['day']: row['count'] for row in db.execute('''SELECT date(submitted_at / 1000, 'unixepoch', '+8 hours') AS day,
                             COUNT(*) AS count FROM attempts WHERE submitted_at >= ? GROUP BY day''',
                             (int(first_midnight.timestamp() * 1000),))}
    return {**counts, 'attempts': totals['attempts'], 'activePlayers': totals['active_players'],
            'perfects': totals['perfects'] or 0, 'averageScore': round(totals['average'], 2) if totals['average'] is not None else None,
            'weekAttempts': totals['week_attempts'] or 0,
            'daily': [{'date': day, 'count': daily.get(day, 0)} for day in dates],
            'recent': [{**attempt_summary(row, context['version'], context['banks']),
                        'nickname': row['nickname'], 'playerNumber': row['number']} for row in recent]}


def players(db, body):
    page = page_number(body)
    query = body.get('query', '')
    if not isinstance(query, str) or len(query) > 64:
        raise AdminError('搜索内容过长。')
    query = query.strip()
    escaped = query.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    number_text = query.lstrip('#').lstrip('0') or '0'
    number = int(number_text) if number_text.isascii() and number_text.isdigit() and len(number_text) < 19 else -1
    clause = "WHERE (? = '' OR p.nickname LIKE ? ESCAPE '\\' OR n.number = ?)"
    params = [query, '%' + escaped + '%', number]
    total = db.execute('SELECT COUNT(*) FROM participants p LEFT JOIN participant_numbers n ON n.participant_id=p.id ' + clause, params).fetchone()[0]
    page, pages = paging(total, page)
    rows = db.execute('''SELECT p.nickname, p.created_at, p.updated_at, n.number, COUNT(a.id) AS attempts,
                                MAX(a.submitted_at) AS latest, MAX(100.0*a.correct_count/NULLIF(a.total_count,0)) AS best,
                                SUM(CASE WHEN a.id IS NOT NULL AND a.correct_count=a.total_count THEN 1 ELSE 0 END) AS perfects
                         FROM participants p LEFT JOIN participant_numbers n ON n.participant_id=p.id
                         LEFT JOIN attempts a ON a.participant_id=p.id ''' + clause + '''
                         GROUP BY p.id ORDER BY (latest IS NULL), latest DESC, n.number DESC LIMIT ? OFFSET ?''',
                         (*params, PAGE_SIZE, (page-1)*PAGE_SIZE)).fetchall()
    return {'page':page, 'pages':pages, 'total':total,
            'entries':[{'nickname':r['nickname'], 'number':r['number'], 'createdAt':r['created_at'],
                        'updatedAt':r['updated_at'], 'attempts':r['attempts'], 'latestAt':r['latest'],
                        'bestScore':round(r['best'],2) if r['best'] is not None else None,
                        'perfects':r['perfects']} for r in rows]}


def player(db, body, context):
    number = body.get('playerNumber')
    if type(number) is not int or not 1 <= number <= 2**63-1:
        raise AdminError('玩家编号无效。')
    page = page_number(body)
    person = db.execute('''SELECT p.id, p.nickname, p.created_at, p.updated_at, n.number
                           FROM participants p JOIN participant_numbers n ON n.participant_id=p.id
                           WHERE n.number=?''', (number,)).fetchone()
    if not person:
        raise AdminError('未找到这位玩家。', 404)
    participant_id = person['id']
    totals = db.execute('''SELECT COUNT(*) AS attempts, MAX(100.0*correct_count/NULLIF(total_count,0)) AS best,
                           SUM(CASE WHEN correct_count=total_count THEN 1 ELSE 0 END) AS perfects
                           FROM attempts WHERE participant_id=?''', (participant_id,)).fetchone()
    page, pages = paging(totals['attempts'], page)
    rows = db.execute('''SELECT a.id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at,
                                t.elapsed_seconds, c.completed_at, x.attempt_id AS analyzed
                         FROM attempts a LEFT JOIN attempt_timings t ON t.attempt_id=a.id
                         LEFT JOIN attempt_completion_times c ON c.attempt_id=a.id
                         LEFT JOIN attempt_analysis x ON x.attempt_id=a.id
                         WHERE a.participant_id=? ORDER BY a.submitted_at DESC, a.id DESC LIMIT ? OFFSET ?''',
                         (participant_id, PAGE_SIZE, (page-1)*PAGE_SIZE)).fetchall()
    states, _ = context['badge_states'](db, [participant_id])
    state = states[participant_id]
    medals = [{'name':item['name'], 'description':item['description'], 'tone':item['tone'],
               'selected':item['id'] in state['selected']} for item in context['badges'] if item['id'] in state['earned']]
    received_comments = db.execute('SELECT COUNT(*) FROM social_comments WHERE target_id=?', (participant_id,)).fetchone()[0]
    sent_comments = db.execute('SELECT COUNT(*) FROM social_comments WHERE author_id=?', (participant_id,)).fetchone()[0]
    reactions = db.execute('SELECT COUNT(*) FROM social_reactions WHERE target_id=?', (participant_id,)).fetchone()[0]
    return {'number':person['number'], 'nickname':person['nickname'], 'createdAt':person['created_at'],
            'updatedAt':person['updated_at'], 'attemptCount':totals['attempts'], 'perfects':totals['perfects'] or 0,
            'bestScore':round(totals['best'],2) if totals['best'] is not None else None,
            'receivedComments':received_comments, 'sentComments':sent_comments, 'receivedReactions':reactions,
            'badges':medals, 'page':page, 'pages':pages,
            'attempts':[attempt_summary(row, context['version'], context['banks']) for row in rows]}


def attempt(db, body, context):
    attempt_id = body.get('attemptId')
    if not isinstance(attempt_id, str) or not re.fullmatch(r'[a-f0-9]{32}', attempt_id):
        raise AdminError('成绩编号无效。')
    row = db.execute('''SELECT a.id, a.quiz_version, a.correct_count, a.total_count, a.submitted_at,
                               t.elapsed_seconds, c.completed_at, x.attempt_id AS analyzed, p.nickname, n.number
                        FROM attempts a JOIN participants p ON p.id=a.participant_id
                        LEFT JOIN participant_numbers n ON n.participant_id=p.id
                        LEFT JOIN attempt_timings t ON t.attempt_id=a.id
                        LEFT JOIN attempt_completion_times c ON c.attempt_id=a.id
                        LEFT JOIN attempt_analysis x ON x.attempt_id=a.id WHERE a.id=?''', (attempt_id,)).fetchone()
    if not row:
        raise AdminError('未找到这次答题。', 404)
    result = {**attempt_summary(row, context['version'], context['banks']),
              'nickname':row['nickname'], 'playerNumber':row['number']}
    if not result['reviewAvailable']:
        return {**result, 'questions': None}
    wrong = {r['question_id'] for r in db.execute('SELECT question_id FROM attempt_wrong_questions WHERE attempt_id=?', (attempt_id,))}
    questions = [q for q in context['banks'][row['quiz_version']]['questions'] if q['id'] in wrong]
    if len(questions) != len(wrong) or len(wrong) != row['total_count']-row['correct_count']:
        return {**result, 'reviewAvailable':False, 'questions':None}
    return {**result, 'questions':[{'id':q['id'], 'section':q['section'], 'question':q['question'],
            'answer':'；'.join(option['text'] for option in q['options'] if option['id'] in q['answer']),
            'explanation':q.get('explanation','')} for q in questions]}


def questions(db, body, context):
    page = page_number(body)
    version = body.get('version', '')
    if not isinstance(version, str) or len(version) > 128 or (version and version not in context['banks']):
        raise AdminError('题库版本无效。')
    params = (version, version)
    total = db.execute('''SELECT COUNT(*) FROM (SELECT a.quiz_version, w.question_id FROM attempt_wrong_questions w
                       JOIN attempts a ON a.id=w.attempt_id WHERE (?='' OR a.quiz_version=?)
                       GROUP BY a.quiz_version,w.question_id)''', params).fetchone()[0]
    page, pages = paging(total, page)
    rows = db.execute('''SELECT a.quiz_version,w.question_id,COUNT(*) AS mistakes,COUNT(DISTINCT a.participant_id) AS players
                         FROM attempt_wrong_questions w JOIN attempts a ON a.id=w.attempt_id
                         WHERE (?='' OR a.quiz_version=?) GROUP BY a.quiz_version,w.question_id
                         ORDER BY mistakes DESC,a.quiz_version DESC,w.question_id LIMIT ? OFFSET ?''',
                         (*params,PAGE_SIZE,(page-1)*PAGE_SIZE)).fetchall()
    items = []
    for row in rows:
        bank = context['banks'].get(row['quiz_version'], {})
        q = next((item for item in bank.get('questions',[]) if item['id']==row['question_id']), None)
        items.append({'quizVersion':row['quiz_version'], 'id':row['question_id'],
                      'question':q['question'] if q else '题目内容不可用', 'section':q['section'] if q else '',
                      'mistakes':row['mistakes'], 'players':row['players']})
    return {'page':page,'pages':pages,'total':total,'versions':sorted(context['banks'],key=context['version_order'],reverse=True),
            'currentVersion':context['version'],'entries':items}


def badge_statistics(db, context):
    counts = context['badge_counts'](db)
    return {'entries':[{'name':badge['name'],'description':badge['description'],'tone':badge['tone'],
                        **counts[badge['id']]} for badge in context['badges']]}


def interactions(db, body, context):
    page = page_number(body)
    kind = body.get('kind', 'comments')
    if kind not in ('comments', 'reactions'):
        raise AdminError('互动类型无效。')
    table = 'social_comments' if kind == 'comments' else 'social_reactions'
    total = db.execute('SELECT COUNT(*) FROM ' + table).fetchone()[0]
    page, pages = paging(total, page)
    if kind == 'comments':
        rows = db.execute('''SELECT c.content,c.state,c.created_at,c.updated_at,author.nickname AS author,
                             an.number AS author_number,target.nickname AS target,tn.number AS target_number,
                             (SELECT COUNT(*) FROM social_likes l WHERE l.comment_id=c.id) AS likes
                             FROM social_comments c JOIN participants author ON author.id=c.author_id
                             JOIN participants target ON target.id=c.target_id
                             LEFT JOIN participant_numbers an ON an.participant_id=author.id
                             LEFT JOIN participant_numbers tn ON tn.participant_id=target.id
                             ORDER BY c.updated_at DESC,c.id DESC LIMIT ? OFFSET ?''', (PAGE_SIZE,(page-1)*PAGE_SIZE)).fetchall()
        entries = [{'author':r['author'],'authorNumber':r['author_number'],'target':r['target'],
                    'targetNumber':r['target_number'],'content':r['content'],'state':r['state'],
                    'createdAt':r['created_at'],'updatedAt':r['updated_at'],'likes':r['likes']} for r in rows]
    else:
        rows = db.execute('''SELECT r.reaction,r.updated_at,author.nickname AS author,an.number AS author_number,
                             target.nickname AS target,tn.number AS target_number
                             FROM social_reactions r JOIN participants author ON author.id=r.actor_id
                             JOIN participants target ON target.id=r.target_id
                             LEFT JOIN participant_numbers an ON an.participant_id=author.id
                             LEFT JOIN participant_numbers tn ON tn.participant_id=target.id
                             ORDER BY r.updated_at DESC,an.number DESC LIMIT ? OFFSET ?''', (PAGE_SIZE,(page-1)*PAGE_SIZE)).fetchall()
        entries = [{'author':r['author'],'authorNumber':r['author_number'],'target':r['target'],
                    'targetNumber':r['target_number'],'reaction':context['reactions'].get(r['reaction'],r['reaction']),
                    'updatedAt':r['updated_at']} for r in rows]
    return {'page':page,'pages':pages,'total':total,'kind':kind,'entries':entries}


class AdminService:
    def __init__(self, path):
        self.path = Path(path)
        self.lock = threading.RLock()
        self.sessions = {}
        self.login_attempts = []
        self.generation = 0

    def verify_password(self, password):
        if not isinstance(password, str) or len(password) > 128:
            return False
        try:
            encoded = password.encode('utf-8')
        except UnicodeEncodeError:
            return False
        try:
            record = json.loads(self.path.read_text(encoding='utf-8'))
            rounds = record['iterations']
            if record['version'] != 1 or type(rounds) is not int or not ITERATIONS <= rounds <= 2_000_000:
                raise ValueError('Invalid authentication configuration')
            salt, expected = bytes.fromhex(record['salt']), bytes.fromhex(record['digest'])
            if len(salt) != 16 or len(expected) != 32:
                raise ValueError('Invalid authentication configuration')
        except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError):
            raise AdminError('管理员登录暂时不可用。', 503)
        candidate = hashlib.pbkdf2_hmac('sha256', encoded, salt, rounds)
        return hmac.compare_digest(candidate, expected)

    def reserve_attempt(self):
        now = time.monotonic()
        with self.lock:
            self.login_attempts = [entry for entry in self.login_attempts if now-entry < LOGIN_WINDOW]
            if len(self.login_attempts) >= LOGIN_LIMIT:
                raise AdminError('尝试次数过多，请 15 分钟后再试。', 429)
            self.login_attempts.append(now)
            return self.generation

    def login(self, password):
        generation = self.reserve_attempt()
        if not self.verify_password(password):
            raise AdminError('管理员密码不正确。', 401)
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        now = time.monotonic()
        with self.lock:
            if generation != self.generation:
                raise AdminError('密码已更新，请重新登录。', 401)
            self.login_attempts.clear()
            self.sessions = {key:value for key,value in self.sessions.items()
                             if now-value['created'] < SESSION_LIFETIME and now-value['used'] < SESSION_IDLE}
            if len(self.sessions) >= 20:
                oldest = min(self.sessions, key=lambda key:self.sessions[key]['used'])
                del self.sessions[oldest]
            self.sessions[hashlib.sha256(token.encode()).hexdigest()] = {'csrf':csrf,'created':now,'used':now}
        return {'authenticated':True,'csrf':csrf}, self.cookie(token, SESSION_LIFETIME)

    @staticmethod
    def cookie(token, age):
        return f'{COOKIE_NAME}={token}; Path={COOKIE_PATH}; Max-Age={age}; HttpOnly; Secure; SameSite=Strict'

    def session(self, headers, require_csrf=True):
        cookie = SimpleCookie()
        try:
            cookie.load(headers.get('Cookie',''))
            token = cookie[COOKIE_NAME].value
        except (CookieError, KeyError):
            raise AdminError('请先登录管理页面。', 401)
        if not re.fullmatch(r'[A-Za-z0-9_-]{43}',token):
            raise AdminError('请先登录管理页面。', 401)
        key, now = hashlib.sha256(token.encode()).hexdigest(), time.monotonic()
        with self.lock:
            session = self.sessions.get(key)
            if not session or now-session['created'] >= SESSION_LIFETIME or now-session['used'] >= SESSION_IDLE:
                self.sessions.pop(key,None)
                raise AdminError('登录已过期，请重新登录。', 401)
            if require_csrf:
                supplied = headers.get('X-CSRF-Token','')
                if not re.fullmatch(r'[A-Za-z0-9_-]{43}', supplied) or not hmac.compare_digest(session['csrf'],supplied):
                    raise AdminError('页面验证已过期，请刷新后重试。', 403)
            session['used'] = now
            return key, session['csrf']

    def dispatch(self, path, body, headers, db, context):
        if headers.get('Origin','') != ORIGIN:
            raise AdminError('请从管理页面直接访问。', 403)
        route = path.removeprefix('/api/admin/')
        if route == 'login':
            return self.login(body.get('password'))
        key, csrf = self.session(headers, require_csrf=route != 'session')
        if route == 'session':
            return {'authenticated':True,'csrf':csrf}, None
        if route == 'logout':
            with self.lock: self.sessions.pop(key,None)
            return {'ok':True}, self.cookie('',0)
        if route == 'password':
            new = body.get('newPassword')
            generation = self.reserve_attempt()
            if not self.verify_password(body.get('currentPassword')):
                raise AdminError('当前密码不正确。', 401)
            if body['currentPassword'] == new:
                raise AdminError('新密码不能与当前密码相同。')
            with self.lock:
                if generation != self.generation:
                    raise AdminError('密码已更新，请重新登录。', 401)
                save_password(self.path,new)
                self.generation += 1
                self.sessions.clear()
                self.login_attempts.clear()
            return {'ok':True}, self.cookie('',0)
        actions = {'overview':overview, 'players':players, 'player':player, 'attempt':attempt,
                   'questions':questions, 'badges':badge_statistics, 'interactions':interactions}
        action = actions.get(route)
        if not action:
            raise AdminError('页面不存在。', 404)
        db.execute('BEGIN')
        try:
            if route == 'players':
                result = action(db,body)
            elif route in ('overview','badges'):
                result = action(db,context)
            else:
                result = action(db,body,context)
            return result, None
        finally:
            db.execute('ROLLBACK')
