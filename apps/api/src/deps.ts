import {
  createAnthropicClient,
  createKnowledgeSearch,
  createOpenAiEmbeddings,
  parsePricing,
  testKnowledge,
  type KnowledgeTestResult,
} from '@nurion/core';
import {
  createAuthVerifier,
  createServiceDb,
  createUserClient,
  type DbClient,
  type ServiceDb,
  type VerifiedUser,
} from '@nurion/db';
import { createSecretBox, type Logger, type SecretBox } from '@nurion/shared';
import type { ApiEnv } from './env';

export type InboundJob = { body: string; receivedAt: string };
export type IngestJob = { tenantId: string; versionId: string };

/** Everything routes need from the outside world. Tests build the same thing against the local stack. */
export type AppDeps = {
  verifyToken: (token: string) => Promise<VerifiedUser | null>;
  /** Supabase client acting as the user (RLS applies). */
  userDb: (accessToken: string) => DbClient;
  /** Service role, only through withTenant() / system (ADR-0001). */
  serviceDb: ServiceDb;
  webUrl: string;
  /** Token vault for third-party secrets (ADR-0004); null when ENCRYPTION_KEY is not configured. */
  secrets: SecretBox | null;
  whatsapp: {
    appSecret?: string;
    verifyToken?: string;
    graph: { version: string; baseUrl?: string; fetch?: typeof fetch };
  };
  /** Puts a raw webhook body on the inbound-messages queue (dedup by `jobId`). */
  enqueueInbound: (job: InboundJob, jobId: string) => Promise<void>;
  /** "Testar a base" (S11); null when the model or the embeddings are not configured. */
  knowledgeTest:
    | ((input: {
        tenantId: string;
        question: string;
        collections?: string[];
      }) => Promise<KnowledgeTestResult>)
    | null;
  /** Starts the ingestion of an approved document version. */
  enqueueIngest: (job: IngestJob, jobId: string) => Promise<void>;
};

export function createDeps(
  env: ApiEnv,
  logger: Logger,
  queues: Pick<AppDeps, 'enqueueInbound' | 'enqueueIngest'>,
): AppDeps {
  const serviceDb = createServiceDb({
    url: env.SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    onTenantViolation: (error) => logger.error({ err: error }, 'tenant scope violation'),
  });
  const pricing = parsePricing(env.LLM_PRICING);
  const embeddings =
    env.EMBEDDINGS_API_KEY && env.EMBEDDINGS_MODEL
      ? createOpenAiEmbeddings({
          apiKey: env.EMBEDDINGS_API_KEY,
          model: env.EMBEDDINGS_MODEL,
          baseUrl: env.EMBEDDINGS_BASE_URL,
        })
      : undefined;
  const knowledgeTest =
    env.ANTHROPIC_API_KEY &&
    env.LLM_MODEL_AGENT &&
    env.LLM_MODEL_FAST &&
    env.LLM_MODEL_VISION &&
    embeddings
      ? (input: { tenantId: string; question: string; collections?: string[] }) =>
          testKnowledge(
            {
              db: serviceDb,
              logger,
              llm: createAnthropicClient({ apiKey: env.ANTHROPIC_API_KEY! }),
              models: {
                agent: env.LLM_MODEL_AGENT!,
                fast: env.LLM_MODEL_FAST!,
                vision: env.LLM_MODEL_VISION!,
              },
              pricing,
              searchKnowledge: createKnowledgeSearch({
                db: serviceDb,
                embeddings,
                pricing,
                logger,
              }),
            },
            input,
          )
      : null;

  return {
    verifyToken: createAuthVerifier({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY }),
    userDb: (accessToken) =>
      createUserClient({ url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY, accessToken }),
    serviceDb,
    webUrl: env.WEB_URL,
    secrets: env.ENCRYPTION_KEY
      ? createSecretBox({ key: env.ENCRYPTION_KEY, previousKey: env.ENCRYPTION_KEY_PREVIOUS })
      : null,
    whatsapp: {
      appSecret: env.WHATSAPP_APP_SECRET,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN,
      graph: { version: env.WHATSAPP_GRAPH_VERSION, baseUrl: env.WHATSAPP_GRAPH_BASE_URL },
    },
    enqueueInbound: queues.enqueueInbound,
    enqueueIngest: queues.enqueueIngest,
    knowledgeTest,
  };
}
