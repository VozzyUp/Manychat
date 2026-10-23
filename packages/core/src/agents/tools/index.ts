import type { ToolDefinition } from '../types';
import { contactProfileTool } from './contact';
import { handoffTool } from './handoff';
import { replyTool } from './reply';

export { contactProfileTool, handoffTool, replyTool };

/**
 * Tools every agent has. `search_knowledge` joins them in build step 1.8; `create_nonconformity`,
 * `attach_evidence` and `send_template` with the modules that use them.
 */
export const CORE_TOOLS: ToolDefinition[] = [replyTool, handoffTool, contactProfileTool];
