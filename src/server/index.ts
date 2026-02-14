import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { spawn } from "bun";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { Storage } from "./storage.js";
import type { ChangeExpressionParams, TransitionType } from "../shared/types.js";

// プロジェクトルートのパスを取得（絶対パス）
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "../..");
const dataDir = join(projectRoot, "data");

const storage = new Storage(dataDir);

// HTTPサーバーのポート番号（環境変数から取得、デフォルトは3000）
const HTTP_PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

/**
 * HTTPサーバーが既に起動しているかチェック
 */
async function isHttpServerRunning(port: number): Promise<boolean> {
  try {
    const response = await fetch(`http://localhost:${port}/api/health`, {
      method: "GET",
    });
    return response.ok;
  } catch {
    return false;
  }
}

// HTTPサーバーを子プロセスとして起動（既に起動していない場合のみ）
let httpServer: ReturnType<typeof spawn> | null = null;

async function startHttpServerIfNeeded() {
  const isRunning = await isHttpServerRunning(HTTP_PORT);

  if (isRunning) {
    console.error(`HTTP server already running on port ${HTTP_PORT}, reusing existing server`);
    return;
  }

  console.error(`Starting HTTP server on port ${HTTP_PORT}...`);
  const httpServerPath = fileURLToPath(new URL("./http-server.ts", import.meta.url));
  httpServer = spawn({
    cmd: [process.execPath, "run", httpServerPath],
    cwd: process.cwd(),
    stdout: "ignore", // stdioをMCPプロトコルで使うため、子プロセスの出力は無視
    stderr: "ignore", // エラーもstdioに混ざらないように無視
    env: {
      ...process.env,
      PORT: HTTP_PORT.toString(),
    },
  });

  // HTTPサーバーを親プロセスから切り離す
  // Claude Codeは設定キャッシュ用に一時的にMCPサーバーを起動→終了するため、
  // 親プロセスの終了でHTTPサーバーをkillすると、
  // 後続のMCPサーバーインスタンスがHTTPサーバーを失う
  httpServer.unref();

  // HTTPサーバーの起動を待つ
  await waitForHttpServer(HTTP_PORT);
}

/**
 * HTTPサーバーが応答可能になるまで待つ
 */
async function waitForHttpServer(port: number, maxRetries = 10): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    if (await isHttpServerRunning(port)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

/**
 * HTTPサーバーにMCPインスタンスを登録
 */
async function registerMcpInstance(): Promise<void> {
  try {
    await fetch(`http://localhost:${HTTP_PORT}/api/mcp/register`, { method: "POST" });
  } catch {
    // HTTPサーバーがまだ起動していない場合は無視
  }
}

/**
 * HTTPサーバーからMCPインスタンスを解除
 */
async function unregisterMcpInstance(): Promise<void> {
  try {
    await fetch(`http://localhost:${HTTP_PORT}/api/mcp/unregister`, { method: "POST" });
  } catch {
    // HTTPサーバーが既に終了している場合は無視
  }
}

// HTTPサーバーを起動（非同期）
await startHttpServerIfNeeded();

// HTTPサーバーにこのMCPインスタンスを登録
await registerMcpInstance();

// プロセス終了時にHTTPサーバーから登録解除
// beforeExitは非同期処理を追加するとイベントループが空にならず再発火するため、
// ガードフラグで無限ループを防止する
let hasUnregistered = false;

async function cleanupAndUnregister(): Promise<void> {
  if (hasUnregistered) return;
  hasUnregistered = true;
  await unregisterMcpInstance();
}

process.on("beforeExit", async () => {
  await cleanupAndUnregister();
});

process.on("SIGINT", async () => {
  await cleanupAndUnregister();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await cleanupAndUnregister();
  process.exit(0);
});

// HTTPサーバーに2D表情変更を通知
async function notifyExpressionChange(
  expressionName: string,
  transition: TransitionType,
  duration: number
) {
  try {
    const expression = await storage.getExpressionByName(expressionName);
    if (!expression) {
      throw new Error(`Expression "${expressionName}" not found`);
    }

    await fetch(`http://localhost:${HTTP_PORT}/api/notify-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "2d", expression, transition, duration }),
    });
  } catch (e) {
    console.error("Failed to notify expression change:", e);
  }
}

// HTTPサーバーにVRM表情変更を通知
async function notifyVrmExpressionChange(
  presetName: string,
  transition: TransitionType,
  duration: number
) {
  try {
    const preset = await storage.getVrmPresetByName(presetName);
    if (!preset) {
      throw new Error(`VRM preset "${presetName}" not found`);
    }

    await fetch(`http://localhost:${HTTP_PORT}/api/notify-change`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "vrm", preset, transition, duration }),
    });
  } catch (e) {
    console.error("Failed to notify VRM expression change:", e);
  }
}

