import Link from 'next/link';
import { headers } from 'next/headers';
import { ArrowLeft, KeyRound, Code, Bot, Terminal, FileJson, BookOpen } from 'lucide-react';

export const dynamic = 'force-dynamic';

function Endpoint({ method, path, desc }) {
  const color = {
    GET: 'bg-blue-100 text-blue-700 border-blue-200',
    POST: 'bg-green-100 text-green-700 border-green-200',
    PATCH: 'bg-amber-100 text-amber-700 border-amber-200',
    DELETE: 'bg-red-100 text-red-700 border-red-200'
  }[method];
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-b-0">
      <span className={`text-xs font-mono font-bold px-2 py-1 rounded border ${color} flex-shrink-0 w-16 text-center`}>{method}</span>
      <div className="min-w-0 flex-1">
        <code className="text-sm font-mono text-gray-900 break-all">{path}</code>
        <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

export default async function ApiDocsPage() {
  const h = await headers();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') || 'https';
  const base = `${proto}://${host}`;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Link href="/" className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1 mb-4">
        <ArrowLeft size={16} /> На главную
      </Link>

      <h1 className="text-3xl font-semibold text-gray-900">Taskboard API</h1>
      <p className="text-gray-600 mt-2">
        Подключите ChatGPT, Claude Desktop или любой скрипт к своим задачам — и пусть ИИ помогает вам их планировать и закрывать.
      </p>

      <section className="mt-8 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><KeyRound size={18} /> Как получить ключ</h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-1">
          <li>Залогиньтесь на сайт.</li>
          <li>Откройте <Link href="/profile/api-keys" className="underline hover:text-gray-900">Профиль → API-ключи</Link>.</li>
          <li>Нажмите «Создать ключ», задайте имя (например «My ChatGPT»).</li>
          <li>Скопируйте ключ — он показывается один раз.</li>
        </ol>
        <p className="text-xs text-gray-500 mt-3">
          Ключ — это секрет, который даёт доступ ко всем вашим задачам. Не публикуйте его, не коммитьте в репозитории, не отправляйте по email. Если утечёт — немедленно отзовите на той же странице.
        </p>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><Bot size={18} /> Подключение к ChatGPT (Custom GPT)</h2>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2">
          <li>Откройте <a href="https://chatgpt.com/gpts/editor" target="_blank" rel="noreferrer" className="underline hover:text-gray-900">редактор Custom GPT</a> (требуется ChatGPT Plus/Pro).</li>
          <li>Перейдите на вкладку <strong>Configure</strong> → <strong>Actions</strong> → <strong>Create new action</strong>.</li>
          <li>В поле <strong>Schema</strong> нажмите «Import from URL» и вставьте:
            <div className="bg-gray-50 border border-gray-200 rounded p-2 font-mono text-xs mt-1 break-all">{base}/api/v1/openapi.json</div>
          </li>
          <li>В <strong>Authentication</strong> → выберите <strong>API Key</strong>, Auth Type: <strong>Bearer</strong>, вставьте свой ключ.</li>
          <li>Сохраните. GPT теперь может вызывать все эндпоинты от вашего имени.</li>
        </ol>
        <p className="text-xs text-gray-500 mt-3">
          Пример запросов к GPT: <em>«Создай мне в Taskboard 5 задач для подготовки к экзамену по биологии»</em>, <em>«Покажи все незавершённые важные задачи»</em>, <em>«Отметь задачу X как выполненную»</em>.
        </p>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><Terminal size={18} /> Подключение к Claude Desktop (MCP)</h2>
        <p className="text-sm text-gray-700 mb-3">
          MCP (Model Context Protocol) — стандарт Anthropic, через него Claude Desktop подключается к внешним сервисам. У Taskboard есть готовый MCP-сервер.
        </p>
        <ol className="list-decimal list-inside text-sm text-gray-700 space-y-2">
          <li>Убедитесь, что установлены <strong>Node.js 18+</strong> и <strong>Claude Desktop</strong>.</li>
          <li>Откройте файл конфигурации Claude Desktop:
            <ul className="list-disc list-inside pl-4 mt-1 text-xs text-gray-600">
              <li>macOS: <code className="font-mono">~/Library/Application Support/Claude/claude_desktop_config.json</code></li>
              <li>Windows: <code className="font-mono">%APPDATA%\Claude\claude_desktop_config.json</code></li>
            </ul>
          </li>
          <li>Добавьте туда (подставьте ваш ключ):
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded mt-2 overflow-x-auto">{`{
  "mcpServers": {
    "taskboard": {
      "command": "node",
      "args": ["/полный/путь/к/taskboard/mcp-server/index.js"],
      "env": {
        "TASKBOARD_API_KEY": "tb_live_...",
        "TASKBOARD_API_URL": "${base}/api/v1"
      }
    }
  }
}`}</pre>
          </li>
          <li>Перезапустите Claude Desktop. В списке инструментов появятся <code className="font-mono text-xs">list_tasks</code>, <code className="font-mono text-xs">create_task</code>, и т.д.</li>
        </ol>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><Code size={18} /> Примеры cURL</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">Получить свои задачи:</p>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-x-auto">{`curl "${base}/api/v1/tasks?done=false" \\
  -H "Authorization: Bearer tb_live_..."`}</pre>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Создать задачу:</p>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-x-auto">{`curl -X POST "${base}/api/v1/tasks" \\
  -H "Authorization: Bearer tb_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"title":"Подготовить презентацию","important":true,"urgent":false}'`}</pre>
          </div>
          <div>
            <p className="text-xs text-gray-500 mb-1">Отметить задачу выполненной:</p>
            <pre className="bg-gray-900 text-gray-100 text-xs p-3 rounded overflow-x-auto">{`curl -X POST "${base}/api/v1/tasks/<task_id>/complete" \\
  -H "Authorization: Bearer tb_live_..."`}</pre>
          </div>
        </div>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><BookOpen size={18} /> Все эндпоинты</h2>
        <p className="text-xs text-gray-500 mb-3">Базовый URL: <code className="font-mono">{base}/api/v1</code>. Все запросы требуют заголовок <code className="font-mono">Authorization: Bearer tb_live_...</code>.</p>

        <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1">Пользователь</h3>
        <div className="border border-gray-200 rounded-lg px-3">
          <Endpoint method="GET" path="/me" desc="Профиль текущего пользователя" />
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1">Личные задачи</h3>
        <div className="border border-gray-200 rounded-lg px-3">
          <Endpoint method="GET" path="/tasks" desc="Список личных задач. Фильтры: ?important=&urgent=&done=, пагинация ?limit=&offset=" />
          <Endpoint method="POST" path="/tasks" desc="Создать личную задачу" />
          <Endpoint method="GET" path="/tasks/{id}" desc="Получить одну задачу" />
          <Endpoint method="PATCH" path="/tasks/{id}" desc="Обновить поля задачи" />
          <Endpoint method="DELETE" path="/tasks/{id}" desc="Удалить задачу" />
          <Endpoint method="POST" path="/tasks/{id}/complete" desc="Отметить выполненной" />
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mt-4 mb-1">Комнаты</h3>
        <div className="border border-gray-200 rounded-lg px-3">
          <Endpoint method="GET" path="/rooms" desc="Все мои комнаты" />
          <Endpoint method="POST" path="/rooms" desc="Создать комнату (стать её владельцем)" />
          <Endpoint method="GET" path="/rooms/{id}" desc="Детали комнаты" />
          <Endpoint method="PATCH" path="/rooms/{id}" desc="Переименовать (только владелец)" />
          <Endpoint method="DELETE" path="/rooms/{id}" desc="Удалить (только владелец)" />
          <Endpoint method="GET" path="/rooms/{id}/tasks" desc="Задачи в комнате" />
          <Endpoint method="POST" path="/rooms/{id}/tasks" desc="Создать задачу в комнате (владелец/помощник)" />
          <Endpoint method="GET" path="/rooms/{id}/members" desc="Участники комнаты" />
        </div>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3"><FileJson size={18} /> OpenAPI-спека</h2>
        <p className="text-sm text-gray-700">Машинно-читаемое описание всех эндпоинтов в формате OpenAPI 3.1:</p>
        <a
          href="/api/v1/openapi.json"
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-sm bg-gray-50 border border-gray-300 rounded px-3 py-1.5 font-mono hover:bg-gray-100"
        >{base}/api/v1/openapi.json</a>
      </section>

      <section className="mt-6 bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-3">Ограничения и безопасность</h2>
        <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
          <li><strong>Rate limit:</strong> 60 запросов в минуту на ключ. При превышении — <code className="font-mono">429</code>, заголовок <code className="font-mono">Retry-After</code>.</li>
          <li><strong>Маркировка:</strong> задачи, созданные через API, помечены на доске бейджем «🤖 Создано ИИ».</li>
          <li><strong>Права:</strong> ключ действует от имени пользователя. В комнате, где вы viewer, API не позволит создавать/изменять задачи (403).</li>
          <li><strong>Отзыв:</strong> отозвать ключ можно в любой момент — доступ прекращается немедленно.</li>
        </ul>
      </section>
    </div>
  );
}
