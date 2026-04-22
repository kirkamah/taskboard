-- Tags scoped to a room. Owner manages them (enforced in UI); anyone with
-- edit rights can attach/detach. RLS stays permissive to match the rest of
-- the app.
CREATE TABLE public.room_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text NOT NULL DEFAULT 'gray',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX room_tags_room_id_idx ON public.room_tags(room_id);
CREATE UNIQUE INDEX room_tags_room_id_name_uniq ON public.room_tags(room_id, lower(name));

CREATE TABLE public.task_tags (
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.room_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (task_id, tag_id)
);
CREATE INDEX task_tags_tag_id_idx ON public.task_tags(tag_id);

ALTER TABLE public.room_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "room_tags_all_authenticated" ON public.room_tags FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "task_tags_all_authenticated" ON public.task_tags FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.room_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_tags;
