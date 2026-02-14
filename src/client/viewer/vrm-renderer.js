import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

/**
 * VRMモデルのレンダリングと表情制御を管理するクラス
 */
export class VrmRenderer {
  /** @type {THREE.WebGLRenderer | null} */
  renderer = null;
  /** @type {THREE.Scene | null} */
  scene = null;
  /** @type {THREE.PerspectiveCamera | null} */
  camera = null;
  /** @type {import("@pixiv/three-vrm").VRM | null} */
  vrm = null;
  /** @type {THREE.Clock} */
  clock = new THREE.Clock();
  /** @type {number} */
  animationFrameId = 0;
  /** @type {boolean} */
  disposed = false;

  // アイドルアニメーション用
  /** @type {number} */
  blinkTimer = 0;
  /** @type {number} */
  nextBlinkTime = 3;
  /** @type {boolean} */
  isBlinking = false;
  /** @type {number} */
  blinkPhase = 0;
  /** @type {number} */
  breathTime = 0;

  // OrbitControls
  /** @type {OrbitControls | null} */
  controls = null;

  // 表情補間用
  /** @type {Map<string, number>} 現在のブレンドシェイプ値 */
  currentBlendShapes = new Map();
  /** @type {Map<string, number>} 目標のブレンドシェイプ値 */
  targetBlendShapes = new Map();
  /** @type {number} 補間の残り時間(秒) */
  interpolationRemaining = 0;
  /** @type {number} 補間の総時間(秒) */
  interpolationDuration = 0;
  /** @type {Map<string, number>} 補間開始時のブレンドシェイプ値 */
  startBlendShapes = new Map();

