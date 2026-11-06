# Длительность code deployment: проверка 7 ноября2026

По замечанию владельца о deployments дольше10минут выполнено read-only сравнение двух завершённых выпусков. Задача измерения — [#553](https://github.com/Celtoman/astro-telekom/issues/553); оптимизация инфраструктуры в текущую интеграцию новостей не добавлена.

| Показатель | Медленный T4 | Быстрый T5 |
| --- | --- | --- |
| Deployment | `0qrjbv1yeao9qnwps28msntq` | `jojpmuixdd1fpx1weoe3odjk` |
| SHA | `4803ba5` | `cea8b632` |
| Created→finished | 20:00:05→20:12:07UTC,722с | 21:27:22→21:28:53UTC,91с |
| Git import marker→image build marker | 20:00:16.117904→20:09:23.035126,546.9с | 21:27:28.121792→21:28:05.442818,37.3с |
| Build marker→image pull marker | 124.3с | 9.6с |
| Start new app→containers started | 32.4с | 32.1с |
| BuildKit cached steps | 34 | 47 |

Даты запусков —6ноября2026UTC. MCP подтвердил exact commits и finished; приложение running:healthy. MCP summary не содержит времён шагов, поэтому через существующий pinned SSH выполнено чтение метаданных этих двух ApplicationDeploymentQueue records. На сервере обработаны timestamps и известные BuildKit markers; команды, значения env и raw logs не выводились и на компьютер не скачивались. Настройки приложения, Git, кешей, Docker и логирования не менялись.

В медленном выпуске основная задержка была до Docker build. Один долгий stderr интервал286.7с содержит сигнал Updating files, затем есть hidden stdout gap255.1с. Этого достаточно локализовать фазу подготовки исходников, но недостаточно объявить точную причину CPU/I/O/network/checkout. Сама admin build заняла73.9с; кеши также различались. Длительность запуска контейнеров почти одинакова и не объясняет разницу.

Следующий отдельный read-only аудит должен сопоставить размеры/формат исходников, source download/checkout, host pressure/I/O и параллельные deployments. Публичный CODE rebuild и CMS activation измеряются отдельно. В текущем выпуске сохраняются один финальный deployment, ожидание его терминального состояния, exact-SHA CI/healthy/CODE и live readback; превышение10минут само по себе не считается отказом.
