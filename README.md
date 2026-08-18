# CalVer Release Action

Publish every successful build without treating every build as a stable release.

`motoish/calver-release-action` provides an opinionated GitHub release workflow built around Calendar Versioning:

* **Immutable builds** pin a GitHub Release to one commit. The Action does not store your artifacts.
* **Daily channels** point to the newest eligible build for a calendar day.
* **Monthly stable releases** explicitly promote one selected immutable build to stable.

```text
daily
  commit a1b2c3d4
        └──▶ v2026.8.17-a1b2c3d4   immutable build
                      └──▶ v2026.8.17   daily channel

promote later, from a selected build
  v2026.8.17-a1b2c3d4 ──▶ v2026.8   stable
```

This is useful for projects that build frequently but want a clear distinction between:

**what was built → what is current today → what is stable**

## Release model

| Layer           | Example               | Mutable                 | GitHub Release          |
| --------------- | --------------------- | ----------------------- | ----------------------- |
| Immutable build | `v2026.8.17-a1b2c3d4` | No                      | Pre-release, not latest |
| Daily channel   | `v2026.8.17`          | Fast-forward only       | Pre-release, not latest |
| Monthly stable  | `v2026.8`             | No implicit replacement | Stable and latest       |

The release policy is intentionally strict:

* every successful build can keep its own immutable release;
* an older workflow cannot move the daily channel backward;
* monthly stable releases are created only by explicit promotion;
* an existing stable tag is never silently replaced;
* unrelated Git histories are rejected instead of force-updating tags. The immutable build from that run is still left published.

Dates use UTC by default. Month and day are unpadded (`v2026.8.17`, not `v2026.08.17`). Set `timezone` to an IANA timezone such as `Asia/Tokyo` when another calendar boundary is required.

> [!NOTE]
> In this README, "immutable build" means that the build tag is never moved.
> It does not refer to GitHub's Immutable Releases repository setting.

> [!WARNING]
> Do not enable GitHub immutable releases on a repository that uses the daily
> channel. That setting locks a published Release's tag, and the daily channel
> must be able to fast-forward `vYYYY.M.D`.

## Quick start

The workflow needs:

```yaml
permissions:
  contents: write
```

The built-in `github.token` is sufficient. A personal access token is not required.

Branch, event, and concurrency policy stay in the calling workflow. This Action only publishes after you invoke it. Fork pull requests cannot create Releases in the base repository with `github.token`.

> [!TIP]
> Use `@v1` to follow the latest compatible v1 release, or a version such as
> `@v1.1.2` when you want a specific release.

### Publish daily builds

Run the Action after your tests and packaging have succeeded.

```yaml
name: Daily release

on:
  push:
    branches: [main]

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v6

      - name: Build and test
        run: ./scripts/build-and-test

      - name: Publish CalVer releases
        id: calver
        uses: motoish/calver-release-action@v1
        with:
          mode: daily
          token: ${{ github.token }}

      - name: Upload assets
        env:
          GH_TOKEN: ${{ github.token }}
          BUILD_TAG: ${{ steps.calver.outputs.build_tag }}
        run: gh release upload "$BUILD_TAG" dist/app.tar.gz --clobber
```

For a commit such as:

```text
a1b2c3d4...
```

the Action creates:

```text
v2026.8.17-a1b2c3d4   immutable build
v2026.8.17             daily channel
```

The immutable build never moves.

The daily channel may move forward to a newer commit from the same history.

Concurrent daily jobs are expected. Fast-forward only applies when the new commit is a descendant. If an older workflow finishes after a newer one, its immutable release is still kept, and the daily channel is not moved backward.

If the daily channel has diverged from the current commit, publication fails instead of forcing the tag. The immutable build created in that run is still left published.

> [!CAUTION]
> A same-day force-push or rebase of `main` can diverge the daily channel from
> later commits. Publication then fails for the rest of that calendar day; the
> next day starts a new `vYYYY.M.D` channel.

## Promote a stable release

Stable releases are created from an exact immutable build.

```yaml
name: Promote stable release

on:
  workflow_dispatch:
    inputs:
      source_tag:
        description: Immutable build tag, for example v2026.8.17-a1b2c3d4
        required: true
        type: string

permissions:
  contents: write

jobs:
  promote:
    runs-on: ubuntu-latest

    steps:
      - name: Promote immutable build
        uses: motoish/calver-release-action@v1
        with:
          mode: promote
          source_tag: ${{ inputs.source_tag }}
          token: ${{ github.token }}
```

For example:

```text
v2026.8.17-a1b2c3d4
          │
          └── promote ──▶ v2026.8
```

The monthly version is derived from the source build tag, **not from the date on which promotion runs**.

If `v2026.8` already points to another commit, promotion fails instead of moving the existing stable release.

Promotion does not need `actions/checkout`. The Action reads the source tag from GitHub, not from the runner workspace.

> [!NOTE]
> Re-running promotion of an older month can mark that month as GitHub's
> latest stable release. Promote months in calendar order, or avoid replaying
> an older promote job after a newer month already exists.

## Why not just generate a CalVer tag?

A simple CalVer Action answers:

> What version string should this build use?

