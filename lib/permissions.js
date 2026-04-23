// Keys match the permission strings the DB function user_has_permission()
// reads out of room_roles.permissions jsonb. The UI uses this list to render
// the role editor; the server is the source of truth for enforcement.
export const PERMISSION_KEYS = [
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

// Resolve the effective permissions for a given member inside a room.
// - Owner short-circuits to every permission (mirrors user_has_permission).
// - Member without role_id or without matching role gets an empty perms set.
export function memberPermissions(member, rolesById) {
  if (!member) return { isOwner: false, perms: {} };
  if (member.role === 'owner') {
    const perms = {};
    PERMISSION_KEYS.forEach((k) => { perms[k] = true; });
    return { isOwner: true, perms };
  }
  const role = member.role_id ? rolesById[member.role_id] : null;
  return { isOwner: false, perms: (role && role.permissions) || {} };
}

export function hasPerm(perms, key) {
  return Boolean(perms && perms[key]);
}
