/**
 * 表情データ
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
 * 設定データ
 */
export interface Config {
  /** デフォルト表情のID */
  defaultExpression: string;
  /** 登録されている表情一覧 */
  expressions: Expression[];
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
 * 表情変更イベント（WebSocket経由で送信）
 */
export interface ExpressionChangeEvent {
  type: "expression-change";
  data: {
    expression: Expression;
    transition: TransitionType;
    duration: number;
  };
}
