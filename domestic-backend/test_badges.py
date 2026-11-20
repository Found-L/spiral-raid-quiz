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
        self.assertLessEqual({'first', 'three_rounds', 'steady', 'comeback', 'brave', 'almost',
                              'knowledge', 'slow_careful', 'perfect', 'perfect_fast'}, earned)
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

    def test_site_record_boards_count_old_attempts_award_ties_and_change_holders(self):
        a, b, c = self.player('a'), self.player('b'), self.player('c')
        self.attempt(a, 87, elapsed=50)
        self.attempt(a, 87, elapsed=60)
        self.attempt(b, 87, elapsed=50)
        self.attempt(b, 20, elapsed=40)
        self.attempt(c, 87)  # Unknown time never wins a timed board.
        self.db.execute('UPDATE attempts SET quiz_version = ? WHERE participant_id = ?',
                        ('peak-spiral-2026-11-18-v3', a['deviceId']))
        boards, _ = server.honor_boards(self.db)
        by_id = {board['badge']['id']: board for board in boards['boards']}
        self.assertEqual([row['nickname'] for row in by_id['quickest']['entries']], ['b', 'a'])
        self.assertEqual(by_id['site_rounds']['holderCount'], 2)
        self.assertEqual([row['rank'] for row in by_id['site_rounds']['entries']], [1, 1])
        self.assertEqual(by_id['site_perfects']['entries'][0]['value'], 2)
        self.assertEqual(by_id['site_perfect_fast']['holderCount'], 2)
        self.assertLessEqual({'site_rounds', 'site_perfects', 'site_perfect_fast'}, self.earned(a))
        self.assertIn('site_perfect_fast', self.earned(b))
        self.assertNotIn('site_perfect_fast', self.earned(c))
        server.select_badges(self.db, {**a, 'selected': ['site_rounds', 'site_perfect_fast']})
        self.attempt(b, 87, elapsed=30)
        self.assertNotIn('site_rounds', self.earned(a))
        self.assertNotIn('site_perfect_fast', self.earned(a))
        self.assertEqual(server.badges(self.db, a)['selected'], [])
        self.assertLessEqual({'quickest', 'site_rounds', 'site_perfect_fast'}, self.earned(b))
        with self.assertRaises(server.ApiError):
            server.select_badges(self.db, {**a, 'selected': ['site_rounds']})

    def test_site_record_board_limits_visible_rows_but_awards_all_tied_winners(self):
        players = [self.player(str(i)) for i in range(7)]
        for player in players:
            self.attempt(player, 87, elapsed=100)
        boards, winners = server.honor_boards(self.db)
        fastest = boards['boards'][0]
        self.assertEqual(len(fastest['entries']), 5)
        self.assertEqual(fastest['holderCount'], 7)
        self.assertEqual(len(winners['quickest']), 7)
        self.assertTrue(all('quickest' in self.earned(player) for player in players))
        rounds = next(board for board in boards['boards'] if board['badge']['id'] == 'site_rounds')
        self.assertEqual(rounds['entries'], [])  # One attempt is not enough for the rounds record.

    def test_empty_record_boards_do_not_invent_winners(self):
        self.player('a')
        boards, winners = server.honor_boards(self.db)
        self.assertTrue(all(not board['entries'] and board['holderCount'] == 0 for board in boards['boards']))
        self.assertTrue(all(not holders for holders in winners.values()))

    def test_history_preserves_previous_tied_holders_and_pages_all_current_entries(self):
        players = [self.player(digit) for digit in '0123456789abcdef']
        for player in players[:12]:
            self.attempt(player, 87, elapsed=100)
        for player in players[12:]:
            self.attempt(player, 87, elapsed=150)
        self.attempt(players[12], 87, elapsed=80)  # A new record supersedes twelve tied holders.
        summary, _ = server.honor_boards(self.db)
        quickest = summary['boards'][0]
        self.assertEqual((len(quickest['entries']), quickest['holderCount'], quickest['total']), (5, 1, 16))
        current = [server.honor_page(self.db, 'quickest', page, 5) for page in range(1, 5)]
        self.assertEqual(sum(len(item['entries']) for item in current), 16)
        self.assertEqual([entry['rank'] for entry in current[2]['entries'][:2]], [2, 2])
        history = [server.honor_history_page(self.db, 'quickest', page, 5) for page in range(1, 4)]
        entries = [entry for item in history for entry in item['entries']]
        self.assertEqual(len(entries), 13)
        self.assertEqual(sum(entry['current'] for entry in entries), 1)
        self.assertEqual(entries[0]['nickname'], 'c')
        self.assertEqual({entry['nickname'] for entry in entries[1:]}, set('0123456789ab'))
        self.assertEqual([entry['achievedAt'] for entry in entries], sorted((entry['achievedAt'] for entry in entries), reverse=True))
        self.assertNotIn('quickest', self.earned(players[0]))
        self.assertIn('quickest', self.earned(players[12]))
        with self.assertRaises(server.ApiError):
            server.honor_history_page(self.db, 'missing')
        with self.assertRaises(server.ApiError):
            server.honor_page(self.db, 'quickest', 0)

    def test_history_does_not_guess_order_within_one_timestamp(self):
        first, second = self.player('a'), self.player('b')
        self.attempt(first, 87, elapsed=100)
        self.attempt(second, 87, elapsed=50)
        self.db.execute('UPDATE attempts SET submitted_at = 1234')
        history = server.honor_history_page(self.db, 'quickest')
        self.assertEqual([entry['nickname'] for entry in history['entries']], ['b'])

    def test_history_pages_include_all_recorded_holders_newest_first(self):
        inserted = 0
        for total in (0, 1, 19, 20, 21, 39, 40, 41, 101):
            while inserted < total:
                player = {'deviceId': f'{inserted + 1000:032x}', 'secret': 'f' * 64}
                server.profile(self.db, {**player, 'nickname': f'玩家{inserted}'})
                self.db.execute('INSERT INTO badge_record_events VALUES (?, ?, ?)',
                                (player['deviceId'], 'quickest', inserted + 100))
                inserted += 1
            pages = max(1, (total + 19) // 20)
            results = [server.honor_history_page(self.db, 'quickest', page, 20) for page in range(1, pages + 1)]
            entries = [entry for result in results for entry in result['entries']]
            self.assertTrue(all(result['total'] == total and result['pages'] == pages for result in results))
            self.assertEqual([entry['achievedAt'] for entry in entries], list(range(total + 99, 99, -1)))
            self.assertEqual(len({entry['playerNumber'] for entry in entries}), total)

    def test_history_same_time_has_stable_order_across_pages(self):
        a, b = self.player('a'), self.player('b')
        self.db.executemany('INSERT INTO badge_record_events VALUES (?, ?, ?)', [
            (b['deviceId'], 'quickest', 100), (a['deviceId'], 'quickest', 100),
        ])
        entries = [server.honor_history_page(self.db, 'quickest', page, 1)['entries'][0]
                   for page in (1, 2)]
        self.assertEqual([entry['nickname'] for entry in entries], ['a', 'b'])

    def test_tied_current_records_order_by_when_the_score_was_reached(self):
        a, b, c = self.player('a'), self.player('b'), self.player('c')
        self.attempt(a, 87, elapsed=100)
        self.attempt(b, 87, elapsed=100)
        self.attempt(c, 87, elapsed=100)
        self.db.executemany('INSERT INTO attempt_completion_times VALUES (?, ?)', [
            (f'{1:032x}', 300), (f'{2:032x}', 100), (f'{3:032x}', 100),
        ])
        quickest = server.honor_boards(self.db)[0]['boards'][0]
        self.assertEqual([entry['nickname'] for entry in quickest['entries']], ['b', 'c', 'a'])
        self.assertEqual([entry['rank'] for entry in quickest['entries']], [1, 1, 1])
        self.assertEqual([entry['nickname'] for entry in server.honor_page(self.db, 'quickest', 2, 1)['entries']], ['c'])
        self.attempt(a, 87, elapsed=120)
        self.attempt(b, 87, elapsed=120)
        self.attempt(c, 87, elapsed=120)
        self.db.executemany('INSERT INTO attempt_completion_times VALUES (?, ?)', [
            (f'{4:032x}', 500), (f'{5:032x}', 400), (f'{6:032x}', 400),
        ])
        for badge in ('site_rounds', 'site_perfects'):
            self.assertEqual([entry['nickname'] for entry in server.honor_page(self.db, badge)['entries']], ['b', 'c', 'a'])
        self.assertEqual([entry['nickname'] for entry in server.honor_page(self.db, 'site_perfect_fast')['entries']], ['b', 'c', 'a'])

    def test_completion_time_is_saved_once_and_invalid_values_fall_back(self):
        identity = self.player('a')
        answers = {q['id']: q['answer'] for q in server.QUESTIONS}
        payload = {**identity, 'attemptId': 'b' * 32, 'version': server.VERSION, 'answers': answers,
                   'elapsedSeconds': 100, 'completedAt': 1700000000000}
        server.submit(self.db, payload)
        server.submit(self.db, {**payload, 'completedAt': 1800000000000})
        self.assertEqual(self.db.execute('SELECT completed_at FROM attempt_completion_times').fetchone()[0], 1700000000000)
        server.submit(self.db, {**payload, 'attemptId': 'c' * 32, 'completedAt': True})
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempt_completion_times').fetchone()[0], 1)

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

    def test_mistake_rules_always_point_to_wrong_options_in_supported_banks(self):
        for version in server.MISTAKE_VERSIONS:
            questions = {q['id']: q for q in server.BANKS[version]['questions']}
            for badge, rules in server.MISTAKE_RULES.items():
                for question_id, choices in rules.items():
                    if question_id not in questions:
                        continue
                    question = questions[question_id]
                    with self.subTest(version=version, badge=badge, question=question_id):
                        self.assertLessEqual(choices, {item['id'] for item in question['options']})
                        self.assertFalse(choices.intersection(question['answer']))

    def test_mistake_badges_use_actual_choices_and_require_opt_in_to_display(self):
        player = self.player('a')
        answers = {q['id']: list(q['answer']) for q in server.BANK['questions']}
        answers['q089'] = ['a']  # The player carries the wave bomb into the group.
        payload = {**player, 'version': server.VERSION, 'attemptId': 'b' * 32,
                   'answers': answers, 'elapsedSeconds': 600}
        first = server.submit(self.db, payload)
        self.assertEqual(first['correctCount'], len(answers) - 1)
        self.assertIn('demolition', [item['id'] for item in first['triggeredBadges']])
        self.assertEqual(server.submit(self.db, payload), first)
        self.assertIn('demolition', self.earned(player))
        self.assertNotIn('demolition', server.badges(self.db, player)['selected'])
        self.assertNotIn('demolition', [item['id'] for item in server.leaderboard(self.db, latest=True)['entries'][0]['badges']])
        server.select_badges(self.db, {**player, 'selected': ['demolition']})
        self.assertEqual([item['id'] for item in server.leaderboard(self.db, latest=True)['entries'][0]['badges']], ['demolition'])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM attempt_mistake_badges WHERE badge_id = 'demolition'").fetchone()[0], 1)
        server.delete_profile(self.db, player)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM attempt_mistake_badges').fetchone()[0], 0)

    def test_each_mechanic_badge_can_be_unlocked_by_its_actual_choice(self):
        for index, (badge_id, rules) in enumerate(server.MISTAKE_RULES.items(), start=1):
            with self.subTest(badge=badge_id):
                player = self.player(format(index, 'x'))
                answers = {q['id']: list(q['answer']) for q in server.BANK['questions']}
                question_id, choices = next(iter(rules.items()))
                answers[question_id] = [next(iter(choices))]
                result = server.submit(self.db, {**player, 'version': server.VERSION,
                    'attemptId': f'{index:032x}', 'answers': answers})
                self.assertIn(badge_id, {item['id'] for item in result['triggeredBadges']})
                self.assertIn(badge_id, self.earned(player))

    def test_newly_uploaded_v5_answers_can_trigger_but_saved_old_scores_cannot_be_guessed(self):
        player = self.player('a')
        version = 'peak-spiral-2026-11-18-v5'
        answers = {q['id']: list(q['answer']) for q in server.BANKS[version]['questions']}
        answers['q036'] = ['d']
        # Previously uploaded attempts contain scores, not the original choices.
        self.attempt(player, len(answers) - 1)
        self.assertNotIn('demolition', self.earned(player))
        payload = {**player, 'version': version, 'attemptId': 'c' * 32, 'answers': answers}
        server.submit(self.db, payload)
        self.assertIn('demolition', self.earned(player))

    def test_retrying_a_preexisting_score_does_not_invent_original_choices(self):
        player = self.player('a')
        version = 'peak-spiral-2026-11-18-v5'
        answers = {q['id']: list(q['answer']) for q in server.BANKS[version]['questions']}
        answers['q036'] = ['d']
        result = server.grade(answers, version)
        attempt_id = 'b' * 32
        self.db.execute('INSERT INTO attempts VALUES (?, ?, ?, ?, ?, ?)',
                        (attempt_id, player['deviceId'], version, result['correctCount'], result['totalCount'], 1))
        retried = server.submit(self.db, {**player, 'version': version, 'attemptId': attempt_id, 'answers': answers})
        self.assertEqual(retried['triggeredBadges'], [])
        self.assertNotIn('demolition', self.earned(player))

    def test_unrelated_wrong_choice_and_old_bank_do_not_unlock_demolition(self):
        player = self.player('a')
        answers = {q['id']: list(q['answer']) for q in server.BANK['questions']}
        answers['q036'] = ['c']  # Continuing to attack is wrong, but not the crowd-bomb joke.
        server.submit(self.db, {**player, 'version': server.VERSION, 'attemptId': 'd' * 32, 'answers': answers})
        self.assertNotIn('demolition', self.earned(player))
        version = 'peak-spiral-2026-11-18-v4'
        old_answers = {q['id']: list(q['answer']) for q in server.BANKS[version]['questions']}
        question = next(q for q in server.BANKS[version]['questions'] if q['id'] == 'q036')
        old_answers['q036'] = [next(o['id'] for o in question['options'] if o['id'] not in question['answer'])]
        server.submit(self.db, {**player, 'version': version, 'attemptId': 'e' * 32, 'answers': old_answers})
        self.assertNotIn('demolition', self.earned(player))


if __name__ == '__main__':
    unittest.main()
