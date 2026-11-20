"""Shared, identity-scoped leaderboard interactions."""

import hashlib
import hmac
import re
import time
import unicodedata

REACTIONS = {
    'clap': '👏', 'fire': '🔥', 'team': '🤝', 'thumb': '👍', 'star': '🌟', 'joy': '😄',
    'down': '👎', 'facepalm': '🤦', 'confused': '🤔',
    'awkward': '😅', 'clown': '🤡', 'skull': '💀',
}
REPORT_REASONS = {'abuse': '侮辱或骚扰', 'privacy': '泄露个人信息', 'spam': '广告或刷屏', 'other': '其他'}


class SocialError(Exception):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def initialize(db):
    db.executescript('''
        CREATE TABLE IF NOT EXISTS social_reactions (
            target_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            actor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            reaction TEXT NOT NULL, updated_at INTEGER NOT NULL,
            PRIMARY KEY (target_id, actor_id)
        );
        CREATE TABLE IF NOT EXISTS social_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            target_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            content TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
            state TEXT NOT NULL DEFAULT 'visible', UNIQUE (target_id, author_id)
        );
        CREATE TABLE IF NOT EXISTS social_likes (
            comment_id INTEGER NOT NULL REFERENCES social_comments(id) ON DELETE CASCADE,
            actor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            created_at INTEGER NOT NULL, PRIMARY KEY (comment_id, actor_id)
        );
        CREATE TABLE IF NOT EXISTS social_rate_limits (
            actor_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            action TEXT NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY (actor_id, action)
        );
        CREATE INDEX IF NOT EXISTS social_comments_target_state ON social_comments(target_id, state, created_at);
        CREATE TABLE IF NOT EXISTS social_reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            comment_id INTEGER REFERENCES social_comments(id) ON DELETE SET NULL,
            reporter_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            author_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            target_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            comment_updated_at INTEGER NOT NULL, content_snapshot TEXT NOT NULL,
            reason TEXT NOT NULL, details TEXT NOT NULL DEFAULT '',
            created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', resolved_at INTEGER,
            UNIQUE(comment_id, reporter_id, comment_updated_at)
        );
        CREATE INDEX IF NOT EXISTS social_reports_status_time ON social_reports(status, created_at);
        CREATE TABLE IF NOT EXISTS social_admin_moderation (
            comment_id INTEGER PRIMARY KEY REFERENCES social_comments(id) ON DELETE CASCADE,
            previous_state TEXT NOT NULL, updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS badge_record_events (
            participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
            badge_id TEXT NOT NULL, achieved_at INTEGER NOT NULL,
            PRIMARY KEY (participant_id, badge_id)
        );
    ''')


def identity(db, body, required=True):
    device, secret = body.get('deviceId'), body.get('secret')
    if device is None and secret is None and not required:
        return None
    if not isinstance(device, str) or not re.fullmatch(r'[a-f0-9]{32}', device):
        raise SocialError('请先保存昵称，或恢复原来的身份。', 403)
    if not isinstance(secret, str) or not re.fullmatch(r'[a-f0-9]{64}', secret):
        raise SocialError('请先保存昵称，或恢复原来的身份。', 403)
    row = db.execute('SELECT secret_hash FROM participants WHERE id=?', (device,)).fetchone()
    digest = hashlib.sha256(secret.encode('utf-8')).hexdigest()
    if row is None or not hmac.compare_digest(row['secret_hash'], digest):
        raise SocialError('请先保存昵称，或恢复原来的身份。', 403)
    return device


def target(db, body):
    number = body.get('playerNumber')
    if type(number) is not int or not 1 <= number <= 2**63 - 1:
        raise SocialError('玩家编号无效。')
    row = db.execute('''SELECT p.id, p.nickname, n.number FROM participants p
                        JOIN participant_numbers n ON n.participant_id=p.id
                        WHERE n.number=? AND EXISTS
                        (SELECT 1 FROM attempts a WHERE a.participant_id=p.id)''', (number,)).fetchone()
    if not row:
        raise SocialError('这位玩家暂不在榜单上。', 404)
    return row


def rate_limit(db, actor, action, milliseconds):
    now = int(time.time() * 1000)
    row = db.execute('SELECT last_at FROM social_rate_limits WHERE actor_id=? AND action=?', (actor, action)).fetchone()
    if row and now - row['last_at'] < milliseconds:
        raise SocialError('操作太快了，请稍后再试。', 429)
    db.execute('''INSERT INTO social_rate_limits VALUES (?, ?, ?)
                  ON CONFLICT(actor_id, action) DO UPDATE SET last_at=excluded.last_at''', (actor, action, now))
    return now


