'use client';

import { useState, useEffect } from 'react';
import { Plus, X, Copy, KeyRound, AlertTriangle, Check } from 'lucide-react';
import { Modal } from '@/components/UI';
import { createApiKey, revokeApiKey } from '@/app/profile/api-keys/actions';

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatAgo(iso) {
  if (!iso) return 'никогда';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'только что';
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'вчера';
  if (days < 30) return `${days} дн назад`;
  return formatDate(iso);
}

export default function ApiKeysClient({ initialKeys }) {
  const [keys, setKeys] = useState(initialKeys);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [revealKey, setRevealKey] = useState(null); // { id, name, prefix, full }
  const [revokeTarget, setRevokeTarget] = useState(null);
  const [revoking, setRevoking] = useState(false);

  const startCreate = () => { setShowCreate(true); setNewName(''); setCreateError(''); };
  const cancelCreate = () => { setShowCreate(false); setNewName(''); setCreateError(''); };

  const doCreate = async () => {
    setCreating(true);
    setCreateError('');
    const res = await createApiKey(newName);
    setCreating(false);
    if (res.error) { setCreateError(res.error); return; }
    setShowCreate(false);
    setNewName('');
    setRevealKey(res.key);
    setKeys((prev) => [{ ...res.key, last_used_at: null, revoked_at: null }, ...prev]);
  };

  const doRevoke = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    const res = await revokeApiKey(revokeTarget.id);
    setRevoking(false);
    if (res.error) { alert(res.error); return; }
    setKeys((prev) => prev.map(k => k.id === revokeTarget.id ? { ...k, revoked_at: new Date().toISOString() } : k));
    setRevokeTarget(null);
  };

  const activeKeys = keys.filter(k => !k.revoked_at);
  const revokedKeys = keys.filter(k => k.revoked_at);

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={startCreate}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
        >
          <Plus size={14} /> Создать ключ
        </button>
      </div>

      {keys.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
          <KeyRound size={32} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">У вас пока нет API-ключей</p>
          <p className="text-sm text-gray-400 mt-1">Создайте ключ, чтобы подключить ИИ к своим задачам</p>
        </div>
      )}

      {activeKeys.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 mb-4">
          {activeKeys.map(k => (
            <div key={k.id} className="p-4 flex items-start gap-3">
              <div className="mt-0.5 text-gray-400"><KeyRound size={16} /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 truncate">{k.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{k.prefix}{'•'.repeat(26)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Создан: {formatDate(k.created_at)} · Последнее использование: {formatAgo(k.last_used_at)}
                </p>
              </div>
              <button
                onClick={() => setRevokeTarget(k)}
                className="flex-shrink-0 px-3 py-1.5 text-sm text-red-600 border border-red-200 rounded-lg hover:bg-red-50"
              >
                Отозвать
              </button>
            </div>
          ))}
        </div>
      )}

      {revokedKeys.length > 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg divide-y divide-gray-200">
          <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">Отозванные</div>
          {revokedKeys.map(k => (
            <div key={k.id} className="p-4 flex items-start gap-3 opacity-60">
              <div className="mt-0.5 text-gray-400"><KeyRound size={16} /></div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-gray-700 truncate line-through">{k.name}</h3>
                <p className="text-xs text-gray-500 font-mono mt-0.5">{k.prefix}{'•'.repeat(26)}</p>
                <p className="text-xs text-gray-400 mt-1">
                  Отозван: {formatDate(k.revoked_at)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <Modal onClose={cancelCreate}>
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Новый API-ключ</h2>
            <button onClick={cancelCreate} className="text-gray-400 hover:text-gray-700"><X size={22} /></button>
          </div>
          <div className="p-6">
            <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Название</label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Например: My ChatGPT"
              maxLength={100}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && newName.trim()) doCreate(); }}
            />
            <p className="text-xs text-gray-500 mt-2">
              Название видно только вам — оно помогает отличать ключи друг от друга.
            </p>
            {createError && <p className="text-sm text-red-600 mt-3">{createError}</p>}
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button onClick={cancelCreate} className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100">Отмена</button>
            <button
              onClick={doCreate}
              disabled={!newName.trim() || creating}
              className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
            >
              {creating ? 'Создаём...' : 'Создать'}
            </button>
          </div>
        </Modal>
      )}

      {revealKey && (
        <RevealKeyModal
          keyData={revealKey}
          onClose={() => setRevealKey(null)}
        />
      )}

      {revokeTarget && (
        <Modal onClose={() => (!revoking ? setRevokeTarget(null) : null)}>
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <AlertTriangle size={18} className="text-red-600" />
              Отозвать ключ?
            </h2>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-700">
              Ключ <span className="font-semibold">«{revokeTarget.name}»</span> будет отозван.
              Все приложения и ИИ, использующие этот ключ, <span className="font-semibold">перестанут работать</span>.
            </p>
            <p className="text-xs text-gray-500 mt-3">Это действие нельзя отменить.</p>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
            <button
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
              className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-100"
            >
              Отмена
            </button>
            <button
              onClick={doRevoke}
              disabled={revoking}
              className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:bg-gray-300"
            >
              {revoking ? 'Отзываем...' : 'Отозвать'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RevealKeyModal({ keyData, onClose }) {
  // Countdown prevents reflexive dismissal of a secret the user must save.
  const [secondsLeft, setSecondsLeft] = useState(3);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setTimeout(() => setSecondsLeft(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft]);

  const canClose = secondsLeft === 0;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(keyData.full);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard API may fail in non-secure contexts; user can select manually
    }
  };

  return (
    <Modal onClose={() => (canClose ? onClose() : null)} wide>
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <KeyRound size={18} className="text-gray-700" />
          Ключ «{keyData.name}» создан
        </h2>
      </div>
      <div className="p-6 space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-900 flex items-start gap-2">
          <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Этот ключ показывается ОДИН РАЗ.</p>
            <p className="mt-1">После закрытия окна вы больше его не увидите. Скопируйте и сохраните его в надёжном месте (менеджер паролей, зашифрованная заметка).</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-2">Ваш API-ключ</label>
          <div className="flex gap-2">
            <div className="flex-1 px-3 py-2 border-2 border-gray-900 rounded-lg font-mono text-sm bg-gray-50 break-all select-all">
              {keyData.full}
            </div>
            <button
              onClick={copy}
              className="flex-shrink-0 px-3 border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-1 text-sm"
            >
              {copied ? <><Check size={14} /> Скопировано</> : <><Copy size={14} /> Копировать</>}
            </button>
          </div>
        </div>
      </div>
      <div className="flex justify-end p-4 border-t border-gray-200 bg-gray-50 rounded-b-lg">
        <button
          onClick={onClose}
          disabled={!canClose}
          className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {canClose ? 'Я скопировал, закрыть' : `Я скопировал, закрыть (${secondsLeft})`}
        </button>
      </div>
    </Modal>
  );
}
