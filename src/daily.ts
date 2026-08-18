import { errorStatus } from './errors';
import {
  dailyReleaseMetadata,
  immutableReleaseMetadata,
} from './release-metadata';
import type {
  ActionOutputs,
  DailyIdentity,
  GitHubPort,
  ReleaseCreateInput,
  ReleaseInfo,
  Repository,
} from './types';
import { createDailyIdentity } from './version';

export interface PublishDailyOptions {
  github: GitHubPort;
  identity: DailyIdentity;
  repository: Repository;
}

async function ensureImmutableTag(
  github: GitHubPort,
  tag: string,
  sha: string,
): Promise<void> {
  let current = await github.getTagTarget(tag);
  if (current === null) {
    try {
      await github.createTag(tag, sha);
      current = sha;
    } catch (error) {
      if (errorStatus(error) !== 422) {
        throw error;
      }
      current = await github.getTagTarget(tag);
    }
  }

  if (current !== sha) {
    throw new Error(
      `Immutable tag ${tag} already points to ${current ?? 'no commit'}, expected ${sha}`,
    );
  }
}

function updateInput(
  metadata: ReleaseCreateInput,
  includeBody: boolean,
): Parameters<GitHubPort['updateRelease']>[1] {
  return {
    name: metadata.name,
    ...(includeBody ? { body: metadata.body } : {}),
    draft: false,
    prerelease: metadata.prerelease,
    makeLatest: metadata.makeLatest,
  };
}

async function ensureRelease(
  github: GitHubPort,
  metadata: ReleaseCreateInput,
  manageBody: boolean,
): Promise<ReleaseInfo> {
  let release = await github.getReleaseByTag(metadata.tagName);
  if (release === null) {
    try {
      return await github.createRelease(metadata);
    } catch (error) {
      if (errorStatus(error) !== 422) {
        throw error;
      }
      release = await github.getReleaseByTag(metadata.tagName);
      if (release === null) {
        throw error;
      }
    }
  }
  return github.updateRelease(
    release.id,
    updateInput(metadata, manageBody),
  );
}

async function reconcileDailyTag(
  github: GitHubPort,
  identity: DailyIdentity,
): Promise<DailyIdentity> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = await github.getTagTarget(identity.channelTag);
    if (current === null) {
      try {
        await github.createTag(identity.channelTag, identity.sha);
        return identity;
      } catch (error) {
        if (errorStatus(error) === 422) {
          continue;
        }
        throw error;
      }
    }

    if (current === identity.sha) {
      return identity;
    }

    const status = await github.compareCommits(current, identity.sha);
    if (status === 'behind') {
      return createDailyIdentity(identity, current);
    }
    if (status === 'diverged' || status === 'identical') {
      throw new Error(
        `Daily channel ${identity.channelTag} points to unrelated commit ${current}`,
      );
    }

    try {
      await github.updateTagFastForward(identity.channelTag, identity.sha);
      return identity;
    } catch (error) {
      if (errorStatus(error) === 422) {
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `Daily channel ${identity.channelTag} changed repeatedly during publication; retry the workflow`,
  );
}

function outputsFor(
  build: DailyIdentity,
  buildRelease: ReleaseInfo,
  channel: DailyIdentity,
  channelRelease: ReleaseInfo,
): ActionOutputs {
  return {
    version: build.version,
    buildTag: build.buildTag,
    buildReleaseId: String(buildRelease.id),
    buildReleaseUrl: buildRelease.htmlUrl,
    buildUploadUrl: buildRelease.uploadUrl,
    channelTag: channel.channelTag,
    channelReleaseId: String(channelRelease.id),
    channelReleaseUrl: channelRelease.htmlUrl,
    channelUploadUrl: channelRelease.uploadUrl,
  };
}

export async function publishDaily({
  github,
  identity,
  repository,
}: PublishDailyOptions): Promise<ActionOutputs> {
  await github.preflightRepositoryAccess();
  await ensureImmutableTag(github, identity.buildTag, identity.sha);
  const buildRelease = await ensureRelease(
    github,
    immutableReleaseMetadata(identity, repository),
    false,
  );

  let channelIdentity = await reconcileDailyTag(github, identity);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const channelTarget = await github.getTagTarget(identity.channelTag);
    if (channelTarget === null) {
      throw new Error(
        `Daily channel ${identity.channelTag} disappeared during publication`,
      );
    }
    channelIdentity = createDailyIdentity(identity, channelTarget);
    const channelRelease = await ensureRelease(
      github,
      dailyReleaseMetadata(channelIdentity, repository),
      true,
    );
    const confirmedTarget = await github.getTagTarget(identity.channelTag);
    if (confirmedTarget === channelTarget) {
      return outputsFor(
        identity,
        buildRelease,
        channelIdentity,
        channelRelease,
      );
    }
  }

  throw new Error(
    `Daily channel ${identity.channelTag} changed repeatedly while updating its Release; retry the workflow`,
  );
}
