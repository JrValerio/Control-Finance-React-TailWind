import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiPackageJsonPath = path.resolve(__dirname, "../../package.json");

const normalizeEnvValue = (value) => {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
};

const loadApiVersion = () => {
  try {
    const packageJsonRaw = fs.readFileSync(apiPackageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw);

    if (typeof packageJson.version === "string" && packageJson.version.trim()) {
      return packageJson.version;
    }
  } catch {
    return "unknown";
  }

  return "unknown";
};

const resolveApiVersion = () => {
  const appVersionFromEnv = normalizeEnvValue(process.env.APP_VERSION);

  if (appVersionFromEnv) {
    return appVersionFromEnv;
  }

  return loadApiVersion();
};

const resolveApiCommit = () => {
  const commitFromAppEnv = normalizeEnvValue(process.env.APP_COMMIT);

  if (commitFromAppEnv) {
    return commitFromAppEnv;
  }

  const commitFromRenderEnv = normalizeEnvValue(process.env.RENDER_GIT_COMMIT);

  if (commitFromRenderEnv) {
    return commitFromRenderEnv;
  }

  return "unknown";
};

export const API_VERSION = resolveApiVersion();
export const API_COMMIT = resolveApiCommit();
