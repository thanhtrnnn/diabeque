import type { CodeRef } from "@/lib/chat-stream-contract";

const REPO = "https://github.com/thanhtrnnn/diabeque";

/** Percent-encodes each segment (spaces become %20) and keeps the slashes. */
function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

const trimSlashes = (path: string) => path.replace(/^\/+/, "").replace(/\/+$/, "");

/** `vscode://file{repo_root}/{path}:{line}`; null when the backend did not say where the repo is. */
export function vscodeLink(root: string | undefined, ref: CodeRef): string | null {
  if (!root) return null;
  return `vscode://file/${encodePath(trimSlashes(root))}/${encodePath(trimSlashes(ref.path))}:${ref.line}`;
}

/** The line on GitHub at the backend's commit, or on `main` when the commit is unknown. */
export function githubLink(commit: string | null | undefined, ref: CodeRef): string {
  return `${REPO}/blob/${encodeURIComponent(commit || "main")}/${encodePath(trimSlashes(ref.path))}#L${ref.line}`;
}
