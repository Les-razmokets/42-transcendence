import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReservationsService } from '../reservations.service';
import { CASINO_TIME_ZONE } from '../casino-day';

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

  @Cron(CronExpression.EVERY_MINUTE)
  async handleNoShows() {
    try {
      const count = await this.reservationsService.expireNoShows();
      if (count > 0) this.logger.log(`${count} reservations marked as no-show`);
    } catch (error) {
      this.logger.error('Failed to expire no show reservations', error);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_5AM, { timeZone: CASINO_TIME_ZONE })
  async handleCasinoClosing() {
    try {
      const { completed, freed } =
        await this.reservationsService.closeCasinoDay();
      if (completed > 0 || freed > 0)
        this.logger.log(
          `Casino closed: ${completed} reservations completed, ${freed} seats freed`,
        );
    } catch (error) {
      this.logger.error('Failed to close casino day', error);
    }
  }
}
