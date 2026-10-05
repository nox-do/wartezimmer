import fs from 'node:fs';
import {
  countRoomOccupants,
  normalizeRoomPanelsSettings,
  WAITING_ROOM_LOCATION_ID,
} from '@praxis-flow/domain';

export const DEV_CONTACTS = [
  { firstName: 'Lena', lastName: 'Sommer', phone: '+4917600000011', birthDate: '12.03.1985' },
  { firstName: 'Paul', lastName: 'Winter', phone: '+4917600000022', birthDate: '24.09.1972' },
  { firstName: 'Nora', lastName: 'Berg', phone: '+4917600000033', birthDate: '07.11.1994' },
];

/** Append examples without replacing an existing development contacts file. */
export function appendDevContacts(csvPath) {
  if (!['development', 'test'].includes(process.env.NODE_ENV))
    throw new Error('Nur für Entwicklung.');
  const csv = fs.readFileSync(csvPath, 'utf8');
  if (csv.split(/\r?\n/)[0].replace(/^\uFEFF/, '') !== 'vorname;nachname;mobil;geburtsdatum') {
    console.log(
      'Beispielkontakte nicht ergänzt: kontakte.csv verwendet ein anderes Spaltenformat.',
    );
    return;
  }
  const names = new Set(csv.split(/\r?\n/).map((row) => row.split(';').slice(0, 2).join(';')));
  const missing = DEV_CONTACTS.filter(
    (contact) => !names.has(`${contact.firstName};${contact.lastName}`),
  );
  if (missing.length) {
    fs.appendFileSync(
      csvPath,
      (csv.endsWith('\n') ? '' : '\n') +
        missing
          .map(
            (contact) =>
              `${contact.firstName};${contact.lastName};${contact.phone};${contact.birthDate}\n`,
          )
          .join(''),
    );
  }
}

/** Populate a development database through the normal visit/room workflows. */
export function seedDevData(core, { patients = 30, rooms = 6 } = {}) {
  if (!['development', 'test'].includes(process.env.NODE_ENV)) {
    throw new Error('Dev-Daten sind nur mit NODE_ENV=development erlaubt.');
  }
  for (const [name, value, max] of [
    ['patients', patients, 200],
    ['rooms', rooms, 20],
  ]) {
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`${name}: Ganzzahl zwischen 1 und ${max} erforderlich.`);
    }
  }
  if (core.isEffectiveCheckinLocked() || core.getDayLifecycleState().dayClosePhase !== 'open') {
    throw new Error(
      'Bitte zuerst in der MFA den aktuellen Praxistag starten und den Check-in freigeben. Es werden keine Tagesdaten gelöscht.',
    );
  }
  const settings = core.getOpsSettings();
  const demoRooms = Array.from({ length: rooms }, (_, i) => {
    const roomId = `dev-room-${i + 1}`;
    return (
      settings.rooms.find((room) => room.roomId === roomId) ?? {
        roomId,
        roomLabel: `Demo · Raum ${i + 1}`,
        enabled: true,
        defaultCallTarget: false,
        maxOccupancy: 2,
        panels: normalizeRoomPanelsSettings(null),
      }
    );
  });
  const newRooms = demoRooms.filter(
    (room) => !settings.rooms.some((existing) => existing.roomId === room.roomId),
  );
  const topicId = 'dev-demo';
  if (!settings.topics.some((topic) => topic.topicId === topicId) || newRooms.length) {
    core.updateOpsSettings({
      rooms: [...settings.rooms, ...newRooms],
      topics: settings.topics.some((topic) => topic.topicId === topicId)
        ? settings.topics
        : [
            ...settings.topics,
            {
              topicId,
              label: 'Demo · Sprechstunde',
              laneCode: 'D',
              defaultRoomId: WAITING_ROOM_LOCATION_ID,
              iconId: null,
              accentColor: '#16a34a',
              enabled: true,
              availableFrom: null,
              availableTo: null,
              sortOrder: settings.topics.length,
            },
          ],
    });
  }
  let added = 0;
  for (const contact of DEV_CONTACTS.slice(0, patients)) {
    const identityRef = `Demo · ${contact.firstName} ${contact.lastName}`;
    if (
      !core.listQueue().some((row) => row.topicId === topicId && row.identityRef === identityRef)
    ) {
      core.createTicket({
        topicId,
        authPath: 'name_dob',
        identityRef,
        checkinPhone: contact.phone,
      });
      added++;
    }
  }
  const existing = core.listQueue().filter((row) => row.topicId === topicId);
  const firstNames = [
    'Anna',
    'Ben',
    'Clara',
    'David',
    'Emilia',
    'Felix',
    'Greta',
    'Hannes',
    'Ida',
    'Jonas',
  ];
  const lastNames = ['Beispiel', 'Mustermann', 'Musterfrau', 'Testmann', 'Demofrau', 'Testberg'];
  for (let i = existing.length; i < patients; i++) {
    core.createTicket({
      topicId,
      authPath: 'name_dob',
      identityRef: `Demo · ${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length) % lastNames.length]}`,
    });
    added++;
  }
  // Fill each demo room to capacity; retain existing placements and other patients.
  const queue = core.listQueue();
  const waiting = queue.filter((row) => row.topicId === topicId && row.status === 'waiting');
  let placed = 0;
  for (const room of demoRooms.filter((room) => room.enabled)) {
    const occupied = countRoomOccupants(queue, room.roomId);
    const free = Math.max(0, Math.min(room.maxOccupancy ?? 2, 2) - occupied);
    for (let i = 0; i < free && waiting.length; i++) {
      const patient = waiting.shift();
      core.placeVisitInRoom(patient.id, room.roomId, room.roomLabel, undefined, 'dev-seed');
      placed++;
    }
  }
  return {
    added,
    placed,
    demoPatients: core.listQueue().filter((row) => row.topicId === topicId).length,
    rooms: demoRooms.length,
  };
}
