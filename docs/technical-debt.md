# Технический долг — индекс

Дата фиксации реестра: 9 сентября 2026 года. **Полное описание каждой проблемы (доказательство, влияние, следующее действие) живёт в GitHub Issue, не здесь** — эта таблица дублировала текст до 8 сентября 2026, что и было источником рассинхронизации; теперь она только индекс. Как устроена вся система — [docs/task-management.md](task-management.md).

Приоритеты: P0 — блокирует безопасный запуск или ведет к недостоверным данным; P1 — нарушает ключевой путь первого релиза; P2 — существенно ограничивает эксплуатацию; P3 — улучшение качества и поддерживаемости.

**Статус ведётся в GitHub Issues** (репозиторий `Celtoman/astro-telekom`, label `tech-debt` + приоритет). 🟢 — open, ✅ — closed. Актуально на момент чтения этой таблицы issue может отличаться от статуса ниже — сверяться по ссылке, не по этому файлу, если нужен текущий статус.

## P0

| ID | Issue | Суть |
| --- | --- | --- |
| TD-01 | [#1](https://github.com/Celtoman/astro-telekom/issues/1) ✅ | Test-double синхронизирован с контроллером, добавлены сценарии дубликатов; release gate зеленый |
| TD-02 | [#2](https://github.com/Celtoman/astro-telekom/issues/2) ✅ | HMAC-ссылка заменена серверным одноразовым token с TTL, отзывом и admin UI |
| TD-03 | [#3](https://github.com/Celtoman/astro-telekom/issues/3) ✅ | Demo-data требуют явного флага; policy и final HTML защищены тестами [#4](https://github.com/Celtoman/astro-telekom/issues/4) |

## P1

| ID | Issue | Суть |
| --- | --- | --- |
| TD-04 | [#5](https://github.com/Celtoman/astro-telekom/issues/5) 🟢 | Публичные маршруты жёстко привязаны к `domru-kazan`/`/kazan/` |
| TD-05 | [#6](https://github.com/Celtoman/astro-telekom/issues/6) ✅ | Persistent rebuild-job: dedupe, BullMQ retry/backoff, API-статус и финальный результат provider |
| TD-06 | [#7](https://github.com/Celtoman/astro-telekom/issues/7) ✅ | Full-snapshot import атомарно удаляет отсутствующие тарифы, требует подтверждения warnings и создает redirects при ручной смене URL |
| TD-07 | [#8](https://github.com/Celtoman/astro-telekom/issues/8) 🟢 | Модель `Redirect` без controller/routing/управления |
| TD-08 | [#9](https://github.com/Celtoman/astro-telekom/issues/9) 🟢 | Админка — demo UI вместо реальных данных; источник замены — [docs/admin-design-system.md](admin-design-system.md) |
| TD-09 | [#10](https://github.com/Celtoman/astro-telekom/issues/10) ✅ | Реализованы HttpOnly-cookie login/me/logout и auth-gated React shell; browser service-token удален |
| TD-10 | [#11](https://github.com/Celtoman/astro-telekom/issues/11) 🟢 | Contract API и Tarifnik не настроены в `.env.example` |
| TD-21 | [#12](https://github.com/Celtoman/astro-telekom/issues/12) 🟢 | `xlsx@0.18.5` уязвим к Prototype Pollution и ReDoS |
| TD-22 | [#37](https://github.com/Celtoman/astro-telekom/issues/37) ✅ | Compose переведен на обязательный для PostgreSQL 18 volume mount `/var/lib/postgresql` |
| TD-23 | [#38](https://github.com/Celtoman/astro-telekom/issues/38) ✅ | Seed использует явный ESM entrypoint сгенерированного Prisma client и снова запускается на Node 22 |
| TD-24 | [#39](https://github.com/Celtoman/astro-telekom/issues/39) ✅ | City import использует transaction-local maps, bulk page insert и проходит полный пакет 207 строк |
| TD-25 | [#40](https://github.com/Celtoman/astro-telekom/issues/40) ✅ | Пользовательские сессии отделены от worker-only `/internal/*`, доступных только по сервисному токену |
| TD-27 | [#42](https://github.com/Celtoman/astro-telekom/issues/42) 🟢 | Импорт тарифов теряет полное описание и счетчики TV-каналов |
| TD-28 | [#43](https://github.com/Celtoman/astro-telekom/issues/43) 🟢 | Snapshot тарифов содержит 63 строки с legacy city slug |
| TD-30 | [#45](https://github.com/Celtoman/astro-telekom/issues/45) 🟢 | Реальный full-snapshot превышает стандартный transaction timeout Prisma |
| TD-31 | [#46](https://github.com/Celtoman/astro-telekom/issues/46) 🟢 | Preview не видит city+slug коллизии между разными типами тарифа |

## P2

| ID | Issue | Суть |
| --- | --- | --- |
| TD-11 | [#13](https://github.com/Celtoman/astro-telekom/issues/13) 🟢 | Нет аудита, версий, schedule публикации, корзины, rollback |
| TD-12 | [#14](https://github.com/Celtoman/astro-telekom/issues/14) 🟢 | Наследование `content` — только shallow merge верхнего уровня |
| TD-13 | [#15](https://github.com/Celtoman/astro-telekom/issues/15) 🟢 | `PageBlock` поддерживает только 3 типа блоков из библиотеки |
| TD-14 | [#16](https://github.com/Celtoman/astro-telekom/issues/16) 🟢 | Нет `ValidationPipe`, rate limiting, anti-abuse, PII retention |
| TD-15 | [#17](https://github.com/Celtoman/astro-telekom/issues/17) 🟢 | Email-уведомление о лиде — fire-and-forget без журнала |
| TD-16 | [#18](https://github.com/Celtoman/astro-telekom/issues/18) 🟢 | Root URL и базовый HTML smoke добавлены; остаются обязательный production origin и sitemap из опубликованных сущностей |
| TD-17 | [#19](https://github.com/Celtoman/astro-telekom/issues/19) 🟢 | Миграции/seed вручную, health не проверяет БД |

## P3

| ID | Issue | Суть |
| --- | --- | --- |
| TD-18 | [#20](https://github.com/Celtoman/astro-telekom/issues/20) 🟢 | `pnpm lint` не проверяет admin и CRM |
| TD-19 | [#21](https://github.com/Celtoman/astro-telekom/issues/21) ✅ | Устаревший tracked JS рядом с TS в `apps/api/src` — закрыто 7 сентября 2026 |
| TD-20 | [#22](https://github.com/Celtoman/astro-telekom/issues/22) 🟢 | Повторяющаяся нумерация «4» в открытых вопросах `decisions.md` |
| TD-26 | [#41](https://github.com/Celtoman/astro-telekom/issues/41) 🟢 | GitHub Actions используют устаревающий Node.js 20 runtime action |
| TD-29 | [#44](https://github.com/Celtoman/astro-telekom/issues/44) 🟢 | README содержит устаревшее число тестов release gate |

## Невыполненные, но согласованные возможности

Это не дефекты уже реализованного поведения, а обязательные для следующего релиза направления: полноценный preview и публикации, массовые SEO-операции, история тарифов, редиректы, медиа-библиотека, аналитика, переменные, географическая навигация, управление учетными записями администраторов, интеграционный контракт Tarifnik и юридически утвержденные правила PII. Их порядок и критерии приема — в исполнимых Task issues, см. [docs/task-management.md](task-management.md).
