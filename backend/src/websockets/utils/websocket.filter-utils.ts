import { BadRequestException } from '@nestjs/common';

const MAX_REASON_LENGTH = 300;

// A validation message is partly CLIENT-controlled: with forbidNonWhitelisted it
// reads "property <name> should not exist", where <name> is any key the client
// sent. So before it goes into a log line:
//  - it is capped (a 10 000-char key must not flood the logs);
//  - it is JSON-escaped (a key containing "\n" must not inject a fake log line).
// Capped BEFORE escaping, so the logged string can be slightly longer than the cap
// (each escaped character takes two). Do not "simplify" the JSON.stringify away.

export function formatLogReason(
  raw: string,
  maxLength = MAX_REASON_LENGTH,
): string {
  const capped = raw.length > maxLength ? `${raw.slice(0, maxLength)}…` : raw;
  return JSON.stringify(capped);
}

function toReadableEntry(item: unknown): string {
  if (item === null) return 'null';
  if (item === undefined) return 'undefined';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    try {
      const json = JSON.stringify(item);
      return json ?? Object.prototype.toString.call(item);
    } catch {
      return Object.prototype.toString.call(item);
    }
  }
  return String(item);
}

export function extractLogReason(exception: BadRequestException): string {
  const res = exception.getResponse();
  if (res && typeof res === 'object') {
    const { message } = res as { message?: unknown };
    if (Array.isArray(message)) {
      const joined = message.map(toReadableEntry).join('; ');
      return formatLogReason(joined);
    }
    if (message !== undefined) {
      return formatLogReason(toReadableEntry(message));
    }
  }
  return formatLogReason(exception.message);
}
