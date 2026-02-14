/**
 * 表示モード
 */
export type DisplayMode = "2d" | "vrm";

/**
 * 表情データ（2D画像用）
 */
export interface Expression {
  /** 一意なID */
  id: string;
  /** 表情名（AIが指定する際に使用） */
  name: string;
  /** 表示名（UI表示用） */
  displayName: string;
  /** 画像ファイルパス */
  filePath: string;
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * VRMブレンドシェイプの重み
 */
export interface BlendShapeWeight {
  /** ブレンドシェイプ名（VRM内の名前） */
  name: string;
  /** 重み（0.0〜1.0） */
  weight: number;
}

/**
 * VRM表情プリセット
 */
export interface VrmExpressionPreset {
  /** 一意なID */
  id: string;
  /** プリセット名（AIが指定する際に使用） */
  name: string;
  /** 表示名（UI表示用） */
  displayName: string;
  /** ブレンドシェイプの重み一覧 */
  blendShapes: BlendShapeWeight[];
  /** 作成日時 */
  createdAt: string;
  /** 更新日時 */
  updatedAt: string;
}

/**
 * VRM設定データ
 */
export interface VrmConfig {
  /** VRMモデルファイル名 */
  modelFileName: string;
  /** 表情プリセット一覧 */
  presets: VrmExpressionPreset[];
  /** デフォルトプリセットのID */
  defaultPreset: string;
}

/**
 * 設定データ
 */
export interface Config {
  /** 表示モード */
  mode: DisplayMode;
  /** デフォルト表情のID（2Dモード用） */
  defaultExpression: string;
  /** 登録されている表情一覧（2Dモード用） */
  expressions: Expression[];
  /** VRM設定（VRMモード用） */
  vrm?: VrmConfig;
}

/**
 * トランジションタイプ
 */
export type TransitionType =
  | "fade"          // 通常のフェード
  | "quick-fade"    // 素早いフェード
  | "slide"         // スライド
  | "zoom"          // ズーム
  | "shake"         // シェイク
  | "instant";      // 即座に切り替え

/**
 * 表情変更パラメータ
 */
export interface ChangeExpressionParams {
  /** 表情名 */
  expression: string;
  /** トランジション効果（省略時: fade） */
  transition?: TransitionType;
  /** トランジション時間（ミリ秒、省略時: 300） */
  duration?: number;
}

/**
 * 2D表情変更イベントデータ
 */
export interface ExpressionChangeData2D {
  mode: "2d";
  expression: Expression;
  transition: TransitionType;
  duration: number;
}

/**
 * VRM表情変更イベントデータ
 */
export interface ExpressionChangeDataVrm {
  mode: "vrm";
  preset: VrmExpressionPreset;
  transition: TransitionType;
  duration: number;
}

/**
 * 表情変更イベント（WebSocket経由で送信）
 */
export interface ExpressionChangeEvent {
  type: "expression-change";
  data: ExpressionChangeData2D | ExpressionChangeDataVrm;
}
