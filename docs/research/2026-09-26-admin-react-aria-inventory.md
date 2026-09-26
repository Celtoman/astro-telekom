# Инвентаризация миграции admin-примитивов (#97)

Проверено 26 сентября 2026 года по `apps/admin/src/components`. Целевой референс — [next-shadcn-admin-dashboard-aria](https://github.com/arhamkhnz/next-shadcn-admin-dashboard-aria); семантику компонентов сверяем с [React Aria Components](https://react-aria.adobe.com/getting-started). Astro static shell, React roots и HTTP API остаются прежними.

| Примитив | Где используется | Текущее состояние | Оставшаяся проверка |
| --- | --- | --- | --- |
| `Label`, `Separator` | Общий `Field` | React Aria | `htmlFor`, декоративный разделитель и ориентация |
| `Tabs` | `/variables`, `/seo/sitemap` | React Aria | Управляемый и начальный выбор, клавиши стрелок, связь tab/panel |
| `Checkbox` | Импорт городов/тарифов, редактор тарифа, sitemap | React Aria | Подписи и controlled state переведены; проверить клавиатуру на экранах |
| `Button`, `Badge` c `asChild` | Ссылки и кнопки нескольких экранов | Radix `Slot` | Сохранить семантику ссылки и клика при переносе composition API |
| `Collapsible`, `DropdownMenu`, `Tooltip` | `AdminNavigation` | Radix | Клавиатура, свёрнутая панель, подписи и возврат фокуса |
| `Dialog` | `AdminShell`, `CitiesApp` | Radix | Модальный focus trap, Escape, возврат фокуса, подтверждение удаления |
| `Popover` | `PublicationIndicator` | Radix | Доступность триггера и закрытие без потери фокуса |

Порядок оставшейся работы в рамках **существующей** #97: перевести композицию `asChild`, затем навигацию и overlays, после каждого среза проверить профильный `astro check`, build и затронутые экраны; удалить `radix-ui` только когда не останется импортов. Финальная приёмка включает доступность с клавиатуры и отсутствие регрессий на desktop/mobile. Это инвентарь исполнения #97, а не новый backlog.