CalVer Release Action also answers:

> Which exact build was produced, which build represents today, and which build was explicitly promoted to stable?

| Capability                             | Simple CalVer helper | CalVer Release Action |
| -------------------------------------- | -------------------- | --------------------- |
| Generate date-based versions           | Yes                  | Yes                   |
| Preserve exact build identity          | Caller-managed       | Built in              |
| Immutable commit release               | Caller-managed       | `vYYYY.M.D-<sha8>`    |
| Daily release channel                  | Caller-managed       | `vYYYY.M.D`           |
| Protect against stale workflow updates | Caller-managed       | Built in              |
| Promote an existing build to stable    | Caller-managed       | Built in              |
| Monthly stable channel                 | Caller-managed       | `vYYYY.M`             |
| Replace an existing stable tag         | Depends              | Never implicitly      |

The goal is deliberately **not** to support every possible versioning scheme.

It provides one predictable release policy that can be reused across repositories.

## Long-running builds

A build can cross a calendar boundary between packaging and release.

If packaging can outlast midnight in the chosen timezone, compute the CalVer identity before the build and pass `now` plus `expected_version`. That keeps the uploaded artifact and the published tag on the same calendar day.

If the caller computes the release identity before the build starts, pass the same timestamp and expected version to the Action:

```yaml
with:
  mode: daily
  timezone: Asia/Tokyo
  now: ${{ steps.identity.outputs.epoch }}
  expected_version: ${{ steps.identity.outputs.version }}
  token: ${{ github.token }}
```

`expected_version` must contain the daily version without the leading `v`, including the 8-character commit suffix. Month and day are unpadded:

```text
2026.8.17-a1b2c3d4
```

If it does not match the version calculated by the Action, the workflow fails **before creating any tag or GitHub Release**.

If you only need another calendar boundary:

```yaml
with:
  mode: daily
  timezone: Asia/Tokyo
  token: ${{ github.token }}
```

## Promotion validation

Promotion only accepts an immutable build produced by the daily release flow.

The source tag must:

* resolve to a published immutable pre-release;
* follow the expected CalVer build format;
* resolve to a commit whose SHA matches the tag suffix.

For example:

```text
v2026.8.17-a1b2c3d4
             └────── commit SHA prefix
```

The suffix uses 8 hexadecimal characters.

A different commit with the same 8-character prefix would therefore satisfy this check. Such collisions are unlikely, but possible.

## Inputs

| Input              | Required       | Default    | Description                                            |
| ------------------ | -------------- | ---------- | ------------------------------------------------------ |
| `mode`             | Yes            | —          | `daily` or `promote`                                   |
| `token`            | Yes            | —          | GitHub token with `contents: write`                    |
| `timezone`         | No             | `UTC`      | IANA timezone used for daily dates                     |
| `source_tag`       | `promote` only | —          | Immutable tag selected for promotion                   |
| `now`              | No             | Wall clock | Unix epoch seconds used for the daily calendar instant |
| `expected_version` | No             | —          | Expected `YYYY.M.D-sha8` version before GitHub writes  |

## Outputs

| Output                | Description                                                    |
| --------------------- | -------------------------------------------------------------- |
| `version`             | Daily `YYYY.M.D-sha8` or monthly `YYYY.M`, without leading `v` |
| `build_tag`           | Immutable build tag                                            |
| `build_release_id`    | Immutable build Release ID                                     |
| `build_release_url`   | Immutable build Release URL                                    |
| `build_upload_url`    | Immutable build asset upload URL                               |
| `channel_tag`         | Daily or monthly channel tag                                   |
| `channel_release_id`  | Channel Release ID                                             |
| `channel_release_url` | Channel Release URL                                            |
| `channel_upload_url`  | Channel release asset upload URL                               |

## Assets

The Action intentionally does **not** build or upload your application artifacts.

Your build system owns the artifacts. The Action owns the release structure.

Normally, upload artifacts only to the immutable build:

```yaml
- name: Upload assets
  env:
    GH_TOKEN: ${{ github.token }}
    BUILD_TAG: ${{ steps.calver.outputs.build_tag }}
  run: gh release upload "$BUILD_TAG" dist/app.tar.gz --clobber
```

This keeps artifact identity tied to a commit-specific release instead of the daily channel.

> [!IMPORTANT]
> Upload artifacts to `build_tag`. The daily channel may move to a newer build,
> while a stable release references the selected immutable build without
> copying its assets.

If you want assets to appear directly on the stable GitHub Release, upload them separately after promotion using `channel_tag` or `channel_upload_url`.

## Release metadata

Immutable and stable Release bodies are initialized by the Action but are not overwritten on retry, so maintainers can edit them manually.

The daily channel body is managed by the Action and always identifies the immutable build it currently points to. Do not rely on manual edits to the daily channel body; the Action rewrites it whenever the channel moves.

## Development

Install dependencies and run the full verification suite:

```bash
npm ci
npm run verify
```

`dist/index.js` is committed as the runnable GitHub Action bundle.

After changing source code:

```bash
npm run package
```

To verify that the committed bundle matches the source without modifying it:

```bash
npm run check-package
```

## License

MIT
