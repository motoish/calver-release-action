import { describe, expect, it } from 'vitest';

import {
  createDailyIdentity,
  formatCalendarDate,
  parseImmutableTag,
} from '../src/version';

const FULL_SHA = 'a1b2c3d4e5f678901234567890abcdef12345678';

describe('formatCalendarDate', () => {
  it('uses unpadded UTC calendar components', () => {
    expect(formatCalendarDate(new Date('2026-08-07T23:30:00Z'), 'UTC')).toEqual({
      year: 2026,
      month: 8,
      day: 7,
    });
  });

  it('honors an IANA timezone at a date boundary', () => {
    expect(
      formatCalendarDate(new Date('2026-08-07T23:30:00Z'), 'Asia/Tokyo'),
    ).toEqual({ year: 2026, month: 8, day: 8 });
  });

  it('rejects an invalid timezone', () => {
    expect(() => formatCalendarDate(new Date(), 'Mars/Olympus')).toThrow(
      'Invalid IANA timezone: Mars/Olympus',
    );
  });
});

describe('createDailyIdentity', () => {
  it('derives immutable and daily channel names from the date and SHA', () => {
    expect(
      createDailyIdentity({ year: 2026, month: 8, day: 7 }, FULL_SHA),
    ).toEqual({
      year: 2026,
      month: 8,
      day: 7,
      sha: FULL_SHA,
      sha8: 'a1b2c3d4',
      version: '2026.8.7-a1b2c3d4',
      buildTag: 'v2026.8.7-a1b2c3d4',
      channelTag: 'v2026.8.7',
    });
  });

  it.each([
    'a1b2c3d4',
    'A1B2C3D4E5F678901234567890ABCDEF12345678',
    'z1b2c3d4e5f678901234567890abcdef12345678',
  ])('rejects malformed full commit SHA %s', (sha) => {
    expect(() =>
      createDailyIdentity({ year: 2026, month: 8, day: 7 }, sha),
    ).toThrow(`Invalid commit SHA: ${sha}`);
  });
});

describe('parseImmutableTag', () => {
  it('parses a build tag and derives the stable channel', () => {
    expect(parseImmutableTag('v2026.8.7-a1b2c3d4')).toEqual({
      year: 2026,
      month: 8,
      day: 7,
      sha8: 'a1b2c3d4',
      version: '2026.8.7-a1b2c3d4',
      buildTag: 'v2026.8.7-a1b2c3d4',
      stableTag: 'v2026.8',
    });
  });

  it.each([
    '2026.8.7-a1b2c3d4',
    'v2026.08.7-a1b2c3d4',
    'v2026.8.07-a1b2c3d4',
    'v2026.13.1-a1b2c3d4',
    'v2026.2.30-a1b2c3d4',
    'v2026.8.7-A1B2C3D4',
    'v2026.8.7-a1b2c3',
  ])('rejects malformed immutable tag %s', (tag) => {
    expect(() => parseImmutableTag(tag)).toThrow(
      `Invalid immutable build tag: ${tag}`,
    );
  });
});
