import type {
  CalendarDate,
  DailyIdentity,
  ImmutableIdentity,
} from './types';

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;
const IMMUTABLE_TAG_PATTERN =
  /^v([1-9]\d{3})\.([1-9]|1[0-2])\.([1-9]|[12]\d|3[01])-([0-9a-f]{8})$/;

function isValidDate(date: CalendarDate): boolean {
  const candidate = new Date(Date.UTC(date.year, date.month - 1, date.day));
  return (
    candidate.getUTCFullYear() === date.year &&
    candidate.getUTCMonth() + 1 === date.month &&
    candidate.getUTCDate() === date.day
  );
}

export function parseUnixEpoch(value: string): Date {
  if (!/^[0-9]+$/.test(value)) {
    throw new Error(`Invalid unix epoch: ${value}`);
  }

  const date = new Date(Number(value) * 1000);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid unix epoch: ${value}`);
  }
  return date;
}

export function formatCalendarDate(now: Date, timezone: string): CalendarDate {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-US-u-ca-gregory', {
      timeZone: timezone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  } catch {
    throw new Error(`Invalid IANA timezone: ${timezone}`);
  }

  const values = new Map(
    formatter
      .formatToParts(now)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  );
  const date = {
    year: values.get('year') ?? Number.NaN,
    month: values.get('month') ?? Number.NaN,
    day: values.get('day') ?? Number.NaN,
  };

  if (!isValidDate(date)) {
    throw new Error(`Invalid date: ${now.toISOString()}`);
  }

  return date;
}

export function createDailyIdentity(
  date: CalendarDate,
  sha: string,
): DailyIdentity {
  if (!FULL_SHA_PATTERN.test(sha)) {
    throw new Error(`Invalid commit SHA: ${sha}`);
  }
  if (!isValidDate(date)) {
    throw new Error(
      `Invalid calendar date: ${date.year}.${date.month}.${date.day}`,
    );
  }

  const sha8 = sha.slice(0, 8);
  const calendarVersion = `${date.year}.${date.month}.${date.day}`;
  return {
    ...date,
    sha,
    sha8,
    version: `${calendarVersion}-${sha8}`,
    buildTag: `v${calendarVersion}-${sha8}`,
    channelTag: `v${calendarVersion}`,
  };
}

export function parseImmutableTag(tag: string): ImmutableIdentity {
  const match = IMMUTABLE_TAG_PATTERN.exec(tag);
  if (!match) {
    throw new Error(`Invalid immutable build tag: ${tag}`);
  }

  const date = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
  if (!isValidDate(date)) {
    throw new Error(`Invalid immutable build tag: ${tag}`);
  }

  return {
    ...date,
    sha8: match[4],
    version: tag.slice(1),
    buildTag: tag,
    stableTag: `v${date.year}.${date.month}`,
  };
}
