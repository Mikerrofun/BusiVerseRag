# Архитектура проекта BusiVerseRag

## Общее описание

BusiVerse RAG System — система извлечения и поиска релевантной информации (RAG) для мультинишевого ассистента по открытию и ведению малого бизнеса в России.

**Стек технологий**:
- TypeScript + Node.js
- PostgreSQL (Neon) с pgvector
- Drizzle ORM
- Гибридный поиск (vector + full-text)

---

## Корневая структура

```
BusiVerseRag/
├── node_modules/              # Зависимости проекта
├── .git/                      # Git репозиторий
├── __pycache__/               # Python кэш (для вспомогательных скриптов)
│
├── data/                      # Данные проекта
│   ├── chunks/                # Результаты нарезки документов
│   │   ├── seller/            # Чанки по нише "маркетплейс продавец"
│   │   ├── accounting/        # Чанки по нише "удалённая бухгалтерия"
│   │   └── bakery/            # Чанки по нише "мини-пекарня"
│   └── chunking-report.md     # Отчёт о процессе чанкинга
│
├── db/                        # База данных
│   ├── config/                # Конфигурация БД
│   │   ├── schema.ts          # Drizzle схема (таблицы, индексы, типы)
│   │   └── index.ts           # Подключение к Neon PostgreSQL
│   ├── migrations/            # SQL миграции
│   │   └── 0000_initial_schema.sql
│   └── README.md              # Документация по БД
│
├── docs/                      # Документация проекта
│   ├── plan/                  # Планы разработки
│   │   ├── 01-rag-plan.md     # Главный план RAG системы
│   │   ├── 02-text-cleanup-plan.md
│   │   ├── 03-chunking-plan.md
│   │   ├── 05-eval-kit-plan.md
│   │   ├── 06-retrieval-plan.md
│   │   ├── cleanup-report.md
│   │   ├── evalImprove-plan.md
│   │   └── Script-commands.md
│   │
│   ├── feature/               # Спецификации функций
│   │   ├── database-architecture.md
│   │   ├── text-cleanup-for-chunking.md
│   │   ├── chunking-pipeline.md
│   │   ├── embedding-implementation.md
│   │   ├── retrieval-pipeline.md
│   │   ├── rerank-relevance-filter.md
│   │   ├── eval-kit.md
│   │   └── eval-improve.md
│   │
│   ├── db/                    # Документация БД
│   │   ├── schema.md          # Справочник по таблицам
│   │   └── setup-report.md    # Отчёт о настройке БД
│   │
│   ├── eval/                  # Результаты оценки
│   │   ├── README.md
│   │   └── fullEvalRun-*/     # Папки с результатами eval-прогонов
│   │
│   └── source/                # Исходные документы
│       └── RAG-документация_BusiVerse.raw.md
│
├── retrieval/                 # RAG Retrieval Pipeline
│   ├── types/                 # TypeScript типы
│   │   └── retrieval.types.ts
│   │
│   ├── config/                # Конфигурации
│   │   ├── niches.config.ts   # Классификация ниш
│   │   └── models.config.ts   # Модели LLM/эмбеддингов
│   │
│   ├── steps/                 # Шаги retrieval pipeline
│   │   ├── classification/    # Классификация запроса по нише
│   │   │   ├── classify.ts
│   │   │   ├── classification.config.ts
│   │   │   └── classification.types.ts
│   │   │
│   │   ├── expand/            # Query expansion (HyDE и подзапросы)
│   │   │   ├── expand.ts
│   │   │   ├── expand.config.ts
│   │   │   └── expand.types.ts
│   │   │
│   │   ├── embedding/         # Эмбеддинги запросов
│   │   │   ├── embed-query.ts
│   │   │   ├── embedding.config.ts
│   │   │   └── embedding.types.ts
│   │   │
│   │   ├── search/            # Векторный и полнотекстовый поиск
│   │   │   ├── vector-search.ts
│   │   │   ├── fts.ts
│   │   │   └── search.config.ts
│   │   │
│   │   ├── fusion/            # RRF для объединения результатов
│   │   │   ├── rrf.ts
│   │   │   └── fusion.config.ts
│   │   │
│   │   ├── rerank/            # Reranking и фильтрация
│   │   │   ├── rerank-system/ # LLM reranking
│   │   │   │   ├── rerank.ts
│   │   │   │   ├── rerank.config.ts
│   │   │   │   └── rerank.types.ts
│   │   │   │
│   │   │   └── filter-rerank/ # Relevance filtering
│   │   │       ├── filter-rerank.ts
│   │   │       ├── filter-rerank.config.ts
│   │   │       └── filter-rerank.types.ts
│   │   │
│   │   └── assemble/          # Сборка финального промпта
│   │       ├── assemble.ts
│   │       ├── assemble.config.ts
│   │       └── assemble.types.ts
│   │
│   ├── eval/                  # Система оценки качества
│   │   ├── evalFunction/      # Функция оценки одного вопроса
│   │   │   ├── eval.ts
│   │   │   ├── eval.types.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── runner/            # Запуск eval-набора
│   │   │   ├── runner.ts
│   │   │   ├── runner.types.ts
│   │   │   ├── loaders.ts
│   │   │   ├── formatters.ts
│   │   │   ├── aggregation.ts
│   │   │   ├── metrics.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── questions.jsonl    # Набор тестовых вопросов
│   │   ├── eval.config.ts
│   │   └── index.ts
│   │
│   ├── lib/                   # Утилиты
│   │   ├── db.ts              # Подключение к БД
│   │   ├── llm-client.ts      # Клиент для LLM
│   │   └── retry.ts           # Retry логика
│   │
│   ├── index.ts               # Главный файл retrieval
│   └── run.ts                 # Скрипт запуска retrieval
│
├── scripts/                   # Скрипты обработки данных
│   ├── database/              # Работа с БД
│   │   ├── migrate.ts         # Применение миграций
│   │   ├── insert-example.ts  # Вставка примеров
│   │   └── README.md
│   │
│   ├── chunking/              # Нарезка документов на чанки
│   │   ├── types/             # Типы
│   │   │   └── chunking.types.ts
│   │   │
│   │   ├── config/            # Конфигурация
│   │   │   └── chunking.config.ts
│   │   │
│   │   ├── lib/               # Библиотеки чанкинга
│   │   │   ├── parse.ts       # Парсинг markdown
│   │   │   ├── split.ts       # Разбивка на чанки
│   │   │   ├── classify.ts    # Классификация чанков
│   │   │   ├── links.ts       # Извлечение ссылок
│   │   │   ├── tokens.ts      # Подсчёт токенов
│   │   │   ├── validate.ts    # Валидация
│   │   │   └── emit.ts        # Вывод результатов
│   │   │
│   │   ├── test/              # Тесты
│   │   │   └── chunking.test.ts
│   │   │
│   │   ├── chunk.ts           # Главный скрипт чанкинга
│   │   └── load.ts            # Загрузка чанков в БД
│   │
│   ├── embeddings/            # Создание эмбеддингов
│   │   ├── types/             # Типы
│   │   │   └── embeddings.types.ts
│   │   │
│   │   ├── config/            # Конфигурация
│   │   │   └── embeddings.config.ts
│   │   │
│   │   └── embed.ts           # Генерация эмбеддингов
│   │
│   ├── lib/                   # Общие утилиты
│   │   └── retry.ts
│   │
│   └── For_cleanUp/           # Python скрипты для очистки
│       ├── cleanup_text.py
│       ├── pdf_verify.py
│       └── validate_cleanup.py
│
├── src/                       # Исходный код (пусто, зарезервировано)
│
├── .env.local                 # Переменные окружения (не в git)
├── .gitignore
├── .neon                      # Конфиг Neon CLI
├── neon.ts                    # Настройка Neon
├── drizzle.config.ts          # Конфиг Drizzle ORM
├── tsconfig.json              # Конфиг TypeScript
├── package.json               # Зависимости и скрипты
├── package-lock.json
│
├── README.md                  # Главный README
├── STRUCTURE.md               # (если есть) краткая структура
├── ARCHITECTURE.md            # Этот файл
│
├── RAG-документация_BusiVerse.md  # Исходный документ базы знаний
├── .pdftext.py                # Вспомогательные Python скрипты
└── .patch4.py
```

