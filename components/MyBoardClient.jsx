'use client';

import { useEffect, useState } from 'react';
import BoardBody from '@/components/BoardBody';
import TagsPanel from '@/components/TagsPanel';
import { createClient } from '@/lib/supabase/client';

export default function MyBoardClient({ userId }) {
  const supabase = createClient();
  const [tags, setTags] = useState([]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const { data } = await supabase
        .from('room_tags')
        .select('id, name, color, created_at')
        .eq('owner_id', userId)
        .is('room_id', null)
        .order('created_at', { ascending: true });
      if (alive) setTags(data || []);
    };
    load();
    const channel = supabase
      .channel(`personal-tags-${userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'room_tags', filter: `owner_id=eq.${userId}` },
        () => load()
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(channel); };
  }, [userId]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
      <div className="lg:col-span-3">
        <BoardBody scope="personal" userId={userId} canEdit={true} tags={tags} />
      </div>
      <div>
        <TagsPanel ownerId={userId} tags={tags} />
      </div>
    </div>
  );
}
