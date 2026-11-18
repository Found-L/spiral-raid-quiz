import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import server


OLD_VERSION = 'peak-spiral-2026-11-18-v3'


def answers(bank, mistakes=0):
    result = {question['id']: question['answer'] for question in bank['questions']}
    for question in bank['questions'][:mistakes]:
        result[question['id']] = [next(option['id'] for option in question['options']
                                       if option['id'] not in question['answer'])]
    return result


class LeaderboardTimingTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_database = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()

    def tearDown(self):
        server.DATABASE = self.previous_database
        self.temp.cleanup()

    def test_latest_version_replaces_old_and_same_score_uses_time(self):
        with closing(server.database()) as db:
            def submit(player, attempt, version, mistakes=0, elapsed=None):
                identity = {'deviceId':player * 32, 'secret':'f' * 64}
                server.profile(db, {**identity, 'nickname':player})
                return server.submit(db, {**identity, 'attemptId':attempt * 32,
                    'version':version, 'answers':answers(server.BANKS[version], mistakes),
                    'elapsedSeconds':elapsed})

            submit('a', '0', OLD_VERSION)  # Old 100 remains visible until a newer version exists.
            submit('b', '1', server.VERSION, elapsed=20)
            submit('c', '2', server.VERSION, elapsed=10)
            submit('d', '3', OLD_VERSION)
            submit('d', '4', server.VERSION, mistakes=20, elapsed=5)
            submit('c', '5', server.VERSION, elapsed=15)  # Same score: keep faster attempt.
            submit('c', '6', server.VERSION, mistakes=1, elapsed=1)  # Lower score does not replace best.

            board = server.leaderboard(db, latest=True)['entries']
            self.assertEqual([row['nickname'] for row in board], ['c', 'b', 'a', 'd'])
            self.assertEqual([row['elapsedSeconds'] for row in board], [10, 20, None, 5])
            self.assertEqual(board[2]['quizVersion'], OLD_VERSION)
            self.assertEqual(board[3]['quizVersion'], server.VERSION)
            self.assertLess(board[3]['score'], 100)
            self.assertEqual(server.history(db, {'deviceId':'d' * 32, 'secret':'f' * 64})['attemptCount'], 2)
            self.assertEqual(len(server.leaderboard(db, OLD_VERSION)['entries']), 2)

    def test_unknown_elapsed_is_not_fabricated_on_duplicate(self):
        identity = {'deviceId':'a' * 32, 'secret':'f' * 64}
        payload = {**identity, 'attemptId':'0' * 32, 'version':OLD_VERSION,
                   'answers':answers(server.BANKS[OLD_VERSION])}
        with closing(server.database()) as db:
            server.profile(db, {**identity, 'nickname':'old'})
            self.assertIsNone(server.submit(db, payload)['elapsedSeconds'])
            self.assertIsNone(server.submit(db, {**payload, 'elapsedSeconds':42})['elapsedSeconds'])
            self.assertIsNone(server.history(db, identity)['entries'][0]['elapsedSeconds'])
            with self.assertRaises(server.ApiError):
                server.submit(db, {**payload, 'attemptId':'1' * 32, 'elapsedSeconds':True})

    def test_existing_database_keeps_rows_and_original_schema(self):
        legacy = Path(self.temp.name) / 'legacy.sqlite3'
        with closing(sqlite3.connect(legacy)) as db:
            db.execute('''CREATE TABLE attempts (id TEXT PRIMARY KEY, participant_id TEXT NOT NULL,
                quiz_version TEXT NOT NULL, correct_count INTEGER NOT NULL, total_count INTEGER NOT NULL,
                submitted_at INTEGER NOT NULL)''')
            db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                       ('1' * 32, 'a' * 32, OLD_VERSION, 83, 87, 1234))
            db.commit()
        server.DATABASE = legacy
        server.initialize()
        server.initialize()  # Migration is safe on repeated restarts.
        with closing(server.database()) as db:
            row = db.execute('''SELECT a.correct_count, t.elapsed_seconds FROM attempts a
                LEFT JOIN attempt_timings t ON t.attempt_id = a.id''').fetchone()
            self.assertEqual((row['correct_count'], row['elapsed_seconds']), (83, None))
            self.assertNotIn('elapsed_seconds', {item['name'] for item in db.execute('PRAGMA table_info(attempts)')})


if __name__ == '__main__':
    unittest.main()
