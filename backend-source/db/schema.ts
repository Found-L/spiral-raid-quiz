import { integer, sqliteTable, text, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const participants = sqliteTable('participants', {
  id: text('id').primaryKey(),
  secretHash: text('secret_hash').notNull(),
  gameId: text('game_id').notNull(),
  gameIdKey: text('game_id_key').notNull(),
  nickname: text('nickname').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (t) => [uniqueIndex('participants_game_id_key').on(t.gameIdKey)]);

export const attempts = sqliteTable('attempts', {
  id: text('id').primaryKey(),
  participantId: text('participant_id').notNull().references(() => participants.id),
  quizVersion: text('quiz_version').notNull(),
  correctCount: integer('correct_count').notNull(),
  totalCount: integer('total_count').notNull(),
  submittedAt: integer('submitted_at').notNull(),
}, (t) => [index('attempts_version_participant').on(t.quizVersion, t.participantId)]);
