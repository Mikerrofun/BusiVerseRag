# Database Scripts

Скрипты для работы с базой данных.

## Файлы

### `migrate.ts`
Применяет SQL миграции к базе данных.

```bash
npm run db:migrate
```

Читает файлы из `db/migrations/` и выполняет их в PostgreSQL.

### `insert-example.ts`
Вставляет примеры данных для тестирования.

```bash
npm run db:seed
```

**Что добавляется:**
- Источник документа (`sources`)
- Родительский чанк (секция)
- Дочерний чанк (таблица)
- Глобальный чанк
- Ссылка между чанками

## Добавление новых скриптов

Создавайте TypeScript файлы в этой папке. Они автоматически получают доступ к:
- `db/config/index.ts` — подключение к БД
- `db/config/schema.ts` — схема таблиц
- `.env.local` — переменные окружения

Пример:

```typescript
import { db, schema } from '../../db/config';

async function myScript() {
  const data = await db.select().from(schema.sources);
  console.log(data);
}

myScript();
```

Запуск:

```bash
tsx scripts/database/my-script.ts
```
