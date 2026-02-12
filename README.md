# 🎭 Emotion MCP

AIアシスタントが自分の感情に合わせて立ち絵を切り替えられるMCP (Model Context Protocol) サーバーです。

## 特徴

- 🖼️ **立ち絵管理**: WebUIで簡単に立ち絵をアップロード・管理
- 🎨 **多彩なトランジション**: フェード、スライド、ズーム、シェイクなど6種類のエフェクト
- ⚡ **リアルタイム更新**: WebSocketで即座に表情が切り替わる
- 🚀 **高速動作**: Bunを使用した爆速起動・実行

## アーキテクチャ

```
┌─────────────────┐
│  Claude Code    │ AIが表情を選択
│  (AI Assistant) │ change_expression("embarrassed", "fade")
└────────┬────────┘
         │ MCP Protocol (stdio)
┌────────▼────────┐
│   MCP Server    │ ツール実装
│  (TypeScript)   │ list_expressions, change_expression
└────────┬────────┘
         │ HTTP API
┌────────▼────────┐
│   HTTP Server   │ WebSocket経由でクライアントに通知
│  (Bun)          │
└────┬───────┬────┘
     │       │
┌────▼────┐ ┌▼─────────┐
│ Admin   │ │ Viewer   │
│ UI      │ │          │
└─────────┘ └──────────┘
```

## セットアップ

### 1. 依存関係のインストール

```bash
bun install
```

### 2. MCPサーバーの設定

使用する環境に応じて、以下のいずれかの設定ファイルに追加してください。

#### Claude Code（CLI / VSCode拡張）

**設定ファイル**: `~/.claude.json`

```json
{
  "mcpServers": {
    "emotion-mcp": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/emotion-mcp/src/server/index.ts"]
    }
  }
}
```

**例（WSL環境）:**
```json
{
  "mcpServers": {
    "emotion-mcp": {
      "command": "bun",
      "args": ["run", "/home/yoshio/repos/emotion-mcp/src/server/index.ts"]
    }
  }
}
```

#### Claude Desktop

**設定ファイルの場所:**
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "emotion-mcp": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/emotion-mcp/src/server/index.ts"]
    }
  }
}
```

※ `/absolute/path/to/emotion-mcp` は実際のパスに置き換えてください

### 3. Claude Code / Claude Desktopの起動

設定を反映するため、Claude Code（VSCode）またはClaude Desktopを起動（または再起動）します。

MCPサーバーが起動すると：
- ✅ HTTPサーバーが自動的にポート3000で起動
- ✅ Viewerが自動的にブラウザで開く

手動でアクセスする場合は以下のURL：

- 管理UI: http://localhost:3000/admin
- Viewer: http://localhost:3000/viewer

**💡 Tips:**

- **Viewerの自動オープンを無効化:**
  ```bash
  AUTO_OPEN_VIEWER=false
  ```

- **ポート番号を変更:**
  ```json
  {
    "mcpServers": {
      "emotion-mcp": {
        "command": "bun",
        "args": ["run", "/absolute/path/to/emotion-mcp/src/server/index.ts"],
        "env": {
          "PORT": "8080"
        }
      }
    }
  }
  ```
  デフォルトは3000。変更した場合は `http://localhost:8080/admin` でアクセス。

### 4. 立ち絵の登録

1. http://localhost:3000/admin にアクセス
2. 画像をドラッグ&ドロップまたはクリックしてアップロード
3. 表情名（英数字）と表示名を入力
4. デフォルト表情を設定

## 使い方

### 管理UI

- **アップロード**: ドラッグ&ドロップまたはクリックで画像を追加
- **デフォルト設定**: 初期表示する表情を選択
- **削除**: 不要な表情を削除

### AIから表情を変更

Claude Codeとの会話中に、AIが自動的に表情を変更します：

```
AI: べ、別にあんたのために説明したわけじゃないんだからね！
    [change_expression("embarrassed", "quick-fade")]
```

### 利用可能なツール

#### `list_expressions`

登録されている表情の一覧を取得します。

```typescript
// 使用例
list_expressions()
```

#### `change_expression`

表情を変更します。

```typescript
// 使用例
change_expression({
  expression: "embarrassed",  // 表情名
  transition: "fade",          // トランジション（省略可）
  duration: 300                // 時間（ms、省略可）
})
```

**利用可能なトランジション:**

- `fade`: 通常のフェード（デフォルト）
- `quick-fade`: 素早いフェード
- `slide`: スライドイン
- `zoom`: ズームイン
- `shake`: シェイク（動揺）
- `instant`: 即座に切り替え

## 推奨される表情名

AIが理解しやすい表情名の例：

- `normal`: 通常
- `happy`: 嬉しい
- `sad`: 悲しい
- `angry`: 怒り
- `embarrassed`: 照れ
- `surprised`: 驚き
- `worried`: 心配
- `thinking`: 考え中
- `confident`: 自信満々

## トラブルシューティング

### Viewerが自動で開かない

HTTPサーバー起動時に自動でViewerが開かない場合：

1. 手動で http://localhost:3000/viewer を開く
2. ブラウザが見つからないエラーが出る場合は、環境変数で無効化して手動で開く：
   ```bash
   AUTO_OPEN_VIEWER=false bun run dev:http
   ```

### WebSocketに接続できない

1. HTTPサーバーが起動しているか確認
2. ブラウザのコンソールでエラーを確認
3. ポート3000が他のアプリケーションで使用されていないか確認

### MCPツールが表示されない

1. Claude Desktopの設定ファイルのパスが正しいか確認
2. Claude Desktopを再起動
3. MCPサーバーのログを確認（stderr出力）

### 表情が切り替わらない

1. Viewerページを開いているか確認
2. WebSocketの接続状態を確認（右上の緑色のインジケーター）
3. ブラウザのコンソールでエラーを確認

## 開発

### プロジェクト構造

```
emotion-mcp/
├── src/
│   ├── server/           # バックエンド
│   │   ├── index.ts      # MCPサーバー
│   │   ├── http-server.ts # HTTPサーバー
│   │   └── storage.ts    # データ永続化
│   ├── client/           # フロントエンド
│   │   ├── admin/        # 管理UI
│   │   └── viewer/       # 表示用クライアント
│   └── shared/           # 共通型定義
├── data/                 # データディレクトリ
│   ├── config.json       # 設定
│   └── expressions/      # 立ち絵画像
└── package.json
```

### スクリプト

```bash
# HTTPサーバー起動（開発用）
bun run dev:http

# MCPサーバー起動（テスト用）
bun run dev

# ビルド
bun run build
```

## ライセンス

MIT

## 作者

Created with ❤️ by Claude Code & You
