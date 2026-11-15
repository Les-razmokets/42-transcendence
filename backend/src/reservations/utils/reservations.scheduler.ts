import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from '../reservations.service';

@Injectable()
export class ReservationsScheduler {
  private readonly logger = new Logger(ReservationsScheduler.name);
  constructor(private readonly reservationsService: ReservationsService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async handlePaymentExpiration() {
    try {
      const count = await this.reservationsService.expirePendingPayments();
      if (count > 0) this.logger.log(`${count} expired reservations`);
    } catch (error) {
      this.logger.error('Failed to expire pending payments', error);
    }
  }
}
