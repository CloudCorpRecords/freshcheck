/**
 * freshcheck MCP server. Tools: assess_freshness.
 *
 * Why the low-level Server instead of McpServer: the high-level
 * helper converts zod schemas to JSON Schema and injects keys
 * not in this tool's defined spec ("$schema" and
 * "additionalProperties"), which breaks exact tool-list/schema
 * parity with the spec. This file serves tools/list with the
 * spec's exact input schema as an explicit literal, and every
 * tools/call is validated by the core, which names the
 * offending path on invalid input.
 *
 * The assessment is pure local computation: no upstream API,
 * no authentication, no configuration.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { assessFreshness, formatPayload, VERSION } from "./freshcheck.js";

const TOOLS = [
  {
    name: "assess_freshness",
    description:
      "Assess how stale a dependency tree is: each dependency's behind level from version comparison, grouped by risk — abandoned, major, minor, patch, current.",
    inputSchema: {
      type: "object" as const,
      properties: {
        dependencies: {
          type: "array",
          description: "Dependencies to assess (at least one)",
          minItems: 1,
          items: {
            type: "object",
            properties: {
              name: {
                type: "string",
                description: "Dependency name (unique across the set)",
              },
              current: {
                type: "string",
                description: "Installed version, strict MAJOR.MINOR.PATCH semver",
              },
              latest: {
                type: "string",
                description: "Latest available version, strict MAJOR.MINOR.PATCH semver",
              },
              archived: {
                type: "boolean",
                description:
                  "True when the dependency's repository is archived (optional, default false)",
              },
              days_since_last_release: {
                type: "integer",
                description:
                  "Whole days since the dependency's most recent release of any version (optional)",
              },
            },
            required: ["name", "current", "latest"],
          },
        },
        abandoned_days: {
          type: "integer",
          description:
            "A dependency counts as abandoned at this many days without a release (optional, default 730)",
        },
      },
      required: ["dependencies"],
    },
  },
];

function textResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof value === "string" ? value : JSON.stringify(value, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  return {
    content: [
      { type: "text" as const, text: err instanceof Error ? err.message : String(err) },
    ],
    isError: true,
  };
}

const server = new Server(
  { name: "freshcheck", version: VERSION },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let out: unknown;
    if (name === "assess_freshness") {
      const raw = (args ?? {}) as Record<string, unknown>;
      out = assessFreshness(raw.dependencies, raw.abandoned_days);
    } else {
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
    return textResult(formatPayload(out));
  } catch (err) {
    if (err instanceof McpError) throw err;
    return errorResult(err);
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

void main();
