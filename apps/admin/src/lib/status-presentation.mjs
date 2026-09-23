const entry = (label, description, tone) => ({ label, description, tone, known: true, code: null })

const registry = {
  publishStatus: {
    DRAFT: entry("Черновик", "Запись сохранена, но не опубликована.", "warning"),
    PUBLISHED: entry("Опубликовано", "Запись включена в опубликованный каталог.", "success"),
    ARCHIVED: entry("В архиве", "Запись исключена из рабочего каталога.", "neutral"),
  },
  serviceType: {
    INTERNET: entry("Домашний интернет", "Тариф только с доступом в интернет.", "info"),
    INTERNET_TV: entry("Интернет и телевидение", "Комбинированный тариф интернета и телевидения.", "info"),
    TV: entry("Телевидение", "Тариф только с телевидением.", "info"),
    OTHER: entry("Другая услуга", "Тип услуги не относится к основным категориям.", "neutral"),
  },
  importStatus: {
    VALIDATED: entry("Проверено", "Файл проверен и ожидает применения.", "warning"),
    APPLIED: entry("Применено", "Данные сохранены в рабочей версии.", "success"),
    UNDONE: entry("Отменено", "Изменения импорта отменены новой рабочей версией.", "neutral"),
    FAILED: entry("Ошибка", "Импорт не завершен.", "destructive"),
  },
  siteRebuildStatus: {
    PENDING: entry("Ожидает запуска", "Пересборка зарегистрирована и ожидает очереди.", "warning"),
    QUEUED: entry("В очереди", "Пересборка передана исполнителю.", "info"),
    RUNNING: entry("Выполняется", "Статический сайт сейчас пересобирается.", "info"),
    RETRYING: entry("Будет повторено", "Предыдущая попытка не завершилась, назначен повтор.", "warning"),
    SUCCEEDED: entry("Завершено", "Пересборка успешно завершена.", "success"),
    FAILED: entry("Ошибка", "Пересборка завершилась ошибкой.", "destructive"),
  },
  sitePublicationStatus: {
    SCHEDULED: entry("Запланировано", "Точная версия ожидает указанного времени запуска.", "warning"),
    PENDING: entry("Ожидает запуска", "Публикация зарегистрирована и ожидает обработки.", "warning"),
    RUNNING: entry("Публикуется", "Точная версия сейчас собирается и проверяется.", "info"),
    SUCCEEDED: entry("Опубликовано", "Версия успешно стала публичной.", "success"),
    FAILED: entry("Ошибка", "Публикация не завершилась успешно.", "destructive"),
    CANCELLED: entry("Отменено", "Запланированная публикация отменена.", "neutral"),
  },
  leadStatus: {
    NEW: entry("Новая", "Заявка еще не взята оператором в работу.", "warning"),
    IN_PROGRESS: entry("В работе", "Оператор обрабатывает заявку.", "info"),
    CALL_LATER: entry("Перезвонить", "Контакт с клиентом отложен.", "warning"),
    CONNECTED: entry("Подключена", "Подключение по заявке завершено.", "success"),
    REJECTED: entry("Отклонена", "Заявка закрыта без подключения.", "destructive"),
  },
  addressCheckStatus: {
    AVAILABLE: entry("Дом.ру доступен", "Адрес прошел проверку доступности Дом.ру.", "success"),
    UNAVAILABLE: entry("Дом.ру недоступен", "По адресу не подтверждена доступность Дом.ру.", "neutral"),
    AMBIGUOUS: entry("Адрес неоднозначен", "Адрес нужно уточнить перед отправкой заявки.", "warning"),
    MANUAL_CHECK: entry("Нужна ручная проверка", "Автоматических данных недостаточно для решения.", "warning"),
    ERROR: entry("Ошибка проверки", "Внешняя проверка адреса не завершилась.", "destructive"),
  },
  leadProcessingStatus: {
    PENDING: entry("Ожидает отправки", "Проверки пройдены, внешний ответ еще не получен.", "warning"),
    DELIVERED: entry("Передана в Tarifnik", "Tarifnik принял заявку и вернул внешний идентификатор.", "success"),
    DUPLICATE_SUPPRESSED: entry("Повтор не отправлен", "Отправка остановлена защитой от повторных заявок.", "neutral"),
    ACTIVE_SUBSCRIBER_NOT_SENT: entry("Действующий абонент", "Заявка сохранена, но не передана как новое подключение.", "neutral"),
    PROVIDER_NOT_AVAILABLE_NOT_SENT: entry("Дом.ру недоступен", "Заявка сохранена без автоматической передачи.", "neutral"),
    NO_PROVIDERS_NOT_SENT: entry("Провайдеры не найдены", "По адресу нет провайдеров для автоматической передачи.", "neutral"),
    MANUAL_CHECK: entry("Нужна ручная проверка", "Недостаточно проверенных данных для автоматического решения.", "warning"),
    ADDRESS_CLARIFICATION: entry("Нужно уточнить адрес", "Точный адрес подключения не подтвержден.", "warning"),
    MANUAL_CHECK_API: entry("Проверка не завершена", "Внешняя проверка вернула ошибку или неоднозначный ответ.", "warning"),
    DELIVERY_QUEUE_ERROR: entry("Ошибка очереди", "Задание доставки не создано.", "destructive"),
    DELIVERY_ERROR_EMAIL_SENT: entry("Отправлено резервное письмо", "Основной канал не сработал, оператор уведомлен по email.", "warning"),
    DELIVERY_ERROR_EMAIL_FAILED: entry("Не доставлена", "Основной и резервный каналы завершились ошибкой.", "destructive"),
    DELIVERY_EMAIL_OUTCOME_UNKNOWN: entry("Результат письма неизвестен", "Резервный канал мог принять письмо, но результат не удалось сохранить. Проверьте внешний канал перед повтором.", "destructive"),
  },
  deliveryChannel: {
    QUEUE: entry("Очередь отправки", "Заявка передана фоновому обработчику.", "info"),
    API: entry("Передача в Tarifnik", "Заявка отправляется напрямую через API Tarifnik.", "info"),
    EMAIL: entry("Резервное письмо", "Оператор получает заявку по резервному email-каналу.", "warning"),
  },
  deliveryAttemptStatus: {
    SUCCEEDED: entry("Успешно", "Попытка доставки подтверждена.", "success"),
    FAILED: entry("Ошибка", "Попытка доставки завершилась ошибкой.", "destructive"),
    SKIPPED: entry("Пропущено", "Попытка не выполнялась по правилам обработки.", "neutral"),
  },
  leadNotificationStatus: {
    PENDING: entry("Ожидает очереди", "Оповещение создано и ожидает постановки в очередь.", "warning"),
    QUEUED: entry("В очереди", "Оповещение передано фоновому обработчику.", "info"),
    RUNNING: entry("Отправляется", "Оповещение сейчас отправляется.", "info"),
    RETRYING: entry("Будет повторено", "Назначена повторная попытка оповещения.", "warning"),
    SUCCEEDED: entry("Отправлено", "Оповещение успешно доставлено.", "success"),
    FAILED: entry("Не отправлено", "Оповещение завершилось финальной ошибкой.", "destructive"),
  },
  contentEntityType: {
    PROVIDER: entry("Провайдер", "Изменение настроек провайдера.", "neutral"),
    SITE: entry("Сайт", "Изменение настроек сайта.", "neutral"),
    REGION: entry("Регион", "Изменение региона обслуживания.", "neutral"),
    CITY: entry("Город", "Изменение города обслуживания.", "neutral"),
    PAGE: entry("Страница", "Изменение страницы или ее блоков.", "neutral"),
    TARIFF: entry("Тариф", "Изменение тарифного предложения.", "neutral"),
    REDIRECT: entry("Редирект", "Изменение правила перенаправления.", "neutral"),
  },
  contentRevisionAction: {
    CREATE: entry("Создание", "Создана новая запись.", "success"),
    UPDATE: entry("Изменение", "Существующая запись изменена.", "info"),
    IMPORT: entry("Импорт", "Изменения внесены массовым импортом.", "info"),
    UNDO: entry("Отмена операции", "Ранее внесенные изменения отменены.", "warning"),
    ARCHIVE: entry("Архивация", "Запись перемещена в архив.", "neutral"),
    RESTORE: entry("Восстановление", "Запись восстановлена из архива.", "success"),
  },
  importIssueLevel: {
    error: entry("Ошибка", "Строка блокирует применение импорта.", "destructive"),
    warning: entry("Предупреждение", "Строка требует внимания и явного подтверждения.", "warning"),
  },
  publicationView: {
    published: entry("Опубликовано", "Рабочая версия совпадает с публичной.", "success"),
    unpublished: entry("Ожидает публикации", "Есть сохраненные изменения, которых еще нет на сайте.", "warning"),
    publishing: entry("Выполняется", "Версия сейчас собирается и проверяется.", "info"),
    scheduled: entry("Запланировано", "Точная версия ожидает назначенного времени.", "warning"),
    failed: entry("Ошибка", "Последняя публикация не завершилась успешно.", "destructive"),
  },
  contractStatus: {
    ACTIVE: entry("Найден действующий абонент", "Новая заявка не отправляется как подключение.", "warning"),
    NOT_FOUND: entry("Договор не найден", "Действующий договор по данным проверки не найден.", "success"),
    ERROR: entry("Ошибка проверки договора", "Внешняя проверка договора не завершилась.", "destructive"),
    NOT_CONFIGURED: entry("Проверка не настроена", "Для города не настроен контракт проверки договора.", "warning"),
  },
  notificationTransport: {
    resend: entry("Email через Resend", "Письмо отправляется через сервис Resend.", "info"),
    webhook: entry("Email через webhook", "Письмо отправляется через настроенный webhook.", "info"),
    none: entry("Канал не настроен", "Транспорт оповещений отсутствует.", "warning"),
  },
  externalLeadStatus: {
    created: entry("Создана в Tarifnik", "Tarifnik создал новую внешнюю заявку.", "success"),
    created_duplicate: entry("Принята как повторная", "Tarifnik распознал повторную заявку.", "warning"),
  },
  duplicateReason: {
    phone_24h: entry("Совпадает телефон", "Найдена заявка с тем же телефоном за последние 24 часа.", "neutral"),
    address_24h: entry("Совпадает адрес", "Найдена заявка с тем же адресом за последние 24 часа.", "neutral"),
  },
}

