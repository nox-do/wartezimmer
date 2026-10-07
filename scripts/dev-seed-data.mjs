import fs from 'node:fs';
import {
  countRoomOccupants,
  normalizeRoomPanelsSettings,
  listEnabledRooms,
  WAITING_ROOM_LOCATION_ID,
} from '@praxis-flow/domain';

export const DEV_ROOM_LABELS = [
  'Empfang',
  'Dr. Jonas Bergmann',
  'Untersuchung 1',
  'Labor',
  'Infekt-Wartezimmer',
];

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
export function seedDevData(core, { patients = 19, rooms = 5 } = {}) {
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
  if (!settings.topics.some((topic) => topic.topicId === 'infekt')) {
    settings.topics.push({
      topicId: 'infekt',
      label: 'Infekt / Erkältung',
      laneCode: 'I',
      defaultRoomId: WAITING_ROOM_LOCATION_ID,
      iconId: 'clock',
      accentColor: '#d64545',
      enabled: true,
      availableFrom: null,
      availableTo: null,
      sortOrder: settings.topics.length + 1,
    });
  }
  const topics = settings.topics.filter(
    (topic) => topic.enabled && !['dev-demo', 'mfa'].includes(topic.topicId),
  );
  if (!topics.length) throw new Error('Bitte mindestens ein reguläres Praxis-Anliegen aktivieren.');

  // Only the legacy seed topic is retired; other visits remain untouched.
  const legacy = core.listQueue().filter((row) => row.topicId === 'dev-demo');
  for (const row of legacy) core.cancelQueueVisit(row.id, 'dev-seed');

  const nextRooms = settings.rooms.map((room) =>
    room.roomId.startsWith('dev-room-') && room.roomLabel.startsWith('Demo · ')
      ? { ...room, roomLabel: room.roomLabel.replace('Demo · ', '') }
      : room,
  );
  let index = 1;
  while (listEnabledRooms(nextRooms).length < rooms) {
    const roomId = `dev-room-${index++}`;
    if (nextRooms.some((room) => room.roomId === roomId)) continue;
    let number = 1;
    while (nextRooms.some((room) => room.roomLabel === `Untersuchung ${number}`)) number++;
    const roomLabel =
      DEV_ROOM_LABELS.find((label) => !nextRooms.some((room) => room.roomLabel === label)) ??
      `Untersuchung ${number}`;
    nextRooms.push({
      roomId,
      roomLabel,
      enabled: true,
      defaultCallTarget: false,
      maxOccupancy: roomLabel === 'Infekt-Wartezimmer' ? 2 : 1,
      panels: normalizeRoomPanelsSettings(null),
    });
  }
  core.updateOpsSettings({
    rooms: nextRooms,
    topics: settings.topics.filter((topic) => topic.topicId !== 'dev-demo'),
  });
  const practiceRooms = listEnabledRooms(nextRooms).slice(0, rooms);
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
  const lastNames = [
    'Keller',
    'Hoffmann',
    'Weber',
    'Schneider',
    'Fischer',
    'Wagner',
    'Richter',
    'Koch',
    'Neumann',
    'Braun',
  ];
  const queue = core.listQueue();
  const missingContacts = DEV_CONTACTS.filter(
    (contact) =>
      !queue.some((row) => row.identityRef === `${contact.firstName} ${contact.lastName}`),
  );
  const seedVisitIds = new Set();
  let added = 0;
  // Top up the active practice population, including existing visits. Anonymous
  // registrations have no identityRef, just like check-ins without a name.
  for (let i = queue.length; i < patients; i++) {
    const contact = missingContacts.shift();
    const named = contact || i % 3 !== 1;
    const ticket = core.createTicket({
      topicId: topics[i % topics.length].topicId,
      authPath: named ? 'name_dob' : 'none',
      ...(named
        ? {
            identityRef: contact
              ? `${contact.firstName} ${contact.lastName}`
              : `${firstNames[i % firstNames.length]} ${lastNames[Math.floor(i / firstNames.length) % lastNames.length]}`,
          }
        : {}),
      ...(contact ? { checkinPhone: contact.phone } : {}),
    });
    if (ticket.queueStatus !== 'waiting') core.returnToWaiting(ticket.visitId, 'dev-seed');
    seedVisitIds.add(ticket.visitId);
    added++;
  }
  const currentQueue = core.listQueue();
  const waiting = currentQueue.filter(
    (row) => seedVisitIds.has(row.id) && row.status === 'waiting',
  );
  let placed = 0;
  for (const room of practiceRooms) {
    const occupied = countRoomOccupants(currentQueue, room.roomId);
    const free = Math.max(
      0,
      Math.min(room.maxOccupancy ?? 1, room.roomLabel === 'Infekt-Wartezimmer' ? 2 : 1) - occupied,
    );
    for (let i = 0; i < free && waiting.length; i++) {
      const candidate = waiting.findIndex((row) => {
        const infection = /infekt|erkält/i.test(row.topicLabel);
        if (room.roomLabel === 'Infekt-Wartezimmer') return infection;
        if (infection) return false;
        if (room.roomLabel === 'Labor') return /blut|labor/i.test(row.topicLabel);
        if (room.roomLabel === 'Empfang')
          return row.topicId === 'rezept' || row.topicId === 'termin-brauche';
        if (room.roomLabel === 'Dr. Jonas Bergmann')
          return row.topicId === 'offen' || row.topicId === 'termin-habe';
        if (room.roomLabel === 'Untersuchung 1') return row.topicId === 'termin-habe';
        return true;
      });
      if (candidate < 0) break;
      const [patient] = waiting.splice(candidate, 1);
      core.placeVisitInRoom(patient.id, room.roomId, room.roomLabel, undefined, 'dev-seed');
      placed++;
    }
  }
  return {
    added,
    placed,
    retiredLegacyPatients: legacy.length,
    activePatients: core.listQueue().length,
    rooms: practiceRooms.length,
  };
}