const server = new Server(
  {
    name: "emotion-mcp",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// ツール一覧の提供
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "list_expressions",
        description: "利用可能な表情の一覧を取得します",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "change_expression",
        description:
          "立ち絵の表情を変更します。現在の心境に合った表情とトランジション効果を指定してください。",
        inputSchema: {
          type: "object",
          properties: {
            expression: {
              type: "string",
              description:
                "表情名（例: normal, embarrassed, angry, happy, surprised, sad）",
            },
            transition: {
              type: "string",
              enum: ["fade", "quick-fade", "slide", "zoom", "shake", "instant"],
              description: "トランジション効果（省略時: fade）",
              default: "fade",
            },
            duration: {
              type: "number",
              description: "トランジション時間（ミリ秒、省略時: 300）",
              default: 300,
            },
          },
          required: ["expression"],
        },
      },
      {
        name: "get_current_expression",
        description: "現在表示されている表情を取得します",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
    ],
  };
});

// ツール実行
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case "list_expressions": {
      const config = await storage.loadConfig();

      if (config.mode === "vrm") {
        // VRMモード: プリセット一覧を返す
        const vrmConfig = await storage.loadVrmConfig();
        const presetList = vrmConfig.presets.map((p) => ({
          name: p.name,
          displayName: p.displayName,
          isDefault: p.id === vrmConfig.defaultPreset,
        }));

        return {
          content: [
            {
              type: "text",
              text: `利用可能な表情（VRMモード）:\n${presetList
                .map(
                  (p) =>
                    `- ${p.name}${p.displayName !== p.name ? ` (${p.displayName})` : ""}${p.isDefault ? " [デフォルト]" : ""}`
                )
                .join("\n")}`,
            },
          ],
        };
      }

      // 2Dモード: 既存の画像表情一覧
      const expressionList = config.expressions.map((e) => ({
        name: e.name,
        displayName: e.displayName,
        isDefault: e.id === config.defaultExpression,
      }));

      return {
        content: [
          {
            type: "text",
            text: `利用可能な表情:\n${expressionList
              .map(
                (e) =>
                  `- ${e.name}${e.displayName !== e.name ? ` (${e.displayName})` : ""}${e.isDefault ? " [デフォルト]" : ""}`
              )
              .join("\n")}`,
          },
        ],
      };
    }

    case "change_expression": {
      const { expression, transition = "fade", duration = 300 } =
        args as unknown as ChangeExpressionParams;

      const config = await storage.loadConfig();

      if (config.mode === "vrm") {
        // VRMモード: プリセット名で検索
        const preset = await storage.getVrmPresetByName(expression);
        if (!preset) {
          return {
            content: [
              {
                type: "text",
                text: `エラー: 表情 "${expression}" が見つかりません。list_expressions ツールで利用可能な表情を確認してください。`,
              },
            ],
            isError: true,
          };
        }

        await notifyVrmExpressionChange(expression, transition, duration);

        return {
          content: [
            {
              type: "text",
              text: `表情を「${preset.displayName}」に変更しました（トランジション: ${transition}, ${duration}ms）`,
            },
          ],
        };
      }

      // 2Dモード: 既存の画像切り替え
      const expr = await storage.getExpressionByName(expression);
      if (!expr) {
        return {
          content: [
            {
              type: "text",
              text: `エラー: 表情 "${expression}" が見つかりません。list_expressions ツールで利用可能な表情を確認してください。`,
            },
          ],
          isError: true,
        };
      }

      await notifyExpressionChange(expression, transition, duration);

      return {
        content: [
          {
            type: "text",
            text: `表情を「${expr.displayName}」に変更しました（トランジション: ${transition}, ${duration}ms）`,
          },
        ],
      };
    }

    case "get_current_expression": {
      const config = await storage.loadConfig();

      if (config.mode === "vrm") {
        const defaultPreset = await storage.getDefaultVrmPreset();
        if (!defaultPreset) {
          return {
            content: [
              {
                type: "text",
                text: "現在、表情が設定されていません。",
              },
            ],
          };
        }

        return {
          content: [
            {
              type: "text",
              text: `現在の表情: ${defaultPreset.name} (${defaultPreset.displayName})`,
            },
          ],
        };
      }

      const defaultExpr = await storage.getDefaultExpression();
      if (!defaultExpr) {
        return {
          content: [
            {
              type: "text",
              text: "現在、表情が設定されていません。",
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `現在の表情: ${defaultExpr.name} (${defaultExpr.displayName})`,
          },
        ],
      };
    }

    default:
      return {
        content: [
          {
            type: "text",
            text: `Unknown tool: ${name}`,
          },
        ],
        isError: true,
      };
  }
});

// サーバー起動
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Emotion MCP server running on stdio");
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
