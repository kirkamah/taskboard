// Keys match the permission strings the DB function user_has_permission()
// reads out of room_roles.permissions jsonb. The UI uses this list to render
// the role editor; the server is the source of truth for enforcement.
export const PERMISSIONS = [
  'create_tasks',
  'edit_any_task',
  'delete_any_task',
  'assign_members',
  'manage_tags',
  'manage_checklists',
  'approve_completion_requests',
  'manage_join_requests',
  'kick_members',
  'manage_roles',
  'manage_room_settings',
];

// Legacy alias — kept because a couple of call sites in this file still use it.
export const PERMISSION_KEYS = PERMISSIONS;

export const PERMISSION_META = {
  create_tasks: {
    label: 'Создавать задачи',
    hint: 'Может добавлять новые задачи в комнате.',
  },
  edit_any_task: {
    label: 'Редактировать любые задачи',
    hint: 'Может изменять название, описание, срочность, дедлайн и другие поля у задач, созданных любым участником. Свои задачи участник может редактировать всегда.',
  },
  delete_any_task: {
    label: 'Удалять любые задачи',
    hint: 'Может удалять задачи, созданные другими. Свои задачи участник может удалять всегда.',
  },
  assign_members: {
    label: 'Назначать участников',
    hint: 'Может назначать и снимать участников с задач.',
  },
  manage_tags: {
    label: 'Управлять тегами',
    hint: 'Может создавать, переименовывать и удалять теги комнаты.',
  },
  manage_checklists: {
    label: 'Управлять чек-листами',
    hint: 'Может добавлять и удалять пункты в чек-листах внутри задач.',
  },
  approve_completion_requests: {
    label: 'Одобрять запросы на выполнение',
    hint: 'Может одобрять или отклонять запросы зрителей на отметку задачи как выполненной.',
  },
  manage_join_requests: {
    label: 'Одобрять заявки на вступление',
    hint: 'Может принимать или отклонять заявки на вступление в закрытую комнату.',
  },
  kick_members: {
    label: 'Удалять участников',
    hint: 'Может удалять (кикать) других участников из комнаты. Не даёт права банить — это доступно только Владельцу.',
  },
  manage_roles: {
    label: 'Управлять ролями',
    hint: 'Может создавать, редактировать и удалять роли в комнате, а также назначать роли другим участникам. Мощное разрешение — даёт почти полный контроль над комнатой (кроме удаления комнаты, бана и передачи владения, которые остаются только у Владельца).',
  },
  manage_room_settings: {
    label: 'Настройки комнаты',
    hint: 'Может переименовывать комнату и включать/выключать режим закрытой комнаты.',
  },
};

// Predefined palette for the color picker in the role editor.
export const ROLE_COLORS = [
  '#6366f1', // indigo
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#ef4444', // red
  '#f97316', // orange
  '#f59e0b', // amber
  '#10b981', // emerald
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#9ca3af', // gray
];

// Resolve a single permission for a member inside a room.
//
// Order of precedence:
//   1. No member row → false (not in the room at all).
//   2. role='owner' → true for every key (matches DB user_has_permission()).
//   3. role='editor' → legacy backcompat. Pre-migration rows still carry this
//      text role; they should behave like the "Помощник" role had all 10
//      permission flags set. Everything except manage_roles returns true.
//   4. role='viewer' → legacy backcompat: no permissions at all.
//   5. role='member' (new joiners) or anything else → look at
//      member.role_data.permissions[permission]. Callers are responsible for
//      hydrating role_data from room_roles before asking.
//
// Once every room_members row has been naturally rewritten to role='member'
// through new assignments, steps 3–4 become dead code and can be dropped.
export function hasPermission(member, permission) {
  if (!member) return false;
  if (member.role === 'owner') return true;
  if (member.role === 'editor') return permission !== 'manage_roles';
  if (member.role === 'viewer') return false;
  const perms = member.role_data && member.role_data.permissions;
  return !!(perms && perms[permission]);
}

// Attach role_data to a raw room_members row so hasPermission() can read it.
export function enrichMember(member, rolesById) {
  if (!member) return null;
  return {
    ...member,
    role_data: member.role_id ? (rolesById[member.role_id] || null) : null,
  };
}

// Legacy object-shaped helper — kept because some call sites computed an
// effective-perms map once and passed it around. New code should call
// hasPermission(member, key) directly so backcompat for 'editor'/'viewer'
// text roles kicks in even if role_data is missing.
export function memberPermissions(member, rolesById) {
  const enriched = enrichMember(member, rolesById);
  const isOwner = enriched?.role === 'owner';
  const perms = {};
  PERMISSIONS.forEach((k) => { perms[k] = hasPermission(enriched, k); });
  return { isOwner, perms };
}

export function hasPerm(perms, key) {
  return Boolean(perms && perms[key]);
}
