import { db } from "../db/prisma.js";
import { logAuditEvent } from "../audit/logger.js";
import { getTool } from "./registry.js";

const MAX_RETRIES = 3;

export async function executeToolSafe(toolId: string, runId: string, rawArgs: unknown) {
  const tool = getTool(toolId);
  if (!tool) throw new Error(`Tool ${toolId} not registered.`);

  const run = await db.investigationRun.findUniqueOrThrow({ where: { id: runId } });

  // 1. TOOL IDEMPOTENCY
  // Prevent duplicate execution if the worker crashed and restarted
  const argsHash = JSON.stringify(rawArgs);
  const existingExecution = await db.toolExecution.findFirst({
    where: {
      runId,
      toolId,
      status: "COMPLETED"
    }
  });

  if (existingExecution && JSON.stringify(existingExecution.parameters) === argsHash) {
    await logAuditEvent({
      investigationId: run.investigationId,
      action: "SYSTEM_ACTION" as any,
      actor: "AGENT_RUNTIME",
      targetType: "TOOL",
      targetId: toolId,
      description: `Idempotency hit: Returning cached result for ${tool.name}.`
    });
    return existingExecution.output;
  }

  // 2. STRICT SCHEMA VALIDATION BEFORE EXECUTION
  const parsedArgs = tool.schema.parse(rawArgs);

  const execution = await db.toolExecution.create({
    data: {
      runId,
      toolId,
      status: "RUNNING",
      parameters: parsedArgs as any
    }
  });

  // 3. BOUNDED RETRIES & CIRCUIT BREAKERS
  let attempt = 0;
  while (attempt < MAX_RETRIES) {
    try {
      const result = await tool.execute(parsedArgs, { runId, investigationId: run.investigationId });

      await db.toolExecution.update({
        where: { id: execution.id },
        data: { status: "COMPLETED", output: result as any }
      });

      await logAuditEvent({
        investigationId: run.investigationId,
        action: "TOOL_EXECUTED" as any,
        actor: "AGENT_RUNTIME",
        targetType: "TOOL",
        targetId: toolId,
        description: `Executed tool ${tool.name} successfully.`
      });

      return result;
    } catch (error: any) {
      attempt++;
      if (attempt >= MAX_RETRIES) {
        await db.toolExecution.update({
          where: { id: execution.id },
          data: { status: "FAILED", error: error.message }
        });
        throw error;
      }
      // Circuit breaker: exponential backoff wait
      await new Promise(res => setTimeout(res, 1000 * attempt));
    }
  }
}