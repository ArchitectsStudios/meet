// Build identity, Bungie style: {seq}.{yy}.{mm}.{dd}.{hhmm}.{branch}, or "untracked version".
// CI computes it with scripts/compute-build-string.mjs and passes the parts to the Docker build,
// which sets them as environment variables for both `next build` and the running server.

export interface BuildInfo {
  buildString: string;
  branch: string;
  commit: string;
  builtAt: string;
}

export function buildInfo(): BuildInfo {
  return {
    buildString: process.env.MEET_BUILD_STRING || "untracked version",
    branch: process.env.MEET_BUILD_BRANCH || "",
    commit: process.env.MEET_BUILD_COMMIT || "",
    builtAt: process.env.MEET_BUILD_TIME || "",
  };
}
