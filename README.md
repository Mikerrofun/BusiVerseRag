# BusiVerse RAG System

RAG-система для базы знаний BusiVerse — мультинишевого ассистента по открытию и ведению малого бизнеса в России.

## Архитектура

- **База данных**: Neon Postgres с pgvector
- **Эмбеддинги**: Размерность 1024 (модель выбирается позже по eval-метрикам)
- **Поиск**: Гибридный (vector + full-text) → RRF → rerank
- **Язык**: Полнотекстовый поиск с конфигурацией `russian`
- **ORM**: Drizzle ORM

## Структура проекта

```
.
├── db/
│   ├── config/            # Конфигурация и схема БД
│   │   ├── schema.ts      # Drizzle схема (таблицы, индексы)
│   │   └── index.ts       # Подключение к БД
│   └── migrations/        # SQL миграции
├── docs/
│   ├── plan/              # Планы разработки
│   ├── feature/           # Спецификации фич
│   ├── source/            # Исходные документы
│   └── db/                # Документация БД
├── scripts/
│   └── database/          # Скрипты для работы с БД
│       ├── migrate.ts     # Применение миграций
│       └── insert-example.ts  # Примеры данных
└── neon.ts               # Конфигурация Neon
```

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка БД

База данных уже настроена и мигрирована. Переменные окружения находятся в `.env.local`.

Проверить подключение:
```bash
neon status
```

### 3. Применить миграции (если нужно)

```bash
npm run db:migrate
```

## Команды

```bash
# База данных
npm run db:migrate    # Применить миграции
npm run db:studio     # Открыть Drizzle Studio (GUI)

# Neon CLI
neon link             # Связать проект с Neon
neon env pull         # Получить переменные окружения
neon status           # Статус проекта
```

## Схема БД

Подробная документация: [docs/db/schema.md](docs/db/schema.md)

### Основные таблицы

- **`sources`** — исходные документы
- **`chunks`** — чанки с эмбеддингами (vector + full-text search)
- **`chunk_links`** — внутренние ссылки между чанками

### Индексы

- **HNSW** для векторного поиска (cosine distance)
- **GIN** для полнотекстового поиска (russian)
- **B-tree** для фильтрации по `business_type`, `scope`, `section_code`

## План работ

Согласно [docs/plan/01-rag-plan.md](docs/plan/01-rag-plan.md):

- [x] **Фаза 0**: Очистка текста (план 2)
- [x] **Фаза 1**: Спроектировать БД → `migrations/`, применённая схема в Neon
- [ ] **Фаза 2**: Нарезка + метаданные → `knowledge/chunks.jsonl`, `knowledge/taxonomy.json`
- [ ] **Фаза 3**: Eval-набор: 40 вопросов + разметка → `eval/questions.jsonl`
- [ ] **Фаза 4**: Выбрать модель эмбеддингов по метрикам
- [ ] **Фаза 5**: Эмбеддинги + загрузка в Neon
- [ ] **Фаза 6**: Retrieval + rerank + сборка промпта
- [ ] **Фаза 7**: Подключение к сайту + UI цитат
- [ ] **Фаза 8**: Сравнение с long-context baseline

## Доступ к БД

- **Проект ID**: `purple-smoke-17298088`
- **Организация**: `org-winter-snow-96324432`
- **Branch**: `production`
- **REST API**: `https://ep-steep-night-b4sa4dyg.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1`

## Контракт с ассистентом

Проект ассистента (отдельный репозиторий) читает ту же Neon-базу. Схема БД — контракт между проектами.

**⚠️ ВАЖНО**: Модель эмбеддингов для запроса и для чанков должна быть одинаковой!

## Документация

- [План RAG-системы](docs/plan/01-rag-plan.md)
- [Схема БД](docs/db/schema.md)
- [План очистки текста](docs/plan/02-text-cleanup-plan.md)

## Технологии

- **PostgreSQL** (Neon) с pgvector
- **Drizzle ORM** для типобезопасных запросов
- **TypeScript** для всего кода
- **Node.js** для обработки данных
