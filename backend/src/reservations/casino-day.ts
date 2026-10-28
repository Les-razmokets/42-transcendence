
export const CASINO_TIME_ZONE =  'Europe/Paris'
export const CASINO_CLOSING_HOUR = 5;
export const CASINO_OPENING_HOUR = 8;

const parisFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CASINO_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: 'numeric',
  hourCycle: 'h23',
});

export function casinoDay(date: Date): string {
	const { year, month, day, hour } = parisParts(date);
	const casinoDate = hour < CASINO_CLOSING_HOUR ? day - 1 : day;
	return new Date(Date.UTC(year, month - 1, casinoDate)).toISOString().slice(0, 10);
}
export function isCasinoClosed(date: Date): boolean {
	const { hour } = parisParts(date);
	return CASINO_CLOSING_HOUR <= hour && hour < CASINO_OPENING_HOUR;
}

function parisParts(date: Date) {
	const parts = parisFormatter.formatToParts(date);
	const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
	return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour')};
}