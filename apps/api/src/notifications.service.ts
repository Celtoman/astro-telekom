import { Injectable } from '@nestjs/common';
import { LeadAccessService } from './lead-access.service';

interface LeadNotification {
  id: string;
  phone: string;
  name?: string | null;
  city: string;
  address?: string | null;
  tariff?: string | null;
  email?: string | null;
  addressCheck?: unknown;
}

const LEAD_NOTIFICATION_TIMEOUT_MS = 15_000;

export type LeadNotificationTransport = 'resend' | 'webhook' | 'none';
export type LeadNotificationFailureCode = 'http_error' | 'invalid_response' | 'network_error' | 'not_configured' | 'internal_error';

export interface LeadNotificationResult {
  transport: Exclude<LeadNotificationTransport, 'none'>;
  providerMessageId?: string;
}

function isRetryableNotificationStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

export class LeadNotificationError extends Error {
  constructor(
    message: string,
    readonly transport: LeadNotificationTransport,
    readonly code: LeadNotificationFailureCode,
    readonly status?: number,
    readonly retryable = status === undefined ? code === 'network_error' : isRetryableNotificationStatus(status),
  ) {
    super(message);
    this.name = 'LeadNotificationError';
  }
}

@Injectable()
export class NotificationsService {
  constructor(private readonly leadAccess: LeadAccessService) {}

  async notifyLead(lead: LeadNotification): Promise<LeadNotificationResult> {
    const resendKey = process.env.RESEND_API_KEY;
    const recipient = process.env.LEADS_EMAIL;
    if (resendKey && recipient) {
      const response = await this.send('https://api.resend.com/emails', 'resend', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
          'idempotency-key': `lead-notification-${lead.id}`,
        },
        body: JSON.stringify({
          from: process.env.LEADS_EMAIL_FROM || 'leads@example.com',
          to: [recipient],
          subject: `Новая заявка ${lead.phone}`,
          text: [
            `Телефон: ${lead.phone}`,
            `Имя: ${lead.name || 'не указано'}`,
            `Город страницы: ${lead.city}`,
            `Адрес подключения: ${lead.address || 'не указан'}`,
            `Тариф: ${lead.tariff || 'не выбран'}`,
            `ID заявки: ${lead.id}`,
          ].join('\n'),
        }),
      });
      if (!response.ok) {
        throw new LeadNotificationError(
          `Lead notification via Resend responded ${response.status}`,
          'resend',
          'http_error',
          response.status,
        );
      }
      const raw = await this.readText(response, 'resend');
      let payload: unknown;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        throw new LeadNotificationError(
          'Lead notification via Resend returned an invalid response',
          'resend',
          'invalid_response',
        );
      }
      if (
        !payload
        || typeof payload !== 'object'
        || Array.isArray(payload)
        || typeof (payload as Record<string, unknown>).id !== 'string'
        || !(payload as Record<string, string>).id.trim()
      ) {
        throw new LeadNotificationError(
          'Lead notification via Resend returned an invalid response',
          'resend',
          'invalid_response',
        );
      }
      return { transport: 'resend', providerMessageId: (payload as Record<string, string>).id.trim() };
    }

    const webhookUrl = process.env.LEADS_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
      throw new LeadNotificationError(
        'Lead notification transport is not configured',
        'none',
        'not_configured',
        undefined,
        false,
      );
    }

    const response = await this.send(webhookUrl, 'webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': `lead-notification-${lead.id}` },
      body: JSON.stringify({
        subject: `Новая заявка ${lead.phone}`,
        recipient,
        lead,
      }),
    });
    if (!response.ok) {
      throw new LeadNotificationError(
        `Lead notification webhook responded ${response.status}`,
        'webhook',
        'http_error',
        response.status,
      );
    }
    return { transport: 'webhook' };
  }

  private async send(url: string, transport: Exclude<LeadNotificationTransport, 'none'>, init: RequestInit) {
    try {
      return await fetch(url, { ...init, signal: AbortSignal.timeout(LEAD_NOTIFICATION_TIMEOUT_MS) });
    } catch (error) {
      if (error instanceof LeadNotificationError) throw error;
      throw new LeadNotificationError(
        `Lead notification via ${transport} failed before receiving a response`,
        transport,
        'network_error',
        undefined,
        true,
      );
    }
  }

  private async readText(response: Response, transport: Exclude<LeadNotificationTransport, 'none'>) {
    try {
      return await response.text();
    } catch {
      throw new LeadNotificationError(
        `Lead notification via ${transport} failed while reading the response`,
        transport,
        'network_error',
        undefined,
        true,
      );
    }
  }

  async notifyDeliveryFallback(lead: LeadNotification) {
    const recipient = process.env.LEADS_EMAIL;
    if (!recipient) {
      throw new Error(`LEADS_EMAIL is not configured; email fallback cannot be sent for lead ${lead.id}`);
    }
    const { token } = await this.leadAccess.issue(lead.id);
    const base = (process.env.ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');
    const link = `${base}/lead-access/?lead=${encodeURIComponent(lead.id)}#token=${encodeURIComponent(token)}`;
    const text = [
      'Автоматическая передача заявки в кол-центр не удалась после трех попыток.',
      `Телефон: ${lead.phone}`,
      `Имя: ${lead.name || 'не указано'}`,
      `Город страницы: ${lead.city}`,
      `Адрес подключения: ${lead.address || 'не указан'}`,
      `Тариф: ${lead.tariff || 'не выбран'}`,
      `Заявка: ${link}`,
      'Ссылка действует 24 часа.',
    ].join('\n');
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${resendKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          from: process.env.LEADS_EMAIL_FROM || 'leads@example.com',
          to: [recipient],
          subject: `Требует ручной передачи: ${lead.phone}`,
          text,
        }),
      });
      if (!response.ok) throw new Error(`Email fallback responded ${response.status}`);
      return;
    }
    const webhookUrl = process.env.LEADS_EMAIL_WEBHOOK_URL;
    if (webhookUrl) {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subject: `Требует ручной передачи: ${lead.phone}`, recipient, lead, text }),
      });
      if (!response.ok) throw new Error(`Email fallback webhook responded ${response.status}`);
      return;
    }
    throw new Error(`No email fallback transport is configured for lead ${lead.id}`);
  }
}
