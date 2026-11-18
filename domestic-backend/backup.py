#!/usr/bin/env python3
"""Create a consistent SQLite backup while the leaderboard stays online."""

import os
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

database = Path(os.environ.get('QUIZ_DATABASE', '/var/lib/spiral-raid-quiz/quiz.sqlite3'))
directory = database.parent / 'backups'
if not database.is_file():
    raise SystemExit('Quiz database does not exist')
directory.mkdir(mode=0o700, exist_ok=True)
stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
target = directory / f'quiz-{stamp}.sqlite3'
temp = directory / f'.quiz-{stamp}-{os.getpid()}.tmp'
try:
    with closing(sqlite3.connect(f'file:{database}?mode=ro', uri=True)) as source:
        with closing(sqlite3.connect(temp)) as destination:
            source.backup(destination)
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise RuntimeError('Backup integrity check failed')
    os.chmod(temp, 0o600)
    os.replace(temp, target)
finally:
    if temp.exists():
        temp.unlink()
for old in sorted(directory.glob('quiz-*.sqlite3'), reverse=True)[14:]:
    old.unlink()
print(f'Backup created: {target.name}')
