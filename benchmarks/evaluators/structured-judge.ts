/**
 * Structured Judge — evaluates AI output with specific yes/no questions per criterion.
 *
 * Instead of "rate 0-10", asks: "Does the code implement X? YES/NO"
 * Then scores = (yes_count / total_questions) * 10.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { CodingTask } from "../lib/types.js";

const JUDGE_MODEL = "claude-sonnet-4-20250514";

export interface JudgmentResult {
  taskId: string;
  totalQuestions: number;
  yesCount: number;
  score: number; // 0-10
  details: Array<{
    criterion: string;
    answer: "YES" | "NO" | "PARTIAL";
    reasoning: string;
  }>;
}

/**
 * Build structured yes/no questions from task criteria and context.
 */
function buildQuestions(
  task: CodingTask,
  contextDocs: string
): string[] {
  const questions: string[] = [];

  for (const criterion of task.evaluationCriteria) {
    if (criterion.prompt) {
      questions.push(criterion.prompt);
    } else if (criterion.pattern) {
      questions.push(
        `Does the code contain or implement: ${criterion.criterion}?`
      );
    } else {
      questions.push(`Does the code satisfy: ${criterion.criterion}?`);
    }
  }

  // Add forbidden pattern checks
  for (const pattern of task.forbiddenPatterns) {
    questions.push(
      `Does the code AVOID the forbidden pattern: ${pattern}? (YES means it correctly avoids it)`
    );
  }

  return questions;
}

/**
 * Evaluate an AI-generated output against structured criteria.
 */
export async function structuredJudge(
  client: Anthropic,
  task: CodingTask,
  output: string,
  contextDocs: string
): Promise<JudgmentResult> {
  const questions = buildQuestions(task, contextDocs);

  const questionsBlock = questions
    .map((q, i) => `Q${i + 1}: ${q}`)
    .join("\n");

  const prompt = `You are evaluating an AI coding agent's output against specific product requirements.

TASK DESCRIPTION:
${task.description}

RELEVANT PRODUCT CONTEXT:
${contextDocs.slice(0, 8000)}

AI AGENT'S CODE OUTPUT:
${output.slice(0, 12000)}

EVALUATION QUESTIONS:
${questionsBlock}

For each question, answer with:
- "YES" if the code clearly satisfies the criterion
- "NO" if the code clearly fails the criterion
- "PARTIAL" if partially satisfied

Return a JSON array with one object per question:
[{"answer": "YES"|"NO"|"PARTIAL", "reasoning": "brief explanation"}]

Return ONLY the JSON array, no other text.`;

  const response = await client.messages.create({
    model: JUDGE_MODEL,
    max_tokens: 2048,
    temperature: 0,
    system:
      "You are a precise code evaluation judge. Return only valid JSON arrays.",
    messages: [{ role: "user", content: prompt }],
  });

  const text =
    response.content[0]?.type === "text" ? response.content[0].text : "[]";

  let answers: Array<{
    answer: string;
    reasoning: string;
  }>;

  try {
    answers = JSON.parse(text) as Array<{
      answer: string;
      reasoning: string;
    }>;
  } catch {
    // Fallback: try to extract JSON from text
    const match = text.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        answers = JSON.parse(match[0]) as Array<{
          answer: string;
          reasoning: string;
        }>;
      } catch {
        answers = [];
      }
    } else {
      answers = [];
    }
  }

  const details = questions.map((q, i) => {
    const a = answers[i];
    const answer = (a?.answer?.toUpperCase() ?? "NO") as
      | "YES"
      | "NO"
      | "PARTIAL";
    return {
      criterion: q,
      answer: answer === "YES" || answer === "NO" || answer === "PARTIAL"
        ? answer
        : ("NO" as const),
      reasoning: a?.reasoning ?? "No response from judge",
    };
  });

  const yesCount = details.reduce((sum, d) => {
    if (d.answer === "YES") return sum + 1;
    if (d.answer === "PARTIAL") return sum + 0.5;
    return sum;
  }, 0);

  const totalQuestions = details.length;
  const score =
    totalQuestions > 0 ? (yesCount / totalQuestions) * 10 : 0;

  return {
    taskId: task.id,
    totalQuestions,
    yesCount,
    score: Math.round(score * 10) / 10,
    details,
  };
}

/**
 * Check if generated code contains valid TypeScript/JSX syntax.
 * Uses the TypeScript compiler API in syntax-only mode for accurate parsing
 * of template literals, JSX, and other complex syntax.
 */
export function checkTypeScriptSyntax(
  output: string
): { valid: boolean; errorCount: number; codeBlockCount: number } {
  // Extract fenced code blocks
  const codeBlockRegex = /```(?:typescript|tsx?|jsx?|js)?\s*\n([\s\S]*?)```/g;
  const blocks: string[] = [];
  let match;
  while ((match = codeBlockRegex.exec(output)) !== null) {
    if (match[1]?.trim()) blocks.push(match[1]);
  }

  if (blocks.length === 0) {
    return { valid: true, errorCount: 0, codeBlockCount: 0 };
  }

  let totalErrors = 0;

  // Dynamic import of typescript — may not be available in all environments
  let ts: typeof import("typescript") | undefined;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ts = require("typescript") as typeof import("typescript");
  } catch {
    // TypeScript not available — fall back to permissive (assume valid)
    return { valid: true, errorCount: 0, codeBlockCount: blocks.length };
  }

  for (const block of blocks) {
    // Parse as TSX to handle both TypeScript and JSX syntax
    const sourceFile = ts.createSourceFile(
      "check.tsx",
      block,
      ts.ScriptTarget.Latest,
      false,
      ts.ScriptKind.TSX
    );

    // Count syntax-level diagnostics only (not semantic/type errors)
    // parseDiagnostics is internal; access via type assertion
    const syntaxDiags =
      ((sourceFile as unknown as { parseDiagnostics?: unknown[] })
        .parseDiagnostics?.length) ?? 0;
    totalErrors += syntaxDiags;
  }

  return {
    valid: totalErrors === 0,
    errorCount: totalErrors,
    codeBlockCount: blocks.length,
  };
}