  /**
   * Three.jsシーンを初期化
   * @param {HTMLElement} container
   */
  init(container) {
    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(
      20,
      container.clientWidth / container.clientHeight,
      0.1,
      100
    );
    this.camera.position.set(0, 1.3, 1.5);
    this.camera.lookAt(0, 1.3, 0);

    this.renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
    });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);

    // ライティング
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(1, 2, 1);
    this.scene.add(directionalLight);

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-1, 1, 0.5);
    this.scene.add(fillLight);

    // OrbitControls（マウスでカメラ操作）
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 0.3;
    this.controls.maxDistance = 5;
    this.controls.update();

    // リサイズ対応
    this._onResize = () => {
      if (!this.camera || !this.renderer) return;
      this.camera.aspect = container.clientWidth / container.clientHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", this._onResize);

    // アニメーションループ開始
    this._animate();
  }

  /**
   * VRMモデルを読み込む
   * @param {string} url
   * @returns {Promise<void>}
   */
  async loadModel(url) {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));

    return new Promise((resolve, reject) => {
      loader.load(
        url,
        (gltf) => {
          const vrm = gltf.userData.vrm;
          if (!vrm) {
            reject(new Error("VRM data not found in glTF"));
            return;
          }

          // 既存モデルを削除
          if (this.vrm) {
            VRMUtils.deepDispose(this.vrm.scene);
            this.scene.remove(this.vrm.scene);
          }

          VRMUtils.removeUnnecessaryJoints(vrm.scene);
          VRMUtils.removeUnnecessaryVertices(vrm.scene);

          this.vrm = vrm;
          this.scene.add(vrm.scene);

          // Tポーズから自然な立ちポーズに変更
          this._setNaturalPose();

          // カメラを顔の高さに調整
          this._adjustCamera();

          console.log("VRM model loaded successfully");
          resolve();
        },
        undefined,
        (error) => {
          console.error("Failed to load VRM:", error);
          reject(error);
        }
      );
    });
  }

  /**
   * カメラ位置をモデルに合わせて調整
   */
  _adjustCamera() {
    if (!this.vrm || !this.camera) return;

    // headボーンの位置を基準にカメラを配置
    const head = this.vrm.humanoid.getNormalizedBoneNode("head");
    if (head) {
      const headPos = new THREE.Vector3();
      head.getWorldPosition(headPos);

      // 頭の高さを注視点に
      const lookAtY = headPos.y - 0.02;
      this.camera.position.set(0, lookAtY, 1.5);
      if (this.controls) {
        this.controls.target.set(0, lookAtY, 0);
        this.controls.update();
      } else {
        this.camera.lookAt(0, lookAtY, 0);
      }
      return;
    }

    // フォールバック: バウンディングボックスの上端付近
    const box = new THREE.Box3().setFromObject(this.vrm.scene);
    const top = box.max.y;
    const lookAtY = top - top * 0.15;
    this.camera.position.set(0, lookAtY, 1.5);
    if (this.controls) {
      this.controls.target.set(0, lookAtY, 0);
      this.controls.update();
    } else {
      this.camera.lookAt(0, lookAtY, 0);
    }
  }

  /**
   * Tポーズから自然な立ちポーズに変更
   * rawボーンに直接回転を適用する
   */
  _setNaturalPose() {
    if (!this.vrm?.humanoid) return;

    // normalizedボーンに回転を設定し、毎フレームvrm.update()前に適用する
    // VRM normalized空間: T-poseが基準、左腕は+X方向を向いている
    // Z軸負方向 = 左腕を下に、Z軸正方向 = 右腕を下に
    this._poseOverrides = [
      ["leftUpperArm", 0.15, 0, -1.2],
      ["rightUpperArm", 0.15, 0, 1.2],
      ["leftLowerArm", 0, 0, -0.15],
      ["rightLowerArm", 0, 0, 0.15],
    ];

    this._poseApplied = true;
  }

  /**
   * 毎フレームポーズを適用（vrm.update()の前に呼ぶ）
   */
  _applyPose() {
    if (!this.vrm?.humanoid || !this._poseOverrides) return;

    for (const [boneName, rx, ry, rz] of this._poseOverrides) {
      const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName);
      if (bone) {
        bone.rotation.set(rx, ry, rz);
      }
    }
  }

  /**
   * 表情プリセットを適用（スムーズ補間あり）
   * @param {{ blendShapes: Array<{name: string, weight: number}> }} preset
   * @param {number} duration ミリ秒
   */
  applyExpression(preset, duration = 300) {
    if (!this.vrm) return;

    // duration=0の場合は即座に適用
    if (duration <= 0) {
      // 既存のブレンドシェイプをリセット
      for (const [name] of this.currentBlendShapes) {
        if (name !== "blink") {
          this.vrm.expressionManager?.setValue(name, 0);
        }
      }
      this.currentBlendShapes.clear();
      // 新しい値を即座に適用
      for (const { name, weight } of preset.blendShapes) {
        this.vrm.expressionManager?.setValue(name, weight);
        if (weight > 0) {
          this.currentBlendShapes.set(name, weight);
        }
      }
      this.interpolationRemaining = 0;
      return;
    }

    // 現在値を開始値として保存
    this.startBlendShapes = new Map(this.currentBlendShapes);

    // 新しい目標値を設定
    this.targetBlendShapes.clear();
    for (const { name, weight } of preset.blendShapes) {
      this.targetBlendShapes.set(name, weight);
    }

    // 目標にないが現在設定中のブレンドシェイプは0に戻す
    for (const [name] of this.currentBlendShapes) {
      if (!this.targetBlendShapes.has(name) && name !== "blink") {
        this.targetBlendShapes.set(name, 0);
        if (!this.startBlendShapes.has(name)) {
          this.startBlendShapes.set(name, 0);
        }
      }
    }

    // 開始値に目標の全キーを含める
    for (const [name] of this.targetBlendShapes) {
      if (!this.startBlendShapes.has(name)) {
        this.startBlendShapes.set(name, 0);
      }
    }

    this.interpolationDuration = duration / 1000;
    this.interpolationRemaining = this.interpolationDuration;
  }

  /**
   * アニメーションループ
   */
  _animate() {
    if (this.disposed) return;

    this.animationFrameId = requestAnimationFrame(() => this._animate());

    const delta = this.clock.getDelta();

    if (this.vrm) {
      // 表情補間の更新
      this._updateExpressionInterpolation(delta);

      // アイドルアニメーション
      this._updateBlink(delta);
      this._updateBreathing(delta);

      // ポーズをvrm.update()の前に適用（normalizedボーン → rawボーンへ転送される）
      if (this._poseApplied) {
        this._applyPose();
      }

      // VRMの更新（SpringBone、normalizedボーン→rawボーン転送など）
      this.vrm.update(delta);
    }

    // OrbitControls更新
    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * 表情ブレンドシェイプの補間を更新
   * @param {number} delta
   */
  _updateExpressionInterpolation(delta) {
    if (this.interpolationRemaining <= 0) return;
    if (!this.vrm?.expressionManager) return;

    this.interpolationRemaining -= delta;
    const t = Math.max(
      0,
      1 - this.interpolationRemaining / this.interpolationDuration
    );
    // イーズアウト
    const eased = 1 - Math.pow(1 - t, 3);

    for (const [name, targetWeight] of this.targetBlendShapes) {
      const startWeight = this.startBlendShapes.get(name) || 0;
      const currentWeight = startWeight + (targetWeight - startWeight) * eased;

      this.vrm.expressionManager.setValue(name, currentWeight);
      this.currentBlendShapes.set(name, currentWeight);
    }

    if (this.interpolationRemaining <= 0) {
      // 補間完了、最終値を適用
      for (const [name, weight] of this.targetBlendShapes) {
        this.vrm.expressionManager.setValue(name, weight);
        this.currentBlendShapes.set(name, weight);
      }
      // 0になったブレンドシェイプを削除
      for (const [name, weight] of this.currentBlendShapes) {
        if (weight === 0) {
          this.currentBlendShapes.delete(name);
        }
      }
    }
  }

  /**
   * まばたきアニメーション
   * @param {number} delta
   */
  _updateBlink(delta) {
    if (!this.vrm?.expressionManager) return;

    // 表情プリセットで目を閉じている場合はまばたきを抑制
    const eyeBlendShapes = ["blink", "blinkLeft", "blinkRight"];
    const hasEyeExpression = eyeBlendShapes.some(
      (name) => (this.currentBlendShapes.get(name) || 0) > 0.3
    );

    if (hasEyeExpression) {
      // まばたき中なら中断してタイマーリセット
      if (this.isBlinking) {
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlinkTime = 3 + Math.random() * 4;
      }
      return;
    }

    this.blinkTimer += delta;

    if (!this.isBlinking && this.blinkTimer >= this.nextBlinkTime) {
      this.isBlinking = true;
      this.blinkPhase = 0;
    }

    if (this.isBlinking) {
      this.blinkPhase += delta;
      const blinkDuration = 0.15; // 150ms
      const halfDuration = blinkDuration / 2;

      let blinkValue;
      if (this.blinkPhase < halfDuration) {
        // 閉じる
        blinkValue = this.blinkPhase / halfDuration;
      } else if (this.blinkPhase < blinkDuration) {
        // 開く
        blinkValue = 1 - (this.blinkPhase - halfDuration) / halfDuration;
      } else {
        // 完了
        blinkValue = 0;
        this.isBlinking = false;
        this.blinkTimer = 0;
        this.nextBlinkTime = 3 + Math.random() * 4; // 3〜7秒
      }

      this.vrm.expressionManager.setValue("blink", blinkValue);
    }
  }

  /**
   * 呼吸アニメーション（胸ボーンの微小スケール変化）
   * @param {number} delta
   */
  _updateBreathing(delta) {
    if (!this.vrm?.humanoid) return;

    this.breathTime += delta;

    const breathCycle = 4; // 4秒周期
    const breathAmount = 0.003; // 微小な変化量
    const breathValue =
      Math.sin((this.breathTime / breathCycle) * Math.PI * 2) * breathAmount;

    // chestボーンを取得して微小にスケール変化
    const chest = this.vrm.humanoid.getNormalizedBoneNode("chest");
    if (chest) {
      chest.scale.set(1, 1 + breathValue, 1);
    }
  }

  /**
   * リソースを解放
   */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrameId);

    if (this._onResize) {
      window.removeEventListener("resize", this._onResize);
    }

    if (this.controls) {
      this.controls.dispose();
    }

    if (this.vrm) {
      VRMUtils.deepDispose(this.vrm.scene);
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.vrm = null;
    this.controls = null;
  }
}
