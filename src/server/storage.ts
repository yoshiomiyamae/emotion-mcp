import type { Config, Expression } from "../shared/types.js";

/**
 * データの永続化を管理するクラス
 */
export class Storage {
  private configPath: string;
  private expressionsDir: string;

  constructor(private dataDir: string) {
    this.configPath = `${dataDir}/config.json`;
    this.expressionsDir = `${dataDir}/expressions`;
  }

  /**
   * 設定ファイルを読み込む
   */
  async loadConfig(): Promise<Config> {
    try {
      const file = Bun.file(this.configPath);
      if (await file.exists()) {
        return await file.json();
      }
    } catch (e) {
      console.error("Failed to load config:", e);
    }

    // デフォルト設定
    return {
      defaultExpression: "",
      expressions: [],
    };
  }

  /**
   * 設定ファイルを保存
   */
  async saveConfig(config: Config): Promise<void> {
    await Bun.write(this.configPath, JSON.stringify(config, null, 2));
  }

  /**
   * 新しい表情を追加
   */
  async addExpression(expression: Expression): Promise<void> {
    const config = await this.loadConfig();
    config.expressions.push(expression);

    // 最初の表情は自動的にデフォルトにする
    if (!config.defaultExpression) {
      config.defaultExpression = expression.id;
    }

    await this.saveConfig(config);
  }

  /**
   * 表情を更新
   */
  async updateExpression(
    id: string,
    updates: Partial<Expression>
  ): Promise<Expression> {
    const config = await this.loadConfig();
    const index = config.expressions.findIndex((e) => e.id === id);

    if (index === -1) {
      throw new Error("Expression not found");
    }

    config.expressions[index] = {
      ...config.expressions[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveConfig(config);
    return config.expressions[index];
  }

  /**
   * 表情を削除
   */
  async deleteExpression(id: string): Promise<void> {
    const config = await this.loadConfig();
    const expression = config.expressions.find((e) => e.id === id);

    if (expression) {
      // ファイル削除
      try {
        const filePath = `${this.expressionsDir}/${expression.filePath}`;
        await Bun.write(filePath, "");
        // 実際には unlink するべきだが、Bunの標準APIにはないので
        // 代わりに fs を使う
        const fs = await import("fs/promises");
        await fs.unlink(filePath);
      } catch (e) {
        console.error("Failed to delete file:", e);
      }

      // 設定から削除
      config.expressions = config.expressions.filter((e) => e.id !== id);

      // デフォルトだった場合は別の表情をデフォルトにする
      if (config.defaultExpression === id) {
        config.defaultExpression = config.expressions[0]?.id || "";
      }

      await this.saveConfig(config);
    }
  }

  /**
   * 設定を更新（デフォルト表情など）
   */
  async updateConfig(updates: Partial<Config>): Promise<void> {
    const config = await this.loadConfig();
    Object.assign(config, updates);
    await this.saveConfig(config);
  }

  /**
   * 表情名から表情データを取得
   */
  async getExpressionByName(name: string): Promise<Expression | undefined> {
    const config = await this.loadConfig();
    return config.expressions.find((e) => e.name === name);
  }

  /**
   * IDから表情データを取得
   */
  async getExpressionById(id: string): Promise<Expression | undefined> {
    const config = await this.loadConfig();
    return config.expressions.find((e) => e.id === id);
  }

  /**
   * デフォルト表情を取得
   */
  async getDefaultExpression(): Promise<Expression | undefined> {
    const config = await this.loadConfig();
    if (!config.defaultExpression) {
      return undefined;
    }
    return this.getExpressionById(config.defaultExpression);
  }
}
