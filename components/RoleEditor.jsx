'use client';

import { useEffect, useMemo, useState } from 'react';
import { Crown, Plus, Trash2, Check, Star } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { PERMISSION_KEYS, PERMISSION_META, ROLE_COLORS } from '@/lib/permissions';

// Shallow equality for the draft-vs-role diff: name/color strings +
// permissions compared as a canonical JSON blob so toggle order doesn't matter.
function draftMatchesRole(draft, role) {
  if (!draft || !role) return false;
  if (draft.name !== role.name) return false;
  if ((draft.color || '') !== (role.color || '')) return false;
  const a = {};
  const b = {};
  PERMISSION_KEYS.forEach((k) => {
    a[k] = !!(draft.permissions && draft.permissions[k]);
    b[k] = !!(role.permissions && role.permissions[k]);
  });
  return JSON.stringify(a) === JSON.stringify(b);
}

function RoleRow({ role, selected, onClick, showDefault }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-md border text-left ${selected ? 'border-gray-900 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}
    >
      <span
        className="w-3 h-3 rounded-full flex-shrink-0 border border-black/10"
        style={{ backgroundColor: role.color }}
      />
      <span className="text-sm flex-1 truncate">{role.name}</span>
      {showDefault && role.is_default && (
        <span className="text-[10px] px-1.5 py-0.5 border border-gray-300 rounded text-gray-600 flex items-center gap-1">
          <Star size={10} /> По умолчанию
        </span>
      )}
    </button>
  );
}

