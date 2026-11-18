import hashlib
import json
import os
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BANK = json.loads((ROOT / 'questions.json').read_text(encoding='utf-8'))
DEVICE = 'a' * 32
SECRET = 'b' * 64


def fixture():
    return {
        'participants': [{'id': DEVICE, 'secret_hash': hashlib.sha256(SECRET.encode()).hexdigest(),
                          'game_id': DEVICE, 'game_id_key': DEVICE, 'nickname': '旧玩家',
                          'created_at': 100, 'updated_at': 200}],
        'participant_numbers': [{'number': 7, 'participant_id': DEVICE}],
        'attempts': [{'id': 'c' * 32, 'participant_id': DEVICE, 'quiz_version': BANK['version'],
                      'correct_count': 80, 'total_count': len(BANK['questions']), 'submitted_at': 300}],
        'sequence': 25,
    }


class MigrationTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.db = Path(self.temp.name) / 'quiz.sqlite3'
        self.env = {**os.environ, 'QUIZ_DATABASE': str(self.db)}

    def tearDown(self):
        self.temp.cleanup()

    def run_import(self, snapshot):
        return subprocess.run([sys.executable, str(ROOT / 'import_snapshot.py')], input=json.dumps(snapshot) + '\n',
                              text=True, encoding='utf-8', env=self.env, capture_output=True)

    def test_import_preserves_identity_history_and_sequence(self):
        result = self.run_import(fixture())
        self.assertEqual(result.returncode, 0, result.stderr)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT nickname, secret_hash FROM participants').fetchone(),
                             ('旧玩家', hashlib.sha256(SECRET.encode()).hexdigest()))
            self.assertEqual(db.execute('SELECT number FROM participant_numbers').fetchone()[0], 7)
            self.assertEqual(db.execute('SELECT correct_count FROM attempts').fetchone()[0], 80)
            self.assertEqual(db.execute("SELECT seq FROM sqlite_sequence WHERE name='participant_numbers'").fetchone()[0], 25)
            self.assertEqual(db.execute('PRAGMA foreign_key_check').fetchall(), [])
        self.assertNotEqual(self.run_import(fixture()).returncode, 0)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 1)

    def test_invalid_snapshot_rolls_back(self):
        data = fixture()
        data['attempts'][0]['participant_id'] = 'd' * 32
        self.assertNotEqual(self.run_import(data).returncode, 0)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM participants').fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 0)

    def test_rejects_reused_number_sequence(self):
        data = fixture()
        data['sequence'] = 1
        self.assertNotEqual(self.run_import(data).returncode, 0)
        with closing(sqlite3.connect(self.db)) as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM participants').fetchone()[0], 0)

    def test_backup_contains_a_valid_snapshot(self):
        self.assertEqual(self.run_import(fixture()).returncode, 0)
        result = subprocess.run([sys.executable, str(ROOT / 'backup.py')], text=True,
                                encoding='utf-8', env=self.env, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        backups = list((self.db.parent / 'backups').glob('quiz-*.sqlite3'))
        self.assertEqual(len(backups), 1)
        with closing(sqlite3.connect(backups[0])) as db:
            self.assertEqual(db.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 1)


if __name__ == '__main__':
    unittest.main()
