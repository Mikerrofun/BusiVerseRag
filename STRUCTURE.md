# Структура проекта BusiVerseRag

## Обзор организации

Проект следует принципу разделения по функциональности:
- **`db/`** — всё, что касается базы данных
- **`scripts/`** — исполняемые скрипты по категориям
- **`docs/`** — документация
- **`src/`** — исходный код приложения (будет добавлен позже)

## Детальная структура

```
BusiVerseRag/
│
├── db/                           # База данных
│   ├── config/                   # Конфигурация БД
│   │   ├── schema.ts             # Drizzle схема (таблицы, индексы)
│   │   └── index.ts              # Подключение к БД
│   ├── migrations/               # SQL миграции
│   │   └── 0000_initial_schema.sql
│   └── README.md
│
├── scripts/                      # Скрипты
│   └── database/                 # Скрипты для работы с БД
│       ├── migrate.ts            # Применение миграций
│       ├── insert-example.ts     # Примеры данных
│       └── README.md
│
├── docs/                         # Документация
│   ├── plan/                     # Планы разработки
│   │   ├── 01-rag-plan.md
│   │   └── 02-text-cleanup-plan.md
│   ├── feature/                  # Спецификации фич
│   ├── source/                   # Исходные документы
│   │   └── RAG-документация_BusiVerse.raw.md
│   └── db/                       # Документация БД
│       ├── schema.md
│       └── setup-report.md
│
├── node_modules/                 # Зависимости (gitignored)
├── dist/                         # Скомпилированный код (gitignored)
│
├── .neon                         # Neon project link (gitignored)
├── .env.local                    # Переменные окружения (gitignored)
├── .gitignore
│
├── package.json                  # Зависимости и скрипты
├── tsconfig.json                 # Конфигурация TypeScript
├── drizzle.config.ts             # Конфигурация Drizzle Kit
├── neon.ts                       # Конфигурация Neon
│
├── README.md                     # Главный README
├── STRUCTURE.md                  # Этот файл
└── RAG-документация_BusiVerse.md # Исходный документ для RAG
```

## Принципы организации

### 1. База данных (`db/`)

Всё, что касается БД, находится здесь:
- **`config/`** — схема и подключение (импортируются в код)
- **`migrations/`** — SQL файлы для изменения структуры

**Использование:**
```typescript
import { db, schema } from './db/config';
```

### 2. Скрипты (`scripts/`)

Исполняемые файлы, организованные по функциональности:
- **`database/`** — работа с БД (миграции, seed данных)
- Будущие папки: `processing/`, `embedding/`, `evaluation/`

**Запуск:**
```bash
npm run db:migrate  # scripts/database/migrate.ts
npm run db:seed     # scripts/database/insert-example.ts
```

### 3. Документация (`docs/`)

Вся документация проекта:
- **`plan/`** — планы работ (что делать)
- **`feature/`** — спецификации фич (что и как)
- **`source/`** — исходные документы
- **`db/`** — документация схемы БД

### 4. Конфигурация (корень)

В корне только файлы конфигурации:
- `package.json` — зависимости
- `tsconfig.json` — TypeScript
- `drizzle.config.ts` — Drizzle ORM
- `neon.ts` — Neon services
- `.gitignore` — игнорируемые файлы

## Команды

### База данных
```bash
npm run db:migrate    # Применить миграции
npm run db:seed       # Загрузить примеры данных
npm run db:studio     # Открыть Drizzle Studio (GUI)
npm run db:generate   # Сгенерировать новую миграцию
npm run db:push       # Push схемы без миграции
```

### Neon CLI
```bash
neon status           # Статус проекта
neon env pull         # Получить переменные окружения
neon checkout dev --create  # Создать dev-ветку
```

## Добавление новых компонентов

### Новый скрипт БД

1. Создать файл в `scripts/database/`
2. Импортировать `db` и `schema`:
   ```typescript
   import { db, schema } from '../../db/config';
   ```
3. Добавить npm-скрипт в `package.json` (опционально)

### Новая миграция

1. Изменить `db/config/schema.ts`
2. Запустить `npm run db:generate`
3. Проверить сгенерированный SQL в `db/migrations/`
4. Применить: `npm run db:migrate`

### Новая категория скриптов

1. Создать папку `scripts/category/`
2. Добавить README в эту папку
3. Создать скрипты внутри
4. Добавить npm-скрипты в `package.json`

## Gitignored файлы

Что **не** коммитится:
- `.neon` — ID проекта Neon
- `.env`, `.env.local`, `.env.*.local` — секреты
- `node_modules/` — зависимости
- `dist/` — скомпилированный код
- `__pycache__/`, `*.pyc` — Python cache

## Следующие шаги

По мере развития проекта будут добавлены:
- `src/` — исходный код приложения
- `scripts/processing/` — обработка markdown
- `scripts/embedding/` — генерация эмбеддингов
- `scripts/evaluation/` — eval-тесты
- `knowledge/` — обработанные данные (chunks.jsonl)
- `eval/` — вопросы и метрики
