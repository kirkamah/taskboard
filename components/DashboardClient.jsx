'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { LayoutGrid, Plus, Users, LogIn, X, Copy } from 'lucide-react';
import { Modal } from '@/components/UI';

export default function DashboardClient({ userName }) {
  const router = useRouter();
  const supabase = createClient();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [createdRoom, setCreatedRoom] = useState(null);
  const [creating, setCreating] = useState(false);

  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joinInfo, setJoinInfo] = useState(null); // { roomId, status, role } для already_member / owner
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  };

  const handleCreateRoom = async () => {
    if (!newRoomName.trim()) return;
    setCreating(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Пробуем до 3-х раз на случай коллизии кода
    let attempt = 0;
    let created = null;
    while (attempt < 3 && !created) {
      const code = generateRoomCode();
      const { data, error } = await supabase
        .from('rooms')
        .insert({ code, name: newRoomName.trim(), owner_id: user.id })
        .select()
        .single();
      if (!error) created = data;
      attempt++;
    }
    setCreating(false);
    if (created) setCreatedRoom(created);
  };

  const handleJoin = async () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) return;
    setJoining(true);
    setJoinError('');
    setJoinInfo(null);

    // Используем RPC-функцию: возвращает { room_id, status, role }
    const { data, error } = await supabase.rpc('join_room_by_code', { _code: code });

    setJoining(false);

    if (error || !data || !data.room_id) {
      setJoinError('Комната не найдена. Проверьте код.');
      return;
    }

    // Если только что присоединился как новый участник — сразу в комнату
    if (data.status === 'joined') {
      router.push(`/room/${data.room_id}`);
      return;
    }

    // Иначе показываем сообщение «вы уже там, как [роль]»
    setJoinInfo({ roomId: data.room_id, status: data.status, role: data.role });
  };

  const roleLabel = (role) => ({
    owner: 'Владелец',
    editor: 'Редактор',
    viewer: 'Наблюдатель'
  }[role] || role);

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewRoomName('');
    setCreatedRoom(null);
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="text-center mb-10">
        <h1 className="text-3xl font-semibold text-gray-900">Привет, {userName}</h1>
        <p className="text-gray-500 mt-2">Выбери, что хочешь сделать</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <Link href="/my-board" className="bg-white border border-gray-200 rounded-lg p-6 text-left hover:border-gray-900 hover:shadow-sm transition-all">
          <LayoutGrid size={24} className="text-gray-700 mb-3" />
          <h2 className="font-semibold text-gray-900">Моя доска</h2>
          <p className="text-sm text-gray-500 mt-1">Личные задачи, видишь только ты</p>
        </Link>

        <button onClick={() => setShowCreateModal(true)} className="bg-white border border-gray-200 rounded-lg p-6 text-left hover:border-gray-900 hover:shadow-sm transition-all">
          <Plus size={24} className="text-gray-700 mb-3" />
          <h2 className="font-semibold text-gray-900">Создать комнату</h2>
          <p className="text-sm text-gray-500 mt-1">Общая доска с кодом приглашения</p>
        </button>

        <Link href="/teams" className="bg-white border border-gray-200 rounded-lg p-6 text-left hover:border-gray-900 hover:shadow-sm transition-all">
          <Users size={24} className="text-gray-700 mb-3" />
          <h2 className="font-semibold text-gray-900">Мои команды</h2>
          <p className="text-sm text-gray-500 mt-1">Комнаты, где ты участник</p>
        </Link>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <div className="flex items-center gap-2 mb-3">
          <LogIn size={18} className="text-gray-700" />
          <h2 className="font-semibold text-gray-900">Присоединиться к чужой доске</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Введи код, который тебе прислали</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={joinCode}
            onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(''); setJoinInfo(null); }}
            placeholder="ABCD1234"
            maxLength={8}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg font-mono tracking-widest uppercase focus:outline-none focus:border-gray-900"
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
          />
          <button
            onClick={handleJoin}
            disabled={joinCode.length < 1 || joining}
            className="px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            {joining ? 'Входим...' : 'Войти'}
          </button>
        </div>
        {joinError && <p className="text-sm text-red-600 mt-2">{joinError}</p>}
        {joinInfo && (
          <div className="mt-3 border border-gray-300 bg-gray-50 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-gray-700">
              {joinInfo.status === 'owner'
                ? 'Это ваша комната — она уже у вас в списке «Мои команды».'
                : `Вы уже в этой комнате как ${roleLabel(joinInfo.role)}.`}
            </p>
            <button
              onClick={() => router.push(`/room/${joinInfo.roomId}`)}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
            >
              Перейти
            </button>
          </div>
        )}
      </div>

      {showCreateModal && (
        <Modal onClose={closeCreateModal}>
          {!createdRoom ? (
            <>
              <div className="flex items-center justify-between p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Новая комната</h2>
                <button onClick={closeCreateModal} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
              </div>
              <div className="p-6">
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Название комнаты</label>
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  placeholder="Например: Команда разработки"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateRoom()}
                />
              </div>
              <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <button onClick={closeCreateModal} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">Отмена</button>
                <button onClick={handleCreateRoom} disabled={!newRoomName.trim() || creating} className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300">
                  {creating ? 'Создаём...' : 'Создать'}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold">Комната создана</h2>
                <p className="text-sm text-gray-500 mt-1">Поделитесь кодом с теми, кого хотите пригласить</p>
              </div>
              <div className="p-6">
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Код комнаты</label>
                <div className="flex gap-2">
                  <div className="flex-1 px-4 py-3 border-2 border-gray-900 rounded-lg font-mono text-2xl tracking-widest text-center bg-gray-50">
                    {createdRoom.code}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard?.writeText(createdRoom.code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className="px-4 border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2"
                  >
                    <Copy size={14} /> {copied ? 'Скопировано' : 'Копировать'}
                  </button>
                </div>
              </div>
              <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <button
                  onClick={() => router.push(`/room/${createdRoom.id}`)}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800"
                >
                  Перейти в комнату
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
