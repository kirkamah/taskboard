'use client';

import { useState } from 'react';
import { Plus, X, Edit2, Trash2, Check, Tag as TagIcon } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Modal } from '@/components/UI';
import Tag, { TAG_COLORS, tagDotClass } from '@/components/Tag';

function ColorPicker({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {TAG_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`w-7 h-7 rounded-full border-2 flex items-center justify-center ${
            value === c ? 'border-gray-900' : 'border-transparent'
          }`}
          aria-label={c}
        >
          <span className={`w-5 h-5 rounded-full ${tagDotClass(c)}`} />
        </button>
      ))}
    </div>
  );
}

export default function TagsPanel({ roomId, ownerId, tags }) {
  // Either roomId (комната) или ownerId (личная доска) должны быть заданы
  const scopeCols = roomId ? { room_id: roomId, owner_id: null } : { owner_id: ownerId, room_id: null };
  const supabase = createClient();
  const [showEditor, setShowEditor] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // null = create; otherwise tag object
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('blue');
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  const openCreate = () => {
    setEditingTag(null);
    setFormName('');
    setFormColor('blue');
    setError('');
    setShowEditor(true);
  };

  const openEdit = (tag) => {
    setEditingTag(tag);
    setFormName(tag.name);
    setFormColor(tag.color);
    setError('');
    setShowEditor(true);
  };

  const save = async () => {
    const name = formName.trim();
    if (!name) return;
    setSaving(true);
    setError('');
    if (editingTag) {
      const { error } = await supabase
        .from('room_tags')
        .update({ name, color: formColor })
        .eq('id', editingTag.id);
      setSaving(false);
      if (error) { setError(err2msg(error)); return; }
    } else {
      const { error } = await supabase
        .from('room_tags')
        .insert({ ...scopeCols, name, color: formColor });
      setSaving(false);
      if (error) { setError(err2msg(error)); return; }
    }
    setShowEditor(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    const { error } = await supabase.from('room_tags').delete().eq('id', deleteConfirm.id);
    setDeleting(false);
    if (error) {
      alert('Не удалось удалить: ' + error.message);
      return;
    }
    setDeleteConfirm(null);
  };

  const err2msg = (e) => {
    if (e?.code === '23505') return 'Тег с таким названием уже есть';
    return e?.message || 'Ошибка';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 h-fit">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <TagIcon size={16} /> Теги ({tags.length})
        </h2>
        <button
          onClick={openCreate}
          className="text-xs px-2 py-1 bg-gray-900 text-white rounded hover:bg-gray-800 flex items-center gap-1"
        >
          <Plus size={12} /> Новый
        </button>
      </div>

      {tags.length === 0 ? (
        <p className="text-xs text-gray-400">Пока нет тегов. Создайте первый — назначайте их задачам.</p>
      ) : (
        <div className="space-y-2">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 border border-gray-200 rounded-md p-2">
              <Tag tag={t} />
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => openEdit(t)}
                  className="p-1 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded"
                  aria-label="Редактировать"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={() => setDeleteConfirm(t)}
                  className="p-1 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                  aria-label="Удалить"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showEditor && (
        <Modal onClose={() => setShowEditor(false)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">{editingTag ? 'Редактировать тег' : 'Новый тег'}</h2>
            <button onClick={() => setShowEditor(false)} className="text-gray-400 hover:text-gray-700">
              <X size={22} />
            </button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Название</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Например: срочно, баг, идея"
                maxLength={24}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Цвет</label>
              <ColorPicker value={formColor} onChange={setFormColor} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Предпросмотр</label>
              <Tag tag={{ name: formName.trim() || 'тег', color: formColor }} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setShowEditor(false)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={save}
              disabled={!formName.trim() || saving}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-2"
            >
              <Check size={14} /> {saving ? 'Сохраняем...' : 'Сохранить'}
            </button>
          </div>
        </Modal>
      )}

      {deleteConfirm && (
        <Modal onClose={() => setDeleteConfirm(null)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-red-700">Удалить тег?</h2>
            <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-700">
              <X size={22} />
            </button>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-700">
              Тег <Tag tag={deleteConfirm} /> будет удалён и отвалится от всех задач, где он назначен.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-md p-3 text-sm text-red-700">
              Это действие нельзя отменить.
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setDeleteConfirm(null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
            >
              {deleting ? 'Удаляем...' : 'Удалить'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
