import { stableReleaseMetadata } from './release-metadata';
import type {
  ActionOutputs,
  GitHubPort,
  ReleaseCreateInput,
  ReleaseInfo,
  Repository,
} from './types';
import { parseImmutableTag } from './version';

export interface PromoteStableOptions {
  github: GitHubPort;
  sourceTag: string;
  repository: Repository;
}

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  return typeof error.status === 'number' ? error.status : undefined;
}

async function ensureStableTag(
  github: GitHubPort,
  stableTag: string,
  sha: string,
): Promise<void> {
  let current = await github.getTagTarget(stableTag);
  if (current === null) {
    try {
      await github.createTag(stableTag, sha);
      current = sha;
    } catch (error) {
      if (errorStatus(error) !== 422) {
        throw error;
      }
      current = await github.getTagTarget(stableTag);
    }
  }

  if (current !== sha) {
    throw new Error(
      `Stable tag ${stableTag} already points to ${current ?? 'no commit'}, expected ${sha}`,
    );
  }
}

async function ensureStableRelease(
  github: GitHubPort,
  metadata: ReleaseCreateInput,
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

  return github.updateRelease(release.id, {
    name: metadata.name,
    draft: false,
    prerelease: false,
    makeLatest: true,
  });
}

function outputsFor(
  version: string,
  sourceTag: string,
  sourceRelease: ReleaseInfo,
  stableTag: string,
  stableRelease: ReleaseInfo,
): ActionOutputs {
  return {
    version,
    buildTag: sourceTag,
    buildReleaseId: String(sourceRelease.id),
    buildReleaseUrl: sourceRelease.htmlUrl,
    buildUploadUrl: sourceRelease.uploadUrl,
    channelTag: stableTag,
    channelReleaseId: String(stableRelease.id),
    channelReleaseUrl: stableRelease.htmlUrl,
    channelUploadUrl: stableRelease.uploadUrl,
  };
}

export async function promoteStable({
  github,
  sourceTag,
  repository,
}: PromoteStableOptions): Promise<ActionOutputs> {
  await github.assertContentsWrite();
  const identity = parseImmutableTag(sourceTag);
  const sourceSha = await github.getTagTarget(sourceTag);
  if (sourceSha === null) {
    throw new Error(`Immutable source tag ${sourceTag} does not exist`);
  }
  if (!sourceSha.startsWith(identity.sha8)) {
    throw new Error(
      `Immutable source tag ${sourceTag} points to ${sourceSha}, which does not match suffix ${identity.sha8}`,
    );
  }

  const sourceRelease = await github.getReleaseByTag(sourceTag);
  if (sourceRelease === null) {
    throw new Error(`Immutable source release ${sourceTag} does not exist`);
  }
  if (sourceRelease.draft || !sourceRelease.prerelease) {
    throw new Error(
      `Immutable source release ${sourceTag} must be a published prerelease`,
    );
  }

  await ensureStableTag(github, identity.stableTag, sourceSha);
  const stableRelease = await ensureStableRelease(
    github,
    stableReleaseMetadata(identity, sourceSha, repository),
  );

  return outputsFor(
    identity.stableTag.slice(1),
    sourceTag,
    sourceRelease,
    identity.stableTag,
    stableRelease,
  );
}
