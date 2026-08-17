import { describe, expect, it } from 'vitest';

import { promoteStable } from '../src/promote';
import { immutableReleaseMetadata } from '../src/release-metadata';
import { createDailyIdentity } from '../src/version';
import { FakeGitHub } from './helpers/fake-github';

const repository = { owner: 'motoish', repo: 'example' };
const sha = 'a1b2c3d4e5f678901234567890abcdef12345678';
const otherSha = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const build = createDailyIdentity({ year: 2026, month: 8, day: 17 }, sha);

async function seededGitHub(): Promise<FakeGitHub> {
  const github = new FakeGitHub();
  github.tags.set(build.buildTag, sha);
  await github.createRelease(immutableReleaseMetadata(build, repository));
  return github;
}

describe('promoteStable', () => {
  it('promotes an immutable prerelease to its monthly stable channel', async () => {
    const github = await seededGitHub();

    const outputs = await promoteStable({
      github,
      sourceTag: build.buildTag,
      repository,
    });

    expect(github.tags.get('v2026.8')).toBe(sha);
    expect(github.releases.get('v2026.8')).toMatchObject({
      name: 'v2026.8',
      draft: false,
      prerelease: false,
    });
    expect(outputs).toEqual({
      version: '2026.8',
      buildTag: build.buildTag,
      buildReleaseId: '1',
      buildReleaseUrl: `https://github.test/releases/tag/${build.buildTag}`,
      buildUploadUrl: 'https://uploads.github.test/releases/1/assets{?name,label}',
      channelTag: 'v2026.8',
      channelReleaseId: '2',
      channelReleaseUrl: 'https://github.test/releases/tag/v2026.8',
      channelUploadUrl: 'https://uploads.github.test/releases/2/assets{?name,label}',
    });
  });

  it('retries the same promotion without duplicates or overwriting stable notes', async () => {
    const github = await seededGitHub();
    await promoteStable({ github, sourceTag: build.buildTag, repository });
    const stable = github.releases.get('v2026.8')!;
    github.releases.set('v2026.8', { ...stable, body: 'Edited stable notes' });

    await promoteStable({ github, sourceTag: build.buildTag, repository });

    expect(github.tags.size).toBe(2);
    expect(github.releases.size).toBe(2);
    expect(github.releases.get('v2026.8')?.body).toBe('Edited stable notes');
  });

  it('rejects a missing immutable source tag', async () => {
    const github = new FakeGitHub();

    await expect(
      promoteStable({ github, sourceTag: build.buildTag, repository }),
    ).rejects.toThrow(`Immutable source tag ${build.buildTag} does not exist`);
    expect(github.tags.has('v2026.8')).toBe(false);
  });

  it('rejects a source tag whose suffix does not match its commit', async () => {
    const github = await seededGitHub();
    github.tags.set(build.buildTag, otherSha);

    await expect(
      promoteStable({ github, sourceTag: build.buildTag, repository }),
    ).rejects.toThrow(
      `Immutable source tag ${build.buildTag} points to ${otherSha}, which does not match suffix a1b2c3d4`,
    );
  });

  it('rejects a source tag without a completed immutable prerelease', async () => {
    const github = new FakeGitHub();
    github.tags.set(build.buildTag, sha);

    await expect(
      promoteStable({ github, sourceTag: build.buildTag, repository }),
    ).rejects.toThrow(
      `Immutable source release ${build.buildTag} does not exist`,
    );
    expect(github.tags.has('v2026.8')).toBe(false);
  });

  it('rejects a source release that is not a published prerelease', async () => {
    const github = await seededGitHub();
    const source = github.releases.get(build.buildTag)!;
    github.releases.set(build.buildTag, { ...source, prerelease: false });

    await expect(
      promoteStable({ github, sourceTag: build.buildTag, repository }),
    ).rejects.toThrow(
      `Immutable source release ${build.buildTag} must be a published prerelease`,
    );
  });

  it('rejects a stable tag that already points to another commit', async () => {
    const github = await seededGitHub();
    github.tags.set('v2026.8', otherSha);

    await expect(
      promoteStable({ github, sourceTag: build.buildTag, repository }),
    ).rejects.toThrow(
      `Stable tag v2026.8 already points to ${otherSha}, expected ${sha}`,
    );
    expect(github.releases.has('v2026.8')).toBe(false);
  });
});
