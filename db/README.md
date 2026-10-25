# Database Configuration

Эта папка содержит всю конфигурацию базы данных.

## Структура

```
db/
├── config/           # Конфигурация и схема
│   ├── schema.ts     # Drizzle схема (таблицы, индексы)
│   └── index.ts      # Подключение к БД
└── migrations/       # SQL миграции
    └── 0000_initial_schema.sql
```

## Использование

### Подключение к БД

```typescript
import { db, schema } from './db/config';

// Использование
const sources = await db.select().from(schema.sources);
```

### Схема

Полная документация схемы: [docs/db/schema.md](../docs/db/schema.md)

**Таблицы:**
- `sources` — исходные документы
- `chunks` — чанки с эмбеддингами
- `chunk_links` — внутренние ссылки

### Миграции

Миграции находятся в `db/migrations/` и применяются скриптом:

```bash
npm run db:migrate
```

Для создания новых миграций используйте Drizzle Kit:

```bash
npm run db:generate
```
