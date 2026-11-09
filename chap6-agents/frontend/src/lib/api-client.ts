import type { AgentsResponse } from "@/lib/agents";
import type { GraphView } from "@/lib/graph";
import type { ClassifyResult, FeatureSets, Task } from "@/lib/survey";

export interface SourceDetail {
  chunk_id: string;
  document_id: string;
  document_title: string;
  publisher: string;
  lang: string;
  excerpt: string;
  source_url: string | null;
}

const GRAPH_LIMIT = 2000;

async function failureMessage(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const { error, detail } = (typeof body === "object" && body !== null ? body : {}) as { error?: { message?: string }; detail?: unknown };
  if (error?.message) return error.message;
  if (typeof detail === "string") return detail;
  return `Máy chủ trả về lỗi ${response.status}`;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init).catch(() => {
    throw new Error("Không kết nối được dịch vụ tra cứu.");
  });
  if (!response.ok) throw new Error(await failureMessage(response));
  return (await response.json()) as T;
}

export const fetchGraph = (id: string) => requestJson<GraphView>(`/api/graph/${encodeURIComponent(id)}?limit=${GRAPH_LIMIT}`);
export const fetchSource = (id: string) => requestJson<SourceDetail>(`/api/sources/${encodeURIComponent(id)}`);
export const fetchFeatures = () => requestJson<FeatureSets>("/api/classify/features");
export const classify = (task: Task, features: Record<string, number>) =>
  requestJson<ClassifyResult>("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task, features }),
  });
export const fetchAgents = () => requestJson<AgentsResponse>("/api/agents");
