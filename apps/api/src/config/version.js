import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const apiPackageJsonPath = path.resolve(__dirname, "../../package.json");

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

export const API_VERSION = loadApiVersion();
