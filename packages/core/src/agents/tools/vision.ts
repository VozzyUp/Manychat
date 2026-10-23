import { z } from 'zod';
import { MediaAccessError } from '../media-access';
import { assertHasConfidence, VisionError } from '../../multimodal/vision';
import { defineTool, type ToolDefinition } from '../types';

/**
 * Builds a tool that reads an image the contact sent (thermometer, medical order, …). The model
 * passes the `media_id` it was shown; the tool returns JSON validated by zod, always with a
 * `confidence`. Modules define their own (`read_thermometer`, `read_medical_order`) with this.
 */
export function defineVisionTool<S extends z.ZodType>(definition: {
  name: string;
  description: string;
  /** What the extraction returns. Must contain a required `confidence` (0–1). */
  schema: S;
  /** The tool-specific instruction sent with the image. */
  instruction: string;
}): ToolDefinition {
  assertHasConfidence(definition.schema);
  return defineTool({
    name: definition.name,
    description: definition.description,
    input: z.object({
      media_id: z.uuid().describe('media_id da imagem, como apareceu na conversa'),
    }),
    run: async (args, ctx) => {
      try {
        const data = await ctx.readImage({
          mediaId: args.media_id,
          schema: definition.schema,
          instruction: definition.instruction,
          name: definition.name,
        });
        return { content: { media_id: args.media_id, ...(data as object) } };
      } catch (err) {
        if (err instanceof MediaAccessError || err instanceof VisionError) {
          return { content: { error: err.message } };
        }
        throw err;
      }
    },
    summarize: (args, result) => {
      const confidence = (result.content as { confidence?: unknown }).confidence;
      return `${definition.name}: ${typeof confidence === 'number' ? `confiança ${confidence}` : 'sem leitura'}`;
    },
  });
}