def summaries(db, participant_ids):
    ids = list(dict.fromkeys(participant_ids))
    result = {item: {'reactions': [], 'commentCount': 0, 'preview': None} for item in ids}
    if not ids:
        return result
    marks = ','.join('?' for _ in ids)
    reactions = db.execute('''SELECT target_id, reaction, COUNT(*) AS count FROM social_reactions
                              WHERE target_id IN (''' + marks + ''') GROUP BY target_id, reaction
                              ORDER BY count DESC, reaction''', ids)
    for row in reactions:
        if row['reaction'] in REACTIONS and len(result[row['target_id']]['reactions']) < 3:
            result[row['target_id']]['reactions'].append({'id': row['reaction'], 'count': row['count']})
    for row in db.execute('''SELECT target_id, COUNT(*) AS count FROM social_comments
                             WHERE state='visible' AND target_id IN (''' + marks + ') GROUP BY target_id', ids):
        result[row['target_id']]['commentCount'] = row['count']
    rows = db.execute('''WITH ranked AS (
          SELECT c.id, c.target_id, c.content, c.created_at, COUNT(l.actor_id) AS likes,
                 ROW_NUMBER() OVER (PARTITION BY c.target_id ORDER BY COUNT(l.actor_id) DESC, c.created_at DESC, c.id DESC) AS position
          FROM social_comments c LEFT JOIN social_likes l ON l.comment_id=c.id
          WHERE c.state='visible' AND c.target_id IN (''' + marks + ''') GROUP BY c.id
        ) SELECT * FROM ranked WHERE position=1''', ids)
    for row in rows:
        result[row['target_id']]['preview'] = {'content': row['content'], 'likes': row['likes']}
    return result


