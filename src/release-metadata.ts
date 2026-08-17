import type {
  DailyIdentity,
  ImmutableIdentity,
  ReleaseCreateInput,
  Repository,
} from './types';

function commitUrl(repository: Repository, sha: string): string {
  return `https://github.com/${repository.owner}/${repository.repo}/commit/${sha}`;
}

function releaseUrl(repository: Repository, tag: string): string {
  return `https://github.com/${repository.owner}/${repository.repo}/releases/tag/${encodeURIComponent(tag)}`;
}

export function immutableReleaseMetadata(
  identity: DailyIdentity,
  repository: Repository,
): ReleaseCreateInput {
  return {
    tagName: identity.buildTag,
    targetCommitish: identity.sha,
    name: identity.buildTag,
    body: `Immutable build for commit [\`${identity.sha8}\`](${commitUrl(repository, identity.sha)}).`,
    draft: false,
    prerelease: true,
    makeLatest: false,
  };
}

export function dailyReleaseMetadata(
  identity: DailyIdentity,
  repository: Repository,
): ReleaseCreateInput {
  return {
    tagName: identity.channelTag,
    targetCommitish: identity.sha,
    name: `Daily ${identity.channelTag}`,
    body: `Current immutable build: [\`${identity.buildTag}\`](${releaseUrl(repository, identity.buildTag)})\n\nCommit: [\`${identity.sha8}\`](${commitUrl(repository, identity.sha)}).`,
    draft: false,
    prerelease: true,
    makeLatest: false,
  };
}

export function stableReleaseMetadata(
  identity: ImmutableIdentity,
  sha: string,
  repository: Repository,
): ReleaseCreateInput {
  return {
    tagName: identity.stableTag,
    targetCommitish: sha,
    name: identity.stableTag,
    body: `Promoted from [\`${identity.buildTag}\`](${releaseUrl(repository, identity.buildTag)}).\n\nCommit: [\`${identity.sha8}\`](${commitUrl(repository, sha)}).`,
    draft: false,
    prerelease: false,
    makeLatest: true,
  };
}
