import { NextResponse } from 'next/server';

// Public OpenAPI 3.1 document describing the Taskboard API.
// Custom GPTs in ChatGPT ingest this URL directly. No auth required to read it.

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const origin = new URL(request.url).origin;

  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'Taskboard API',
      description:
        'REST API для сервиса Taskboard. Позволяет внешнему ИИ или скрипту управлять личными и командными задачами пользователя.',
      version: '1.0.0'
    },
    servers: [{ url: `${origin}/api/v1` }],
    security: [{ bearerAuth: [] }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API key (tb_live_...)',
          description: 'Передайте API-ключ вида `tb_live_...` в заголовке `Authorization: Bearer <key>`.'
        }
      },
      schemas: {
        Me: {
          type: 'object',
          required: ['id', 'email', 'display_name'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            email: { type: 'string' },
            display_name: { type: 'string' }
          }
        },
        Task: {
          type: 'object',
          required: ['id', 'title', 'description', 'important', 'urgent', 'done', 'created_at', 'tags'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            important: { type: 'boolean', description: 'Квадрант матрицы Эйзенхауэра. important+urgent=Сделать сразу, important=Запланировать, urgent=Делегировать, ни то ни другое=Не делать. См. также POST /tasks/{id}/move.' },
            urgent: { type: 'boolean' },
            done: { type: 'boolean' },
            room_id: { type: ['string', 'null'], format: 'uuid' },
            owner_id: { type: ['string', 'null'], format: 'uuid' },
            due_at: { type: ['string', 'null'], format: 'date-time' },
            created_at: { type: 'string', format: 'date-time' },
            created_by_api_key_id: { type: ['string', 'null'], format: 'uuid', description: 'Если не null — задача создана через API (не через UI).' },
            tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' }, description: 'Теги, назначенные задаче.' }
          }
        },
        Tag: {
          type: 'object',
          required: ['id', 'name', 'color'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string', maxLength: 24 },
            color: { type: 'string', enum: ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'] },
            room_id: { type: ['string', 'null'], format: 'uuid', description: 'Если задан — тег комнаты. Иначе личный тег (тогда owner_id=владелец).' },
            owner_id: { type: ['string', 'null'], format: 'uuid' }
          }
        },
        CreateTagBody: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', maxLength: 24 },
            color: { type: 'string', enum: ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'], default: 'gray' },
            room_id: { type: ['string', 'null'], format: 'uuid', description: 'Если задан — тег будет принадлежать комнате (нужно право manage_tags). Иначе создастся личный тег.' }
          }
        },
        PatchTagBody: {
          type: 'object',
          properties: {
            name: { type: 'string', maxLength: 24 },
            color: { type: 'string', enum: ['gray', 'red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'purple', 'pink'] }
          }
        },
        MoveTaskBody: {
          type: 'object',
          required: ['quadrant'],
          properties: {
            quadrant: {
              type: 'string',
              enum: ['do', 'plan', 'delegate', 'drop'],
              description: 'do = важно+срочно (Сделать сразу); plan = важно (Запланировать); delegate = срочно (Делегировать); drop = ни важно, ни срочно (Не делать).'
            }
          }
        },
        AttachTagBody: {
          type: 'object',
          required: ['tag_id'],
          properties: {
            tag_id: { type: 'string', format: 'uuid' }
          }
        },
        Room: {
          type: 'object',
          required: ['id', 'code', 'name', 'owner_id', 'created_at'],
          properties: {
            id: { type: 'string', format: 'uuid' },
            code: { type: 'string', description: '8-символьный код комнаты для приглашения' },
            name: { type: 'string' },
            owner_id: { type: 'string', format: 'uuid' },
            created_at: { type: 'string', format: 'date-time' },
            my_role: { type: ['string', 'null'], enum: ['owner', 'member', 'editor', 'viewer', null] }
          }
        },
        Member: {
          type: 'object',
          properties: {
            user_id: { type: 'string', format: 'uuid' },
            role: { type: 'string', enum: ['owner', 'member', 'editor', 'viewer'] },
            joined_at: { type: 'string', format: 'date-time' },
            display_name: { type: ['string', 'null'] },
            avatar_emoji: { type: ['string', 'null'] },
            avatar_color: { type: 'string' }
          }
        },
        Error: {
          type: 'object',
          required: ['error'],
          properties: {
            error: {
              type: 'object',
              required: ['code', 'message'],
              properties: {
                code: { type: 'string' },
                message: { type: 'string' }
              }
            }
          }
        },
        CreateTaskBody: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', maxLength: 500 },
            description: { type: 'string' },
            important: { type: 'boolean', default: true },
            urgent: { type: 'boolean', default: true },
            due_at: { type: ['string', 'null'], format: 'date-time' }
          }
        },
        PatchTaskBody: {
          type: 'object',
          properties: {
            title: { type: 'string', maxLength: 500 },
            description: { type: 'string' },
            important: { type: 'boolean' },
            urgent: { type: 'boolean' },
            done: { type: 'boolean' },
            due_at: { type: ['string', 'null'], format: 'date-time' }
          }
        }
      },
      responses: {
        Unauthorized: {
          description: 'Invalid or missing API key',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        Forbidden: {
          description: 'API key valid but the caller is not permitted to perform this action',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        NotFound: {
          description: 'Resource not found or not accessible',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        },
        RateLimited: {
          description: '60 requests per minute per API key exceeded',
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } }
        }
      },
      parameters: {
        ImportantFilter: {
          name: 'important', in: 'query', required: false,
          schema: { type: 'boolean' },
          description: 'Фильтр по флагу important'
        },
        UrgentFilter: {
          name: 'urgent', in: 'query', required: false,
          schema: { type: 'boolean' },
          description: 'Фильтр по флагу urgent'
        },
        DoneFilter: {
          name: 'done', in: 'query', required: false,
          schema: { type: 'boolean' },
          description: 'Фильтр по флагу done'
        },
        LimitParam: {
          name: 'limit', in: 'query', required: false,
          schema: { type: 'integer', default: 50, maximum: 200, minimum: 1 }
        },
        OffsetParam: {
          name: 'offset', in: 'query', required: false,
          schema: { type: 'integer', default: 0, minimum: 0 }
        },
        RoomIdPath: {
          name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
        },
        TaskIdPath: {
          name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
        },
        TagIdPath: {
          name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
        },
        TagIdOnTaskPath: {
          name: 'tagId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' }
        }
      }
    },
    paths: {
      '/me': {
        get: {
          operationId: 'getMe',
          summary: 'Текущий пользователь',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Me' } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks': {
        get: {
          operationId: 'listTasks',
          summary: 'Список личных задач',
          parameters: [
            { $ref: '#/components/parameters/ImportantFilter' },
            { $ref: '#/components/parameters/UrgentFilter' },
            { $ref: '#/components/parameters/DoneFilter' },
            { $ref: '#/components/parameters/LimitParam' },
            { $ref: '#/components/parameters/OffsetParam' }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: { tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } } }
                  }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        post: {
          operationId: 'createTask',
          summary: 'Создать личную задачу',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTaskBody' } } }
          },
          responses: {
            '201': {
              description: 'Created',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } }
                }
              }
            },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks/{id}': {
        parameters: [{ $ref: '#/components/parameters/TaskIdPath' }],
        get: {
          operationId: 'getTask',
          summary: 'Получить задачу',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        patch: {
          operationId: 'updateTask',
          summary: 'Обновить задачу',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PatchTaskBody' } } }
          },
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } } } }
            },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        delete: {
          operationId: 'deleteTask',
          summary: 'Удалить задачу',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'boolean' } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks/{id}/move': {
        parameters: [{ $ref: '#/components/parameters/TaskIdPath' }],
        post: {
          operationId: 'moveTask',
          summary: 'Перенести задачу в другой квадрат матрицы Эйзенхауэра',
          description: 'Удобный шорткат вместо PATCH с двумя флагами: принимает один именованный квадрант и сам выставляет important/urgent.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/MoveTaskBody' } } }
          },
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks/{id}/tags': {
        parameters: [{ $ref: '#/components/parameters/TaskIdPath' }],
        post: {
          operationId: 'attachTagToTask',
          summary: 'Прикрепить тег к задаче',
          description: 'Тег должен принадлежать тому же контексту, что и задача: личный тег — личной задаче, тег комнаты — задаче в той же комнате. Идемпотентно.',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/AttachTagBody' } } }
          },
          responses: {
            '201': {
              description: 'Attached',
              content: { 'application/json': { schema: { type: 'object', properties: { attached: { type: 'boolean' }, tag: { $ref: '#/components/schemas/Tag' } } } } }
            },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks/{id}/tags/{tagId}': {
        parameters: [
          { $ref: '#/components/parameters/TaskIdPath' },
          { $ref: '#/components/parameters/TagIdOnTaskPath' }
        ],
        delete: {
          operationId: 'detachTagFromTask',
          summary: 'Открепить тег от задачи',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { detached: { type: 'boolean' } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tags': {
        get: {
          operationId: 'listTags',
          summary: 'Список тегов',
          description: 'Без параметров — личные теги. С room_id — теги указанной комнаты (требуется членство в ней).',
          parameters: [
            { name: 'room_id', in: 'query', required: false, schema: { type: 'string', format: 'uuid' } }
          ],
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tags: { type: 'array', items: { $ref: '#/components/schemas/Tag' } } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        post: {
          operationId: 'createTag',
          summary: 'Создать тег',
          description: 'Личный тег — без room_id. Тег комнаты — с room_id (требуется право manage_tags).',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTagBody' } } }
          },
          responses: {
            '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { tag: { $ref: '#/components/schemas/Tag' } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '409': { description: 'Tag with this name already exists in this scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tags/{id}': {
        parameters: [{ $ref: '#/components/parameters/TagIdPath' }],
        get: {
          operationId: 'getTag',
          summary: 'Получить тег',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tag: { $ref: '#/components/schemas/Tag' } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        patch: {
          operationId: 'updateTag',
          summary: 'Переименовать или перекрасить тег',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PatchTagBody' } } }
          },
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { tag: { $ref: '#/components/schemas/Tag' } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '409': { description: 'Tag with this name already exists in this scope', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        delete: {
          operationId: 'deleteTag',
          summary: 'Удалить тег',
          description: 'Удаление тега отвяжет его от всех задач, где он был назначен.',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'boolean' } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/tasks/{id}/complete': {
        parameters: [{ $ref: '#/components/parameters/TaskIdPath' }],
        post: {
          operationId: 'completeTask',
          summary: 'Отметить задачу выполненной',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/rooms': {
        get: {
          operationId: 'listRooms',
          summary: 'Список моих комнат',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: { type: 'object', properties: { rooms: { type: 'array', items: { $ref: '#/components/schemas/Room' } } } }
                }
              }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        post: {
          operationId: 'createRoom',
          summary: 'Создать новую комнату',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object', required: ['name'],
                  properties: { name: { type: 'string', maxLength: 200 } }
                }
              }
            }
          },
          responses: {
            '201': {
              description: 'Created',
              content: { 'application/json': { schema: { type: 'object', properties: { room: { $ref: '#/components/schemas/Room' } } } } }
            },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/rooms/{id}': {
        parameters: [{ $ref: '#/components/parameters/RoomIdPath' }],
        get: {
          operationId: 'getRoom',
          summary: 'Детали комнаты',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { room: { $ref: '#/components/schemas/Room' } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        patch: {
          operationId: 'updateRoom',
          summary: 'Переименовать комнату (только владелец)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', required: ['name'], properties: { name: { type: 'string', maxLength: 200 } } }
              }
            }
          },
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { room: { $ref: '#/components/schemas/Room' } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        delete: {
          operationId: 'deleteRoom',
          summary: 'Удалить комнату (только владелец)',
          responses: {
            '200': { description: 'OK', content: { 'application/json': { schema: { type: 'object', properties: { deleted: { type: 'boolean' } } } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/rooms/{id}/tasks': {
        parameters: [{ $ref: '#/components/parameters/RoomIdPath' }],
        get: {
          operationId: 'listRoomTasks',
          summary: 'Задачи в комнате',
          parameters: [
            { $ref: '#/components/parameters/ImportantFilter' },
            { $ref: '#/components/parameters/UrgentFilter' },
            { $ref: '#/components/parameters/DoneFilter' },
            { $ref: '#/components/parameters/LimitParam' },
            { $ref: '#/components/parameters/OffsetParam' }
          ],
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { tasks: { type: 'array', items: { $ref: '#/components/schemas/Task' } } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        },
        post: {
          operationId: 'createRoomTask',
          summary: 'Создать задачу в комнате',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateTaskBody' } } }
          },
          responses: {
            '201': { description: 'Created', content: { 'application/json': { schema: { type: 'object', properties: { task: { $ref: '#/components/schemas/Task' } } } } } },
            '400': { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '403': { $ref: '#/components/responses/Forbidden' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      },
      '/rooms/{id}/members': {
        parameters: [{ $ref: '#/components/parameters/RoomIdPath' }],
        get: {
          operationId: 'listRoomMembers',
          summary: 'Участники комнаты',
          responses: {
            '200': {
              description: 'OK',
              content: { 'application/json': { schema: { type: 'object', properties: { members: { type: 'array', items: { $ref: '#/components/schemas/Member' } } } } } }
            },
            '401': { $ref: '#/components/responses/Unauthorized' },
            '404': { $ref: '#/components/responses/NotFound' },
            '429': { $ref: '#/components/responses/RateLimited' }
          }
        }
      }
    }
  };

  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      // Custom GPT loader will fetch cross-origin.
      'Access-Control-Allow-Origin': '*'
    }
  });
}
