import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const owner = "mahmoudbkeer";
const repo = "Ai-digital-sinai";
const endpoint = (path) => `repos/${owner}/${repo}/${path}`;
const run = (args, input) => {
  const cliArgs = ["api", ...args];
  if (input !== undefined) cliArgs.push("--input", "-");
  return execFileSync("gh", cliArgs, { input, encoding: "utf8", env: { ...process.env, GH_FORCE_TTY: "0" } }).toString().replace(/\u001b\[[0-9;]*[A-Za-z]/g, "").trim();
};
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).trim().split("\n").filter(Boolean);
if (tracked.length === 0) throw new Error("No tracked source files found");
if (tracked.some((file) => /(^|\/)(\.env($|\.)|node_modules|dist|\.manus-logs|\.git)(\/|$)/.test(file))) throw new Error("Sensitive or generated file selected");

let baseCommit;
try {
  const ref = JSON.parse(run([endpoint("git/refs/heads/main")]));
  baseCommit = ref.object.sha;
} catch {
  const readme = readFileSync("README.md").toString("base64");
  const initialized = JSON.parse(run([endpoint("contents/README.md"), "--method", "PUT"], JSON.stringify({ message: "Initialize repository", content: readme, branch: "main" })));
  baseCommit = initialized.commit.sha;
}

const commitInfo = JSON.parse(run([endpoint(`commits/${baseCommit}`)]));
const baseTreeSha = commitInfo.commit?.tree?.sha ?? commitInfo.tree?.sha;
if (!baseTreeSha) throw new Error("Unable to resolve base commit tree");
const entries = [];
for (const file of tracked) {
  const content = readFileSync(file).toString("base64");
  const blob = JSON.parse(run([endpoint("git/blobs"), "--method", "POST"], JSON.stringify({ content, encoding: "base64" })));
  entries.push({ path: file, mode: "100644", type: "blob", sha: blob.sha });
}
const tree = JSON.parse(run([endpoint("git/trees"), "--method", "POST"], JSON.stringify({ base_tree: baseTreeSha, tree: entries })));
const commit = JSON.parse(run([endpoint("git/commits"), "--method", "POST"], JSON.stringify({ message: "Upload AI DIGITAL SINAI source and security docs", tree: tree.sha, parents: [baseCommit] })));
const ref = JSON.parse(run([endpoint("git/refs/heads/main"), "--method", "PATCH"], JSON.stringify({ sha: commit.sha, force: false })));
console.log(JSON.stringify({ uploadedFiles: tracked.length, commit: commit.sha, ref: ref.ref, repo: `https://github.com/${owner}/${repo}` }));
