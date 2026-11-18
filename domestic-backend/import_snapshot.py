#!/usr/bin/env python3
"""Import a validated, quiesced D1 snapshot into an empty local database.

The snapshot is read from one line on standard input so player identifiers and
credential hashes need not be written to an intermediate file.
"""

import json
import sys
from contextlib import closing

from server import database, initialize

TABLES = {
    'participants': ('id', 'secret_hash', 'game_id', 'game_id_key', 'nickname', 'created_at', 'updated_at'),
    'participant_numbers': ('number', 'participant_id'),
    'attempts': ('id', 'participant_id', 'quiz_version', 'correct_count', 'total_count', 'submitted_at'),
}


def main():
    snapshot = json.loads(sys.stdin.readline())
    if set(snapshot) != {*TABLES, 'sequence'}:
        raise ValueError('Unexpected snapshot fields')
    if not isinstance(snapshot['sequence'], int) or snapshot['sequence'] < 0:
        raise ValueError('Invalid player-number sequence')
    for table, columns in TABLES.items():
        if not isinstance(snapshot[table], list):
            raise ValueError(f'Invalid {table} rows')
        if any(not isinstance(row, dict) or set(row) != set(columns) for row in snapshot[table]):
            raise ValueError(f'Unexpected {table} columns')
    initialize()
    with closing(database()) as db:
        db.execute('BEGIN IMMEDIATE')
        try:
            for table, columns in TABLES.items():
                if db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]:
                    raise ValueError(f'Target table {table} is not empty')
                placeholders = ','.join('?' for _ in columns)
                db.executemany(f"INSERT INTO {table} ({','.join(columns)}) VALUES ({placeholders})",
                               [[row[column] for column in columns] for row in snapshot[table]])
            highest = db.execute('SELECT COALESCE(MAX(number), 0) FROM participant_numbers').fetchone()[0]
            if snapshot['sequence'] < highest:
                raise ValueError('Sequence is below an existing player number')
            db.execute("DELETE FROM sqlite_sequence WHERE name = 'participant_numbers'")
            db.execute("INSERT INTO sqlite_sequence(name, seq) VALUES ('participant_numbers', ?)", (snapshot['sequence'],))
            if db.execute('PRAGMA foreign_key_check').fetchone():
                raise ValueError('Snapshot has broken references')
            db.execute('COMMIT')
        except Exception:
            db.execute('ROLLBACK')
            raise
    print('Imported: ' + ', '.join(f'{table}={len(snapshot[table])}' for table in TABLES))


if __name__ == '__main__':
    main()
