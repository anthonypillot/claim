export default {
  branches: ["main"],
  tagFormat: "v${version}",
  plugins: [
    "@semantic-release/commit-analyzer",
    "@semantic-release/release-notes-generator",
    ["@semantic-release/changelog", { changelogFile: "docs/CHANGELOG.md" }],
    [
      "@semantic-release/exec",
      {
        prepareCmd:
          "bun pm pkg set version=${nextRelease.version} && bun pm --cwd packages/api pkg set version=${nextRelease.version} && bun pm --cwd packages/web pkg set version=${nextRelease.version} && bun install --lockfile-only && bun run verify",
      },
    ],
    [
      "@semantic-release/git",
      {
        assets: [
          "package.json",
          "packages/api/package.json",
          "packages/web/package.json",
          "bun.lock",
          "docs/CHANGELOG.md",
        ],
        message: "chore(release): ${nextRelease.version}\n\n${nextRelease.notes}\n\n[skip ci]",
      },
    ],
    "@semantic-release/github",
  ],
};
