import json
import tempfile
import threading
import unittest
import urllib.request
from contextlib import closing
from pathlib import Path

import server


ROOT = Path(__file__).resolve().parent
OLD_VERSION = 'peak-spiral-2026-11-18-v3'
DEVICE = 'a' * 32
SECRET = 'b' * 64


def answers(bank):
    return {question['id']: question['answer'] for question in bank['questions']}


class QuestionVersionsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.previous_database = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()

    def tearDown(self):
        server.DATABASE = self.previous_database
        self.temp.cleanup()

    def test_both_versions_are_graded_with_their_own_answer_keys(self):
        for version, bank in server.BANKS.items():
            result = server.grade(answers(bank), version)
            self.assertEqual(result['correctCount'], len(bank['questions']))
            self.assertEqual(result['score'], 100)
        with self.assertRaises(server.ApiError):
            server.grade(answers(server.BANK), 'unknown-version')

    def test_old_attempt_is_preserved_and_not_ranked_as_current(self):
        identity = {'deviceId': DEVICE, 'secret': SECRET}
        old_bank = server.BANKS[OLD_VERSION]
        old = {**identity, 'attemptId': 'c' * 32, 'version': OLD_VERSION, 'answers': answers(old_bank)}
        new = {**identity, 'attemptId': 'd' * 32, 'version': server.VERSION, 'answers': answers(server.BANK)}
        with closing(server.database()) as db:
            server.profile(db, {**identity, 'nickname': '测试玩家'})
            first = server.submit(db, old)
            self.assertEqual(server.submit(db, old), first)
            self.assertEqual(server.leaderboard(db)['entries'], [])
            self.assertFalse(server.history(db, identity)['entries'][0]['currentVersion'])
            server.submit(db, new)
            self.assertEqual(len(server.leaderboard(db)['entries']), 1)
            history = server.history(db, identity)
            self.assertEqual(history['attemptCount'], 2)
            self.assertEqual(sorted(entry['currentVersion'] for entry in history['entries']), [False, True])
            with self.assertRaises(server.ApiError):
                server.submit(db, {**new, 'attemptId': old['attemptId']})

    def test_migration_clears_every_changed_question_only(self):
        current = {q['id']: q for q in server.BANK['questions']}
        for version in server.BANK['draft_migrations']:
            old = {q['id']: q for q in server.BANKS[version]['questions']}
            changed = {key for key in old.keys() | current.keys() if current.get(key) != old.get(key)}
            self.assertEqual(set(server.BANK['draft_migrations'][version]), changed)
        self.assertEqual(server.BANK, json.loads((ROOT.parent / 'questions.json').read_text(encoding='utf-8')))

    def test_http_submission_and_history_for_old_and_new_banks(self):
        httpd = server.QuizServer(('127.0.0.1', 0), server.Handler)
        thread = threading.Thread(target=httpd.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{httpd.server_port}'
        identity = {'deviceId': DEVICE, 'secret': SECRET}

        def post(route, data):
            request = urllib.request.Request(base + route, json.dumps(data).encode(),
                headers={'Content-Type':'application/json', 'Origin':'https://found-l.github.io'})
            with urllib.request.urlopen(request, timeout=5) as response:
                self.assertEqual(response.headers['Access-Control-Allow-Origin'], 'https://found-l.github.io')
                return json.load(response)

        try:
            post('/api/profile', {**identity, 'nickname':'本地测试'})
            for attempt_id, version in [('c' * 32, OLD_VERSION), ('d' * 32, server.VERSION)]:
                data = {**identity, 'attemptId':attempt_id, 'version':version,
                        'answers':answers(server.BANKS[version])}
                self.assertEqual(post('/api/submit', data)['score'], 100)
            history = post('/api/history', identity)
            self.assertEqual(history['attemptCount'], 2)
            self.assertEqual(sorted(entry['currentVersion'] for entry in history['entries']), [False, True])
            with urllib.request.urlopen(base + '/api/leaderboard', timeout=5) as response:
                self.assertEqual(json.load(response)['entries'][0]['score'], 100)
        finally:
            httpd.shutdown()
            httpd.server_close()
            thread.join(timeout=5)


if __name__ == '__main__':
    unittest.main()
