import { casinoDay, isCasinoClosed } from './casino-day';

// Dates en UTC (suffixe Z) pour que le résultat ne dépende pas du fuseau de la machine.
// L'heure de Paris est dans le titre : UTC+1 l'hiver, UTC+2 l'été.
describe('casinoDay', () => {
  it.each([
    ['20h00 → jour même', '2026-11-05T19:00Z', '2026-11-05'],
    ['02h00 → veille', '2026-11-06T01:00Z', '2026-11-05'],
    ['04h59 → veille', '2026-11-06T03:59Z', '2026-11-05'],
    ['05h00 → jour même', '2026-11-06T04:00Z', '2026-11-06'],
    ['04h59 l’été → veille', '2026-07-01T02:59Z', '2026-06-30'],
    [
      '02h00 le 1er du mois → dernier jour du mois précédent',
      '2026-11-01T01:00Z',
      '2026-10-31',
    ],
    ['03h00 le 1er janvier → 31 décembre', '2027-01-01T02:00Z', '2026-12-31'],
    [
      '04h30 le jour du passage à l’heure d’hiver → veille',
      '2026-10-25T03:30Z',
      '2026-10-24',
    ],
    [
      '05h30 le jour du passage à l’heure d’été → jour même',
      '2026-03-29T03:30Z',
      '2026-03-29',
    ],
  ])('%s', (_, instant, expected) => {
    expect(casinoDay(new Date(instant))).toBe(expected);
  });
});

describe('isCasinoClosed', () => {
  it.each([
    ['04h59 → ouvert', '2026-11-06T03:59Z', false],
    ['05h00 → fermé', '2026-11-06T04:00Z', true],
    ['07h59 → fermé', '2026-11-06T06:59Z', true],
    ['08h00 → ouvert', '2026-11-06T07:00Z', false],
    ['05h00 l’été → fermé', '2026-07-01T03:00Z', true],
    [
      '04h30 le jour du passage à l’heure d’hiver → ouvert',
      '2026-10-25T03:30Z',
      false,
    ],
  ])('%s', (_, instant, expected) => {
    expect(isCasinoClosed(new Date(instant))).toBe(expected);
  });
});
