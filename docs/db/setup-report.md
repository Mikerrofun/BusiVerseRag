# Отчёт о настройке БД для RAG-системы BusiVerse

**Дата:** 26 октября 2026  
**Статус:** ✅ Завершено

## Выполненные работы

### 1. Инициализация проекта

✅ Создан Node.js/TypeScript проект
- `package.json` с зависимостями
- `tsconfig.json` для компиляции TypeScript
- Структура папок `src/db/`, `migrations/`

### 2. Установка зависимостей

Установлены пакеты:
- `drizzle-orm` — ORM для работы с PostgreSQL
- `@neondatabase/serverless` — драйвер для Neon Postgres
- `drizzle-kit` — CLI для генерации миграций
- `tsx` — запуск TypeScript без компиляции
- `dotenv` — загрузка переменных окружения
- `typescript`, `@types/node` — типы для TypeScript

### 3. Подключение к Neon

✅ Настроено подключение:
- Neon CLI установлен и авторизован
- Проект связан с `purple-smoke-17298088`
- Ветка: `production`
- Переменные окружения получены в `.env.local`

### 4. Создание схемы БД

✅ Создан файл `src/db/schema.ts` с Drizzle ORM:

**Таблицы:**
- `sources` — исходные документы
- `chunks` — чанки с эмбеддингами
- `chunk_links` — внутренние ссылки

**Индексы:**
- `chunks_embedding_idx` (HNSW) — векторный поиск
- `chunks_tsv_idx` (GIN) — полнотекстовый поиск
- `chunks_filter_idx` — фильтрация по `business_type`, `section_code`
- `chunks_scope_idx` — фильтрация по `scope`
- `chunks_parent_idx` — связь родитель-ребёнок

**Особенности:**
- Размерность вектора: **1024** (универсальная)
- FTS конфигурация: **russian** (встроенная)
- Generated column `tsv` для автоматического индексирования
- Публичный доступ (без RLS)

### 5. Создание миграций

✅ Создан файл `migrations/0000_initial_schema.sql`:
- Включение pgvector extension
- Создание всех таблиц
- Создание всех индексов
- Комментарии для документации

✅ Создан скрипт миграции `src/db/migrate.ts`

### 6. Применение миграций

✅ Миграция успешно применена к БД:

```
✅ Migration completed successfully!

Created tables:
  - sources
  - chunks (with pgvector extension)
  - chunk_links

Created indexes:
  - chunks_embedding_idx (HNSW for vector search)
  - chunks_tsv_idx (GIN for full-text search)
  - chunks_filter_idx (business_type, section_code)
  - chunks_scope_idx (scope)
  - chunks_parent_idx (parent_id)
```

### 7. Документация

✅ Созданы документы:
- `README.md` — общее описание проекта
- `docs/db/schema.md` — детальная документация схемы БД
- `docs/db/setup-report.md` — этот отчёт

### 8. Примеры использования

✅ Создан `src/db/insert-example.ts` с примерами:
- Вставка источника документа
- Добавление родительского чанка (секция)
- Добавление дочернего чанка (блок)
- Добавление глобального чанка
- Создание ссылок между чанками

## Команды для работы

```bash
# База данных
npm run db:migrate    # Применить миграции
npm run db:seed       # Загрузить примеры данных
npm run db:studio     # Открыть Drizzle Studio (GUI)

# Neon CLI
neon status           # Статус проекта
neon env pull         # Получить переменные окружения
neon checkout dev --create  # Создать dev-ветку
```

## Проверка работоспособности

Для проверки, что всё работает:

1. **Посмотреть схему БД:**
   ```bash
   neon status
   ```

2. **Загрузить примеры данных:**
   ```bash
   npm run db:seed
   ```

3. **Открыть Drizzle Studio:**
   ```bash
   npm run db:studio
   ```
   Откроется GUI на `https://local.drizzle.studio` для просмотра данных.

## Следующие шаги

Согласно плану [docs/plan/01-rag-plan.md](../plan/01-rag-plan.md):

