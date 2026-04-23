'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, X, Check, Trash2, Edit2, Maximize2, Calendar, UserPlus, MessageSquare, Send, Tag as TagIcon, ListChecks, Bot } from 'lucide-react';
import { Modal, Toggle } from './UI';
import LinkifiedText from './LinkifiedText';
import Avatar from './Avatar';
import Tag from './Tag';
import { createClient } from '@/lib/supabase/client';

/**
 * BoardBody — универсальный компонент доски задач.
 *
 * Props:
 *  - scope: 'personal' (личная доска) или 'room' (комната)
 *  - roomId (нужен если scope='room')
 *  - userId (текущий пользователь)
 *  - members, profiles (только для 'room')
 *  - perms (только для 'room'): объект разрешений текущего пользователя
 *  - isRoomOwner (только для 'room'): true если текущий пользователь — владелец
 *  - tags: теги, доступные для привязки к задаче
 */
export default function BoardBody({
  scope,
  roomId,
  userId,
  members = [],
  profiles = {},
  perms = null,
  isRoomOwner = false,
  tags = [],
}) {
  const supabase = createClient();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedTask, setSelectedTask] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [draggingTaskId, setDraggingTaskId] = useState(null);
  const [dragOverQuadrant, setDragOverQuadrant] = useState(null);
  // Модалка для работы с запросами на выполнение:
  //   { mode: 'create', taskId } — отправка запроса назначенным
  //   { mode: 'respond', requestId, action: 'approve'|'reject' } — ответ владельца/редактора
  const [requestModal, setRequestModal] = useState(null);
  const [requestNote, setRequestNote] = useState('');
  const [requestSubmitting, setRequestSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    important: true,
    urgent: true,
    due_at: '', // строка из <input type="datetime-local">: YYYY-MM-DDTHH:MM
    assignees: [], // массив user_id
    tags: [], // массив tag_id
    checklist: [], // [{id?, text, done}]
  });
  const MAX_CHECKLIST_ITEMS = 10;

  const isRoom = scope === 'room';
  const isPersonal = !isRoom;
  // Personal boards let the user do everything to their own tasks; rooms
  // rely on the permissions object computed by the parent.
  const p = perms || {};
  const canCreateTask = isPersonal || !!p.create_tasks;
  const canEditTask = isPersonal || !!p.edit_any_task;
  const canDeleteTask = isPersonal || !!p.delete_any_task;
  const canAssign = isRoom && !!p.assign_members;
  const canEditChecklist = isPersonal || !!p.manage_checklists;
  const canApproveRequests = isRoom && !!p.approve_completion_requests;
  // "Any write at all" — controls the footer layout of the task detail modal
  // and whether Completed section shows action buttons.
  const canEdit = canCreateTask || canEditTask || canDeleteTask;

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

  // Загрузка задач + назначений + активных запросов одним запросом
  const loadTasks = useCallback(async () => {
    let query = supabase
      .from('tasks')
      .select('*, task_assignees(user_id), task_completion_requests(id, requester_id, request_note, status, created_at), task_tags(tag_id), task_checklist_items(id, text, done, position)')
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
        pendingRequests: (t.task_completion_requests || []).filter(r => r.status === 'pending'),
        tagIds: (t.task_tags || []).map((tt) => tt.tag_id),
        checklist: (t.task_checklist_items || [])
          .slice()
          .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .map((it) => ({ id: it.id, text: it.text, done: it.done })),
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

  // Realtime: подписка на изменения запросов на выполнение
  useEffect(() => {
    if (!isRoom) return;
    const channel = supabase
      .channel(`requests-${roomId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_completion_requests' },
        () => loadTasks()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isRoom, roomId, loadTasks]);

  // Realtime: task_tags — назначения тегов меняются (owner добавил/убрал из задачи,
  // либо тег был удалён на уровне БД, что каскадно удаляет связи).
  useEffect(() => {
    const channel = supabase
      .channel(`task-tags-${scope}-${roomId || userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_tags' },
        () => loadTasks()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scope, roomId, userId, loadTasks]);

  // Realtime: task_checklist_items
  useEffect(() => {
    const channel = supabase
      .channel(`task-checklist-${scope}-${roomId || userId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_checklist_items' },
        () => loadTasks()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [scope, roomId, userId, loadTasks]);

  const quadrants = [
    { important: true, urgent: true, title: 'Важно и срочно' },
    { important: true, urgent: false, title: 'Важно, не срочно' },
    { important: false, urgent: true, title: 'Не важно, срочно' },
    { important: false, urgent: false, title: 'Не важно, не срочно' }
  ];

  const getTasksFor = (imp, urg) => tasks.filter(t => t.important === imp && t.urgent === urg && !t.done);
  const completedTasks = tasks.filter(t => t.done);

  const openAdd = () => {
    setFormData({ title: '', description: '', important: true, urgent: true, due_at: '', assignees: [], tags: [], checklist: [] });
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
      tags: task.tagIds || [],
      checklist: (task.checklist || []).map((it) => ({ id: it.id, text: it.text, done: it.done })),
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

  // Синхронизация тегов задачи
  const syncTags = async (taskId, newTagIds) => {
    await supabase.from('task_tags').delete().eq('task_id', taskId);
    if (newTagIds.length > 0) {
      const rows = newTagIds.map((tagId) => ({ task_id: taskId, tag_id: tagId }));
      await supabase.from('task_tags').insert(rows);
    }
  };

  // Синхронизация пунктов чеклиста: полная замена.
  const syncChecklist = async (taskId, items) => {
    await supabase.from('task_checklist_items').delete().eq('task_id', taskId);
    const rows = items
      .map((it, idx) => ({ text: (it.text || '').trim(), done: !!it.done, position: idx }))
      .filter((it) => it.text.length > 0)
      .slice(0, MAX_CHECKLIST_ITEMS)
      .map((r) => ({ task_id: taskId, ...r }));
    if (rows.length > 0) {
      await supabase.from('task_checklist_items').insert(rows);
    }
  };

  // Переключение одного пункта чеклиста прямо из модалки деталей.
  const toggleChecklistItem = async (itemId, nextDone) => {
    setSelectedTask((prev) => prev ? {
      ...prev,
      checklist: (prev.checklist || []).map((it) => it.id === itemId ? { ...it, done: nextDone } : it),
    } : prev);
    setTasks((prev) => prev.map((t) => ({
      ...t,
      checklist: (t.checklist || []).map((it) => it.id === itemId ? { ...it, done: nextDone } : it),
    })));
    await supabase.from('task_checklist_items').update({ done: nextDone }).eq('id', itemId);
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
        if (canEditTask) await syncTags(data.id, formData.tags);
        if (canEditChecklist) await syncChecklist(data.id, formData.checklist);
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
        if (canCreateTask) await syncTags(data.id, formData.tags);
        if (canCreateTask) await syncChecklist(data.id, formData.checklist);
        await loadTasks();
      }
    }
    setShowAddModal(false);
    setEditingTask(null);
  };

  const moveTaskToQuadrant = async (taskId, important, urgent) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task || (task.important === important && task.urgent === urgent)) return;
    setTasks((prev) => prev.map(t => t.id === taskId ? { ...t, important, urgent } : t));
    const { error } = await supabase.from('tasks').update({ important, urgent }).eq('id', taskId);
    if (error) {
      await loadTasks();
    }
  };

  const del = async (id) => {
    await supabase.from('tasks').delete().eq('id', id);
    setTasks((prev) => prev.filter(t => t.id !== id));
    setSelectedTask(null);
  };

  const toggleDone = async (task) => {
    const { data } = await supabase.from('tasks').update({ done: !task.done }).eq('id', task.id).select().single();
    if (data) setTasks((prev) => prev.map(t => t.id === data.id ? { ...t, ...data, assignees: t.assignees, pendingRequests: t.pendingRequests } : t));
    setSelectedTask(null);
  };

  // Помощник/владелец завершает задачу с опциональным текстом.
  // В комнате вызывает RPC → триггер создаёт уведомление владельцу с note.
  // В личной доске просто помечает done.
  const submitEditorComplete = async () => {
    if (!requestModal || requestModal.mode !== 'editor_complete') return;
    setRequestSubmitting(true);
    if (isRoom) {
      const { error } = await supabase.rpc('complete_task_with_note', {
        _task_id: requestModal.taskId,
        _note: requestNote.trim() || null,
      });
      setRequestSubmitting(false);
      if (error) {
        alert('Не удалось выполнить: ' + error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('tasks').update({ done: true }).eq('id', requestModal.taskId);
      setRequestSubmitting(false);
      if (error) {
        alert('Не удалось выполнить: ' + error.message);
        return;
      }
    }
    setRequestModal(null);
    setRequestNote('');
    setSelectedTask(null);
    await loadTasks();
  };

  // Отправить запрос на выполнение (назначенный → owner/editor)
  const submitCreateRequest = async () => {
    if (!requestModal || requestModal.mode !== 'create') return;
    setRequestSubmitting(true);
    const { error } = await supabase.rpc('create_completion_request', {
      _task_id: requestModal.taskId,
      _note: requestNote.trim() || null,
    });
    setRequestSubmitting(false);
    if (error) {
      alert('Не удалось отправить запрос: ' + error.message);
      return;
    }
    setRequestModal(null);
    setRequestNote('');
    setSelectedTask(null);
    await loadTasks();
  };

  // Отозвать свой активный запрос по задаче
  const withdrawMyRequest = async (taskId) => {
    const task = tasks.find(t => t.id === taskId);
    const myRequest = task?.pendingRequests?.find(r => r.requester_id === userId);
    if (!myRequest) return;
    const { error } = await supabase.rpc('withdraw_completion_request', { _request_id: myRequest.id });
    if (error) {
      alert('Не удалось отозвать: ' + error.message);
      return;
    }
    await loadTasks();
  };

  // Ответить на запрос (одобрить/отклонить)
  const submitRespondRequest = async () => {
    if (!requestModal || requestModal.mode !== 'respond') return;
    setRequestSubmitting(true);
    const { error } = await supabase.rpc('respond_to_completion_request', {
      _request_id: requestModal.requestId,
      _action: requestModal.action,
      _note: requestNote.trim() || null,
    });
    setRequestSubmitting(false);
    if (error) {
      alert('Не удалось ответить: ' + error.message);
      return;
    }
    setRequestModal(null);
    setRequestNote('');
    setSelectedTask(null);
    await loadTasks();
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

  const getName = (uid) => profiles[uid]?.display_name || 'Пользователь';
  const getProfile = (uid) => profiles[uid] || null;
  const tagsById = tags.reduce((acc, t) => { acc[t.id] = t; return acc; }, {});
  const getTaskTags = (task) => (task.tagIds || []).map((id) => tagsById[id]).filter(Boolean);

  if (loading) {
    return <p className="text-sm text-gray-500 text-center py-8">Загрузка задач...</p>;
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="text-sm text-gray-500">
          {tasks.filter(t => !t.done).length} активных · {completedTasks.length} выполнено
          {!canEdit && <span className="ml-2 text-yellow-700">· Только просмотр — у вашей роли нет прав на изменение</span>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCompleted(!showCompleted)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white hover:bg-gray-100"
          >
            {showCompleted ? 'Скрыть выполненные' : 'Показать выполненные'}
          </button>
          {canCreateTask && (
            <button onClick={openAdd} className="px-3 py-1.5 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2">
              <Plus size={16} /> Добавить задачу
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {quadrants.map((q, idx) => {
          const qTasks = getTasksFor(q.important, q.urgent);
          const isDragOver = dragOverQuadrant === idx;
          return (
            <div
              key={idx}
              onDragOver={(e) => { if (canEditTask && draggingTaskId) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
              onDragEnter={(e) => { if (canEditTask && draggingTaskId) { e.preventDefault(); setDragOverQuadrant(idx); } }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverQuadrant((cur) => cur === idx ? null : cur); }}
              onDrop={(e) => {
                if (!canEditTask || !draggingTaskId) return;
                e.preventDefault();
                moveTaskToQuadrant(draggingTaskId, q.important, q.urgent);
                setDragOverQuadrant(null);
                setDraggingTaskId(null);
              }}
              className={`bg-white border rounded-lg p-4 min-h-[240px] transition-colors ${isDragOver ? 'border-gray-900 border-2 bg-gray-50' : 'border-gray-200'}`}
            >
              <div className="flex items-baseline justify-between mb-3 pb-3 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">{q.title}</h2>
                <span className="text-xs text-gray-400">{qTasks.length}</span>
              </div>
              <div className="space-y-2">
                {qTasks.length === 0 && <p className="text-xs text-gray-400 text-center py-6">Пусто</p>}
                {qTasks.map(task => {
                  const dueClasses = getDueClasses(task.due_at, task.done);
                  const isDragging = draggingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      draggable={canEditTask}
                      onDragStart={(e) => {
                        if (!canEditTask) return;
                        setDraggingTaskId(task.id);
                        e.dataTransfer.effectAllowed = 'move';
                        try { e.dataTransfer.setData('text/plain', task.id); } catch {}
                      }}
                      onDragEnd={() => { setDraggingTaskId(null); setDragOverQuadrant(null); }}
                      onClick={() => { if (!draggingTaskId) setSelectedTask(task); }}
                      className={`group border border-gray-200 rounded-md p-3 hover:border-gray-400 hover:shadow-sm bg-white transition-all ${canEditTask ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'opacity-40' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-medium text-gray-900 line-clamp-2 flex-1">{task.title}</h3>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {(task.assignees || []).length > 0 && (
                            <div className="flex -space-x-1">
                              {task.assignees.slice(0, 3).map((uid) => (
                                <Avatar key={uid} profile={getProfile(uid)} />
                              ))}
                              {task.assignees.length > 3 && (
                                <div
                                  className="w-6 h-6 rounded-full bg-gray-100 border border-white flex items-center justify-center text-xs text-gray-600"
                                  title={task.assignees.slice(3).map((u) => getName(u)).join(', ')}
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
                      <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                        {getTaskTags(task).map((tag) => (
                          <Tag key={tag.id} tag={tag} size="xs" />
                        ))}
                        {(task.checklist || []).length > 0 && (() => {
                          const total = task.checklist.length;
                          const done = task.checklist.filter((it) => it.done).length;
                          const complete = done === total;
                          return (
                            <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded ${complete ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>
                              <ListChecks size={10} /> {done}/{total}
                            </div>
                          );
                        })()}
                        {task.due_at && (
                          <div className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 border rounded ${dueClasses}`}>
                            <Calendar size={10} /> {formatDue(task.due_at)}
                          </div>
                        )}
                        {task.created_by_api_key_id && (
                          <div
                            className="inline-flex items-center gap-1 text-xs px-2 py-0.5 border border-purple-200 bg-purple-50 text-purple-700 rounded"
                            title="Создано внешним ИИ через API"
                          >
                            <Bot size={10} /> Создано ИИ
                          </div>
                        )}
                        {isRoom && canApproveRequests && (task.pendingRequests || []).length > 0 && (
                          <div className="inline-flex items-center gap-1 text-xs px-2 py-0.5 border border-blue-200 bg-blue-50 text-blue-700 rounded">
                            <MessageSquare size={10} /> {task.pendingRequests.length} {task.pendingRequests.length === 1 ? 'запрос' : 'запросов'}
                          </div>
                        )}
                      </div>
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
                {(canEditTask || canDeleteTask) && (
                  <div className="flex gap-2">
                    {canEditTask && (
                      <button onClick={() => toggleDone(task)} className="text-xs text-gray-600 hover:text-gray-900">Вернуть</button>
                    )}
                    {canDeleteTask && (
                      <button onClick={() => del(task.id)} className="text-xs text-red-600 hover:text-red-800">Удалить</button>
                    )}
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
              {selectedTask.description
                ? <LinkifiedText text={selectedTask.description} />
                : <span className="text-gray-400">Описание не указано</span>}
            </p>
            {getTaskTags(selectedTask).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <TagIcon size={12} /> Теги
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {getTaskTags(selectedTask).map((tag) => (
                    <Tag key={tag.id} tag={tag} />
                  ))}
                </div>
              </div>
            )}
            {(selectedTask.checklist || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                {(() => {
                  const items = selectedTask.checklist || [];
                  const done = items.filter((it) => it.done).length;
                  return (
                    <>
                      <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                        <ListChecks size={12} /> Чеклист · {done}/{items.length}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((it) => (
                          <label
                            key={it.id}
                            className={`flex items-start gap-2 px-2 py-1.5 rounded ${canEditChecklist ? 'hover:bg-gray-50 cursor-pointer' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={it.done}
                              disabled={!canEditChecklist}
                              onChange={(e) => toggleChecklistItem(it.id, e.target.checked)}
                              className="w-4 h-4 mt-0.5 flex-shrink-0"
                            />
                            <span className={`text-sm flex-1 ${it.done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                              {it.text}
                            </span>
                          </label>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            )}
            {isRoom && (selectedTask.assignees || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Назначены</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTask.assignees.map((uid) => (
                    <div key={uid} className="flex items-center gap-2 border border-gray-200 rounded-full pl-1 pr-3 py-0.5">
                      <Avatar profile={getProfile(uid)} />
                      <span className="text-sm text-gray-700">{getName(uid)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Для участников с approve_completion_requests: список активных запросов */}
            {isRoom && canApproveRequests && (selectedTask.pendingRequests || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <MessageSquare size={12} /> Запросы на выполнение
                </p>
                <div className="space-y-2">
                  {selectedTask.pendingRequests.map((req) => (
                    <div key={req.id} className="border border-blue-200 bg-blue-50/40 rounded-md p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <Avatar profile={getProfile(req.requester_id)} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {getName(req.requester_id)}
                          </p>
                          <p className="text-xs text-gray-500">{formatDue(req.created_at) || ''}</p>
                        </div>
                      </div>
                      {req.request_note && (
                        <p className="text-sm text-gray-700 bg-white border border-gray-200 rounded p-2 mb-2 whitespace-pre-wrap">
                          <LinkifiedText text={req.request_note} />
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setRequestModal({ mode: 'respond', requestId: req.id, action: 'approve' }); setRequestNote(''); }}
                          className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center justify-center gap-1"
                        >
                          <Check size={12} /> Одобрить
                        </button>
                        <button
                          onClick={() => { setRequestModal({ mode: 'respond', requestId: req.id, action: 'reject' }); setRequestNote(''); }}
                          className="flex-1 px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded hover:bg-red-50 flex items-center justify-center gap-1"
                        >
                          <X size={12} /> Отклонить
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Футер: разные варианты в зависимости от прав и назначения */}
          {(canEditTask || canDeleteTask) ? (
            <div className="flex items-center justify-between p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              {canEditTask && (
                <button
                  onClick={() => {
                    // Owner (или личная доска) — отмечаем напрямую без доп. модалки.
                    // Остальные с edit_any_task проходят через editor_complete,
                    // чтобы передать комментарий владельцу через триггер уведомлений.
                    if (isRoom && !isRoomOwner) {
                      setRequestModal({ mode: 'editor_complete', taskId: selectedTask.id });
                      setRequestNote('');
                    } else {
                      toggleDone(selectedTask);
                    }
                  }}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
                >
                  <Check size={16} /> Выполнено
                </button>
              )}
              <div className="flex gap-2 ml-auto">
                {canEditTask && (
                  <button onClick={() => openEdit(selectedTask)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2"><Edit2 size={14} /> Редактировать</button>
                )}
                {canDeleteTask && (
                  <button onClick={() => del(selectedTask.id)} className="px-3 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 flex items-center gap-2"><Trash2 size={14} /> Удалить</button>
                )}
              </div>
            </div>
          ) : (
            // Нет прав на edit/delete: если назначен — может отправить запрос на выполнение
            isRoom && (selectedTask.assignees || []).includes(userId) && !selectedTask.done && (
              <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                {(() => {
                  const myRequest = (selectedTask.pendingRequests || []).find(r => r.requester_id === userId);
                  if (myRequest) {
                    return (
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <p className="text-sm text-gray-700">
                          Ваш запрос на выполнение отправлен
                        </p>
                        <button
                          onClick={() => withdrawMyRequest(selectedTask.id)}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-100 text-gray-700"
                        >
                          Отозвать
                        </button>
                      </div>
                    );
                  }
                  return (
                    <button
                      onClick={() => { setRequestModal({ mode: 'create', taskId: selectedTask.id }); setRequestNote(''); }}
                      className="w-full px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center justify-center gap-2"
                    >
                      <Send size={14} /> Запросить выполнение
                    </button>
                  );
                })()}
              </div>
            )
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
            {(editingTask ? canEditTask : canCreateTask) && tags.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <TagIcon size={12} /> Теги (необязательно)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => {
                    const checked = formData.tags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          const next = checked
                            ? formData.tags.filter((id) => id !== t.id)
                            : [...formData.tags, t.id];
                          setFormData({ ...formData, tags: next });
                        }}
                        className={`rounded transition-all ${
                          checked ? 'ring-2 ring-gray-900 ring-offset-1' : 'opacity-60 hover:opacity-100'
                        }`}
                        aria-pressed={checked}
                      >
                        <Tag tag={t} />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {(editingTask ? canEditChecklist : canCreateTask) && (
              <div>
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <ListChecks size={12} /> Чеклист (необязательно · до {MAX_CHECKLIST_ITEMS} пунктов)
                </label>
                {formData.checklist.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => setFormData({ ...formData, checklist: [{ text: '', done: false }] })}
                    className="w-full px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg hover:bg-gray-50 text-gray-600 flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Включить чеклист
                  </button>
                ) : (
                  <div className="space-y-2">
                    {formData.checklist.map((it, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={(e) => {
                            const next = [...formData.checklist];
                            next[idx] = { ...next[idx], done: e.target.checked };
                            setFormData({ ...formData, checklist: next });
                          }}
                          className="w-4 h-4 flex-shrink-0"
                        />
                        <input
                          type="text"
                          value={it.text}
                          placeholder={`Пункт ${idx + 1}`}
                          maxLength={200}
                          onChange={(e) => {
                            const next = [...formData.checklist];
                            next[idx] = { ...next[idx], text: e.target.value };
                            setFormData({ ...formData, checklist: next });
                          }}
                          className={`flex-1 min-w-0 px-3 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-gray-900 ${it.done ? 'line-through text-gray-400' : ''}`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const next = formData.checklist.filter((_, i) => i !== idx);
                            setFormData({ ...formData, checklist: next });
                          }}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"
                          aria-label="Удалить пункт"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, checklist: [...formData.checklist, { text: '', done: false }] })}
                      disabled={formData.checklist.length >= MAX_CHECKLIST_ITEMS}
                      className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    >
                      <Plus size={12} /> Добавить пункт
                      {formData.checklist.length >= MAX_CHECKLIST_ITEMS && ` (максимум ${MAX_CHECKLIST_ITEMS})`}
                    </button>
                  </div>
                )}
              </div>
            )}
            {canAssign && members.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
                  <UserPlus size={12} /> Назначить участников (необязательно)
                </label>
                <div className="border border-gray-300 rounded-lg max-h-48 overflow-y-auto">
                  {members.map((m) => {
                    const checked = formData.assignees.includes(m.user_id);
                    const name = getName(m.user_id);
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
                        <Avatar profile={getProfile(m.user_id)} />
                        <span className="text-sm text-gray-800 flex-1">{name}</span>
                        {m.role === 'owner' && (
                          <span className="text-xs text-amber-700">Владелец</span>
                        )}
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

      {/* Модалка: запрос (зритель), ответ на запрос (owner/editor) или выполнение с комментарием (помощник) */}
      {requestModal && (
        <Modal onClose={() => { setRequestModal(null); setRequestNote(''); }}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">
              {requestModal.mode === 'create' && 'Запросить выполнение'}
              {requestModal.mode === 'editor_complete' && 'Отметить задачу выполненной'}
              {requestModal.mode === 'respond' && requestModal.action === 'approve' && 'Одобрить запрос'}
              {requestModal.mode === 'respond' && requestModal.action === 'reject' && 'Отклонить запрос'}
            </h2>
            <button onClick={() => { setRequestModal(null); setRequestNote(''); }} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6 space-y-3">
            <p className="text-sm text-gray-600">
              {requestModal.mode === 'create' && 'Владелец и помощники комнаты получат уведомление. Опишите, что сделано — это обязательно.'}
              {requestModal.mode === 'editor_complete' && 'Задача будет отмечена выполненной, владелец получит уведомление. Можете добавить комментарий (необязательно).'}
              {requestModal.mode === 'respond' && requestModal.action === 'approve' && 'Задача будет отмечена выполненной. Отправитель получит уведомление.'}
              {requestModal.mode === 'respond' && requestModal.action === 'reject' && 'Запрос будет отклонён. Отправитель получит уведомление.'}
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">
                {requestModal.mode === 'create' ? (<>Комментарий <span className="text-red-500 normal-case">*</span></>) : 'Комментарий (необязательно)'}
              </label>
              <textarea
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                placeholder={
                  requestModal.mode === 'create' ? 'Например: всё готово, прошу проверить'
                  : requestModal.mode === 'editor_complete' ? 'Например: сделано, отчёт прикреплён'
                  : 'Коротко опишите причину или благодарите'
                }
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900 resize-none text-sm"
                autoFocus
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => { setRequestModal(null); setRequestNote(''); }}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
              disabled={requestSubmitting}
            >
              Отмена
            </button>
            {requestModal.mode === 'create' ? (
              <button
                onClick={submitCreateRequest}
                disabled={requestSubmitting || !requestNote.trim()}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-2"
              >
                <Send size={14} /> {requestSubmitting ? 'Отправляем...' : 'Отправить'}
              </button>
            ) : requestModal.mode === 'editor_complete' ? (
              <button
                onClick={submitEditorComplete}
                disabled={requestSubmitting}
                className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 flex items-center gap-2"
              >
                <Check size={14} /> {requestSubmitting ? 'Сохраняем...' : 'Выполнено'}
              </button>
            ) : requestModal.action === 'approve' ? (
              <button
                onClick={submitRespondRequest}
                disabled={requestSubmitting}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-300 flex items-center gap-2"
              >
                <Check size={14} /> {requestSubmitting ? 'Одобряем...' : 'Одобрить'}
              </button>
            ) : (
              <button
                onClick={submitRespondRequest}
                disabled={requestSubmitting}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300 flex items-center gap-2"
              >
                <X size={14} /> {requestSubmitting ? 'Отклоняем...' : 'Отклонить'}
              </button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
