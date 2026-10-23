import type { ToolDefinition } from '../types';
import { contactProfileTool } from './contact';
import { handoffTool } from './handoff';
import { replyTool } from './reply';
import { searchKnowledgeTool } from './search';

export { defineVisionTool } from './vision';
export { contactProfileTool, handoffTool, replyTool, searchKnowledgeTool };

/**
 * Tools every agent has. `create_nonconformity`, `attach_evidence` and `send_template` join them
 * with the modules that use them.
 */
export const CORE_TOOLS: ToolDefinition[] = [
  replyTool,
  handoffTool,
  contactProfileTool,
  searchKnowledgeTool,
];
