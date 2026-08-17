import { describe, expect, it } from 'vitest';

import { publishDaily } from '../src/daily';
import type { DailyIdentity } from '../src/types';
import { createDailyIdentity } from '../src/version';
import { FakeGitHub } from './helpers/fake-github';

const repository = { owner: 'motoish', repo: 'example' };
const date = { year: 2026, month: 8, day: 17 };
const oldSha = '11111111aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const newSha = '22222222bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const latestSha = '33333333cccccccccccccccccccccccccccccccc';
const oldBuild = createDailyIdentity(date, oldSha);
const newBuild = createDailyIdentity(date, newSha);
const latestBuild = createDailyIdentity(date, latestSha);

async function publish(github: FakeGitHub, identity: DailyIdentity) {
  return publishDaily({ github, identity, repository });
}

describe('publishDaily', () => {
  it('creates an immutable build and daily prerelease on first publication', async () => {
    const github = new FakeGitHub();

    const outputs = await publish(github, oldBuild);

    expect(github.tags).toEqual(
      new Map([
        [oldBuild.buildTag, oldSha],
        [oldBuild.channelTag, oldSha],
      ]),
    );
    expect([...github.releases.keys()]).toEqual([
      oldBuild.buildTag,
      oldBuild.channelTag,
    ]);
    expect(github.releases.get(oldBuild.buildTag)?.prerelease).toBe(true);
    expect(github.releases.get(oldBuild.channelTag)?.prerelease).toBe(true);
    expect(outputs).toEqual({
      version: oldBuild.version,
      buildTag: oldBuild.buildTag,
      buildReleaseId: '1',
      buildReleaseUrl: `https://github.test/releases/tag/${oldBuild.buildTag}`,
      buildUploadUrl: 'https://uploads.github.test/releases/1/assets{?name,label}',
      channelTag: oldBuild.channelTag,
      channelReleaseId: '2',
      channelReleaseUrl: `https://github.test/releases/tag/${oldBuild.channelTag}`,
      channelUploadUrl: 'https://uploads.github.test/releases/2/assets{?name,label}',
    });
  });

  it('retries the same build without duplicates or overwriting its body', async () => {
    const github = new FakeGitHub();
    await publish(github, oldBuild);
    const release = github.releases.get(oldBuild.buildTag)!;
    github.releases.set(oldBuild.buildTag, {
      ...release,
      body: 'Edited release notes',
    });

    await publish(github, oldBuild);

    expect(github.tags.size).toBe(2);
    expect(github.releases.size).toBe(2);
    expect(github.releases.get(oldBuild.buildTag)?.body).toBe(
      'Edited release notes',
    );
  });

  it('moves the daily channel to a descendant commit', async () => {
    const github = new FakeGitHub();
    await publish(github, oldBuild);
    github.comparisons.set(`${oldSha}...${newSha}`, 'ahead');

    const outputs = await publish(github, newBuild);

    expect(github.tags.get(oldBuild.channelTag)).toBe(newSha);
    expect(github.releases.size).toBe(3);
    expect(github.releases.get(oldBuild.channelTag)?.body).toContain(
      newBuild.buildTag,
    );
    expect(outputs.buildTag).toBe(newBuild.buildTag);
    expect(outputs.channelTag).toBe(newBuild.channelTag);
  });

  it('publishes an older immutable build without moving the newer channel backward', async () => {
    const github = new FakeGitHub();
    await publish(github, newBuild);
    github.comparisons.set(`${newSha}...${oldSha}`, 'behind');

    const outputs = await publish(github, oldBuild);

    expect(github.tags.get(oldBuild.channelTag)).toBe(newSha);
    expect(github.tags.get(oldBuild.buildTag)).toBe(oldSha);
    expect(github.releases.get(oldBuild.channelTag)?.body).toContain(
      newBuild.buildTag,
    );
    expect(outputs.buildTag).toBe(oldBuild.buildTag);
    expect(outputs.channelReleaseId).toBe('2');
  });

  it('keeps the immutable build but rejects a diverged daily channel', async () => {
    const github = new FakeGitHub();
    await publish(github, oldBuild);

    await expect(publish(github, newBuild)).rejects.toThrow(
      `Daily channel ${oldBuild.channelTag} points to unrelated commit ${oldSha}`,
    );
    expect(github.tags.get(newBuild.buildTag)).toBe(newSha);
    expect(github.releases.has(newBuild.buildTag)).toBe(true);
    expect(github.tags.get(oldBuild.channelTag)).toBe(oldSha);
  });

  it('reconciles a concurrent channel creation race', async () => {
    const github = new FakeGitHub();
    github.raceOnCreateTag.set(oldBuild.channelTag, oldSha);

    await publish(github, oldBuild);

    expect(github.tags.get(oldBuild.channelTag)).toBe(oldSha);
    expect(github.releases.has(oldBuild.channelTag)).toBe(true);
  });

  it('does not overwrite a newer channel body when publications interleave', async () => {
    const github = new FakeGitHub();
    await publish(github, oldBuild);
    github.comparisons.set(`${oldSha}...${newSha}`, 'ahead');
    github.comparisons.set(`${newSha}...${latestSha}`, 'ahead');
    const dailyReleaseId = github.releases.get(oldBuild.channelTag)!.id;
    github.beforeUpdateRelease = async (releaseId) => {
      if (releaseId !== dailyReleaseId) {
        return;
      }
      github.beforeUpdateRelease = undefined;
      await publish(github, latestBuild);
    };

    await publish(github, newBuild);

    expect(github.tags.get(oldBuild.channelTag)).toBe(latestSha);
    expect(github.releases.get(oldBuild.channelTag)?.body).toContain(
      latestBuild.buildTag,
    );
  });

  it('rejects an immutable tag collision before creating its release', async () => {
    const github = new FakeGitHub();
    github.tags.set(oldBuild.buildTag, newSha);

    await expect(publish(github, oldBuild)).rejects.toThrow(
      `Immutable tag ${oldBuild.buildTag} already points to ${newSha}, expected ${oldSha}`,
    );
    expect(github.releases.has(oldBuild.buildTag)).toBe(false);
  });
});
