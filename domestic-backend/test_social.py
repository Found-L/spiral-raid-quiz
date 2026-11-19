import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import badge_metrics
import server
import social


class SocialTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()
        self.db = server.database()
        self.players = {}
        for index, char in enumerate('abcd', 1):
            identity = {'deviceId': char * 32, 'secret': ('1' if char != 'a' else '2') * 64}
            profile = server.profile(self.db, {**identity, 'nickname': '玩家' + char})
            self.players[char] = {**identity, 'number': profile['playerNumber']}
        self.attempt('a', 1, 30)

    def tearDown(self):
        self.db.close()
        server.DATABASE = self.previous
        badge_metrics.invalidate()
        self.temp.cleanup()

    def attempt(self, char, timestamp, elapsed):
        player = self.players[char]
        attempt_id = f'{timestamp:032x}'
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        (attempt_id, player['deviceId'], server.VERSION, 5, 10, timestamp))
        self.db.execute('INSERT INTO attempt_timings VALUES (?, ?)', (attempt_id, elapsed))
        badge_metrics.record_current(self.db, server.honor_boards)
        badge_metrics.invalidate()
        return attempt_id

    def actor(self, char):
        return {key: self.players[char][key] for key in ('deviceId', 'secret')}

    def action(self, char, name, **values):
        return social.mutate(self.db, {**self.actor(char), **values}, name)

    def view(self, char=None):
        return social.view(self.db, {'playerNumber': self.players['a']['number'], **(self.actor(char) if char else {})})

    def comment(self, char, content):
        self.action(char, 'comment', playerNumber=self.players['a']['number'], content=content)
        return self.db.execute('SELECT id FROM social_comments WHERE author_id=?', (self.players[char]['deviceId'],)).fetchone()[0]

    def test_reactions_comments_likes_and_reload(self):
        target = self.players['a']['number']
        self.action('b', 'reaction', playerNumber=target, reaction='clap')
        self.action('b', 'reaction', playerNumber=target, reaction='clap')  # Retry is idempotent.
        self.action('c', 'reaction', playerNumber=target, reaction='fire')
        first = self.comment('b', '<script>这是纯文本</script>')
        second = self.comment('c', '配合很稳')
        self.action('d', 'like', commentId=first, liked=True)
        self.action('d', 'like', commentId=first, liked=True)
        result = self.view('d')
        self.assertEqual(result['comments'][0]['id'], first)
        self.assertEqual(result['comments'][0]['likes'], 1)
        self.assertTrue(result['comments'][0]['liked'])
        self.assertEqual(result['commentCount'], 2)
        self.assertEqual(sum(item['count'] for item in result['reactions']), 2)
        summary = server.leaderboard(self.db, latest=True)['entries'][0]['social']
        self.assertEqual(summary['preview']['content'], '<script>这是纯文本</script>')
        self.assertEqual(summary['preview']['likes'], 1)
        self.assertEqual(summary['commentCount'], 2)
        with closing(server.database()) as db:
            self.assertEqual(social.view(db, {'playerNumber': target})['comments'][0]['id'], first)
        self.assertNotEqual(first, second)

    def test_validation_auth_rate_and_comment_edit(self):
        target = self.players['a']['number']
        with self.assertRaises(social.SocialError):
            self.action('a', 'reaction', playerNumber=target, reaction='fire')
        with self.assertRaises(social.SocialError):
            social.mutate(self.db, {**self.actor('b'), 'secret': 'e' * 64, 'playerNumber': target, 'reaction': 'fire'}, 'reaction')
        with self.assertRaises(social.SocialError):
            self.action('b', 'comment', playerNumber=target, content='x' * 61)
        with self.assertRaises(social.SocialError):
            self.action('b', 'comment', playerNumber=target, content='http://example.com')
        comment = self.comment('b', '第一次评价')
        with self.assertRaises(social.SocialError):
            self.action('b', 'like', commentId=comment, liked=True)
        self.action('c', 'like', commentId=comment, liked=True)
        with self.assertRaises(social.SocialError) as error:
            self.action('b', 'comment', playerNumber=target, content='改一改')
        self.assertEqual(error.exception.status, 429)
        self.db.execute("UPDATE social_rate_limits SET last_at=0 WHERE actor_id=? AND action='comment'", (self.players['b']['deviceId'],))
        self.action('b', 'comment', playerNumber=target, content='改一改')
        self.assertEqual(self.view()['comments'][0]['likes'], 0)
        self.assertEqual(len(self.view()['comments']), 1)

    def test_negative_and_playful_reaction_can_be_replaced_and_removed(self):
        target = self.players['a']['number']
        self.action('b', 'reaction', playerNumber=target, reaction='down')
        self.assertEqual(self.view('b')['myReaction'], 'down')
        self.db.execute("UPDATE social_rate_limits SET last_at=0 WHERE actor_id=? AND action='reaction'", (self.players['b']['deviceId'],))
        self.action('b', 'reaction', playerNumber=target, reaction='clown')
        view = self.view('b')
        self.assertEqual(view['myReaction'], 'clown')
        self.assertEqual({item['id']: item['count'] for item in view['reactions']}['down'], 0)
        self.assertEqual({item['id']: item['count'] for item in view['reactions']}['clown'], 1)
        self.db.execute("UPDATE social_rate_limits SET last_at=0 WHERE actor_id=? AND action='reaction'", (self.players['b']['deviceId'],))
        self.action('b', 'reaction', playerNumber=target, reaction=None)
        self.assertIsNone(self.view('b')['myReaction'])
        self.assertEqual(server.leaderboard(self.db, latest=True)['entries'][0]['social']['reactions'], [])
        with self.assertRaises(social.SocialError):
            self.action('b', 'reaction', playerNumber=target, reaction='unknown')

    def test_deleting_target_removes_received_interactions(self):
        target = self.players['a']['number']
        self.action('b', 'reaction', playerNumber=target, reaction='clap')
        comment = self.comment('b', '一起加油')
        self.action('c', 'like', commentId=comment, liked=True)
        server.delete_profile(self.db, self.actor('a'))
        for table in ('social_reactions', 'social_comments', 'social_likes'):
            self.assertEqual(self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM participants').fetchone()[0], 3)

    def test_hide_and_deletion_cascade(self):
        comment = self.comment('b', '需要处理的评价')
        self.action('a', 'hide', commentId=comment, hidden=True)
        self.assertEqual(self.view()['commentCount'], 0)
        self.assertTrue(self.view('a')['comments'][0]['hidden'])
        self.assertTrue(self.view('b')['comments'][0]['hidden'])
        self.action('a', 'hide', commentId=comment, hidden=False)
        self.action('d', 'like', commentId=comment, liked=True)
        server.delete_profile(self.db, self.actor('d'))
        self.assertEqual(self.view()['comments'][0]['likes'], 0)
        server.delete_profile(self.db, self.actor('b'))
        self.assertEqual(self.view()['commentCount'], 0)

    def test_author_can_delete_hidden_comment_and_likes(self):
        comment = self.comment('b', '我想删除的评价')
        self.action('c', 'like', commentId=comment, liked=True)
        self.action('a', 'hide', commentId=comment, hidden=True)
        with self.assertRaises(social.SocialError):
            self.action('c', 'delete', commentId=comment)
        self.assertEqual(self.view('b')['ownComment']['id'], comment)
        self.action('b', 'delete', commentId=comment)
        self.assertIsNone(self.view('b')['ownComment'])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM social_likes').fetchone()[0], 0)

    def test_badge_counts_deduplicate_and_preserve_record_events(self):
        b = self.attempt('b', 2, 10)
        c = self.attempt('c', 3, 10)
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['demolition'], {'count': 0})
        self.db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (b, 'demolition'))
        badge_metrics.invalidate()
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['demolition'], {'count': 1})
        self.db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (c, 'demolition'))
        badge_metrics.invalidate()
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['first']['count'], 3)
        self.assertEqual(result['quickest'], {'historyCount': 3, 'currentCount': 2})
        self.assertEqual(result['demolition'], {'count': 2})
        self.db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (f'{1:032x}', 'demolition'))
        badge_metrics.invalidate()
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['demolition']['count'], 3)
        server.delete_profile(self.db, self.actor('b'))
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['quickest'], {'historyCount': 2, 'currentCount': 1})
        self.assertEqual(result['demolition'], {'count': 2})
        repeat = self.attempt('c', 4, 8)
        self.db.execute('INSERT INTO attempt_mistake_badges VALUES (?, ?)', (repeat, 'demolition'))
        badge_metrics.invalidate()
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        self.assertEqual(result['demolition'], {'count': 2})

    def test_recorded_history_and_badge_count_agree_after_late_upload(self):
        self.attempt('b', 2, 10)
        late = self.attempt('c', 3, 5)
        self.db.execute('INSERT INTO attempt_completion_times VALUES (?, ?)', (late, 0))
        badge_metrics.invalidate()
        result = {item['id']: item['stats'] for item in server.badges(self.db, self.actor('a'))['badges']}
        history = server.honor_history_page(self.db, 'quickest')
        self.assertEqual(result['quickest']['historyCount'], history['total'])
        self.assertEqual(history['total'], 3)
        recorded = [entry for entry in history['entries'] if entry['recordedOnly']]
        self.assertEqual(len(recorded), 2)
        self.assertTrue(all(entry['value'] is None for entry in recorded))

    def test_comments_paginate_and_sort_by_likes_then_recency(self):
        for index, char in enumerate('0123456789bc'):
            if char not in self.players:
                identity = {'deviceId': char * 32, 'secret': '1' * 64}
                profile = server.profile(self.db, {**identity, 'nickname': '玩家' + char})
                self.players[char] = {**identity, 'number': profile['playerNumber']}
            comment_id = self.comment(char, f'评价 {index}')
            self.db.execute('UPDATE social_comments SET created_at=? WHERE id=?', (1000 + index, comment_id))
        first = self.db.execute("SELECT id FROM social_comments WHERE content='评价 0'").fetchone()[0]
        last = self.db.execute("SELECT id FROM social_comments WHERE content='评价 11'").fetchone()[0]
        self.action('d', 'like', commentId=first, liked=True)
        self.db.execute("UPDATE social_rate_limits SET last_at=0 WHERE actor_id=? AND action='like'", (self.players['d']['deviceId'],))
        self.action('d', 'like', commentId=last, liked=True)
        one = social.view(self.db, {'playerNumber': self.players['a']['number'], 'page': 1, 'sort': 'hot'})
        two = social.view(self.db, {'playerNumber': self.players['a']['number'], 'page': 2, 'sort': 'hot'})
        self.assertEqual((one['commentCount'], one['pages'], len(one['comments']), len(two['comments'])), (12, 2, 10, 2))
        self.assertEqual([entry['id'] for entry in one['comments'][:2]], [last, first])
        self.assertEqual(len({entry['id'] for entry in one['comments'] + two['comments']}), 12)


if __name__ == '__main__':
    unittest.main()