---

## Схема базы данных

**Таблицы**:

1. **`sources`** — исходные документы  
   - `id`, `title`, `business_type`, `created_at`, `updated_at`

2. **`chunks`** — чанки документов с эмбеддингами  
   - `id`, `source_id`, `section_code`, `scope`, `business_type`  
   - `content`, `tokens`, `tsvector` (полнотекстовый поиск)  
   - `embedding` (pgvector, размерность 1024)  
   - `parent_chunk_id`, `metadata`, `created_at`

3. **`chunk_links`** — связи между чанками (внутренние ссылки)  
   - `id`, `source_chunk_id`, `target_chunk_id`, `link_text`

**Индексы**:
- HNSW для векторного поиска (`embedding`)
- GIN для полнотекстового поиска (`tsvector`)
- B-tree для фильтрации по `business_type`, `scope`, `section_code`

---

## Retrieval Pipeline (пошаговый процесс)

1. **Classification** (`retrieval/steps/classification/`)  
   Определяет нишу бизнеса из запроса пользователя (например: "маркетплейс продавец")

2. **Expansion** (`retrieval/steps/expand/`)  
   Генерирует дополнительные формулировки запроса (HyDE, подзапросы)

3. **Embedding** (`retrieval/steps/embedding/`)  
   Создаёт векторное представление запроса (эмбеддинг)