export default function RoleEditor({ roomId, roles, canManage }) {
  const supabase = createClient();
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Keep the selected role alive across realtime role updates. If the selected
  // role disappears (deleted elsewhere), fall back to the first one.
  useEffect(() => {
    if (roles.length === 0) {
      setSelectedId(null);
      setDraft(null);
      return;
    }
    const exists = roles.some((r) => r.id === selectedId);
    if (!exists) {
      setSelectedId(roles[0].id);
    }
  }, [roles, selectedId]);

  // Reset the draft whenever the selected role changes or the upstream copy
  // updates (realtime). Don't clobber in-flight edits if only the selection
  // changed; we reset on purpose — the user picks roles explicitly.
  useEffect(() => {
    const role = roles.find((r) => r.id === selectedId);
    if (!role) { setDraft(null); return; }
    setDraft({
      name: role.name,
      color: role.color,
      permissions: { ...(role.permissions || {}) },
    });
    setError('');
    setConfirmDelete(false);
  }, [selectedId, roles]);

  const selectedRole = useMemo(
    () => roles.find((r) => r.id === selectedId) || null,
    [roles, selectedId]
  );

  const dirty = useMemo(
    () => draft && selectedRole && !draftMatchesRole(draft, selectedRole),
    [draft, selectedRole]
  );

  const handleCreate = async () => {
    setBusyAction(true);
    setError('');
    const { data, error: err } = await supabase.rpc('create_role', {
      p_room_id: roomId,
      p_name: 'Новая роль',
      p_color: '#6366f1',
      p_permissions: {},
    });
    setBusyAction(false);
    if (err) {
      setError(err.message);
      return;
    }
    if (data) setSelectedId(data);
  };

  const handleSave = async () => {
    if (!selectedRole || !draft) return;
    const name = draft.name.trim();
    if (name.length < 1 || name.length > 32) {
      setError('Название должно быть от 1 до 32 символов');
      return;
    }
    setSaving(true);
    setError('');
    const { error: err } = await supabase.rpc('update_role', {
      p_role_id: selectedRole.id,
      p_name: name,
      p_color: draft.color,
      p_permissions: draft.permissions || {},
    });
    setSaving(false);
    if (err) setError(err.message);
  };

  const handleSetDefault = async () => {
    if (!selectedRole || selectedRole.is_default) return;
    setBusyAction(true);
    setError('');
    const { error: err } = await supabase.rpc('set_default_role', {
      p_role_id: selectedRole.id,
    });
    setBusyAction(false);
    if (err) setError(err.message);
  };

  const handleDelete = async () => {
    if (!selectedRole || selectedRole.is_default) return;
    setBusyAction(true);
    setError('');
    const { error: err } = await supabase.rpc('delete_role', {
      p_role_id: selectedRole.id,
    });
    setBusyAction(false);
    if (err) {
      setError(err.message);
      return;
    }
    setConfirmDelete(false);
    setSelectedId(null);
  };

  const togglePerm = (key) => {
    if (!draft) return;
    setDraft({
      ...draft,
      permissions: { ...draft.permissions, [key]: !draft.permissions?.[key] },
    });
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-h-[420px]">
      {/* LEFT: list of roles */}
      <div className="space-y-2">
        <div className="border border-gray-200 rounded-md p-3 bg-gray-50 flex items-center gap-2">
          <Crown size={14} className="text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">Владелец</p>
            <p className="text-xs text-gray-500 leading-tight">
              Фиксированная роль — всегда имеет все права
            </p>
          </div>
        </div>

        <div className="space-y-1">
          {roles.map((r) => (
            <RoleRow
              key={r.id}
              role={r}
              selected={r.id === selectedId}
              onClick={() => setSelectedId(r.id)}
              showDefault
            />
          ))}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleCreate}
            disabled={busyAction}
            className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-md hover:bg-gray-50 flex items-center justify-center gap-2 text-gray-600 disabled:opacity-60"
          >
            <Plus size={14} /> Создать роль
          </button>
        )}
      </div>

      {/* RIGHT: editor for the selected role */}
      <div className="border border-gray-200 rounded-md p-3 space-y-4">
        {!selectedRole ? (
          <p className="text-sm text-gray-500 text-center py-10">
            Выберите роль слева
          </p>
        ) : (
          <>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                Название
              </label>
              <input
                type="text"
                value={draft?.name || ''}
                onChange={(e) => setDraft({ ...draft, name: e.target.value.slice(0, 32) })}
                disabled={!canManage}
                maxLength={32}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900 text-sm disabled:bg-gray-50"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1">
                Цвет
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ROLE_COLORS.map((c) => {
                  const active = draft?.color === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => canManage && setDraft({ ...draft, color: c })}
                      disabled={!canManage}
                      aria-label={c}
                      className={`w-7 h-7 rounded-full border-2 transition ${active ? 'border-gray-900 scale-110' : 'border-transparent'} ${canManage ? 'hover:scale-105' : 'cursor-not-allowed opacity-70'}`}
                      style={{ backgroundColor: c }}
                    />
                  );
                })}
              </div>
            </div>

            <label className="flex items-start gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={!!selectedRole.is_default}
                disabled={!canManage || selectedRole.is_default || busyAction}
                onChange={() => handleSetDefault()}
                className="mt-0.5 w-4 h-4 accent-gray-900"
              />
              <span className="flex-1">
                <span className="text-sm font-medium text-gray-900">Роль по умолчанию для новых участников</span>
                <span className="block text-xs text-gray-500">
                  Именно эту роль получают те, кто только что присоединился к комнате или был принят по заявке.
                </span>
              </span>
            </label>

            <div>
              <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                Разрешения
              </p>
              <div className="space-y-2">
                {PERMISSION_KEYS.map((key) => {
                  const meta = PERMISSION_META[key];
                  const checked = !!draft?.permissions?.[key];
                  return (
                    <label
                      key={key}
                      className={`flex items-start gap-2 p-2 rounded border ${checked ? 'border-gray-300 bg-gray-50' : 'border-gray-200'} ${canManage ? 'cursor-pointer' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!canManage}
                        onChange={() => togglePerm(key)}
                        className="mt-0.5 w-4 h-4 accent-gray-900 flex-shrink-0"
                      />
                      <span className="flex-1">
                        <span className="text-sm font-medium text-gray-900">{meta.label}</span>
                        <span className="block text-xs text-gray-500 leading-snug">
                          {meta.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
                {error}
              </div>
            )}

            {canManage && (
              <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                <div>
                  {!confirmDelete ? (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(true)}
                      disabled={selectedRole.is_default || busyAction}
                      className="text-xs px-2 py-1 border border-red-200 text-red-700 rounded hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                      title={selectedRole.is_default ? 'Нельзя удалить роль по умолчанию' : 'Удалить роль'}
                    >
                      <Trash2 size={12} /> Удалить роль
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-red-700">Уверены?</span>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={busyAction}
                        className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                      >
                        Удалить
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={busyAction}
                        className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100"
                      >
                        Отмена
                      </button>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!dirty || saving}
                  className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-2"
                >
                  <Check size={14} /> {saving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
