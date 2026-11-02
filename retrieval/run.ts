// CLI для ручной проверки владельцем (план 06, раздел 7). Не часть публичного API.
// Использование: npm run retrieve -- "запрос" [--niche <код>] [--json]
import { MODELS_CONFIG } from './config/models.config';
import { NICHE_CODES, isNicheCode } from './config/niches.config';
import { NicheCode } from './types/retrieval.types';
import { retrieve } from './index';
import { closePool } from './lib/db';

function parseArgs(argv: string[]): { query: string; niche?: string; json: boolean } {
  const args = argv.slice(2);
  const nicheIdx = args.indexOf('--niche');
  let niche: string | undefined;
  if (nicheIdx !== -1) {
    niche = args[nicheIdx + 1];
    args.splice(nicheIdx, 2);
  }
  const json = args.includes('--json');
  const query = args.filter((a) => a !== '--json').join(' ');
  return { query, niche, json };
}

async function main() {
  const { query, niche, json } = parseArgs(process.argv);

  if (!query.trim()) {
    console.error('Использование: npm run retrieve -- "запрос" [--niche <код>] [--json]');
    console.error(`Коды ниш: ${NICHE_CODES.join(', ')}`);
    process.exit(1);
  }

  // Понятные ошибки env-переменных: какая переменная и зачем (по паттерну embed.ts)
  const envChecks: Array<[string, string]> = [
    [MODELS_CONFIG.env.databaseUrl, 'подключение к Neon'],
    [MODELS_CONFIG.env.jinaEmbedKey, 'эмбеддинг запроса и rerank (ключ один)'],
    [MODELS_CONFIG.env.zaiKey, 'LLM-классификатор ниши'],
  ];
  for (const [name, why] of envChecks) {
    if (!process.env[name]) {
      console.error(`${name} is not set (.env.local) — нужно для: ${why}`);
      process.exit(1);
    }
  }

  if (niche !== undefined && !isNicheCode(niche)) {
    console.error(`Неизвестный код ниши «${niche}». Доступны: ${NICHE_CODES.join(', ')}`);
    process.exit(1);
  }

  const result = await retrieve({ query, niche: niche as NicheCode | undefined });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    const m = result.meta;
    console.log('── meta ─────────────────────────────────────────');
    console.log(
      `ниша: ${m.niche ?? '—'} (${m.niche_source})` +
        (m.confidence !== null ? `, confidence: ${m.confidence.toFixed(2)}` : ''),
    );
    console.log(
      `счётчики: vector=${m.counters.vector}, fts=${m.counters.fts}, rrf=${m.counters.rrf}, ` +
        `rerank=${m.counters.rerank}, context=${m.counters.context}` +
        (m.truncated ? ', ОБРЕЗАНО по бюджету' : ''),
    );
    console.log('── context ──────────────────────────────────────');
    console.log(result.context || '(контекст пуст — ничего не найдено)');
  }
}

main()
  .catch((err) => {
    console.error(`Ошибка retrieval: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1;
  })
  .finally(() => closePool());
