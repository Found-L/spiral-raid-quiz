import json
import tempfile
import unittest
from pathlib import Path

import badge_metrics
import server


class ShareTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()
        self.db = server.database()
        self.players = {}
        for letter in 'abc':
            identity = {'deviceId': letter * 32, 'secret': '1' * 64}
            profile = server.profile(self.db, {**identity, 'nickname': '玩家' + letter})
            self.players[letter] = {**identity, 'number': profile['playerNumber']}
        self.attempt('a', 1, 8, 10)
        self.attempt('a', 2, 9, 10)
        self.attempt('b', 3, 10, 10)

    def tearDown(self):
        self.db.close()
        server.DATABASE = self.previous
        badge_metrics.invalidate()
        self.temp.cleanup()

    def attempt(self, letter, timestamp, correct, elapsed):
        attempt_id = f'{timestamp:032x}'
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        (attempt_id, self.players[letter]['deviceId'], server.VERSION, correct, 10, timestamp))
        self.db.execute('INSERT INTO attempt_timings VALUES (?, ?)', (attempt_id, elapsed))

    def create(self, letter, kind, **values):
        player = self.players[letter]
        return server.create_share(self.db, {'deviceId': player['deviceId'], 'secret': player['secret'],
                                             'kind': kind, **values})

    def test_owned_badge_and_opaque_share(self):
        card = self.create('a', 'badge', badgeId='first')
        self.assertEqual(card['snapshot']['badge']['id'], 'first')
        self.assertEqual(server.read_share(self.db, card['id']), card)
        self.assertEqual(self.create('a', 'badge', badgeId='first'), card)
        serialized = json.dumps(card, ensure_ascii=False)
        self.assertNotIn(self.players['a']['deviceId'], serialized)
        self.assertNotIn(self.players['a']['secret'], serialized)
        with self.assertRaises(server.ApiError):
            self.create('a', 'badge', badgeId='perfect')
        with self.assertRaises(server.ApiError):
            self.create('a', 'badge', badgeId=['first'])

    def test_ranking_matches_paged_public_order_and_ignores_client_values(self):
        board = server.leaderboard(self.db, latest=True, page=2, page_size=1)
        card = self.create('a', 'ranking', rank=1, score=1000)['snapshot']
        self.assertEqual(card['rank'], board['entries'][0]['rank'])
        self.assertEqual(card['score'], board['entries'][0]['score'])
        self.assertEqual(card['elapsedSeconds'], board['entries'][0]['elapsedSeconds'])
        self.assertEqual(card['total'], board['total'])
        with self.assertRaises(server.ApiError):
            self.create('c', 'ranking')

    def test_honor_ranks_respect_ties_and_eligibility(self):
        card = self.create('a', 'honor', badgeId='quickest')['snapshot']
        board = server.honor_page(self.db, 'quickest')
        row = next(item for item in board['entries'] if item['playerNumber'] == self.players['a']['number'])
        self.assertEqual(card['rank'], row['rank'])
        self.assertEqual(card['rank'], 1)
        self.assertEqual(card['value'], 10)
        self.assertEqual(card['total'], board['total'])
        self.assertEqual(self.create('a', 'honor', badgeId='site_rounds')['snapshot']['value'], 2)
        with self.assertRaises(server.ApiError):
            self.create('b', 'honor', badgeId='site_rounds')

    def test_snapshot_is_stable_and_profile_deletion_revokes_links(self):
        original = self.create('a', 'ranking')
        player = self.players['a']
        server.profile(self.db, {'deviceId': player['deviceId'], 'secret': player['secret'], 'nickname': '改名了'})
        self.assertEqual(server.read_share(self.db, original['id']), original)
        updated = self.create('a', 'ranking')
        self.assertNotEqual(updated['id'], original['id'])
        self.assertEqual(updated['snapshot']['nickname'], '改名了')
        server.delete_profile(self.db, {'deviceId': player['deviceId'], 'secret': player['secret']})
        with self.assertRaises(server.ApiError) as error:
            server.read_share(self.db, original['id'])
        self.assertEqual(error.exception.status, 404)

    def test_authentication_and_invalid_links(self):
        with self.assertRaises(server.ApiError) as error:
            server.create_share(self.db, {'deviceId': self.players['a']['deviceId'], 'secret': 'f' * 64,
                                          'kind': 'ranking'})
        self.assertEqual(error.exception.status, 403)
        with self.assertRaises(server.ApiError):
            server.read_share(self.db, 'not-a-share')
        with self.assertRaises(server.ApiError):
            self.create('a', 'honor', badgeId='first')


if __name__ == '__main__':
    unittest.main()
