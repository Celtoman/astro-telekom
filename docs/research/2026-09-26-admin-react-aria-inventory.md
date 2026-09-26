# Инвентаризация миграции admin-примитивов (#97)

Проверено 26 сентября 2026 года по `apps/admin/src/components`. Целевой референс — [next-shadcn-admin-dashboard-aria](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-aria); семантику компонентов сверяем с [React Aria Components](https://react-aria.adobe.com/getting-started). Astro static shell, React roots и HTTP API остаются прежними.

| Примитив | Где используется | Текущее состояние | Оставшаяся проверка |
| --- | --- | --- | --- |
| `Label`, `Separator` | Общий `Field` | React Aria | `htmlFor`, декоративный разделитель и ориентация |
| `Tabs` | `/variables`, `/seo/sitemap` | React Aria | Управляемый и начальный выбор, клавиши стрелок, связь tab/panel |
| `Checkbox` | Импорт городов/тарифов, редактор тарифа, sitemap | React Aria | Подписи и controlled state переведены; проверить клавиатуру на экранах |
| `Button`, `Badge` | Ссылки и кнопки нескольких экранов | Нативная anchor-композиция / span; без Radix `Slot` | Проверить ссылку и клавиатуру |
| `Disclosure`, `Menu`, `Tooltip` | `AdminNavigation` | React Aria | Клик/Enter, Escape, подсказка и возврат фокуса проверены в Chrome |
| `Dialog` | `AdminShell`, `CitiesApp` | React Aria | Сохраняется dirty warning; проверить focus trap, Escape и возврат фокуса |
| `Popover` | `PublicationIndicator` | React Aria | Проверить клавиатуру и возврат фокуса |

Проверка в локальном headless Chrome: раскрытие группы, tooltip, меню по клику и Enter, Escape с возвратом фокуса, переход вкладки стрелкой, выбор checkbox пробелом, открытие/закрытие мобильного Modal и Popover с возвратом фокуса. Временные QA-маршруты удалены. Полный `pnpm check` пройден; для закрытия #97 требуется публикация коммита. Это инвентарь исполнения #97, а не новый backlog.
