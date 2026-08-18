import type {
  CompareStatus,
  GitHubPort,
  ReleaseCreateInput,
  ReleaseInfo,
  ReleaseUpdateInput,
} from '../../src/types';

export class FakeGitHub implements GitHubPort {
  readonly tags = new Map<string, string>();
  readonly releases = new Map<string, ReleaseInfo>();
  readonly comparisons = new Map<string, CompareStatus>();
  readonly raceOnCreateTag = new Map<string, string>();
  beforeUpdateRelease?: (
    releaseId: number,
    input: ReleaseUpdateInput,
  ) => Promise<void>;
  permissionGranted = true;
  private nextReleaseId = 1;

  async preflightRepositoryAccess(): Promise<void> {
    if (!this.permissionGranted) {
      throw new Error('GitHub token requires contents: write permission');
    }
  }

  async getTagTarget(tag: string): Promise<string | null> {
    return this.tags.get(tag) ?? null;
  }

  async createTag(tag: string, sha: string): Promise<void> {
    const raceTarget = this.raceOnCreateTag.get(tag);
    if (raceTarget !== undefined) {
      this.raceOnCreateTag.delete(tag);
      this.tags.set(tag, raceTarget);
      throw Object.assign(new Error(`Reference ${tag} already exists`), {
        status: 422,
      });
    }
    if (this.tags.has(tag)) {
      throw Object.assign(new Error(`Reference ${tag} already exists`), {
        status: 422,
      });
    }
    this.tags.set(tag, sha);
  }

  async updateTagFastForward(tag: string, sha: string): Promise<void> {
    const current = this.tags.get(tag);
    if (current === undefined) {
      throw Object.assign(new Error(`Reference ${tag} is missing`), {
        status: 422,
      });
    }
    if (current !== sha) {
      const status = await this.compareCommits(current, sha);
      if (status !== 'ahead') {
        throw Object.assign(new Error('Update is not a fast-forward'), {
          status: 422,
        });
      }
    }
    this.tags.set(tag, sha);
  }

  async compareCommits(base: string, head: string): Promise<CompareStatus> {
    if (base === head) {
      return 'identical';
    }
    return this.comparisons.get(`${base}...${head}`) ?? 'diverged';
  }

  async getReleaseByTag(tag: string): Promise<ReleaseInfo | null> {
    return this.releases.get(tag) ?? null;
  }

  async createRelease(input: ReleaseCreateInput): Promise<ReleaseInfo> {
    if (this.releases.has(input.tagName)) {
      throw Object.assign(new Error(`Release ${input.tagName} already exists`), {
        status: 422,
      });
    }
    const release = this.releaseFrom(input, this.nextReleaseId++);
    this.releases.set(input.tagName, release);
    return release;
  }

  async updateRelease(
    releaseId: number,
    input: ReleaseUpdateInput,
  ): Promise<ReleaseInfo> {
    await this.beforeUpdateRelease?.(releaseId, input);
    const existing = [...this.releases.values()].find(
      (release) => release.id === releaseId,
    );
    if (!existing) {
      throw new Error(`Release ${releaseId} is missing`);
    }
    const updated = {
      ...existing,
      name: input.name,
      body: input.body ?? existing.body,
      draft: input.draft,
      prerelease: input.prerelease,
    };
    this.releases.set(existing.tagName, updated);
    return updated;
  }

  private releaseFrom(input: ReleaseCreateInput, id: number): ReleaseInfo {
    return {
      id,
      tagName: input.tagName,
      htmlUrl: `https://github.test/releases/tag/${input.tagName}`,
      uploadUrl: `https://uploads.github.test/releases/${id}/assets{?name,label}`,
      name: input.name,
      body: input.body,
      draft: input.draft,
      prerelease: input.prerelease,
    };
  }
}
