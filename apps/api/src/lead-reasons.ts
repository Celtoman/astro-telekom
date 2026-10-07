export const LEAD_REASONS = Object.freeze([
  Object.freeze({ code: 'callback_consultation', label: 'Консультация — обратный звонок', route: 'MANUAL', version: 1 }),
  Object.freeze({ code: 'new_connection', label: 'Новое подключение', route: 'SALES', version: 1 }),
  Object.freeze({ code: 'existing_subscriber_support', label: 'Поддержка действующего абонента', route: 'NON_SALES', version: 1 }),
  Object.freeze({ code: 'billing', label: 'Оплата', route: 'NON_SALES', version: 1 }),
  Object.freeze({ code: 'relocation', label: 'Переезд', route: 'MANUAL', version: 1 }),
  Object.freeze({ code: 'other', label: 'Другое', route: 'MANUAL', version: 1 }),
] as const);

export const LEAD_REASON_CODES = LEAD_REASONS.map(({ code }) => code);
export type LeadReasonSnapshot = typeof LEAD_REASONS[number];

export function classifyLeadReason(code: unknown): LeadReasonSnapshot | null {
  return LEAD_REASONS.find((reason) => reason.code === code) ?? null;
}
