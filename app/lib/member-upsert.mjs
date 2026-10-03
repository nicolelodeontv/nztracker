export async function upsertMemberTableRows({db,memberRows,existing,capturedAt}) {
  const newRows=[];
  const existingRows=[];
  for(const row of memberRows){
    if(existing.has(String(row.member_id))){
      existingRows.push(row);
    }else{
      newRows.push({...row,first_seen_at:capturedAt,created_at:capturedAt});
    }
  }

  for(const rows of [newRows,existingRows]){
    if(!rows.length)continue;
    const {error}=await db.from('rep_tracker_members').upsert(rows,{onConflict:'clan_id,member_id'});
    if(error)throw error;
  }
}
