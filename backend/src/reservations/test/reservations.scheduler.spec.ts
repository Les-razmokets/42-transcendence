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
//   - étape 8 (TSK-54) :
//     - `handleNoShows()` : @Cron(CronExpression.EVERY_MINUTE), appelle
//       `expireNoShows()` (renvoie un nombre), même gestion log / erreur ;
//     - `handleCasinoClosing()` : @Cron(CronExpression.EVERY_DAY_AT_5AM, { timeZone: 'Europe/Paris' }),
//       appelle `closeCasinoDay()` (renvoie { completed, freed }), log si l'un
//       des deux est > 0, même gestion d'erreur.
describe('ReservationsScheduler', () => {
  let scheduler: ReservationsScheduler;
  const serviceMock = {
    expirePendingPayments: jest.fn(),
    expireNoShows: jest.fn(),
    closeCasinoDay: jest.fn(),
  };

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
  describe('handleNoShows (étape 8)', () => {
    it('est planifié toutes les minutes', () => {
      const options = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        ReservationsScheduler.prototype.handleNoShows,
      );
      expect(options).toBeDefined();
      expect(options.cronTime).toBe(CronExpression.EVERY_MINUTE);
    });

    it('appelle expireNoShows une seule fois', async () => {
      serviceMock.expireNoShows.mockResolvedValue(0);
      await scheduler.handleNoShows();
      expect(serviceMock.expireNoShows).toHaveBeenCalledTimes(1);
    });

    it('log le nombre de no-shows quand il y en a', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      serviceMock.expireNoShows.mockResolvedValue(4);
      await scheduler.handleNoShows();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('4'));
    });

    it("ne log rien quand il n'y a aucun no-show", async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      serviceMock.expireNoShows.mockResolvedValue(0);
      await scheduler.handleNoShows();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("ne relance pas l'erreur et la log si le service échoue", async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      serviceMock.expireNoShows.mockRejectedValue(new Error('db down'));
      await expect(scheduler.handleNoShows()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });

  describe('handleCasinoClosing (étape 8)', () => {
    it('est planifié à 5 h, heure de Paris', () => {
      const options = Reflect.getMetadata(
        'SCHEDULE_CRON_OPTIONS',
        ReservationsScheduler.prototype.handleCasinoClosing,
      );
      expect(options).toBeDefined();
      expect(options.cronTime).toBe(CronExpression.EVERY_DAY_AT_5AM);
      expect(options.timeZone).toBe('Europe/Paris');
    });

    it('appelle closeCasinoDay une seule fois', async () => {
      serviceMock.closeCasinoDay.mockResolvedValue({ completed: 0, freed: 0 });
      await scheduler.handleCasinoClosing();
      expect(serviceMock.closeCasinoDay).toHaveBeenCalledTimes(1);
    });

    it('log les réservations terminées et les places libérées', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      serviceMock.closeCasinoDay.mockResolvedValue({ completed: 2, freed: 7 });
      await scheduler.handleCasinoClosing();
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringMatching(/2[\s\S]*7|7[\s\S]*2/),
      );
    });

    it('log aussi quand seules des places walk-in sont libérées', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      serviceMock.closeCasinoDay.mockResolvedValue({ completed: 0, freed: 3 });
      await scheduler.handleCasinoClosing();
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('3'));
    });

    it('ne log rien quand il n’y avait rien à fermer', async () => {
      const logSpy = jest
        .spyOn(Logger.prototype, 'log')
        .mockImplementation(() => undefined);
      serviceMock.closeCasinoDay.mockResolvedValue({ completed: 0, freed: 0 });
      await scheduler.handleCasinoClosing();
      expect(logSpy).not.toHaveBeenCalled();
    });

    it("ne relance pas l'erreur et la log si le service échoue", async () => {
      const errorSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      serviceMock.closeCasinoDay.mockRejectedValue(new Error('db down'));
      await expect(scheduler.handleCasinoClosing()).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalled();
    });
  });
});
