import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';

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

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notifyLead(lead: LeadNotification) {
    const resendKey = process.env.RESEND_API_KEY;
    const recipient = process.env.LEADS_EMAIL;
    if (resendKey && recipient) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${resendKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: process.env.LEADS_EMAIL_FROM || 'leads@example.com',
          to: [recipient],
          subject: `Новая заявка ${lead.phone}`,
          text: [
            `Телефон: ${lead.phone}`,
            `Имя: ${lead.name || 'не указано'}`,
            `Город: ${lead.city}`,
            `Адрес: ${lead.address || 'не указан'}`,
            `Тариф: ${lead.tariff || 'не выбран'}`,
            `ID заявки: ${lead.id}`,
          ].join('\n'),
        }),
      });
      return;
    }

    const webhookUrl = process.env.LEADS_EMAIL_WEBHOOK_URL;
    if (!webhookUrl) {
      this.logger.warn(`LEADS_EMAIL_WEBHOOK_URL is not configured; lead ${lead.id} was saved without notification`);
      return;
    }

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: `Новая заявка ${lead.phone}`,
        recipient,
        lead,
      }),
    });
  }

  protectedLeadUrl(leadId: string) {
    const expires = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
    const secret = process.env.LEAD_LINK_SECRET || process.env.ADMIN_API_TOKEN || 'development-only-secret';
    const signature = createHmac('sha256', secret).update(`${leadId}.${expires}`).digest('hex');
    const base = (process.env.ADMIN_URL || 'http://localhost:3001').replace(/\/$/, '');
    return `${base}/?lead=${encodeURIComponent(leadId)}&expires=${expires}&signature=${signature}`;
  }

  async notifyDeliveryFallback(lead: LeadNotification) {
    const recipient = process.env.LEADS_EMAIL;
    if (!recipient) {
      throw new Error(`LEADS_EMAIL is not configured; email fallback cannot be sent for lead ${lead.id}`);
    }
    const link = this.protectedLeadUrl(lead.id);
    const text = [
      'Автоматическая передача заявки в кол-центр не удалась после трех попыток.',
      `Телефон: ${lead.phone}`,
      `Имя: ${lead.name || 'не указано'}`,
      `Город: ${lead.city}`,
      `Адрес: ${lead.address || 'не указан'}`,
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
