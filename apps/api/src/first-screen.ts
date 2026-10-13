import { BadRequestException } from '@nestjs/common';
import { ContentValidationError, validateContentText } from './content-validation-error';
import { listVariableDefinitions, resolveVariableText } from './variable-registry';
import { HOME_HERO_VERSION, HOME_HERO_IMPLEMENTATION, HOME_HERO_TEXT_LIMITS, parseRedTitle } from './home-hero-model';

export type FirstScreenKind = 'HOME' | 'CITY_HOME';
export const FIRST_SCREEN_VERSION = '1.0.0';
export const FIRST_SCREEN_IMPLEMENTATION = 'first-screen-editor-v1';
export const FIRST_SCREEN_COMMON = ['title', 'text', 'image', 'imageAlt', 'addressPlaceholder', 'checkButtonText'] as const;
export function firstScreenDefaults(kind: FirstScreenKind, siteName = 'Дом.ру') {
  return {
    title: kind === 'HOME' ? `Подключение домашнего интернета и телевидения ${siteName}` : 'Домашний интернет и телевидение в {CITY_NAME_PREPOSITIONAL}',
    text: kind === 'HOME' ? 'Укажите адрес, чтобы проверить возможность подключения Дом.ру в вашем доме и узнать о доступных услугах.' : 'Сравните опубликованные тарифы, проверьте возможность подключения по адресу и оставьте заявку на консультацию.',
    image: '/images/figma/home-hero.png', imageAlt: 'Wi-Fi-роутер, ТВ-приставка и пульт для домашнего подключения',
    addressPlaceholder: 'Введите ваш адрес', checkButtonText: 'Проверить',
    ...(kind === 'HOME' ? { chips: ['Бесплатная проверка', 'Точные результаты', 'Поможем с подключением'] } : { tariffsCtaText: 'Посмотреть тарифы' }),
  };
}

export function validateFirstScreen(kind: FirstScreenKind, raw: unknown, draft = false, version = FIRST_SCREEN_VERSION): string[] {
  if (version === HOME_HERO_VERSION && kind === 'HOME') return validateHomeHero(raw, draft);
  if (version !== FIRST_SCREEN_VERSION) throw new ContentValidationError('passportVersion', 'VERSION', 'Неизвестная версия первого экрана.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Контент первого экрана должен быть объектом');
  const data = raw as Record<string, unknown>;
  const limits: Record<string, number> = { title: 120, text: 1000, image: 2048, imageAlt: 250, addressPlaceholder: 120, checkButtonText: 80, ...(kind === 'CITY_HOME' ? { tariffsCtaText: 80 } : {}) };
  const allowed = [...Object.keys(limits), ...(kind === 'HOME' ? ['chips'] : [])];
  if (Object.keys(data).some(key => !allowed.includes(key))) throw new BadRequestException('Первый экран содержит неизвестные или системные поля');
  const missing: string[] = [];
  for (const [key, limit] of Object.entries(limits)) {
    const value = data[key];
    validateContentText(value, key, limit);
    if (!value.trim()) missing.push(key);
    if (key === 'title' || key === 'text') {
      try { resolveVariableText(value, { now: new Date() }, { path: key, field: 'TEXT' }); }
      catch (error) { throw new ContentValidationError(key, 'VARIABLE', error instanceof Error ? error.message : String(error)); }
      for (const token of value.matchAll(/\{([^{}]+)\}/g)) {
        const definition = listVariableDefinitions().find(item => item.code === token[1]);
        if (!definition || definition.scope === 'TARIFF' || (kind === 'HOME' && definition.scope === 'CITY')) throw new ContentValidationError(key, 'VARIABLE', `Переменная {${token[1]}} недоступна для этого первого экрана. Выберите переменную из списка редактора.`);
      }
    } else if (/[{}]/.test(value)) throw new ContentValidationError(key, 'VARIABLE', 'Переменные разрешены только в заголовке и описании.');
  }
  if (data.image) {
    const image = data.image as string;
    if (/\s|\\/.test(image) || image.startsWith('//')) throw new ContentValidationError('image', 'URL', 'Некорректная ссылка изображения');
    if (image.startsWith('/')) {
      if (!/^\/(?:[\w.-]+\/)*[\w.-]+$/.test(image) || image.split('/').some(part => part === '.' || part === '..')) throw new ContentValidationError('image', 'URL', 'Некорректный локальный путь изображения');
    } else {
      try { const url = new URL(image); if (url.protocol !== 'https:' || url.username || url.password) throw new Error(); }
      catch { throw new ContentValidationError('image', 'URL', 'Изображение должно иметь локальный путь или HTTPS URL'); }
    }
  }
  if (kind === 'HOME') {
    if (!Array.isArray(data.chips) || data.chips.length !== 3 || data.chips.some(value => typeof value !== 'string' || value.length > 80 || /[<>{}]/.test(value))) throw new ContentValidationError('chips', 'FORMAT', 'Нужны ровно три текстовых пояснения до 80 символов');
    data.chips.forEach((value, index) => { if (!(value as string).trim()) missing.push(`chips.${index}`); });
  }
  if (!draft && missing.length) throw new ContentValidationError(missing[0], 'REQUIRED', 'Первый экран не готов: обязательное поле пустое. Заполните его и повторите проверку.');
  return missing;
}

