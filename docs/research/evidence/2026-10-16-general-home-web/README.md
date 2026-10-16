# Локальная проверка компонентов HOME

Датированный пакет 16 октября 2026 года. Объём и ограничения — в [приёмке компонентов этапа 5](../../2026-10-16-general-home-stage5-blocks-acceptance.md).

Имена `figma-{block}-{1440,834,390}.png` обозначают исходные рендеры Screens. Имена `{block}-{public,preview}-{1440,834,390,320}.png` — отдельные собранные Astro-компоненты и тот же безопасный renderer с inactive preview CSS. `block`: `address`, `b14`, `b15`, `steps`, `movix`, `b16`, `help`, `cities`, `faq`.

Машинные измерения:

- [2g: геометрия и существующий FLOW 2](address-browser-proof.json).
- [B14](b14-browser-proof.json), [B15](b15-browser-proof.json), [Movix](movix-browser-proof.json), [B16](b16-browser-proof.json).
- [Этапы, помощь, города, FAQ и интерактивные сценарии](second-blocks-browser-proof.json).
- [Источник типографики B14/B15](b14-b15-source.json), [assets и происхождение](assets-provenance.json).

В B14/B16 сохранены измеренные отличия естественного переноса и их последующая независимая оценка; наличие поля `mismatches` в исходном B16 proof не означает потерю контента. Не подменять эту оценку утверждением о попиксельной идентичности Figma.

Состояния `help-error-390.png`, `help-success-390.png`, `faq-keyboard-expanded-390.png` сняты с перехваченными HTTP-запросами. Каталог52 городов и вопросы в этом fixture синтетические. Они не внесены в рабочие данные или опубликованный snapshot. Пакет не подтверждает полную страницу, общий iframe `/preview`, внешнюю доставку или deployment.