def view(db, body):
    viewer = identity(db, body, required=False)
    player = target(db, body)
    page, size = body.get('page', 1), 10
    order = body.get('sort', 'hot')
    if type(page) is not int or not 1 <= page <= 10000000 or order not in ('hot', 'new'):
        raise SocialError('评价页码无效。')
    visible = "(c.state='visible' OR (c.state='owner_hidden' AND (c.target_id=? OR c.author_id=?)))"
    params = (player['id'], viewer or '', viewer or '')
    total = db.execute('SELECT COUNT(*) FROM social_comments c WHERE c.target_id=? AND ' + visible, params).fetchone()[0]
    pages = max(1, (total + size - 1) // size)
    page = min(page, pages)
    sorting = 'likes DESC, c.created_at DESC, c.id DESC' if order == 'hot' else 'c.created_at DESC, c.id DESC'
    rows = db.execute('''SELECT c.*, p.nickname, n.number,
          (SELECT COUNT(*) FROM social_likes l WHERE l.comment_id=c.id) AS likes,
          EXISTS(SELECT 1 FROM social_likes l WHERE l.comment_id=c.id AND l.actor_id=?) AS liked,
          EXISTS(SELECT 1 FROM social_reports r WHERE r.comment_id=c.id AND r.reporter_id=? AND r.comment_updated_at=c.updated_at) AS reported
          FROM social_comments c JOIN participants p ON p.id=c.author_id
          LEFT JOIN participant_numbers n ON n.participant_id=p.id
          WHERE c.target_id=? AND ''' + visible + ' ORDER BY ' + sorting + ' LIMIT ? OFFSET ?',
          (viewer or '', viewer or '', *params, size, (page - 1) * size)).fetchall()
    reactions = {row['reaction']: row['count'] for row in db.execute('''SELECT reaction, COUNT(*) AS count
                   FROM social_reactions WHERE target_id=? GROUP BY reaction''', (player['id'],))}
    mine = db.execute('SELECT reaction FROM social_reactions WHERE target_id=? AND actor_id=?',
                      (player['id'], viewer or '')).fetchone()
    own_comment = db.execute('''SELECT id, content, state FROM social_comments
                                WHERE target_id=? AND author_id=?''', (player['id'], viewer or '')).fetchone()
    return {'player': {'number': player['number'], 'nickname': player['nickname']},
            'reactions': [{'id': key, 'count': reactions.get(key, 0)} for key in REACTIONS],
            'myReaction': mine['reaction'] if mine else None,
            'ownComment': {'id': own_comment['id'], 'content': own_comment['content'], 'state': own_comment['state']} if own_comment else None,
            'isTarget': bool(viewer and viewer == player['id']),
            'commentCount': summaries(db, [player['id']])[player['id']]['commentCount'],
            'page': page, 'pages': pages, 'sort': order,
            'comments': [{'id': row['id'], 'nickname': row['nickname'], 'playerNumber': row['number'],
                          'content': row['content'], 'createdAt': row['created_at'], 'likes': row['likes'],
                          'liked': bool(row['liked']),
                          'own': bool(viewer and viewer == row['author_id']),
                          'canHide': bool(viewer and viewer == row['target_id']),
                          'reported': bool(row['reported']),
                          'hidden': row['state'] != 'visible'} for row in rows]}


def mutate(db, body, action):
    db.execute('BEGIN IMMEDIATE')
    try:
        actor = identity(db, body)
        now = int(time.time() * 1000)
        if action in ('reaction', 'comment'):
            player = target(db, body)
            if player['id'] == actor:
                raise SocialError('不能给自己贴表情或写评价。')
        if action == 'reaction':
            reaction = body.get('reaction')
            if reaction is not None and (not isinstance(reaction, str) or reaction not in REACTIONS):
                raise SocialError('请选择可用的表情。')
            old = db.execute('SELECT reaction FROM social_reactions WHERE target_id=? AND actor_id=?',
                             (player['id'], actor)).fetchone()
            if (old['reaction'] if old else None) != reaction:
                now = rate_limit(db, actor, 'reaction', 1000)
                if reaction is None:
                    db.execute('DELETE FROM social_reactions WHERE target_id=? AND actor_id=?', (player['id'], actor))
                else:
                    db.execute('''INSERT INTO social_reactions VALUES (?, ?, ?, ?)
                                  ON CONFLICT(target_id, actor_id) DO UPDATE SET reaction=excluded.reaction, updated_at=excluded.updated_at''',
                               (player['id'], actor, reaction, now))
        elif action == 'comment':
            content = body.get('content')
            if not isinstance(content, str):
                raise SocialError('请输入评价。')
            content = unicodedata.normalize('NFKC', ' '.join(content.split()))
            if not 1 <= len(content) <= 60 or any(unicodedata.category(c).startswith('C') for c in content):
                raise SocialError('评价请填写 1 至 60 个字符。')
            if re.search(r'(?i)https?://|www\.', content):
                raise SocialError('评价中请不要包含链接。')
            old = db.execute('SELECT id, content FROM social_comments WHERE target_id=? AND author_id=?',
                             (player['id'], actor)).fetchone()
            if not old or old['content'] != content:
                now = rate_limit(db, actor, 'comment', 30000)
                if old:
                    db.execute('UPDATE social_comments SET content=?, updated_at=? WHERE id=?', (content, now, old['id']))
                    db.execute('DELETE FROM social_likes WHERE comment_id=?', (old['id'],))
                else:
                    db.execute('''INSERT INTO social_comments (target_id, author_id, content, created_at, updated_at)
                                  VALUES (?, ?, ?, ?, ?)''', (player['id'], actor, content, now, now))
        else:
            comment_id = body.get('commentId')
            if type(comment_id) is not int or not 1 <= comment_id <= 2**63 - 1:
                raise SocialError('评价编号无效。')
            comment = db.execute('SELECT * FROM social_comments WHERE id=?', (comment_id,)).fetchone()
            if not comment:
                raise SocialError('这条评价已不存在。', 404)
            if action == 'like':
                liked = body.get('liked')
                if type(liked) is not bool or comment['state'] != 'visible' or comment['author_id'] == actor:
                    raise SocialError('无法给这条评价点赞。')
                old = db.execute('SELECT 1 FROM social_likes WHERE comment_id=? AND actor_id=?', (comment_id, actor)).fetchone()
                if bool(old) != liked:
                    now = rate_limit(db, actor, 'like', 500)
                    if liked:
                        db.execute('INSERT INTO social_likes VALUES (?, ?, ?)', (comment_id, actor, now))
                    else:
                        db.execute('DELETE FROM social_likes WHERE comment_id=? AND actor_id=?', (comment_id, actor))
            elif action == 'delete':
                if comment['author_id'] != actor:
                    raise SocialError('只能删除自己的评价。', 403)
                db.execute('DELETE FROM social_comments WHERE id=?', (comment_id,))
            elif action == 'hide':
                hidden = body.get('hidden')
                if type(hidden) is not bool or comment['target_id'] != actor or comment['state'] == 'admin_hidden':
                    raise SocialError('无法修改这条评价的展示状态。', 403)
                db.execute('UPDATE social_comments SET state=? WHERE id=?', ('owner_hidden' if hidden else 'visible', comment_id))
            elif action == 'report':
                reason, details = body.get('reason'), body.get('details', '')
                if comment['state'] != 'visible' or comment['author_id'] == actor:
                    raise SocialError('无法举报这条评价。', 403)
                if not isinstance(reason, str) or reason not in REPORT_REASONS or not isinstance(details, str):
                    raise SocialError('请选择举报原因。')
                details = unicodedata.normalize('NFKC', ' '.join(details.split()))
                if len(details) > 120 or any(unicodedata.category(c).startswith('C') for c in details):
                    raise SocialError('补充说明请填写 120 个字以内。')
                old = db.execute('''SELECT id FROM social_reports WHERE comment_id=? AND reporter_id=?
                                    AND comment_updated_at=?''', (comment_id, actor, comment['updated_at'])).fetchone()
                if not old:
                    now = rate_limit(db, actor, 'report', 10000)
                    db.execute('''INSERT INTO social_reports (comment_id,reporter_id,author_id,target_id,comment_updated_at,
                                   content_snapshot,reason,details,created_at) VALUES (?,?,?,?,?,?,?,?,?)''',
                               (comment_id,actor,comment['author_id'],comment['target_id'],comment['updated_at'],
                                comment['content'],reason,details,now))
            else:
                raise SocialError('操作不存在。', 404)
        db.execute('COMMIT')
        return {'ok': True}
    except Exception:
        db.execute('ROLLBACK')
        raise
