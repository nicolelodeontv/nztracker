import assert from 'node:assert/strict';
import test from 'node:test';
import { upsertMemberTableRows } from '../app/lib/member-upsert.mjs';

test('mixed new and existing members use separate upsert batches', async () => {
  const calls=[];
  const capturedAt='2026-10-03T00:00:00.000Z';
  const existing=new Map([
    ['existing',{member_id:'existing',first_seen_at:'2026-09-22T00:00:00.000Z',created_at:'2026-09-22T00:00:00.000Z'}]
  ]);
  const memberRows=[
    {clan_id:'chaos',member_id:'new',current_ign:'Newbie',current_level:80,last_seen_at:capturedAt,updated_at:capturedAt},
    {clan_id:'chaos',member_id:'existing',current_ign:'Veteran',current_level:90,last_seen_at:capturedAt,updated_at:capturedAt}
  ];
  const db={
    from(table){
      assert.equal(table,'rep_tracker_members');
      return{
        upsert:async(rows,options)=>{
          calls.push({rows,options});
          return{error:null};
        }
      };
    }
  };

  await upsertMemberTableRows({db,memberRows,existing,capturedAt});

  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].rows,[
    {...memberRows[0],first_seen_at:capturedAt,created_at:capturedAt}
  ]);
  assert.deepEqual(calls[1].rows,[memberRows[1]]);
  assert.deepEqual(calls.map((call)=>call.options),[
    {onConflict:'clan_id,member_id'},
    {onConflict:'clan_id,member_id'}
  ]);
});
