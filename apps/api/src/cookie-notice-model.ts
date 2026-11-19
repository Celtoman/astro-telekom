export const COOKIE_DOCUMENTS = {
  COOKIE_POLICY: 'Политика обработки файлов cookie',
  PRIVACY: 'Политика конфиденциальности',
  PERSONAL_DATA_CONSENT: 'Согласие на обработку персональных данных',
} as const;
export type CookieDocument = keyof typeof COOKIE_DOCUMENTS;
export interface CookieNotice {
  version: '1.0.0';
  enabled: boolean;
  message: string;
  button: string;
  links: [{ label: string; document: CookieDocument }, { label: string; document: CookieDocument }];
}

export function cookieNoticeDefaults(): CookieNotice {
  return {
    version: '1.0.0',
    enabled: true,
    message: 'Сайт использует cookie и сервисы аналитики. Они помогают понять, какие страницы полезны и откуда приходят обращения.',
    button: 'Понятно',
    links: [
      { label: 'Что именно собирается', document: 'COOKIE_POLICY' },
      { label: 'Политика конфиденциальности', document: 'PRIVACY' },
    ],
  };
}
