---
name: Astro Telekom Admin
description: Existing React Aria dashboard system; factual extraction for news extension
colors:
  background: "oklch(1 0 0)"
  foreground: "oklch(0.145 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  muted: "oklch(0.97 0 0)"
  muted-foreground: "oklch(0.556 0 0)"
  border: "oklch(0.922 0 0)"
  destructive: "oklch(0.577 0.245 27.325)"
  success: "oklch(0.45 0.14 150)"
rounded:
  base: "0.625rem"
---

## Overview

Расширение существующего административного интерфейса, режим Operate. Авторитет: src/styles/global.css, src/components/ui и ../../docs/admin-design-system.md. Это запись существующих правил, не замена CSS и не новая палитра. Система сохраняет привычные таблицы, формы и sidebar.

## Colors

Использовать семантические Tailwind tokens background/foreground/card/muted/border/primary/destructive/success/info/warning. Выше записаны исходные light-значения; dark-источник — тот же global.css, без отдельного набора в news CSS. Состояние обозначается текстом и иконкой/цветом вместе. Розовый чип публичного сайта не переносится автоматически в admin.

## Typography

Текущий --font-sans: Inter, ui-sans-serif, system-ui, sans-serif. H1 рабочих экранов text-2xl/font-semibold, поля/таблица text-sm, вспомогательные пояснения muted-foreground. Длинные названия переносятся; подпись поля не заменяется placeholder.

## Layout

Существующий AdminShell и persistent workspace. Основная рабочая область с gap6/p6 и lg:p8; редактор расширяется до двух областей content/settings. Desktop — основной контент и правая колонка; узкий экран — единая последовательность. Верхние действия переносятся без потери подписей. Список сохраняет контекст при возврате.

## Elevation & Depth

Группировка Card/border и отступами; не добавлять декоративные тени. Диалоги — React Aria ModalOverlay/Dialog вне обрезающих контейнеров, с фокусом и возвратом фокуса. Обычные ошибки/сохранение не открывают модалки.

## Shapes

Базовый radius0.625rem и текущие варианты rounded библиотечных компонентов. Не вводить особые news-кнопки или новый стиль полей. Public44px targets не являются поводом менять все общие admin controls; новые touch-сценарии проверяются отдельно.

## Components

Переиспользовать Button/Input/Field/Card/Table/Badge/Alert/Skeleton/Tabs, существующие navigation guards и publication progress. Combobox/Dialog/Toolbar из React Aria при отсутствии локальной обёртки. Специализированные rich text/media/crop компоненты собираются в этой системе, не через новую UI-библиотеку.

## Do's and Don'ts

Показывать точное состояние и следующее действие. Сохранять ввод при ошибке и различать draft/live. Не строить hero/KPI в редакторе, не украшать процесс и не заменять русские действия служебными revision-кодами. Технические сведения — вторичные подробности. Анимация только для обратной связи; reduced motion учитывается. Проверить light/dark, keyboard и4ширины перед завершением.
