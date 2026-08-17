import { describe, expect, it } from 'vitest';

import {
  dailyReleaseMetadata,
  immutableReleaseMetadata,
  stableReleaseMetadata,
} from '../src/release-metadata';
import type { DailyIdentity, ImmutableIdentity } from '../src/types';

const repository = { owner: 'motoish', repo: 'example' };
const daily: DailyIdentity = {
  year: 2026,
  month: 8,
  day: 17,
  sha: 'a1b2c3d4e5f678901234567890abcdef12345678',
  sha8: 'a1b2c3d4',
  version: '2026.8.17-a1b2c3d4',
  buildTag: 'v2026.8.17-a1b2c3d4',
  channelTag: 'v2026.8.17',
};
const immutable: ImmutableIdentity = {
  year: 2026,
  month: 8,
  day: 17,
  sha8: 'a1b2c3d4',
  version: '2026.8.17-a1b2c3d4',
  buildTag: 'v2026.8.17-a1b2c3d4',
  stableTag: 'v2026.8',
};

describe('release metadata', () => {
  it('describes an immutable prerelease without making it latest', () => {
    expect(immutableReleaseMetadata(daily, repository)).toEqual({
      tagName: 'v2026.8.17-a1b2c3d4',
      targetCommitish: daily.sha,
      name: 'v2026.8.17-a1b2c3d4',
      body:
        'Immutable build for commit [`a1b2c3d4`](https://github.com/motoish/example/commit/a1b2c3d4e5f678901234567890abcdef12345678).',
      draft: false,
      prerelease: true,
      makeLatest: false,
    });
  });

  it('describes the action-managed daily channel and current build', () => {
    expect(dailyReleaseMetadata(daily, repository)).toEqual({
      tagName: 'v2026.8.17',
      targetCommitish: daily.sha,
      name: 'Daily v2026.8.17',
      body:
        'Current immutable build: [`v2026.8.17-a1b2c3d4`](https://github.com/motoish/example/releases/tag/v2026.8.17-a1b2c3d4)\n\nCommit: [`a1b2c3d4`](https://github.com/motoish/example/commit/a1b2c3d4e5f678901234567890abcdef12345678).',
      draft: false,
      prerelease: true,
      makeLatest: false,
    });
  });

  it('describes a stable release with its immutable promotion source', () => {
    expect(stableReleaseMetadata(immutable, daily.sha, repository)).toEqual({
      tagName: 'v2026.8',
      targetCommitish: daily.sha,
      name: 'v2026.8',
      body:
        'Promoted from [`v2026.8.17-a1b2c3d4`](https://github.com/motoish/example/releases/tag/v2026.8.17-a1b2c3d4).\n\nCommit: [`a1b2c3d4`](https://github.com/motoish/example/commit/a1b2c3d4e5f678901234567890abcdef12345678).',
      draft: false,
      prerelease: false,
      makeLatest: true,
    });
  });
});
