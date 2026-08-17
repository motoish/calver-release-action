import type { getOctokit } from '@actions/github';
import { describe, expect, it, vi } from 'vitest';

import { createGitHubClientFromApi } from '../src/github-client';

type Octokit = ReturnType<typeof getOctokit>;

const repository = { owner: 'motoish', repo: 'example' };
const releaseData = {
  id: 42,
  tag_name: 'v2026.8.17-a1b2c3d4',
  html_url: 'https://github.com/motoish/example/releases/tag/build',
  upload_url: 'https://uploads.github.com/releases/42/assets{?name,label}',
  name: 'Build',
  body: 'Body',
  draft: false,
  prerelease: true,
};

function apiWith(overrides: Record<string, unknown> = {}): Octokit {
  return {
    rest: {
      repos: {
        get: vi.fn().mockResolvedValue({ data: { permissions: { push: true } } }),
        compareCommitsWithBasehead: vi
          .fn()
          .mockResolvedValue({ data: { status: 'ahead' } }),
        getReleaseByTag: vi.fn().mockResolvedValue({ data: releaseData }),
        createRelease: vi.fn().mockResolvedValue({ data: releaseData }),
        updateRelease: vi.fn().mockResolvedValue({ data: releaseData }),
      },
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { type: 'commit', sha: 'a'.repeat(40) } },
        }),
        createRef: vi.fn().mockResolvedValue({ data: {} }),
        updateRef: vi.fn().mockResolvedValue({ data: {} }),
      },
    },
    ...overrides,
  } as unknown as Octokit;
}

describe('GitHub API adapter', () => {
  it('does not treat GITHUB_TOKEN collaborator ACL as missing contents: write', async () => {
    const api = apiWith();
    vi.mocked(api.rest.repos.get).mockResolvedValueOnce({
      data: { permissions: { admin: false, push: false, pull: true } },
    } as never);
    const client = createGitHubClientFromApi(api, repository);

    await expect(client.assertContentsWrite()).resolves.toBeUndefined();
  });

  it('normalizes a lightweight tag target and maps missing refs to null', async () => {
    const api = apiWith();
    const client = createGitHubClientFromApi(api, repository);

    await expect(client.getTagTarget('v2026.8.17')).resolves.toBe('a'.repeat(40));

    vi.mocked(api.rest.git.getRef).mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );
    await expect(client.getTagTarget('missing')).resolves.toBeNull();
  });

  it('creates lightweight refs and updates channels without force', async () => {
    const api = apiWith();
    const client = createGitHubClientFromApi(api, repository);
    const sha = 'b'.repeat(40);

    await client.createTag('v2026.8.17', sha);
    await client.updateTagFastForward('v2026.8.17', sha);

    expect(api.rest.git.createRef).toHaveBeenCalledWith({
      ...repository,
      ref: 'refs/tags/v2026.8.17',
      sha,
    });
    expect(api.rest.git.updateRef).toHaveBeenCalledWith({
      ...repository,
      ref: 'tags/v2026.8.17',
      sha,
      force: false,
    });
  });

  it('compares full commits through the modern basehead endpoint', async () => {
    const api = apiWith();
    const client = createGitHubClientFromApi(api, repository);
    const base = 'a'.repeat(40);
    const head = 'b'.repeat(40);

    await expect(client.compareCommits(base, head)).resolves.toBe('ahead');
    expect(api.rest.repos.compareCommitsWithBasehead).toHaveBeenCalledWith({
      ...repository,
      basehead: `${base}...${head}`,
    });
  });

  it('normalizes releases and maps a missing release to null', async () => {
    const api = apiWith();
    const client = createGitHubClientFromApi(api, repository);

    await expect(
      client.getReleaseByTag('v2026.8.17-a1b2c3d4'),
    ).resolves.toEqual({
      id: 42,
      tagName: releaseData.tag_name,
      htmlUrl: releaseData.html_url,
      uploadUrl: releaseData.upload_url,
      name: 'Build',
      body: 'Body',
      draft: false,
      prerelease: true,
    });

    vi.mocked(api.rest.repos.getReleaseByTag).mockRejectedValueOnce(
      Object.assign(new Error('Not Found'), { status: 404 }),
    );
    await expect(client.getReleaseByTag('missing')).resolves.toBeNull();
  });

  it('maps release creation and updates to GitHub REST parameters', async () => {
    const api = apiWith();
    const client = createGitHubClientFromApi(api, repository);
    const createInput = {
      tagName: 'v2026.8.17-a1b2c3d4',
      targetCommitish: 'a'.repeat(40),
      name: 'Build',
      body: 'Body',
      draft: false as const,
      prerelease: true,
      makeLatest: false,
    };

    await client.createRelease(createInput);
    await client.updateRelease(42, {
      name: 'Build',
      draft: false,
      prerelease: true,
      makeLatest: false,
    });

    expect(api.rest.repos.createRelease).toHaveBeenCalledWith({
      ...repository,
      tag_name: createInput.tagName,
      target_commitish: createInput.targetCommitish,
      name: 'Build',
      body: 'Body',
      draft: false,
      prerelease: true,
      make_latest: 'false',
    });
    expect(api.rest.repos.updateRelease).toHaveBeenCalledWith({
      ...repository,
      release_id: 42,
      name: 'Build',
      draft: false,
      prerelease: true,
      make_latest: 'false',
    });
  });

  it('turns REST 403 errors into an actionable permission failure', async () => {
    const api = apiWith();
    vi.mocked(api.rest.git.createRef).mockRejectedValueOnce(
      Object.assign(new Error('Resource not accessible by integration'), {
        status: 403,
      }),
    );
    const client = createGitHubClientFromApi(api, repository);

    await expect(client.createTag('v2026.8.17', 'a'.repeat(40))).rejects.toThrow(
      'GitHub token requires contents: write permission for motoish/example',
    );
  });
});
