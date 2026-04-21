'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Trash2, Edit2, Maximize2, Calendar, UserPlus } from 'lucide-react';
import { Modal, Toggle } from './UI';
import { createClient } from '@/lib/supabase/client';

/**
 * BoardBody — универсальный компонент доски задач.
 *
 * Props:
 *  - scope: 'personal' (личная доска) или 'room' (комната)
 *  - roomId (нужен если scope='room')
 *  - userId (текущий пользователь)
 *  - canEdit (bool): можно ли редактировать задачи (для наблюдателей — false)
 *  - members (только для 'room'): [{ user_id, role }, ...]
 *  - profiles (только для 'room'): { user_id: display_name, ... }
 *  - currentUserRole (только для 'room'): 'owner' | 'editor' | 'viewer'
 *      Назначать на задачи может только owner.
 */
export default function BoardBody({
  scope,
  roomId,
  userId,
  canEdit,
  members = [],
  profiles = {},
  currentUserRole = null,
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    important: true,
    urgent: true,
    due_at: '', // строка из <input type="datetime-local">: YYYY-MM-DDTHH:MM
    assignees: [], // массив user_id
  });

  const isRoom = scope === 'room';
  const canAssign = isRoom && currentUserRole === 'owner';

  // Конвертация: timestamptz из БД -> локальная строка для datetime-local input
  const isoToLocalInput = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  // Конвертация: локальная строка -> ISO для отправки в БД
  const localInputToIso = (local) => {
    if (!local) return null;
    const d = new Date(local);
    return isNaN(d.getTime()) ? null : d.toISOString();
  };

  // Загрузка задач + назначений одним запросом
  const loadTasks = useCallback(async () => {
    let query = supabase
      .from('tasks')
      .select('*, task_assignees(user_id)')
      .order('created_at', { ascending: false });
    if (scope === 'personal') {
      query = query.eq('owner_id', userId).is('room_id', null);
    } else {
      query = query.eq('room_id', roomId);
    }
    const { data, error } = await query;
    if (!error) {
      const flat = (data || []).map((t) => ({
        ...t,
        assignees: (t.task_assignees || []).map((a) => a.user_id),
      }));
      setTasks(flat);
    }
  }, [scope, roomId, userId]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadTasks().finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [loadTasks]);

  // Realtime: подписка на изменения tasks
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
        () => loadTasks()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scope, roomId, userId, loadTasks]);

  // Realtime: подписка на изменения назначений (только для комнат)
  useEffect(() => {
    if (!isRoom) return;
    const channel = supabase
      .channel(`assignees-${roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_assignees' },
        () => loadTasks()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isRoom, roomId, loadTasks]);

  const quadrants = [
    { important: true, urgent: true, title: 'Важно и срочно' },
    { important: true, urgent: false, title: 'Важно, не срочно' },
    { important: false, urgent: true, title: 'Не важно, срочно' },
    { important: false, urgent: false, title: 'Не важно, не срочно' }
  ];

  const getTasksFor = (imp, urg) => tasks.filter(t => t.important === imp && t.urgent === urg && !t.done);
  const completedTasks = tasks.filter(t => t.done);

  const openAdd = () => {
    setFormData({ title: '', description: '', important: true, urgent: true, due_at: '', assignees: [] });
    setEditingTask(null);
    setShowAddModal(true);
  };

  const openEdit = (task) => {
    setFormData({
      title: task.title,
      description: task.description || '',
      important: task.important,
      urgent: task.urgent,
      due_at: isoToLocalInput(task.due_at),
      assignees: task.assignees || [],
    });
    setEditingTask(task);
    setSelectedTask(null);
    setShowAddModal(true);
  };

  // Синхронизация назначений: удаляем старые, вставляем новые
  const syncAssignees = async (taskId, newAssignees) => {
    if (!isRoom) return;
    await supabase.from('task_assignees').delete().eq('task_id', taskId);
    if (newAssignees.length > 0) {
      const rows = newAssignees.map((uid) => ({ task_id: taskId, user_id: uid }));
      await supabase.from('task_assignees').insert(rows);
    }
  };

  const save = async () => {
    if (!formData.title.trim()) return;
    const dueIso = localInputToIso(formData.due_at);

    if (editingTask) {
      const { data, error } = await supabase
        .from('tasks')
        .update({
          title: formData.title,
          description: formData.description,
          important: formData.important,
          urgent: formData.urgent,
          due_at: dueIso,
        })
        .eq('id', editingTask.id)
        .select()
        .single();
      if (!error && data) {
        if (canAssign) await syncAssignees(data.id, formData.assignees);
        await loadTasks();
      }
    } else {
      const payload = {
        title: formData.title,
        description: formData.description,
        important: formData.important,
        urgent: formData.urgent,
        done: false,
        due_at: dueIso,
        ...(scope === 'personal' ? { owner_id: userId, room_id: null } : { room_id: roomId, owner_id: null })
      };
      const { data, error } = await supabase.from('tasks').insert(payload).select().single();
      if (!error && data) {
        if (canAssign) await syncAssignees(data.id, formData.assignees);
        await loadTasks();
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
    if (data) setTasks((prev) => prev.map(t => t.id === data.id ? { ...t, ...data, assignees: t.assignees } : t));
    setSelectedTask(null);
  };

  // Формат даты для отображения: "сегодня, 14:30" / "завтра, 09:00" / "15 мая, 14:30"
  const formatDue = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(now.getDate() + 1);
    const sameTomorrow = d.toDateString() === tomorrow.toDateString();
    const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    if (sameDay) return `сегодня, ${time}`;
    if (sameTomorrow) return `завтра, ${time}`;
    const date = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
    return `${date}, ${time}`;
  };

  // Цвет дедлайна: красный (просрочено), жёлтый (в пределах 24ч), серый (позже)
  const getDueClasses = (iso, done) => {
    if (!iso) return null;
    if (done) return 'text-gray-400 bg-gray-50 border-gray-200';
    const diff = new Date(iso).getTime() - Date.now();
    if (diff < 0) return 'text-red-700 bg-red-50 border-red-200';
    if (diff < 24 * 60 * 60 * 1000) return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-gray-600 bg-gray-50 border-gray-200';
  };

  // Аватарка пользователя — кружок с первой буквой и tooltip с именем
  const Avatar = ({ uid }) => {
    const name = profiles[uid] || 'Пользователь';
    const initial = (name.trim()[0] || '?').toUpperCase();
    return (
      <div
        className="w-6 h-6 rounded-full bg-gray-200 border border-white flex items-center justify-center text-xs font-medium text-gray-700"
        title={name}
      >
        {initial}
      </div>
    );
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
                <h2 className="font-semibold text-gray-900">{q.title}</h2>
                <span className="text-xs text-gray-400">{qTasks.length}</span>
              </div>
              <div className="space-y-2">
                {qTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Пусто</p>}
                {qTasks.map(task => {
                  const dueClasses = getDueClasses(task.due_at, task.done);
                  return (
                    <div
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className="group border border-gray-200 rounded-md p-3 hover:border-gray-400 hover:shadow-sm cursor-pointer bg-white transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">{task.title}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(task.assignees || []).length > 0 && (
                            <div className="flex -space-x-1">
                              {task.assignees.slice(0, 3).map((uid) => (
                                <Avatar key={uid} uid={uid} />
                              ))}
                              {task.assignees.length > 3 && (
                                <div
                                  className="w-6 h-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-xs text-gray-600"
                                  title={task.assignees.slice(3).map((u) => profiles[u] || 'Пользователь').join(', ')}
                                >
                                  +{task.assignees.length - 3}
                                </div>
                              )}
                            </div>
                          )}
                          <Maximize2 size={12} className="text-gray-300 group-hover:text-gray-500 ml-1" />
                        </div>
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                      {task.due_at && (
                        <div className={`mt-2 inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded ${dueClasses}`}>
                          <Calendar size={10} /> {formatDue(task.due_at)}
                        </div>
                      )}
                    </div>
                  );
                })}
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
              <div className="flex gap-2 mt-2 flex-wrap">
                <span className="text-xs px-2 py-1 border border-gray-300 rounded">{selectedTask.important ? 'Важно' : 'Не важно'}</span>
                <span className="text-xs px-2 py-1 border border-gray-300 rounded">{selectedTask.urgent ? 'Срочно' : 'Не срочно'}</span>
                {selectedTask.due_at && (
                  <span className={`text-xs px-2 py-1 border rounded inline-flex items-center gap-1 ${getDueClasses(selectedTask.due_at, selectedTask.done)}`}>
                    <Calendar size={11} /> {formatDue(selectedTask.due_at)}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => setSelectedTask(null)} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {selectedTask.description || <span className="text-gray-400">Описание не указано</span>}
            </p>
            {isRoom && (selectedTask.assignees || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Назначены</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTask.assignees.map((uid) => (
                    <div key={uid} className="flex items-center gap-2 border border-gray-200 rounded-full pl-1 pr-3 py-0.5">
                      <Avatar uid={uid} />
                      <span className="text-sm text-gray-700">{profiles[uid] || 'Пользователь'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Срок выполнения (необязательно)</label>
              <div className="flex gap-2">
                <input
                  type="datetime-local"
                  value={formData.due_at}
                  onChange={(e) => setFormData({ ...formData, due_at: e.target.value })}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                />
                {formData.due_at && (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, due_at: '' })}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-600"
                    title="Убрать срок"
                  >
                    Очистить
                  </button>
                )}
              </div>
            </div>
            {canAssign && members.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <UserPlus size={12} /> Назначить участников (необязательно)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                  {members.map((m) => {
                    const checked = formData.assignees.includes(m.user_id);
                    const name = profiles[m.user_id] || 'Пользователь';
                    return (
                      <label
                        key={m.user_id}
                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...formData.assignees, m.user_id]
                              : formData.assignees.filter((u) => u !== m.user_id);
                            setFormData({ ...formData, assignees: next });
                          }}
                          className="w-4 h-4"
                        />
                        <Avatar uid={m.user_id} />
                        <span className="text-sm text-gray-800 flex-1">{name}</span>
                        <span className="text-xs text-gray-400">
                          {m.role === 'owner' ? 'Владелец' : m.role === 'editor' ? 'Редактор' : 'Наблюдатель'}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {formData.assignees.length > 0 && (
                  <p className="text-xs text-gray-500 mt-2">Выбрано: {formData.assignees.length}</p>
                )}
              </div>
            )}
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
