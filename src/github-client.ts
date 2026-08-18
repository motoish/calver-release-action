import { getOctokit } from '@actions/github';

import type {
  CompareStatus,
  GitHubPort,
  ReleaseCreateInput,
  ReleaseInfo,
  ReleaseUpdateInput,
  Repository,
} from './types';

type Octokit = ReturnType<typeof getOctokit>;

function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }
  return typeof error.status === 'number' ? error.status : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function annotateForbidden(error: unknown, repository: Repository): Error {
  return new Error(
    `${errorMessage(error)}; if this is a permissions failure, GitHub token requires contents: write permission for ${repository.owner}/${repository.repo}`,
  );
}

function normalizeRelease(data: {
  id: number;
  tag_name: string;
  html_url: string;
  upload_url: string;
  name: string | null;
  body?: string | null;
  draft: boolean;
  prerelease: boolean;
}): ReleaseInfo {
  return {
    id: data.id,
    tagName: data.tag_name,
    htmlUrl: data.html_url,
    uploadUrl: data.upload_url,
    name: data.name,
    body: data.body ?? null,
    draft: data.draft,
    prerelease: data.prerelease,
  };
}

export function createGitHubClientFromApi(
  api: Octokit,
  repository: Repository,
): GitHubPort {
  async function call<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (errorStatus(error) === 403) {
        throw annotateForbidden(error, repository);
      }
      throw error;
    }
  }

  return {
    // Only checks that the repository is reachable. GITHUB_TOKEN's
    // permissions.push ACL is not a reliable contents: write signal;
    // mutating calls surface real write failures.
    async preflightRepositoryAccess(): Promise<void> {
      await call(() => api.rest.repos.get({ ...repository }));
    },

    async getTagTarget(tag: string): Promise<string | null> {
      try {
        const response = await call(() =>
          api.rest.git.getRef({ ...repository, ref: `tags/${tag}` }),
        );
        if (response.data.object.type !== 'commit') {
          throw new Error(
            `Tag ${tag} is annotated; calver-release-action requires a lightweight tag`,
          );
        }
        return response.data.object.sha;
      } catch (error) {
        if (errorStatus(error) === 404) {
          return null;
        }
        throw error;
      }
    },

    async createTag(tag: string, sha: string): Promise<void> {
      await call(() =>
        api.rest.git.createRef({
          ...repository,
          ref: `refs/tags/${tag}`,
          sha,
        }),
      );
    },

    async updateTagFastForward(tag: string, sha: string): Promise<void> {
      await call(() =>
        api.rest.git.updateRef({
          ...repository,
          ref: `tags/${tag}`,
          sha,
          force: false,
        }),
      );
    },

    async compareCommits(base: string, head: string): Promise<CompareStatus> {
      const response = await call(() =>
        api.rest.repos.compareCommitsWithBasehead({
          ...repository,
          basehead: `${base}...${head}`,
        }),
      );
      const status = response.data.status;
      if (
        status !== 'ahead' &&
        status !== 'behind' &&
        status !== 'identical' &&
        status !== 'diverged'
      ) {
        throw new Error(`Unexpected GitHub commit comparison status: ${status}`);
      }
      return status;
    },

    async getReleaseByTag(tag: string): Promise<ReleaseInfo | null> {
      try {
        const response = await call(() =>
          api.rest.repos.getReleaseByTag({ ...repository, tag }),
        );
        return normalizeRelease(response.data);
      } catch (error) {
        if (errorStatus(error) === 404) {
          return null;
        }
        throw error;
      }
    },

    async createRelease(input: ReleaseCreateInput): Promise<ReleaseInfo> {
      const response = await call(() =>
        api.rest.repos.createRelease({
          ...repository,
          tag_name: input.tagName,
          target_commitish: input.targetCommitish,
          name: input.name,
          body: input.body,
          draft: input.draft,
          prerelease: input.prerelease,
          make_latest: input.makeLatest ? 'true' : 'false',
        }),
      );
      return normalizeRelease(response.data);
    },

    async updateRelease(
      releaseId: number,
      input: ReleaseUpdateInput,
    ): Promise<ReleaseInfo> {
      const response = await call(() =>
        api.rest.repos.updateRelease({
          ...repository,
          release_id: releaseId,
          name: input.name,
          ...(input.body === undefined ? {} : { body: input.body }),
          draft: input.draft,
          prerelease: input.prerelease,
          make_latest: input.makeLatest ? 'true' : 'false',
        }),
      );
      return normalizeRelease(response.data);
    },
  };
}

export function createGitHubClient(
  token: string,
  repository: Repository,
): GitHubPort {
  return createGitHubClientFromApi(getOctokit(token), repository);
}