export function firstScreenFromTemplate(template: any) {
  const kind = template.kind as FirstScreenKind;
  const block = template.blocks?.find((item: any) => item.blockType === (kind === 'HOME' ? 'home.hero' : 'hero'));
  const passportVersion = template.content?.firstScreenPassportVersion ?? FIRST_SCREEN_VERSION;
  if (passportVersion !== FIRST_SCREEN_VERSION && !(kind === 'HOME' && passportVersion === HOME_HERO_VERSION)) throw new ContentValidationError('passportVersion', 'VERSION', 'Неизвестная версия первого экрана.');
  return { kind, data: block?.data ?? null, passportVersion, implementationVersion: passportVersion === HOME_HERO_VERSION ? HOME_HERO_IMPLEMENTATION : FIRST_SCREEN_IMPLEMENTATION };
}

function validateHomeHero(raw: unknown, draft: boolean): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('Контент первого экрана должен быть объектом');
  const data = raw as Record<string, unknown>;
  const limits = HOME_HERO_TEXT_LIMITS;
  if (Object.keys(data).some(key => !Object.hasOwn(limits, key) && key !== 'steps')) throw new BadRequestException('Первый экран содержит неизвестные или системные поля');
  const missing: string[] = [];
  for (const [key, limit] of Object.entries(limits)) {
    const value = data[key];
    if (key !== 'title') validateContentText(value, key, limit);
    else if (typeof value !== 'string') throw new ContentValidationError(key, 'TYPE', 'Заголовок должен быть текстом.');
    const input = value as string;
    let segments;
    try { segments = key === 'title' ? parseRedTitle(input) : [{ text: input, red: false }]; }
    catch (error) { throw new ContentValidationError(key, 'FORMAT', (error as Error).message); }
    if (!segments.map(segment => segment.text).join('').trim()) missing.push(key);
    if (key === 'title' || key === 'text') {
      let plain = '';
      for (const segment of segments) {
        try { plain += resolveVariableText(segment.text, { now: new Date() }, { path: key, field: 'TEXT' }).text; }
        catch (error) { throw new ContentValidationError(key, 'VARIABLE', (error as Error).message); }
        for (const token of segment.text.matchAll(/\{([^{}]+)\}/g)) {
          const definition = listVariableDefinitions().find(item => item.code === token[1]);
          if (!definition || definition.scope !== 'SITE') throw new ContentValidationError(key, 'VARIABLE', 'Переменная недоступна для общей главной.');
        }
      }
      if (key === 'title' && segments.map(segment => segment.text).join('').length > 120) throw new ContentValidationError(key, 'TOO_LONG', 'Заголовок без маркеров должен быть не длиннее 120 символов.');
      if (key === 'title' && plain.length > 120) throw new ContentValidationError(key, 'TOO_LONG', 'Заголовок после подстановки должен быть не длиннее 120 символов.');
    } else if (/[{}]/.test(input)) throw new ContentValidationError(key, 'VARIABLE', 'Переменные разрешены только в заголовке и описании.');
  }
  if (!Array.isArray(data.steps) || data.steps.length !== 3) throw new ContentValidationError('steps', 'FORMAT', 'Нужны ровно три шага.');
  data.steps.forEach((step, index) => {
    if (!step || typeof step !== 'object' || Array.isArray(step) || Object.keys(step).some(key => !['title', 'text'].includes(key))) throw new ContentValidationError(`steps.${index}`, 'FORMAT', 'Шаг содержит неизвестные поля.');
    for (const key of ['title', 'text']) {
      const field = `steps.${index}.${key}`, value = step[key];
      validateContentText(value, field, key === 'title' ? 80 : 250);
      if (/[{}]/.test(value)) throw new ContentValidationError(field, 'VARIABLE', 'Шаг содержит обычный текст без переменных.');
      if (!value.trim()) missing.push(field);
    }
  });
  if (!draft && missing.length) throw new ContentValidationError(missing[0], 'REQUIRED', 'Первый экран не готов: обязательное поле пустое.');
  return missing;
}
