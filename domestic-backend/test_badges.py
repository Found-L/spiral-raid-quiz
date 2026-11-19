import tempfile
import unittest
from pathlib import Path

import server


class BadgeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_database = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()
        self.db = server.database()
        self.count = 0

    def tearDown(self):
        self.db.close()
        server.DATABASE = self.previous_database
        self.temp.cleanup()

    def player(self, digit):
        identity = {'deviceId': digit * 32, 'secret': 'f' * 64}
        server.profile(self.db, {**identity, 'nickname': digit})
        return identity

    def attempt(self, identity, correct, total=87, elapsed=None):
        self.count += 1
        attempt_id = f'{self.count:032x}'
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        (attempt_id, identity['deviceId'], server.VERSION, correct, total, self.count))
        if elapsed is not None:
            self.db.execute('INSERT INTO attempt_timings VALUES (?, ?)', (attempt_id, elapsed))

    def earned(self, identity):
        return {badge['id'] for badge in server.badges(self.db, identity)['badges'] if badge['earned']}

    def test_fastest_ignores_score_and_ties_but_missing_times_do_not_win(self):
        low = self.player('a')
        perfect = self.player('b')
        tied = self.player('c')
        old = self.player('d')
        self.attempt(low, 0, elapsed=20)
        self.attempt(low, 86, elapsed=50)
        self.attempt(perfect, 87, elapsed=40)
        self.attempt(tied, 10, elapsed=20)
        self.attempt(old, 87)
        self.assertIn('quickest', self.earned(low))
        self.assertIn('quickest', self.earned(tied))
        self.assertNotIn('quickest', self.earned(perfect))
        self.assertNotIn('quickest', self.earned(old))
        self.assertEqual(server.badges(self.db, old)['fastestSeconds'], 20)
        low_entry = next(entry for entry in server.leaderboard(self.db, latest=True)['entries'] if entry['nickname'] == 'a')
        self.assertEqual(low_entry['correctCount'], 86)
        self.assertIn('quickest', [badge['id'] for badge in low_entry['badges']])

        server.select_badges(self.db, {**low, 'selected': ['quickest', 'zero']})
        self.attempt(perfect, 0, elapsed=10)
        self.assertNotIn('quickest', self.earned(low))
        self.assertIn('quickest', self.earned(perfect))
        self.assertEqual(server.badges(self.db, low)['selected'], ['zero'])
        with self.assertRaises(server.ApiError):
            server.select_badges(self.db, {**low, 'selected': ['quickest']})

    def test_retroactive_badges_and_selection_persist_without_changing_scores(self):
        player = self.player('a')
        self.attempt(player, 20, elapsed=None)
        self.attempt(player, 86, elapsed=1900)
        self.attempt(player, 87, elapsed=500)
        self.attempt(player, 87, elapsed=700)
        earned = self.earned(player)
        self.assertTrue({'first', 'three_rounds', 'steady', 'comeback', 'brave', 'almost',
                         'knowledge', 'slow_careful', 'perfect', 'perfect_fast'} <= earned)
        self.assertNotIn('five_minutes', earned)
        self.assertNotIn('five_rounds', earned)
        before = self.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0]
        server.select_badges(self.db, {**player, 'selected': ['brave', 'comeback']})
        self.assertEqual(server.badges(self.db, player)['selected'], ['brave', 'comeback'])
        entry = server.leaderboard(self.db, latest=True)['entries'][0]
        self.assertEqual([badge['id'] for badge in entry['badges']], ['brave', 'comeback'])
        self.assertEqual(entry['score'], 100)
        self.assertNotIn('participant_id', entry)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], before)
        server.select_badges(self.db, {**player, 'selected': []})
        self.assertEqual(server.leaderboard(self.db, latest=True)['entries'][0]['badges'], [])

    def test_selection_is_authenticated_and_rejects_invalid_or_locked_badges(self):
        player = self.player('a')
        self.attempt(player, 1)
        for selected in (['first'] * 2, ['first', 'brave', 'zero', 'perfect'], ['missing'], [None], ['perfect']):
            with self.subTest(selected=selected), self.assertRaises(server.ApiError):
                server.select_badges(self.db, {**player, 'selected': selected})
        with self.assertRaises(server.ApiError) as error:
            server.select_badges(self.db, {**player, 'secret': 'e' * 64, 'selected': ['first']})
        self.assertEqual(error.exception.status, 403)
        server.select_badges(self.db, {**player, 'selected': ['first']})
        server.delete_profile(self.db, player)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM badge_selections').fetchone()[0], 0)

    def test_unsubmitted_user_has_no_badges_and_old_times_are_not_invented(self):
        player = self.player('a')
        info = server.badges(self.db, player)
        self.assertEqual(info['selected'], [])
        self.assertIsNone(info['fastestSeconds'])
        self.assertFalse(any(badge['earned'] for badge in info['badges']))
        self.attempt(player, 87)
        self.assertIn('perfect', self.earned(player))
        self.assertNotIn('quickest', self.earned(player))
        self.assertNotIn('perfect_fast', self.earned(player))


if __name__ == '__main__':
    unittest.main()
