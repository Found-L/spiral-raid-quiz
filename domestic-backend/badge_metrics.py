"""Aggregate existing achievements and record-holder history without exposing players."""

import itertools
import threading
import time

_lock = threading.Lock()
_cache = {}
_revision = 0


def invalidate():
    global _revision
    with _lock:
        _revision += 1
        _cache.clear()


def record_current(db, honor_boards):
    _, winners = honor_boards(db)
    now = int(time.time() * 1000)
    db.executemany('INSERT OR IGNORE INTO badge_record_events VALUES (?, ?, ?)',
                   ((participant, badge, now) for badge, people in winners.items() for participant in people))


def _history(db, categories):
    has_completed = db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='attempt_completion_times'").fetchone()
    completed = 'COALESCE(c.completed_at, a.submitted_at)' if has_completed else 'a.submitted_at'
    join = 'LEFT JOIN attempt_completion_times c ON c.attempt_id=a.id' if has_completed else ''
    rows = db.execute('''SELECT a.participant_id, a.correct_count, a.total_count, t.elapsed_seconds,
                         ''' + completed + ''' AS completed_at FROM attempts a
                         JOIN participants p ON p.id=a.participant_id
                         LEFT JOIN attempt_timings t ON t.attempt_id=a.id ''' + join +
                      ' ORDER BY completed_at, a.id')
    values = {badge: {} for badge, _, _, _ in categories}
    records = {badge: None for badge, _, _, _ in categories}
    achieved = {badge: set() for badge, _, _, _ in categories}
    for _, batch in itertools.groupby(rows, key=lambda row: row['completed_at']):
        changed = {badge: set() for badge, _, _, _ in categories}
        for row in batch:
            player = row['participant_id']
            perfect = row['correct_count'] == row['total_count']
            elapsed = row['elapsed_seconds']
            for badge, _, direction, minimum in categories:
                previous = values[badge].get(player)
                if badge == 'site_rounds':
                    value = (previous or 0) + 1
                elif badge == 'site_perfects':
                    if not perfect:
                        continue
                    value = (previous or 0) + 1
                else:
                    if elapsed is None or (badge == 'site_perfect_fast' and not perfect):
                        continue
                    value = elapsed if previous is None else min(previous, elapsed)
                values[badge][player] = value
                if value < minimum:
                    continue
                changed[badge].add(player)
                best = records[badge]
                if best is None or (value < best if direction == 'asc' else value > best):
                    records[badge] = value
        for badge, _, _, _ in categories:
            achieved[badge].update(player for player in changed[badge] if values[badge][player] == records[badge])
    for row in db.execute('SELECT participant_id, badge_id FROM badge_record_events'):
        if row['badge_id'] in achieved:
            achieved[row['badge_id']].add(row['participant_id'])
    return achieved


def counts(db, badges, _mistakes, badge_states, honor_boards, categories):
    path = db.execute('PRAGMA database_list').fetchone()[2]
    now = time.monotonic()
    with _lock:
        revision = _revision
        cached = _cache.get(path) if path else None
        if cached and cached[0] > now:
            return cached[1]
    started = not db.in_transaction
    if started:
        db.execute('BEGIN')
    try:
        ids = [row[0] for row in db.execute('SELECT DISTINCT participant_id FROM attempts')]
        all_counts = {badge['id']: 0 for badge in badges}
        for offset in range(0, len(ids), 250):
            states, _ = badge_states(db, ids[offset:offset + 250])
            for state in states.values():
                for badge_id in state['earned']:
                    if badge_id in all_counts:
                        all_counts[badge_id] += 1
        _, winners = honor_boards(db)
        history = _history(db, categories)
        result = {}
        for badge in badges:
            badge_id = badge['id']
            if badge_id in history:
                result[badge_id] = {'historyCount': len(history[badge_id]), 'currentCount': len(winners[badge_id])}
            else:
                result[badge_id] = {'count': all_counts[badge_id]}
        if started:
            db.execute('COMMIT')
    except Exception:
        if started:
            db.execute('ROLLBACK')
        raise
    with _lock:
        if path and revision == _revision:
            _cache[path] = (time.monotonic() + 30, result)
    return result
