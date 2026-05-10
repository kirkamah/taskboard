'use client';

import { useState } from 'react';
import { Trash2, Plus, RefreshCw, Power, PowerOff, Copy, Check } from 'lucide-react';
import { createWebhook, deleteWebhook, toggleWebhook, rotateWebhookSecret } from '@/app/profile/webhooks/actions';

export default function WebhooksClient({ initialHooks }) {
  const [hooks, setHooks] = useState(initialHooks);
  const [url, setUrl] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [revealedSecrets, setRevealedSecrets] = useState({}); // id → bool
  const [copied, setCopied] = useState({}); // id → bool

  const create = async () => {
    setError('');
    setCreating(true);
    const res = await createWebhook(url);
    setCreating(false);
    if (res.error) { setError(res.error); return; }
    setHooks((prev) => [res.webhook, ...prev]);
    setUrl('');
  };

  const remove = async (id) => {
    if (!window.confirm('Удалить подписку? Доставка остановится.')) return;
    const res = await deleteWebhook(id);
    if (res.error) { setError(res.error); return; }
    setHooks((prev) => prev.filter((h) => h.id !== id));
  };

  const toggle = async (h) => {
    const res = await toggleWebhook(h.id, !h.is_active);
    if (res.error) { setError(res.error); return; }
    setHooks((prev) => prev.map((x) => x.id === h.id ? { ...x, is_active: !h.is_active } : x));
  };

  const rotate = async (id) => {
    if (!window.confirm('Сгенерировать новый секрет? Старый перестанет работать сразу.')) return;
    const res = await rotateWebhookSecret(id);
    if (res.error) { setError(res.error); return; }
    setHooks((prev) => prev.map((x) => x.id === id ? { ...x, secret: res.webhook.secret } : x));
    setRevealedSecrets((prev) => ({ ...prev, [id]: true }));
  };

  const copy = (id, text) => {
    navigator.clipboard?.writeText(text);
    setCopied((prev) => ({ ...prev, [id]: true }));
    setTimeout(() => setCopied((prev) => ({ ...prev, [id]: false })), 1500);
  };

  return (
    <div>
      <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
        <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2"><Plus size={16} /> Добавить webhook</h2>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/webhook"
            className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-gray-900"
          />
          <button
            onClick={create}
            disabled={creating || !url.trim()}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:bg-gray-300"
          >
            {creating ? '…' : 'Добавить'}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      {hooks.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-6">Подписок пока нет.</p>
      ) : (
        <div className="space-y-2">
          {hooks.map((h) => (
            <div key={h.id} className="bg-white border border-gray-200 rounded-lg p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate" title={h.url}>{h.url}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Создан {new Date(h.created_at).toLocaleDateString('ru-RU')}
                    {h.last_delivered_at && <> · последняя доставка {new Date(h.last_delivered_at).toLocaleString('ru-RU')}</>}
                  </p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => toggle(h)}
                    className={`p-1.5 rounded ${h.is_active ? 'text-green-700 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                    title={h.is_active ? 'Активен — отключить' : 'Отключён — включить'}
                  >
                    {h.is_active ? <Power size={14} /> : <PowerOff size={14} />}
                  </button>
                  <button
                    onClick={() => rotate(h.id)}
                    className="p-1.5 rounded text-gray-500 hover:bg-gray-100"
                    title="Перевыпустить секрет"
                  >
                    <RefreshCw size={14} />
                  </button>
                  <button
                    onClick={() => remove(h.id)}
                    className="p-1.5 rounded text-red-500 hover:bg-red-50"
                    title="Удалить"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <div className="text-xs">
                <button
                  onClick={() => setRevealedSecrets((p) => ({ ...p, [h.id]: !p[h.id] }))}
                  className="text-gray-500 hover:text-gray-900 mr-2"
                >
                  {revealedSecrets[h.id] ? 'Скрыть секрет' : 'Показать секрет'}
                </button>
                {revealedSecrets[h.id] && (
                  <span className="inline-flex items-center gap-1 font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1">
                    <span className="break-all">{h.secret}</span>
                    <button onClick={() => copy(h.id, h.secret)} className="text-gray-500 hover:text-gray-900 flex-shrink-0">
                      {copied[h.id] ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
        <h3 className="font-semibold text-gray-900 mb-2">Формат запроса</h3>
        <p className="mb-2">Каждое событие отправляется методом <code className="bg-white px-1 rounded">POST</code> с JSON-телом:</p>
        <pre className="text-xs bg-white border border-gray-200 rounded p-2 overflow-x-auto">{`{
  "event_id": "uuid",
  "task_id": "uuid",
  "kind": "task_created" | "task_updated" | "assignee_added" | ...,
  "actor_id": "uuid | null",
  "payload": { ... },
  "created_at": "2026-...",
  "scope": { "owner_id": "uuid | null", "room_id": "uuid | null" }
}`}</pre>
        <h3 className="font-semibold text-gray-900 mt-3 mb-2">Заголовки</h3>
        <ul className="list-disc pl-5 text-xs space-y-1">
          <li><code className="bg-white px-1 rounded">X-Taskboard-Signature: sha256=&lt;hex&gt;</code> — HMAC-SHA256 от тела запроса с твоим секретом. Сверяйте перед обработкой.</li>
          <li><code className="bg-white px-1 rounded">X-Taskboard-Event</code> — тип события.</li>
          <li><code className="bg-white px-1 rounded">X-Taskboard-Subscription</code> — id подписки.</li>
        </ul>
      </div>
    </div>
  );
}
