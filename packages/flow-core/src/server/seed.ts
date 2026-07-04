import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { journeySteps, journeyTemplates, locations, queues, routingRules, surfaceDisplayRules, surfaces, topics } from './seed-data.js';

function insertMany(db: DatabaseSync, sql: string, rows: readonly (readonly SQLInputValue[])[]): void {
  const stmt = db.prepare(sql);
  for (const row of rows) stmt.run(...row);
}

export function seedIfEmpty(db: DatabaseSync): void {
  const count = (db.prepare('SELECT COUNT(*) AS count FROM topics').get() as { count: number }).count;
  if (count > 0) return;
  insertMany(db, 'INSERT INTO topics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', topics);
  insertMany(db, 'INSERT INTO locations VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', locations);
  insertMany(db, 'INSERT INTO queues VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', queues);
  insertMany(db, 'INSERT INTO surfaces VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', surfaces);
  insertMany(db, 'INSERT INTO surface_display_rules VALUES (?, ?, ?, ?, ?, ?, ?)', surfaceDisplayRules);
  insertMany(db, 'INSERT INTO journey_templates VALUES (?, ?, ?, ?)', journeyTemplates);
  insertMany(db, 'INSERT INTO journey_steps VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', journeySteps);
  insertMany(db, 'INSERT INTO routing_rules VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', routingRules);
}
