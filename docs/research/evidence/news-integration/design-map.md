# T0: принятый дизайн → реализация

Свежий Figma readback6ноября2026, session `df082622-16c7-4b16-bc47-62207a7c20b9`. Screens file `BdxNHlBVZWejREtOEIWDkI`; архив не менялся.

| Источник | Применение |
| --- | --- |
| СписокC1091:395, Mobile1091:450 | B01: intro/крошки, категория как переход к списку, сетка3/2/1, полные заголовки20/25, розовые чипы, единая ссылка карточки, right-aligned pagination. |
| СтатьяA1091:1520 | B02: чтение с заголовком/метаданными/анонсом/необязательной обложкой/body/source; B03: до3связанных и голубоватая44px «Все новости». |
|4041090:38 | Центрированный H1 «Страница не найдена», пояснение, Primary «На главную», Secondary «Выбрать город», обычный текст «Код ошибки:404». Никакой новой иллюстрации/анимации. |
| UI Library PiSCXYR88uqqcS6tKVfd8T | Общие карточка/чип/pagination/CMP0129/0130; public code переиспользует общие Header/Footer/Button/Breadcrumb patterns. |

Desktop H1 Geist48/50,800; Tablet40/43; Mobile28/33,700. Body16/24, secondary #526071, primary #18202A. Карточка Heading/Card20/25, нейтральная поверхность #F6F7F9, pink #FFEAE9, Secondary button #EEF8FF. Эти значения проверяются с текущими public tokens при построении, не создают отдельную admin-тему.

Public: сохраняется утверждённая композиция. Admin: расширение существующего workspace, его Tailwind/shadcn/React Aria и light/dark, не копия публичного розового сайта. Content-backed изображения будут из загруженных данных; статические общий логотип/иконки должны переиспользовать точные существующие assets либо штатный Figma export. Generated React code служит только design reference, не копируется как приложение.
