import { PROVIDER_METADATA } from "../../contracts/providerMetadata";
import { asArray, asRecord, readString } from "../../parsing/helpers";
import { parseClaudeEvent, parseClaudePayload } from "../claude/parser";
import {
  annotateClaudeMessagesForEvent,
  createClaudeIndexingState,
  processClaudeIndexedEvent,
  registerClaudePersistedMessage,
  shouldSkipDuplicateClaudeEvent,
} from "../claude/indexing";
import {
  applyClaudeHookLine,
  applyClaudeTranscriptLine,
  readClaudeHookTranscriptPath,
} from "../claude/live";
import { resolveClaudeTurnFamilySessionIds } from "../claude/query";
import { sanitizeClaudeOversizedJsonlEvent } from "../oversized/claude";
import { defaultTimestampNormalization, sortModels } from "../adapters/shared";
import type { ProviderAdapter } from "../types";

import { discoverClaudeSakaFiles, discoverSingleClaudeSakaFile } from "../../discovery/providers/claudeSaka";

function extractClaudeSakaSourceMetadata(payload: unknown[]) {
  const models = new Set<string>();
  let gitBranch: string | null = null;
  let cwd: string | null = null;

  for (const entry of asArray(payload)) {
    const record = asRecord(entry);
    const message = asRecord(record?.message);
    const model = readString(message?.model);
    if (model) {
      models.add(model);
    }

    gitBranch ??= readString(record?.gitBranch);
    cwd ??= readString(record?.cwd);
  }

  return {
    models: sortModels(models),
    gitBranch,
    cwd,
  };
}

export const claudeSakaAdapter: ProviderAdapter = {
  ...PROVIDER_METADATA["claude-saka"],
  sourceFormat: "jsonl_stream",
  supportsIncrementalCheckpoints: true,
  discoverAll: discoverClaudeSakaFiles,
  discoverOne: discoverSingleClaudeSakaFile,
  sanitizeOversizedJsonlEvent: sanitizeClaudeOversizedJsonlEvent,
  parsePayload: parseClaudePayload,
  parseEvent: parseClaudeEvent,
  extractSourceMetadata: (payload) => extractClaudeSakaSourceMetadata(payload as unknown[]),
  updateSourceMetadataFromEvent: (event, accumulator) => {
    const record = asRecord(event);
    if (!record) {
      return;
    }

    const message = asRecord(record.message);
    const model = readString(message?.model);
    if (model) {
      accumulator.models.add(model);
    }
    accumulator.gitBranch ??= readString(record.gitBranch);
    accumulator.cwd ??= readString(record.cwd);
  },
  normalizeMessageTimestamp: defaultTimestampNormalization,
  createIndexingState: createClaudeIndexingState,
  prepareMessagesForPersistence: ({ eventRecord, processingState, messages }) => ({
    immediateMessages: annotateClaudeMessagesForEvent({
      eventRecord,
      processingState,
      messages,
    }),
    deferredCodexUserMessages: [],
  }),
  processIndexedEvent: processClaudeIndexedEvent,
  registerPersistedMessage: registerClaudePersistedMessage,
  shouldSkipDuplicateEvent: shouldSkipDuplicateClaudeEvent,
  resolveTurnFamilySessionIds: resolveClaudeTurnFamilySessionIds,
  handlesToolEditsNatively: true,
  liveSession: {
    applyTranscriptLine: applyClaudeTranscriptLine,
    applyHookLine: applyClaudeHookLine,
    readHookTranscriptPath: readClaudeHookTranscriptPath,
    transcriptTraceSource: "claude_saka_transcript",
    hookTraceSource: "claude_saka_hook",
  },
};