4. **Search** (`retrieval/steps/search/`)  
   - **Vector search** — поиск по косинусной близости в pgvector
   - **Full-text search (FTS)** — полнотекстовый поиск в PostgreSQL

5. **Fusion** (`retrieval/steps/fusion/`)  
   Объединяет результаты поиска через RRF (Reciprocal Rank Fusion)

6. **Rerank** (`retrieval/steps/rerank/`)  
   - **Rerank-system**: переранжирование через LLM
   - **Filter-rerank**: фильтрация по релевантности

7. **Assemble** (`retrieval/steps/assemble/`)  
   Собирает финальный промпт с найденными чанками для генерации ответа

---

## Система оценки (Eval)

**Расположение**: `retrieval/eval/`

- **questions.jsonl** — набор вопросов с разметкой (expected chunks)
- **evalFunction/** — функция для оценки одного вопроса (точность, recall)
- **runner/** — запуск полного eval-набора, агрегация метрик

**Команды**:
```bash
npm run eval         # Полный прогон
npm run eval:limit   # С лимитом вопросов
npm run eval:json    # Вывод в JSON
```

---

## Скрипты (npm scripts)

```bash
# База данных
npm run db:generate   # Генерация миграций
npm run db:migrate    # Применение миграций
npm run db:push       # Push схемы в БД
npm run db:studio     # Drizzle Studio GUI
npm run db:seed       # Вставка тестовых данных

# Обработка данных
npm run chunk         # Нарезка документов на чанки
npm run chunk:validate # Валидация чанков
npm run chunk:load    # Загрузка чанков в БД
npm run embed         # Генерация эмбеддингов

# Retrieval и eval
npm run retrieve      # Запуск retrieval pipeline
npm run eval          # Оценка качества
npm run eval:limit    # Оценка с лимитом
npm run eval:json     # Вывод в JSON

# Тесты
npm run test:chunking # Тесты чанкинга
```

---

## Ключевые концепции

### 1. Чанкинг (Chunking)
Документы нарезаются на семантические блоки (чанки) размером до ~500 токенов. Каждый чанк классифицируется по scope (instruction | info | example) и связан с исходным документом.

### 2. Эмбеддинги
Векторные представления чанков размерностью 1024. Модель выбирается через eval-метрики (precision, recall).

### 3. Гибридный поиск
Комбинация векторного поиска (pgvector) и полнотекстового (PostgreSQL FTS) с объединением через RRF.

### 4. Reranking
Переранжирование результатов через LLM для улучшения релевантности.

### 5. Query Expansion
Расширение запроса через HyDE (Hypothetical Document Embeddings) и генерацию подзапросов.

---

## Технические детали

**Язык**: TypeScript + Node.js  
**ORM**: Drizzle ORM (типобезопасные запросы)  
**БД**: PostgreSQL (Neon) с расширением pgvector  
**Полнотекстовый поиск**: Конфигурация `russian`  
**Векторный индекс**: HNSW (Hierarchical Navigable Small World)  

---

## Текущий статус проекта

Согласно `docs/plan/01-rag-plan.md`:

- [x] **Фаза 0**: Очистка текста
- [x] **Фаза 1**: Проектирование БД
- [x] **Фаза 2**: Нарезка + метаданные (частично)
- [x] **Фаза 3**: Eval-набор
- [x] **Фаза 4**: Выбор модели эмбеддингов
- [x] **Фаза 5**: Эмбеддинги + загрузка в Neon
- [x] **Фаза 6**: Retrieval + rerank + сборка промпта
- [ ] **Фаза 7**: Подключение к сайту + UI цитат
- [ ] **Фаза 8**: Сравнение с long-context baseline

---

## Полезные ссылки

- [README.md](README.md) — быстрый старт
- [docs/plan/01-rag-plan.md](docs/plan/01-rag-plan.md) — главный план
- [docs/feature/database-architecture.md](docs/feature/database-architecture.md) — детальная архитектура БД
- [docs/db/schema.md](docs/db/schema.md) — справочник по таблицам
- [docs/eval/README.md](docs/eval/README.md) — документация eval-системы

---

## Контакты и поддержка

**GitHub**: https://github.com/Mikerrofun/BusiVerseRag  
**Neon Project ID**: `purple-smoke-17298088`  
**Organization**: `org-winter-snow-96324432`  
