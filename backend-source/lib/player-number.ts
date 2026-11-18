export function assignPlayerNumbers(database: D1Database, participantIds: string[]) {
  return database.prepare(`
    INSERT INTO participant_numbers (participant_id)
    SELECT p.id FROM participants p
    JOIN json_each(?) AS requested ON requested.value = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM participant_numbers n WHERE n.participant_id = p.id
    )
    ON CONFLICT(participant_id) DO NOTHING
  `).bind(JSON.stringify(participantIds));
}
