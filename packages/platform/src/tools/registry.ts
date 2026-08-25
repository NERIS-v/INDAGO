import { z } from "zod";

export type ToolDefinition<T extends z.ZodTypeAny> = {
  id: string;
  name: string;
  schema: T;
  execute: (args: z.infer<T>, context: { runId: string, investigationId: string }) => Promise<any>;
};

export const toolRegistry = new Map<string, ToolDefinition<any>>();

export function registerTool<T extends z.ZodTypeAny>(tool: ToolDefinition<T>) {
  toolRegistry.set(tool.id, tool);
}

export function getTool(toolId: string) {
  return toolRegistry.get(toolId);
}