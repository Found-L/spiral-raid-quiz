import tempfile
import unittest
from pathlib import Path

import server


class NewHonorsTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_database = server.DATABASE
        server.DATABASE = Path(self.temp.name) / 'quiz.sqlite3'
        server.initialize()
        self.db = server.database()
        self.player = {'deviceId': 'a' * 32, 'secret': 'f' * 64}
        server.profile(self.db, {**self.player, 'nickname': '玩家'})
        self.questions = server.BANK['questions']
        self.answers = {q['id']: list(q['answer']) for q in self.questions}
        self.order = [q['id'] for q in self.questions]
        self.number = 0

    def tearDown(self):
        self.db.close()
        server.DATABASE = self.old_database
        self.temp.cleanup()

    def wrong_answers(self, ids, version=None):
        bank = server.BANKS[version or server.VERSION]
        answers = {q['id']: list(q['answer']) for q in bank['questions']}
        for question in bank['questions']:
            if question['id'] in ids:
                answers[question['id']] = [next(o['id'] for o in question['options']
                                                if o['id'] not in question['answer'])]
        return answers

    def submit(self, answers, version=None, order=None):
        self.number += 1
        body = {**self.player, 'version': version or server.VERSION,
                'attemptId': f'{self.number:032x}', 'answers': answers}
        if order is not None:
            body['questionOrder'] = order
        return server.submit(self.db, body), body

    def test_sections_topics_and_display_order_come_from_checked_answers(self):
        result, _ = self.submit(self.answers, order=self.order)
        honors = {badge['id'] for badge in result['triggeredBadges']}
        self.assertLessEqual({'twins_expert', 'spirit_expert', 'witch_expert', 'heal_expert',
                              'lamp_expert', 'spider_expert', 'right_streak'}, honors)
        self.assertNotIn('wrong_streak', honors)
        answers = self.wrong_answers({'q014'})
        _, earned = server.analyze_attempt(answers, server.VERSION, self.order)
        self.assertNotIn('twins_expert', earned)
        self.assertNotIn('heal_expert', earned)
        self.assertIn('spirit_expert', earned)
        old_version = 'peak-spiral-2026-11-18-v9'
        old_answers = self.wrong_answers(set(), old_version)
        _, old_earned = server.analyze_attempt(old_answers, old_version, None)
        self.assertIn('twins_expert', old_earned)
        self.assertNotIn('heal_expert', old_earned)
        self.assertNotIn('right_streak', old_earned)

    def test_streaks_use_final_answers_in_display_order_and_bad_order_is_rejected(self):
        wrong_ids = set(self.order[:5])
        answers = self.wrong_answers(wrong_ids)
        _, earned = server.analyze_attempt(answers, server.VERSION, self.order)
        self.assertIn('wrong_streak', earned)
        interleaved = []
        for i in range(5):
            interleaved.extend([self.order[i], self.order[5 + i]])
        interleaved.extend(self.order[10:])
        _, earned = server.analyze_attempt(answers, server.VERSION, interleaved)
        self.assertNotIn('wrong_streak', earned)
        with self.assertRaises(server.ApiError):
            self.submit(answers, order=[self.order[0]] * len(self.order))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 0)

    def test_repeat_question_is_private_and_requires_three_new_consecutive_uploads(self):
        answers = self.wrong_answers({'q001'})
        first, body = self.submit(answers, order=self.order)
        self.assertEqual(server.submit(self.db, body), first)  # retry is idempotent
        self.submit(answers)
        self.assertEqual(server.badges(self.db, self.player)['repeatQuestions'], [])
        third, _ = self.submit(answers)
        self.assertIn('repeat_wrong', {b['id'] for b in third['triggeredBadges']})
        catalog = server.badges(self.db, self.player)
        self.assertEqual([item['id'] for item in catalog['repeatQuestions']], ['q001'])
        self.assertNotIn('repeat_wrong', catalog['selected'])
        server.select_badges(self.db, {**self.player, 'selected': ['repeat_wrong']})
        self.assertEqual(server.badges(self.db, self.player)['selected'], ['repeat_wrong'])
        self.submit(self.answers)
        catalog = server.badges(self.db, self.player)
        self.assertEqual(catalog['repeatQuestions'], [])
        self.assertTrue(next(b for b in catalog['badges'] if b['id'] == 'repeat_wrong')['earned'])
        server.delete_profile(self.db, self.player)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempt_analysis').fetchone()[0], 0)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempt_wrong_questions').fetchone()[0], 0)

    def test_missing_old_detail_and_bank_changes_break_the_chain(self):
        answers = self.wrong_answers({'q001'})
        self.submit(answers)
        # A previously uploaded score has no per-question detail.
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        ('b' * 32, self.player['deviceId'], server.VERSION, 1, len(self.order), 1))
        third, _ = self.submit(answers)
        self.assertNotIn('repeat_wrong', {b['id'] for b in third['triggeredBadges']})
        self.assertEqual(server.badges(self.db, self.player)['repeatQuestions'], [])
        self.submit(answers)
        other_version = 'peak-spiral-2026-11-18-v9'
        self.submit(self.wrong_answers({'q001'}, other_version), version=other_version)
        self.submit(answers)
        result, _ = self.submit(answers)
        self.assertNotIn('repeat_wrong', {b['id'] for b in result['triggeredBadges']})
        self.assertEqual(server.badges(self.db, self.player)['repeatQuestions'], [])
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempt_analysis').fetchone()[0], 6)

    def test_different_wrong_questions_never_create_a_repeat(self):
        for question_id in ('q001', 'q002', 'q003'):
            result, _ = self.submit(self.wrong_answers({question_id}))
        self.assertNotIn('repeat_wrong', {b['id'] for b in result['triggeredBadges']})
        self.assertEqual(server.badges(self.db, self.player)['repeatQuestions'], [])


if __name__ == '__main__':
    unittest.main()
