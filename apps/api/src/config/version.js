import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const normalizeEnvValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const resolvePackageVersion = () => {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDirectory = path.dirname(currentFilePath);
    const packageJsonPath = path.resolve(currentDirectory, "..", "..", "package.json");
    const packageJsonContent = fs.readFileSync(packageJsonPath, "utf-8");
    const packageJson = JSON.parse(packageJsonContent);

    return normalizeEnvValue(packageJson?.version);
  } catch {
    return "";
  }
};

const API_PACKAGE_VERSION = resolvePackageVersion();

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

export const resolveApiVersion = (
  env = process.env,
  options = {},
) => {
  const packageVersion = normalizeEnvValue(options.packageVersion ?? API_PACKAGE_VERSION);

  if (packageVersion) {
    return packageVersion;
  }

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
