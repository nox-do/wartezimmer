import { openDb } from './open-db.js';

openDb({ reset: true }).close();
console.log('Flow Core DB reset.');
