import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class RebuildQueueService {
  private readonly logger = new Logger(RebuildQueueService.name);
  async enqueue(data: { entity: string; id: string; siteId?: string }) {
    const webhook = process.env.REBUILD_WEBHOOK_URL;
    if (!webhook) return;
    try {
      const response = await fetch(webhook, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
      if (!response.ok) throw new Error(`rebuild webhook responded ${response.status}`);
    } catch (error) {
      this.logger.warn(`Unable to notify site rebuild: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
