import { serve, type ServerWebSocket } from "bun";
import open from "open";
import { Storage } from "./storage.js";
import type {
  Expression,
  ExpressionChangeEvent,
  TransitionType,
} from "../shared/types.js";

const storage = new Storage("./data");

// WebSocket接続管理
const clients = new Set<ServerWebSocket<unknown>>();

/**
 * 表情変更をすべてのクライアントに通知
 */
export function broadcastExpressionChange(
  expression: Expression,
  transition: TransitionType = "fade",
  duration: number = 300
) {
  const event: ExpressionChangeEvent = {
    type: "expression-change",
    data: {
      expression,
      transition,
      duration,
    },
  };

  const message = JSON.stringify(event);
  clients.forEach((client) => {
    client.send(message);
  });
}

const server = serve({
  port: 3000,
  async fetch(req, server) {
    const url = new URL(req.url);

    // WebSocketアップグレード
    if (req.headers.get("upgrade") === "websocket") {
      const upgraded = server.upgrade(req);
      if (!upgraded) {
        return new Response("WebSocket upgrade failed", { status: 500 });
      }
      return undefined;
    }

    // CORS対応
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 静的ファイル配信
    if (url.pathname === "/" || url.pathname === "/admin") {
      const file = Bun.file("./src/client/admin/index.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    if (url.pathname === "/viewer") {
      const file = Bun.file("./src/client/viewer/index.html");
      return new Response(file, {
        headers: { "Content-Type": "text/html", ...corsHeaders },
      });
    }

    // 静的ファイル配信（CSS, JS）
    if (url.pathname.startsWith("/admin/") || url.pathname.startsWith("/viewer/")) {
      const basePath = url.pathname.startsWith("/admin/") ? "admin" : "viewer";
      const fileName = url.pathname.replace(`/${basePath}/`, "");
      const file = Bun.file(`./src/client/${basePath}/${fileName}`);

      if (await file.exists()) {
        // Content-Typeを判定
        let contentType = "text/plain";
        if (fileName.endsWith(".css")) {
          contentType = "text/css";
        } else if (fileName.endsWith(".js")) {
          contentType = "application/javascript";
        } else if (fileName.endsWith(".html")) {
          contentType = "text/html";
        }

        return new Response(file, {
          headers: { "Content-Type": contentType, ...corsHeaders },
        });
      }
    }

    // 画像配信
    if (url.pathname.startsWith("/expressions/")) {
      const fileName = url.pathname.replace("/expressions/", "");
      const file = Bun.file(`./data/expressions/${fileName}`);
      if (await file.exists()) {
        return new Response(file, { headers: corsHeaders });
      }
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    // API: 表情一覧取得
    if (url.pathname === "/api/expressions" && req.method === "GET") {
      const config = await storage.loadConfig();
      return Response.json(config.expressions, { headers: corsHeaders });
    }

    // API: 新しい表情追加（画像アップロード）
    if (url.pathname === "/api/expressions" && req.method === "POST") {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;
        const name = formData.get("name") as string;
        const displayName = formData.get("displayName") as string;

        if (!file || !name) {
          return Response.json(
            { error: "Missing required fields: file and name" },
            { status: 400, headers: corsHeaders }
          );
        }

        // ファイル保存
        const id = crypto.randomUUID();
        const ext = file.name.split(".").pop();
        const fileName = `${id}.${ext}`;
        const filePath = `./data/expressions/${fileName}`;

        await Bun.write(filePath, file);

        // 設定に追加
        const expression: Expression = {
          id,
          name,
          displayName: displayName || name,
          filePath: fileName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        await storage.addExpression(expression);

        return Response.json(expression, { status: 201, headers: corsHeaders });
      } catch (e) {
        console.error("Upload error:", e);
        return Response.json(
          { error: "Upload failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: 表情更新
    if (url.pathname.match(/^\/api\/expressions\/[^/]+$/) && req.method === "PUT") {
      const id = url.pathname.split("/").pop()!;
      try {
        const body = await req.json();
        const updated = await storage.updateExpression(id, body);
        return Response.json(updated, { headers: corsHeaders });
      } catch (e) {
        console.error("Update error:", e);
        return Response.json(
          { error: "Update failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: 表情削除
    if (url.pathname.match(/^\/api\/expressions\/[^/]+$/) && req.method === "DELETE") {
      const id = url.pathname.split("/").pop()!;
      try {
        await storage.deleteExpression(id);
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        console.error("Delete error:", e);
        return Response.json(
          { error: "Delete failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: 設定取得
    if (url.pathname === "/api/config" && req.method === "GET") {
      const config = await storage.loadConfig();
      return Response.json(config, { headers: corsHeaders });
    }

    // API: 設定更新
    if (url.pathname === "/api/config" && req.method === "PUT") {
      try {
        const body = await req.json();
        await storage.updateConfig(body);
        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        console.error("Config update error:", e);
        return Response.json(
          { error: "Config update failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // API: 表情変更通知（MCPサーバーから呼ばれる）
    if (url.pathname === "/api/notify-change" && req.method === "POST") {
      try {
        const body = await req.json();
        const { expression, transition, duration } = body;

        // WebSocketクライアントに通知
        broadcastExpressionChange(expression, transition, duration);

        return Response.json({ success: true }, { headers: corsHeaders });
      } catch (e) {
        console.error("Notify change error:", e);
        return Response.json(
          { error: "Notify failed" },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },

  websocket: {
    open(ws) {
      clients.add(ws);
      console.log("WebSocket client connected. Total clients:", clients.size);
    },
    message(ws, message) {
      console.log("Received message from client:", message);
    },
    close(ws) {
      clients.delete(ws);
      console.log("WebSocket client disconnected. Total clients:", clients.size);
    },
  },
});

console.log(`
🎭 Emotion MCP Server started!

📍 Admin UI:  http://localhost:3000/admin
👁️  Viewer:    http://localhost:3000/viewer
🔌 WebSocket: ws://localhost:3000

Press Ctrl+C to stop
`);

// 環境変数で自動オープンを制御（デフォルトは有効）
const autoOpen = process.env.AUTO_OPEN_VIEWER !== "false";

if (autoOpen) {
  // 少し遅延させてからブラウザを開く（サーバーが完全に起動するまで待つ）
  setTimeout(async () => {
    try {
      console.log("Opening viewer in browser...");
      await open("http://localhost:3000/viewer");
    } catch (error) {
      console.error("Failed to open browser:", error);
      console.log("Please manually open: http://localhost:3000/viewer");
    }
  }, 500);
}
