const normalizeEnvValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

export const resolveApiCommit = (env = process.env) => {
  const commitFromRenderEnv = normalizeEnvValue(env.RENDER_GIT_COMMIT);

  if (commitFromRenderEnv) {
    return commitFromRenderEnv;
  }

  const commitFromAppEnv = normalizeEnvValue(env.APP_COMMIT);

  if (commitFromAppEnv) {
    return commitFromAppEnv;
  }

  const commitFromGenericEnv = normalizeEnvValue(env.COMMIT_SHA);

  if (commitFromGenericEnv) {
    return commitFromGenericEnv;
  }

  return "unknown";
};

export const resolveApiVersion = (env = process.env) => {
  const appVersionFromEnv = normalizeEnvValue(env.APP_VERSION);

  if (appVersionFromEnv) {
    return appVersionFromEnv;
  }

  const commit = resolveApiCommit(env);

  if (commit !== "unknown") {
    return `sha-${commit.slice(0, 7)}`;
  }

  return "unknown";
};