export function statusPresentation(kind, value) {
  const code = typeof value === "string" ? value : value == null ? "" : String(value)
  const known = registry[kind]?.[code]
  if (known) return known
  return {
    label: "Неизвестный статус",
    description: "Система вернула значение, которого нет в текущем реестре интерфейса.",
    tone: "neutral",
    known: false,
    code,
  }
}

const sourceEntries = {
  manual: entry("Введено вручную", "Данные созданы оператором.", "neutral"),
  admin: entry("Административный интерфейс", "Изменение выполнено оператором в админке.", "neutral"),
  seed: entry("Начальные данные", "Запись создана штатной инициализацией окружения.", "neutral"),
  preview: entry("Рабочий предпросмотр", "Данные используются только для предпросмотра.", "info"),
  snapshot: entry("Снимок публикации", "Данные зафиксированы для конкретной публикации.", "info"),
  "static web": entry("Статический публичный сайт", "Данные относятся к собранной публичной версии.", "success"),
}

export function sourcePresentation(value) {
  const code = typeof value === "string" && value.trim() ? value.trim() : "manual"
  const exact = sourceEntries[code.toLocaleLowerCase("ru-RU")]
  if (exact) return exact
  if (/^(?:city|tariff)-import(?:-undo)?:/u.test(code)) {
    return { ...entry(code.includes("-undo:") ? "Отмена импорта" : "Импорт данных", "Изменение выполнено штатным импортом.", "info"), code }
  }
  if (/^migration:/u.test(code)) return { ...entry("Миграция данных", "Изменение выполнено версионированной миграцией.", "neutral"), code }
  if (/\.(?:xlsx|xls|csv)$/iu.test(code)) return { ...entry("Импорт из файла", "Источник данных — загруженный оператором файл.", "info"), code }
  return { ...entry("Другой источник", "Источник не относится к стандартным категориям интерфейса.", "neutral"), known: false, code }
}

export function statusOptions(kind, values) {
  return values.map((value) => ({ value, ...statusPresentation(kind, value) }))
}
