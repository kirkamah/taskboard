'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Check, Trash2, Edit2, Maximize2 } from 'lucide-react';
import { Modal, Toggle } from './UI';
import { createClient } from '@/lib/supabase/client';

/**
 * BoardBody — универсальный компонент доски задач.
 *
 * Props:
 *  - scope: 'personal' (личная доска) или 'room' (комната)
 *  - roomId (нужен если scope='room')
 *  - userId (текущий пользователь, нужен для личной доски)
 *  - canEdit (bool): можно ли редактировать задачи (для наблюдателей — false)
 */
export default function BoardBody({ scope, roomId, userId, canEdit }) {
  const supabase = createClient();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [formData, setFormData] = useState({ title: '', description: '', important: true, urgent: true });

  // Загрузка задач
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (scope === 'personal') {
        query = query.eq('owner_id', userId).is('room_id', null);
      } else {
        query = query.eq('room_id', roomId);
      }
      const { data, error } = await query;
      if (!error) setTasks(data || []);
      setLoading(false);
    };
    load();
  }, [scope, roomId, userId]);

  // Realtime: подписка на изменения
  useEffect(() => {
    const channel = supabase
      .channel(`tasks-${scope}-${roomId || userId}`)
      .on('postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tasks',
          filter: scope === 'personal' ? `owner_id=eq.${userId}` : `room_id=eq.${roomId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setTasks((prev) => prev.some(t => t.id === payload.new.id) ? prev : [payload.new, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            setTasks((prev) => prev.map(t => t.id === payload.new.id ? payload.new : t));
          } else if (payload.eventType === 'DELETE') {
            setTasks((prev) => prev.filter(t => t.id !== payload.old.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scope, roomId, userId]);

  const quadrants = [
    { important: true, urgent: true, title: 'Важно и срочно', hint: 'Делать сейчас' },
    { important: true, urgent: false, title: 'Важно, не срочно', hint: 'Запланировать' },
    { important: false, urgent: true, title: 'Не важно, срочно', hint: 'Делегировать' },
    { important: false, urgent: false, title: 'Не важно, не срочно', hint: 'Отложить / удалить' }
  ];

  const getTasksFor = (imp, urg) => tasks.filter(t => t.important === imp && t.urgent === urg && !t.done);
  const completedTasks = tasks.filter(t => t.done);

  const openAdd = () => {
    setFormData({ title: '', description: '', important: true, urgent: true });
    setEditingTask(null);
    setShowAddModal(true);
  };

  const openEdit = (task) => {
    setFormData({ title: task.title, description: task.description || '', important: task.important, urgent: task.urgent });
    setEditingTask(task);
    setSelectedTask(null);
    setShowAddModal(true);
  };

  const save = async () => {
    if (!formData.title.trim()) return;
    if (editingTask) {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          title: formData.title,
          description: formData.description,
          important: formData.important,
          urgent: formData.urgent
        })
        .eq('id', editingTask.id)
        .select()
        .single();
      if (!error && data) {
        setTasks((prev) => prev.map(t => t.id === data.id ? data : t));
      }
    } else {
      const payload = {
        title: formData.title,
        description: formData.description,
        important: formData.important,
        urgent: formData.urgent,
        done: false,
        ...(scope === 'personal' ? { owner_id: userId, room_id: null } : { room_id: roomId, owner_id: null })
      };
      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (!error && data) {
        setTasks((prev) => prev.some(t => t.id === data.id) ? prev : [data, ...prev]);
      }
    }
    setShowAddModal(false);
    setEditingTask(null);
  };

  const del = async (id) => {
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter(t => t.id !== id));
    setSelectedTask(null);
  };

  const toggleDone = async (task) => {
    const { data } = await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id).select().single();
    if (data) setTasks((prev) => prev.map(t => t.id === data.id ? data : t));
    setSelectedTask(null);
  };

  if (loading) {
    return <p className="text-sm text-gray-500 text-center py-8">Загрузка задач...</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm text-gray-500">
          {tasks.filter(t => !t.done).length} активных · {completedTasks.length} выполнено
          {!canEdit && <span className="ml-2 text-yellow-700">· Роль наблюдателя — редактировать нельзя</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100"
          >
            {showCompleted ? 'Скрыть выполненные' : 'Показать выполненные'}
          </button>
          {canEdit && (
            <button onClick={openAdd} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2">
              <Plus size={16} /> Добавить задачу
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quadrants.map((q, idx) => {
          const qTasks = getTasksFor(q.important, q.urgent);
          return (
            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-4 min-h-[240px]">
              <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-100">
                <div>
                  <h2 className="font-semibold text-gray-900">{q.title}</h2>
                  <p className="text-xs text-gray-500 mt-0.5">{q.hint}</p>
                </div>
                <span className="text-xs text-gray-400">{qTasks.length}</span>
              </div>
              <div className="space-y-2">
                {qTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Пусто</p>}
                {qTasks.map(task => (
                  <div
                    key={task.id}
                    onClick={() => setSelectedTask(task)}
                    className="group border border-gray-200 rounded-md p-3 hover:border-gray-400 hover:shadow-sm cursor-pointer bg-white transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">{task.title}</h3>
                      <Maximize2 size={12} className="text-gray-300 group-hover:text-gray-500 mt-1 flex-shrink-0" />
                    </div>
                    {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {showCompleted && completedTasks.length > 0 && (
        <div className="mt-6 bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="font-semibold text-gray-900 mb-3">Выполненные</h2>
          <div className="space-y-2">
            {completedTasks.map(task => (
              <div key={task.id} className="flex items-center justify-between border border-gray-200 rounded-md p-3">
                <span className="text-sm text-gray-500 line-through">{task.title}</span>
                {canEdit && (
                  <div className="flex gap-2">
                    <button onClick={() => toggleDone(task)} className="text-xs text-gray-600 hover:text-gray-900">Вернуть</button>
                    <button onClick={() => del(task.id)} className="text-xs text-red-600 hover:text-red-800">Удалить</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {selectedTask && (
        <Modal onClose={() => setSelectedTask(null)} wide>
          <div className="flex items-start justify-between p-6 border-b border-gray-200">
            <div className="flex-1 pr-4">
              <h2 className="text-xl font-semibold text-gray-900">{selectedTask.title}</h2>
              <div className="flex gap-2 mt-2">
                <span className="text-xs px-2 py-1 border border-gray-300 rounded">{selectedTask.important ? 'Важно' : 'Не важно'}</span>
                <span className="text-xs px-2 py-1 border border-gray-300 rounded">{selectedTask.urgent ? 'Срочно' : 'Не срочно'}</span>
              </div>
            </div>
            <button onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Описание</h3>
            <p className="text-gray-700 whitespace-pre-wrap">
              {selectedTask.description || <span className="text-gray-400">Описание не указано</span>}
            </p>
          </div>
          {canEdit && (
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button onClick={() => toggleDone(selectedTask)} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2">
                <Check size={16} /> Выполнено
              </button>
              <div className="flex gap-2">
                <button onClick={() => openEdit(selectedTask)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2"><Edit2 size={14} /> Редактировать</button>
                <button onClick={() => del(selectedTask.id)} className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} /> Удалить</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">{editingTask ? 'Редактировать задачу' : 'Новая задача'}</h2>
            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Название</label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Что нужно сделать?"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Описание</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Подробности, контекст, ссылки..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900 resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Важность</label>
                <div className="flex gap-2">
                  <Toggle active={formData.important} onClick={() => setFormData({ ...formData, important: true })}>Важно</Toggle>
                  <Toggle active={!formData.important} onClick={() => setFormData({ ...formData, important: false })}>Не важно</Toggle>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Срочность</label>
                <div className="flex gap-2">
                  <Toggle active={formData.urgent} onClick={() => setFormData({ ...formData, urgent: true })}>Срочно</Toggle>
                  <Toggle active={!formData.urgent} onClick={() => setFormData({ ...formData, urgent: false })}>Не срочно</Toggle>
                </div>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">Отмена</button>
            <button onClick={save} disabled={!formData.title.trim()} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300">{editingTask ? 'Сохранить' : 'Создать'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