- [x] **Фаза 1**: Спроектировать БД ← **ЗАВЕРШЕНО**
- [ ] **Фаза 2**: Нарезка на чанки
  - Парсинг markdown
  - Структурный чанкинг
  - Обогащение метаданных
  - Экспорт в `knowledge/chunks.jsonl`

- [ ] **Фаза 3**: Eval-набор
  - 40 вопросов (30 по нишам + 10 по сквозным разделам)
  - Разметка ожидаемых `chunk_id`
  - Экспорт в `eval/questions.jsonl`

- [ ] **Фаза 4**: Выбор модели эмбеддингов
  - Прогнать eval на 2-3 моделях
  - Сравнить `recall@5` и `MRR`
  - Зафиксировать модель

- [ ] **Фаза 5**: Генерация эмбеддингов
  - Contextual retrieval (heading_path + text)
  - Батчинг по 600 чанков
  - Загрузка в Neon

- [ ] **Фаза 6**: Retrieval pipeline
  - Гибридный поиск (vector + fulltext)
  - RRF слияние
  - Reranker
  - Small-to-big

## Технические детали

**Проект Neon:**
- ID: `purple-smoke-17298088`
- Организация: `org-winter-snow-96324432`
- Branch: `production`
- Region: `aws-us-east-2`

**REST API:**
```
https://ep-steep-night-b4sa4dyg.apirest.c-6.us-east-2.aws.neon.tech/neondb/rest/v1
```

**Переменные окружения (.env.local):**
- `DATABASE_URL` — пулированное подключение (для приложений)
- `DATABASE_URL_UNPOOLED` — прямое подключение
- `NEON_BRANCH` — имя ветки

## Изменённые/Созданные файлы

**Конфигурация:**
- `package.json` — добавлены зависимости и скрипты
- `tsconfig.json` — конфигурация TypeScript
- `drizzle.config.ts` — конфигурация Drizzle Kit
- `.gitignore` — обновлён для секретов
- `neon.ts` — создан при `neon init`

**Схема БД:**
- `src/db/schema.ts` — Drizzle схема
- `src/db/index.ts` — подключение к БД
- `src/db/migrate.ts` — скрипт миграции
- `src/db/insert-example.ts` — примеры вставки данных
- `migrations/0000_initial_schema.sql` — SQL миграция

**Документация:**
- `README.md` — главный README
- `docs/db/schema.md` — документация схемы
- `docs/db/setup-report.md` — этот отчёт

**Секреты (gitignored):**
- `.neon` — ID проекта и ветки
- `.env.local` — переменные окружения

## Контракт с проектом ассистента

⚠️ **ВАЖНО для интеграции:**

Проект ассистента будет читать ту же Neon-базу. Схема БД — это контракт между репозиториями.

**Что гарантируем:**
1. Таблицы `sources`, `chunks`, `chunk_links` стабильны
2. Поля для фильтрации: `business_type`, `scope`, `section_code`
3. Векторное поле: `embedding` (1024 размерность)
4. FTS поле: `tsv` (russian конфигурация)
5. Поля для цитат: `heading_path`, `section_title`, `block_title`

**Что нужно синхронизировать:**
- **Модель эмбеддингов** — одна и та же для генерации и поиска
- **Размерность вектора** — 1024 (если меняем — миграция)
- **Конфигурация FTS** — russian (если меняем — переиндексация)

## Статистика

- **Размер корпуса**: ~250K токенов
- **Ожидаемое количество чанков**: 500–600
- **Размер эмбеддинга на чанк**: 1024 × 4 bytes = 4KB
- **Общий размер эмбеддингов**: ~2.4 MB
- **Размер HNSW индекса**: ~5-10 MB (зависит от ef_construction)

## Заключение

✅ **База данных полностью готова к загрузке данных.**

Все таблицы созданы, индексы настроены, схема задокументирована. Можно переходить к следующей фазе — нарезке markdown на чанки.

**Следующий шаг:** Создать скрипт парсинга `RAG-документация_BusiVerse.md` для генерации `knowledge/chunks.jsonl`.
