import tempfile
import unittest
from pathlib import Path

import server


class HistoryReviewTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_database = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()
        self.db = server.database()
        self.player = {'deviceId': 'a' * 32, 'secret': '1' * 64}
        self.other = {'deviceId': 'b' * 32, 'secret': '2' * 64}
        server.profile(self.db, {**self.player, 'nickname': '玩家一'})
        server.profile(self.db, {**self.other, 'nickname': '玩家二'})

    def tearDown(self):
        self.db.close()
        server.DATABASE = self.previous_database
        self.temp.cleanup()

    def submit(self, attempt_id, wrong, version=None):
        version = version or server.VERSION
        bank = server.BANKS[version]
        answers = {q['id']: list(q['answer']) for q in bank['questions']}
        for q in bank['questions']:
            if q['id'] in wrong:
                answers[q['id']] = [next(o['id'] for o in q['options'] if o['id'] not in q['answer'])]
        server.submit(self.db, {**self.player, 'attemptId': attempt_id, 'version': version, 'answers': answers})

    def test_owned_attempt_returns_wrong_questions_and_not_original_choices(self):
        attempt_id = '1' * 32
        self.submit(attempt_id, {'q001', 'q010', 'q100'})
        row = server.history(self.db, self.player)['entries'][0]
        self.assertEqual(row['attemptId'], attempt_id)
        self.assertTrue(row['reviewAvailable'])
        review = server.history_review(self.db, {**self.player, 'attemptId': attempt_id})
        self.assertTrue(review['available'])
        self.assertTrue(review['currentVersion'])
        self.assertEqual({q['id'] for q in review['questions']}, {'q001', 'q010', 'q100'})
        self.assertTrue(all(q['options'] and q['answer'] and q['explanation'] for q in review['questions']))
        self.assertNotIn('selected', str(review))

    def test_review_is_private_and_validates_attempt_id(self):
        attempt_id = '1' * 32
        self.submit(attempt_id, {'q001'})
        for body, status in [({**self.player, 'secret': self.other['secret'], 'attemptId': attempt_id}, 403),
                             ({**self.other, 'attemptId': attempt_id}, 404),
                             ({**self.player, 'attemptId': 'bad'}, 400)]:
            with self.subTest(body=body), self.assertRaises(server.ApiError) as error:
                server.history_review(self.db, body)
            self.assertEqual(error.exception.status, status)

    def test_older_banks_perfect_and_records_without_details(self):
        old = 'peak-spiral-2026-11-18-v9'
        self.submit('1' * 32, {'q001'}, old)
        self.submit('2' * 32, set())
        old_review = server.history_review(self.db, {**self.player, 'attemptId': '1' * 32})
        self.assertTrue(old_review['available'])
        self.assertFalse(old_review['currentVersion'])
        self.assertEqual([q['id'] for q in old_review['questions']], ['q001'])
        self.assertEqual(server.history_review(self.db, {**self.player, 'attemptId': '2' * 32})['questions'], [])
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        ('3' * 32, self.player['deviceId'], server.VERSION, 1, 105, 1))
        entry = next(e for e in server.history(self.db, self.player)['entries'] if e['attemptId'] == '3' * 32)
        self.assertFalse(entry['reviewAvailable'])
        self.assertFalse(server.history_review(self.db, {**self.player, 'attemptId': '3' * 32})['available'])

    def test_incomplete_or_unknown_question_detail_is_not_misreported(self):
        attempt_id = '1' * 32
        self.submit(attempt_id, {'q001'})
        self.db.execute('DELETE FROM attempt_wrong_questions WHERE attempt_id = ?', (attempt_id,))
        self.assertFalse(server.history_review(self.db, {**self.player, 'attemptId': attempt_id})['available'])
        self.db.execute('INSERT INTO attempt_wrong_questions VALUES (?, ?)', (attempt_id, 'unknown'))
        self.assertFalse(server.history_review(self.db, {**self.player, 'attemptId': attempt_id})['available'])


if __name__ == '__main__':
    unittest.main()
