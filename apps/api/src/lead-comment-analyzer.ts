export const LEAD_COMMENT_RULES_VERSION = 1;

export type LeadCommentCategory =
  | 'technical_problem'
  | 'billing'
  | 'cancellation'
  | 'complaint'
  | 'relocation'
  | 'new_connection';

export type LeadCommentOutcome = 'CLEAR' | 'WARNING' | 'MANUAL_REVIEW';

export interface LeadCommentEvidence {
  category: LeadCommentCategory;
  fragment: string;
  start: number;
  end: number;
}

export interface LeadCommentAnalysis {
  version: number;
  outcome: LeadCommentOutcome;
  category: LeadCommentCategory | null;
  evidence: LeadCommentEvidence[];
  explanation: string;
}

const RULES: ReadonlyArray<{ category: LeadCommentCategory; phrases: readonly string[] }> = [
  { category: 'technical_problem', phrases: ['не работает интернет', 'интернет не работает', 'пропал интернет', 'нет интернета', 'не работает wi-fi', 'не работает вай-фай'] },
  { category: 'billing', phrases: ['списали деньги', 'неверное начисление', 'ошибка в счете', 'ошибка в счёте', 'вопрос по оплате', 'неправильное списание'] },
  { category: 'cancellation', phrases: ['расторгнуть договор', 'отключить интернет', 'отказаться от услуг', 'закрыть договор'] },
  { category: 'complaint', phrases: ['жалоба', 'жалобу', 'претензия', 'претензию', 'юридическая претензия'] },
  { category: 'relocation', phrases: ['переезд', 'переезжаю', 'сменить адрес подключения'] },
  { category: 'new_connection', phrases: ['подключить интернет', 'новое подключение', 'хочу подключиться'] },
];

function phrasePattern(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'giu');
}

function isNegated(comment: string, start: number): boolean {
  const before = comment.slice(Math.max(0, start - 40), start);
  return /(?:^|[^\p{L}\p{N}])(?:не|нет|без)\s+(?:(?:хочу|нужно|планирую)\s+)?$/iu.test(before);
}

function determineOutcome(categories: Set<LeadCommentCategory>, reasonCode?: string): LeadCommentOutcome {
  if (reasonCode === 'relocation' || reasonCode === 'other') return 'MANUAL_REVIEW';
  if (!categories.size) return 'CLEAR';
  const hasNewConnection = categories.has('new_connection');
  const nonSales = [...categories].filter((category) => category !== 'new_connection');
  if (!reasonCode || reasonCode === 'new_connection') return nonSales.length ? 'MANUAL_REVIEW' : 'CLEAR';
  if (hasNewConnection) return 'MANUAL_REVIEW';
  if (reasonCode === 'existing_subscriber_support') {
    if (nonSales.some((category) => !['technical_problem', 'complaint'].includes(category))) return 'MANUAL_REVIEW';
    return categories.has('complaint') ? 'WARNING' : 'CLEAR';
  }
  if (reasonCode === 'billing') {
    if (nonSales.some((category) => !['billing', 'complaint'].includes(category))) return 'MANUAL_REVIEW';
    return categories.has('complaint') ? 'WARNING' : 'CLEAR';
  }
  return 'MANUAL_REVIEW';
}

export function analyzeLeadComment(input: string | null | undefined, reasonCode?: string): LeadCommentAnalysis | null {
  const comment = input?.trim();
  if (!comment) return null;

  const evidence: LeadCommentEvidence[] = [];
  for (const rule of RULES) {
    for (const phrase of rule.phrases) {
      for (const match of comment.matchAll(phrasePattern(phrase))) {
        const start = match.index;
        if (isNegated(comment, start)) continue;
        const end = start + match[0].length;
        if (!evidence.some((item) => item.category === rule.category && item.start === start && item.end === end)) {
          evidence.push({ category: rule.category, fragment: comment.slice(start, end), start, end });
        }
      }
    }
  }
  evidence.sort((left, right) => left.start - right.start || left.end - right.end || left.category.localeCompare(right.category));
  const categories = new Set(evidence.map((item) => item.category));
  const outcome = determineOutcome(categories, reasonCode);
  const category = (outcome === 'MANUAL_REVIEW' ? evidence.find((item) => item.category !== 'new_connection') : null)?.category
    ?? evidence[0]?.category ?? null;
  const explanation = outcome === 'WARNING'
    ? 'Найдено упоминание жалобы: оператору следует прочитать комментарий, автоматический отказ не применяется.'
    : outcome === 'MANUAL_REVIEW' && !reasonCode
      ? 'Комментарий указывает на несбытовое обращение без структурированной причины; требуется ручная проверка.'
      : outcome === 'MANUAL_REVIEW' && (reasonCode === 'relocation' || reasonCode === 'other')
        ? 'Причина обращения требует ручного решения; автоматическая передача не запускается.'
        : outcome === 'MANUAL_REVIEW'
          ? 'Найдено противоречие между причиной обращения и комментарием; требуется ручная проверка без автоматической передачи.'
          : evidence.length
            ? 'Значимые фрагменты согласуются с причиной обращения; автоматический отказ не применяется.'
            : 'Значимых сигналов в комментарии не найдено.';
  return { version: LEAD_COMMENT_RULES_VERSION, outcome, category, evidence, explanation };
}
