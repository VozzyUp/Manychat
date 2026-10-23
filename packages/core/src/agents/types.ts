import type { TenantDb } from '@nurion/db';
import type { ContactKind, Logger, ModuleKey } from '@nurion/shared';
import type { z } from 'zod';
import type { HandoffReason } from '../handoff/handoff';

/** A piece of a document the agent may cite. `chunkId` comes from `search_knowledge` (ADR-0006). */
export type ChunkRef = {
  chunkId: string;
  documentVersionId?: string;
  title: string;
  section?: string;
  version?: string;
  /** Extra detail kept for the panel ("Testar a base"); not needed for the citation line. */
  code?: string;
  page?: number;
  similarity?: number;
  text?: string;
};

/** What an agent knows about the situation (system prompt input). */
export type AgentContext = {
  tenantName: string;
  contactName: string | null;
  contactKind: ContactKind;
  module: ModuleKey;
  timezone: string;
  now: Date;
};

/** What a tool may use. Always scoped to the tenant (`tdb` is `withTenant`). */
export type ToolContext = {
  tdb: TenantDb;
  tenantId: string;
  /** Null when the run is not part of a conversation (e.g. "Testar a base"). */
  conversationId: string | null;
  contactId: string | null;
  contactKind: ContactKind;
  module: ModuleKey;
  agent: AgentDefinition;
  /** Searches the tenant's base within this agent's collections. Throws if no base is configured. */
  search: (query: string) => Promise<ChunkRef[]>;
  /** Chunks `search_knowledge` returned in this run: the only ones a reply may cite. */
  retrieved: ReadonlyMap<string, ChunkRef>;
  logger: Logger;
};

/** How a turn ends. Tools return one of these to finish the run. */
export type Terminal =
  | { type: 'reply'; text: string; citations: ChunkRef[] }
  | { type: 'handoff'; reason: HandoffReason; summary?: string };

export type ToolResult = {
  /** Shown to the model as JSON. Keep it small and free of personal data it does not need. */
  content: unknown;
  /** Chunks this result made citable. */
  chunks?: ChunkRef[];
  terminal?: Terminal;
};

export type ToolDefinition<S extends z.ZodType = z.ZodType> = {
  name: string;
  /** Say WHEN to call it, not only what it does. */
  description: string;
  input: S;
  run: (args: z.output<S>, ctx: ToolContext) => Promise<ToolResult>;
  /** Short line for `ai_tool_calls.result_summary`. No personal data. */
  summarize: (args: z.output<S>, result: ToolResult) => string;
};

/** Typed helper so `run` and `summarize` get the parsed input type. */
export function defineTool<S extends z.ZodType>(tool: ToolDefinition<S>): ToolDefinition {
  return tool;
}

/** ESCOPO §4.4: configuration + tools + rules. Data, not a class. */
export type AgentDefinition = {
  key: string;
  module: ModuleKey;
  /** Module-specific part of the prompt. The platform guardrails are added by the engine. */
  systemPrompt: (ctx: AgentContext) => string;
  /** Module tools. Core tools (reply, handoff_to_human, …) are always added. */
  tools: ToolDefinition[];
  /** Document collections `search_knowledge` may read for this agent. */
  knowledgeScopes: string[];
  requireCitation: boolean;
  /** Limit of model calls (tool-use iterations) per message. */
  maxTurns: number;
};
