-- 1. Extend room_tags so it can also be scoped to a personal board via owner_id.
--    Exactly one of (room_id, owner_id) must be set.
ALTER TABLE public.room_tags
  ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.room_tags ALTER COLUMN room_id DROP NOT NULL;

ALTER TABLE public.room_tags
  ADD CONSTRAINT room_tags_scope_check CHECK ((room_id IS NULL) <> (owner_id IS NULL));

DROP INDEX IF EXISTS public.room_tags_room_id_name_uniq;
CREATE UNIQUE INDEX room_tags_room_name_uniq ON public.room_tags (room_id, lower(name)) WHERE room_id IS NOT NULL;
CREATE UNIQUE INDEX room_tags_owner_name_uniq ON public.room_tags (owner_id, lower(name)) WHERE owner_id IS NOT NULL;
CREATE INDEX room_tags_owner_id_idx ON public.room_tags (owner_id);

-- 2. Task checklist items. UI caps each task at 10 items.
CREATE TABLE public.task_checklist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  text text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_checklist_items_task_id_idx ON public.task_checklist_items(task_id);

ALTER TABLE public.task_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_checklist_all_authenticated" ON public.task_checklist_items FOR ALL USING (true) WITH CHECK (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.task_checklist_items;
