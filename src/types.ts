export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export interface DailyIdentity extends CalendarDate {
  sha: string;
  sha8: string;
  version: string;
  buildTag: string;
  channelTag: string;
}

export interface ImmutableIdentity extends CalendarDate {
  sha8: string;
  version: string;
  buildTag: string;
  stableTag: string;
}

export interface Repository {
  owner: string;
  repo: string;
}

export interface ReleaseInfo {
  id: number;
  tagName: string;
  htmlUrl: string;
  uploadUrl: string;
  name: string | null;
  body: string | null;
  draft: boolean;
  prerelease: boolean;
}

export interface ReleaseCreateInput {
  tagName: string;
  targetCommitish: string;
  name: string;
  body: string;
  draft: false;
  prerelease: boolean;
  makeLatest: boolean;
}

export interface ReleaseUpdateInput {
  name: string;
  body?: string;
  draft: false;
  prerelease: boolean;
  makeLatest: boolean;
}

export type CompareStatus = 'ahead' | 'behind' | 'identical' | 'diverged';

export interface GitHubPort {
  preflightRepositoryAccess(): Promise<void>;
  getTagTarget(tag: string): Promise<string | null>;
  createTag(tag: string, sha: string): Promise<void>;
  updateTagFastForward(tag: string, sha: string): Promise<void>;
  compareCommits(base: string, head: string): Promise<CompareStatus>;
  getReleaseByTag(tag: string): Promise<ReleaseInfo | null>;
  createRelease(input: ReleaseCreateInput): Promise<ReleaseInfo>;
  updateRelease(
    releaseId: number,
    input: ReleaseUpdateInput,
  ): Promise<ReleaseInfo>;
}

export interface ActionOutputs {
  version: string;
  buildTag: string;
  buildReleaseId: string;
  buildReleaseUrl: string;
  buildUploadUrl: string;
  channelTag: string;
  channelReleaseId: string;
  channelReleaseUrl: string;
  channelUploadUrl: string;
}

export type ActionMode = 'daily' | 'promote';

export interface ActionInputs {
  mode: ActionMode;
  token: string;
  timezone: string;
  sourceTag?: string;
}
