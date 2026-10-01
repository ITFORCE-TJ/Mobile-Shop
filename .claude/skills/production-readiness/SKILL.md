---
name: production-readiness
description: Проверка готовности Mobile Shop к релизу в production — CI-шаги, миграции, env-переменные, Docker/nginx/Vercel, бэкапы, логирование, нативные сборки. Выдаёт Go/No-Go чек-лист. Используй перед деплоем или при просьбе «production readiness».
argument-hint: "[web | native | backend | пусто = всё]"
---

# Production readiness

Область: `$ARGUMENTS` (если пусто, то всё).

Итог: **Go / No-Go** с перечнем блокеров.

## 1. Код и CI (повтори шаги `.github/workflows/ci-cd.yml`)
Запусти и зафиксируй результат каждого шага:
- `npm run lint`
- `npm test`
- `npm run build`
- При доступной локальной БД (порт 5435): `npx prisma migrate status`, `npm run test:e2e`, `npm run test:audit-fixes`, `npm run test:profit-refund`, `npm run audit:owners`.

Если шаг не удалось запустить, укажи это явно как «не проверено», а не «ок».

## 2. Git и миграции
- `git status`: нет незакоммиченных изменений, особенно новых папок в `prisma/migrations/` и правок `schema.prisma` без миграции.
- `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --shadow-database-url ...` (или `migrate status`) показывает, что схема и миграции совпадают.
- Миграции безопасны для живых данных: нет `DROP` и `NOT NULL` без default на заполненных таблицах, долгие блокировки отмечены.
- Есть свежий бэкап перед миграцией (`scripts/backup-db.sh`) и проверенный план отката (`scripts/restore-db.sh`).

## 3. Конфигурация и секреты
- Production требует `JWT_SECRET` и `APP_URL`, сервер без них не стартует; проверь, что так и есть.
- Сверь `.env.example` и `.env.native.example` с реально используемыми `process.env.*` и `import.meta.env.*`: нет ли новых переменных без документации.
- `BUSINESS_TIME_ZONE` задан правильно.
- Тестовые пользователи (`SEED_TEST_DATA`) не попадут в prod.

## 4. Инфраструктура
- `Dockerfile` / `docker-compose.prod.yml`: non-root пользователь, healthcheck, `docker-entrypoint.sh` выполняет `migrate deploy` и падает при ошибке.
- `nginx/nginx.conf`: rate limit на `/api`, проксирование `/ws` с upgrade-заголовками, gzip, HTTPS.
- `vercel.json`: rewrite `/api/*` на актуальный backend, CSP включает все внешние origin (API, WS, CDN).
- Есть health-эндпоинт для мониторинга.

## 5. Надёжность
- Центральный error handler: Prisma P2002 превращается в 409, schema drift в 503, стектрейсы наружу не уходят.
- Логирование ошибок достаточное для расследования, без секретов.
- Graceful shutdown (SIGTERM): закрываются HTTP, WebSocket и Prisma.
- Тяжёлые запросы отчётов имеют индексы по датам и `storeId` (сверь с `schema.prisma`).

## 6. Фронтенд и нативные приложения
- Сборка PWA: service worker не кэширует `/api`, при деплое есть стратегия обновления версии.
- Native: `VITE_API_URL` (https) и `VITE_WS_URL` (wss) заданы, `npm run native:sync` проходит, версии/buildNumber в `android/` и `ios/` увеличены.

## Формат отчёта

| Раздел | Статус (✅ / ⚠️ / ❌ / ⏭ не проверено) | Детали / файл:строка |

Затем:
- **Блокеры (No-Go):** что обязательно исправить до релиза.
- **Риски:** можно релизить, но нужно исправить следом.
- **Вердикт:** Go или No-Go.
