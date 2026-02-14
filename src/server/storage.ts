import type { Config, Expression, VrmConfig, VrmExpressionPreset } from "../shared/types.js";

/**
 * データの永続化を管理するクラス
 */
export class Storage {
  private configPath: string;
  private expressionsDir: string;
  private vrmDir: string;
  private vrmConfigPath: string;

  constructor(private dataDir: string) {
    this.configPath = `${dataDir}/config.json`;
    this.expressionsDir = `${dataDir}/expressions`;
    this.vrmDir = `${dataDir}/vrm`;
    this.vrmConfigPath = `${dataDir}/vrm-config.json`;
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
      mode: "2d",
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

  // ===== VRM関連メソッド =====

  /**
   * VRM設定を読み込む
   */
  async loadVrmConfig(): Promise<VrmConfig> {
    try {
      const file = Bun.file(this.vrmConfigPath);
      if (await file.exists()) {
        return await file.json();
      }
    } catch (e) {
      console.error("Failed to load VRM config:", e);
    }

    return {
      modelFileName: "",
      presets: [],
      defaultPreset: "",
    };
  }

  /**
   * VRM設定を保存
   */
  async saveVrmConfig(config: VrmConfig): Promise<void> {
    await Bun.write(this.vrmConfigPath, JSON.stringify(config, null, 2));
  }

  /**
   * VRMモデルファイルを保存
   */
  async saveVrmModel(file: File): Promise<string> {
    // vrmディレクトリを確保
    const fs = await import("fs/promises");
    await fs.mkdir(this.vrmDir, { recursive: true });

    const fileName = `model.vrm`;
    const filePath = `${this.vrmDir}/${fileName}`;
    await Bun.write(filePath, file);

    // VRM設定を更新
    const config = await this.loadVrmConfig();
    config.modelFileName = fileName;
    await this.saveVrmConfig(config);

    return fileName;
  }

  /**
   * VRMモデルファイルのパスを取得
   */
  getVrmModelPath(fileName: string): string {
    return `${this.vrmDir}/${fileName}`;
  }

  /**
   * VRMプリセットを追加
   */
  async addVrmPreset(preset: VrmExpressionPreset): Promise<void> {
    const config = await this.loadVrmConfig();
    config.presets.push(preset);

    if (!config.defaultPreset) {
      config.defaultPreset = preset.id;
    }

    await this.saveVrmConfig(config);
  }

  /**
   * VRMプリセットを更新
   */
  async updateVrmPreset(
    id: string,
    updates: Partial<VrmExpressionPreset>
  ): Promise<VrmExpressionPreset> {
    const config = await this.loadVrmConfig();
    const index = config.presets.findIndex((p) => p.id === id);

    if (index === -1) {
      throw new Error("VRM preset not found");
    }

    config.presets[index] = {
      ...config.presets[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    await this.saveVrmConfig(config);
    return config.presets[index];
  }

  /**
   * VRMプリセットを削除
   */
  async deleteVrmPreset(id: string): Promise<void> {
    const config = await this.loadVrmConfig();
    config.presets = config.presets.filter((p) => p.id !== id);

    if (config.defaultPreset === id) {
      config.defaultPreset = config.presets[0]?.id || "";
    }

    await this.saveVrmConfig(config);
  }

  /**
   * プリセット名からVRMプリセットを取得
   */
  async getVrmPresetByName(name: string): Promise<VrmExpressionPreset | undefined> {
    const config = await this.loadVrmConfig();
    return config.presets.find((p) => p.name === name);
  }

  /**
   * IDからVRMプリセットを取得
   */
  async getVrmPresetById(id: string): Promise<VrmExpressionPreset | undefined> {
    const config = await this.loadVrmConfig();
    return config.presets.find((p) => p.id === id);
  }

  /**
   * デフォルトVRMプリセットを取得
   */
  async getDefaultVrmPreset(): Promise<VrmExpressionPreset | undefined> {
    const config = await this.loadVrmConfig();
    if (!config.defaultPreset) {
      return undefined;
    }
    return this.getVrmPresetById(config.defaultPreset);
  }

  /**
   * VRMファイルからブレンドシェイプ一覧を抽出
   * VRMはglTF+JSON形式なので、バイナリからJSONチャンクを解析する
   */
  async extractBlendShapeNames(): Promise<string[]> {
    const config = await this.loadVrmConfig();
    if (!config.modelFileName) return [];

    const filePath = this.getVrmModelPath(config.modelFileName);
    const file = Bun.file(filePath);
    if (!(await file.exists())) return [];

    try {
      const buffer = await file.arrayBuffer();
      const dataView = new DataView(buffer);

      // glTFバイナリヘッダー: magic(4) + version(4) + length(4)
      // チャンク0: length(4) + type(4) + JSON data
      const jsonChunkLength = dataView.getUint32(12, true);
      const jsonChunkType = dataView.getUint32(16, true);

      // type == 0x4E4F534A ("JSON" in little-endian)
      if (jsonChunkType !== 0x4E4F534A) return [];

      const jsonBytes = new Uint8Array(buffer, 20, jsonChunkLength);
      const jsonText = new TextDecoder().decode(jsonBytes);
      const gltf = JSON.parse(jsonText);

      const names: string[] = [];

      // VRM 1.0 形式
      const vrm1 = gltf.extensions?.VRMC_vrm;
      if (vrm1?.expressions?.preset) {
        for (const key of Object.keys(vrm1.expressions.preset)) {
          names.push(key);
        }
      }
      if (vrm1?.expressions?.custom) {
        for (const key of Object.keys(vrm1.expressions.custom)) {
          names.push(key);
        }
      }

      // VRM 0.x 形式
      const vrm0 = gltf.extensions?.VRM;
      if (vrm0?.blendShapeMaster?.blendShapeGroups) {
        for (const group of vrm0.blendShapeMaster.blendShapeGroups) {
          if (group.presetName && group.presetName !== "unknown") {
            names.push(group.presetName);
          } else if (group.name) {
            names.push(group.name);
          }
        }
      }

      return names;
    } catch (e) {
      console.error("Failed to extract blend shapes from VRM:", e);
      return [];
    }
  }
}
