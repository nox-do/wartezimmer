import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { seedDevData } from './dev-seed-data.mjs';

test('dev seed rejects production and invalid counts before touching the database', () => {
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = 'production';
    assert.throws(() => seedDevData(null), /NODE_ENV/);
    process.env.NODE_ENV = 'test';
    assert.throws(() => seedDevData(null, { patients: 0 }), /patients/);
    assert.throws(() => seedDevData(null, { rooms: 21 }), /rooms/);
  } finally {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
  }
});

test('dev seed fills a real temporary database, preserves visits and tops up repeatedly', () => {
  execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
    input: `
      import assert from 'node:assert/strict';
      import {mkdtempSync,rmSync} from 'node:fs';
      import {tmpdir} from 'node:os';
      import {join} from 'node:path';
      import {seedDevData, DEV_CONTACTS, appendDevContacts} from './scripts/dev-seed-data.mjs';
      import {readFileSync,writeFileSync} from 'node:fs';
      import {CoreDatabase} from './app/src/shared/db/database.ts';
      process.env.NODE_ENV='test';
      const dir=mkdtempSync(join(tmpdir(),'pf-dev-seed-'));
      process.env.CONTACT_LOOKUP_BASE_PATH=join(dir,'imports');
      try {
        const core=new CoreDatabase(join(dir,'app.db'));
        core.resetBusinessDay();core.setCheckinLock(false);
        const original=core.createTicket({topicId:'offen',authPath:'name_dob',identityRef:'Existing'});
        const originalRooms=core.getOpsSettings().rooms;
        const result=seedDevData(core,{patients:30,rooms:6});
        assert.equal(result.added,29);assert(result.placed > 0);assert.equal(result.activePatients,30);
        for(const contact of DEV_CONTACTS){
          const row=core.listQueue().find(row=>row.identityRef===contact.firstName+' '+contact.lastName);
          assert.equal(row?.checkinPhone,contact.phone);
        }
        const csvPath=join(dir,'imports','kontakte.csv');
        const existingCsv='vorname;nachname;mobil;geburtsdatum\\nAlex;Alt;017611111111;01.01.1980\\n';
        writeFileSync(csvPath,existingCsv);
        appendDevContacts(csvPath);
        const csv=readFileSync(csvPath,'utf8');
        assert(csv.startsWith(existingCsv));
        assert.equal(csv.trim().split('\\n').length,5);
        appendDevContacts(csvPath);
        assert.equal(readFileSync(csvPath,'utf8'),csv);

        const population=core.listQueue();
        assert(population.some(row=>row.identityRef===null));
        assert(new Set(population.map(row=>row.topicId)).size>=5);
        assert(!population.some(row=>row.topicId==='dev-demo'));
        assert(!core.getOpsSettings().topics.some(topic=>topic.topicId==='dev-demo'));
        assert(!core.getOpsSettings().rooms.some(room=>room.roomLabel.includes('Demo')));
        assert(population.some(row=>row.id===original.visitId && row.identityRef==='Existing'));
        assert.deepEqual(core.getOpsSettings().rooms.slice(0,originalRooms.length),originalRooms);
        assert.equal(seedDevData(core,{patients:30,rooms:6}).added,0);
        assert.equal(seedDevData(core,{patients:35,rooms:7}).added,5);
        assert.equal(core.getOpsSettings().rooms.filter(room=>room.enabled).length,7);

        // Upgrade the previous seed without affecting unrelated practice visits.
        const baseTopic=core.getOpsSettings().topics[0];
        core.updateOpsSettings({topics:[...core.getOpsSettings().topics,
          {...baseTopic,topicId:'dev-demo',label:'Demo · Sprechstunde',laneCode:'D'}]});
        const legacy=core.createTicket({topicId:'dev-demo',authPath:'name_dob',identityRef:'Demo · Anna Beispiel'});
        const migrated=seedDevData(core,{patients:35,rooms:7});
        assert.equal(migrated.retiredLegacyPatients,1);
        assert(!core.listQueue().some(row=>row.id===legacy.visitId));
        assert(!core.getOpsSettings().topics.some(topic=>topic.topicId==='dev-demo'));
        assert(core.listQueue().some(row=>row.id===original.visitId));
        core.setCheckinLock(true);
        const count=core.listQueue().length;
        assert.throws(()=>seedDevData(core),/Praxistag/);
        assert.equal(core.listQueue().length,count);
        core.resetBusinessDay();core.setCheckinLock(false);
        const screenshot=seedDevData(core);
        assert.equal(screenshot.activePatients,19);
        assert.equal(screenshot.rooms,5);
        assert.equal(screenshot.placed,6);
        assert.equal(core.listQueue().filter(row=>row.status==='waiting').length,13);
        const infectionRoom=core.getOpsSettings().rooms.find(room=>room.roomLabel==='Infekt-Wartezimmer');
        const infectionPatients=core.listQueue().filter(row=>row.roomId===infectionRoom.roomId);
        assert.equal(infectionPatients.length,2);
        assert(infectionPatients.every(row=>row.topicId==='infekt'));
      } finally {rmSync(dir,{recursive:true,force:true});}
    `,
  });
});
