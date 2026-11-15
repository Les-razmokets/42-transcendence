import { Logger } from '@nestjs/common';
import { CronExpression } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { ReservationsService } from '../reservations.service';
import { ReservationsScheduler } from '../utils/reservations.scheduler';

// Test unitaire : ReservationsService est remplacé par un mock.
// Contrat attendu :
//   - classe `ReservationsScheduler`, injectable, qui reçoit ReservationsService
//   - méthode `handlePaymentExpiration()` décorée par @Cron(CronExpression.EVERY_MINUTE)
//   - appelle `expirePendingPayments()` et ne laisse jamais remonter d'erreur
//     (une exception dans un cron ne doit pas faire planter l'application)
describe('ReservationsScheduler', () => {
  let scheduler: ReservationsScheduler;
  const serviceMock = { expirePendingPayments: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReservationsScheduler,
        { provide: ReservationsService, useValue: serviceMock },
      ],
    }).compile();
    scheduler = moduleRef.get(ReservationsScheduler);
  });

  afterEach(() => jest.restoreAllMocks());

  it('est planifié toutes les minutes', () => {
    const options = Reflect.getMetadata(
      'SCHEDULE_CRON_OPTIONS',
      ReservationsScheduler.prototype.handlePaymentExpiration,
    );
    expect(options).toBeDefined();
    expect(options.cronTime).toBe(CronExpression.EVERY_MINUTE);
  });

  it('appelle expirePendingPayments une seule fois', async () => {
    serviceMock.expirePendingPayments.mockResolvedValue(0);
    await scheduler.handlePaymentExpiration();
    expect(serviceMock.expirePendingPayments).toHaveBeenCalledTimes(1);
  });

  it('log le nombre de réservations expirées quand il y en a', async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    serviceMock.expirePendingPayments.mockResolvedValue(3);
    await scheduler.handlePaymentExpiration();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
  });

  it("ne log rien quand aucune réservation n'a expiré", async () => {
    const logSpy = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);
    serviceMock.expirePendingPayments.mockResolvedValue(0);
    await scheduler.handlePaymentExpiration();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it("ne relance pas l'erreur et la log si le service échoue", async () => {
    const errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    serviceMock.expirePendingPayments.mockRejectedValue(new Error('db down'));
    await expect(scheduler.handlePaymentExpiration()).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
