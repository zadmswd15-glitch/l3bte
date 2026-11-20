import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type InteractTargetId = 'key' | 'breaker' | 'phone' | 'door';

export interface SceneCallbacks {
  onHoverTarget: (target: InteractTargetId | null, labelAr: string | null) => void;
  onInteract: (target: InteractTargetId) => void;
  onStateTick: (telemetry: {
    tension: number;
    distanceToDoor: number;
    entityDistance: number;
    playerMoved: boolean;
  }) => void;
  onFootstep: () => void;
  onFlickerBuzz: () => void;
}

export interface HorrorSceneState {
  mode: 'title' | 'playing' | 'paused' | 'victory' | 'gameover';
  hasKey: boolean;
  doorUnlocked: boolean;
  powerOn: boolean;
}

// Reusable module-scope math objects (zero GC in render loop)
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _moveDelta = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _rayMouse = new THREE.Vector2(0, 0);
const _worldPos = new THREE.Vector3();

function createProceduralSurfaceTexture(
  kind: 'concrete' | 'plaster' | 'steel' | 'wood' | 'crt',
  renderer: THREE.WebGLRenderer
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  if (kind === 'concrete') {
    ctx.fillStyle = '#181a1f';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 4200; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 16 + Math.floor(Math.random() * 24);
      ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
      ctx.fillRect(x, y, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 2;
    for (let g = 0; g <= 512; g += 128) {
      ctx.beginPath();
      ctx.moveTo(g, 0);
      ctx.lineTo(g, 512);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, g);
      ctx.lineTo(512, g);
      ctx.stroke();
    }
  } else if (kind === 'plaster') {
    ctx.fillStyle = '#202229';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 2400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const v = 22 + Math.floor(Math.random() * 26);
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.45)`;
      ctx.fillRect(x, y, 3, 3);
    }
    // Moisture streaks
    for (let s = 0; s < 14; s++) {
      const sx = Math.random() * 512;
      const grad = ctx.createLinearGradient(sx, 0, sx, 512);
      grad.addColorStop(0, 'rgba(8,9,12,0.55)');
      grad.addColorStop(0.5, 'rgba(18,16,14,0.2)');
      grad.addColorStop(1, 'rgba(5,5,7,0.7)');
      ctx.fillStyle = grad;
      ctx.fillRect(sx, 0, 8 + Math.random() * 18, 512);
    }
  } else if (kind === 'steel') {
    ctx.fillStyle = '#2a2d34';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 2) {
      const shade = 36 + Math.floor(Math.random() * 16);
      ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},0.35)`;
      ctx.fillRect(0, y, 512, 1);
    }
    // Rust patches
    for (let r = 0; r < 24; r++) {
      ctx.fillStyle = 'rgba(92, 34, 22, 0.24)';
      ctx.beginPath();
      ctx.arc(Math.random() * 512, Math.random() * 512, 12 + Math.random() * 35, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === 'wood') {
    ctx.fillStyle = '#2c1e16';
    ctx.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 3) {
      const tone = 30 + Math.floor(Math.sin(y * 0.08) * 10 + Math.random() * 10);
      ctx.fillStyle = `rgb(${tone + 14},${tone},${tone - 6})`;
      ctx.fillRect(0, y, 512, 2);
    }
  } else {
    // CRT screen
    ctx.fillStyle = '#05140c';
    ctx.fillRect(0, 0, 512, 512);
    ctx.fillStyle = '#24d37d';
    ctx.font = 'bold 28px monospace';
    ctx.fillText('ROOM_07 // ACTIVE', 38, 96);
    ctx.font = '20px monospace';
    ctx.fillStyle = '#149a58';
    ctx.fillText('TWILIO LINK: ARMED', 38, 150);
    ctx.fillText('ENTITY PROXIMITY:', 38, 196);
    ctx.fillStyle = '#ef4444';
    ctx.fillText('WATCHING YOU', 38, 246);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let y = 0; y < 512; y += 6) {
      ctx.fillRect(0, y, 512, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

export class HorrorCorridorController {
  private container: HTMLElement;
  private callbacks: SceneCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private frameId = 0;
  private disposed = false;
  private clock = new THREE.Clock();

  // State controlled from React via ref-safe setter
  private gameState: HorrorSceneState = {
    mode: 'title',
    hasKey: false,
    doorUnlocked: false,
    powerOn: true,
  };

  // Player kinematics
  private playerPos = new THREE.Vector3(0, 1.65, 4.4);
  private targetPos = new THREE.Vector3(0, 1.65, 4.4);
  private yaw = 0;
  private pitch = -0.04;
  private targetYaw = 0;
  private targetPitch = -0.04;
  private bobPhase = 0;
  private totalWalked = 0;

  // Input state
  private keys = new Set<string>();
  private isDragging = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private dragMovedDist = 0;
  private raycaster = new THREE.Raycaster();
  private interactables: THREE.Object3D[] = [];
  private hoveredTarget: InteractTargetId | null = null;
  private lastRaycastMs = 0;

  // Animated 3D references
  private keyGroup!: THREE.Group;
  private doorPivot!: THREE.Group;
  private doorLedMat!: THREE.MeshStandardMaterial;
  private breakerLeverPivot!: THREE.Group;
  private breakerLedMat!: THREE.MeshStandardMaterial;
  private entityGroup!: THREE.Group;
  private entityHead!: THREE.Group;
  private entityLeftArm!: THREE.Mesh;
  private entityRightArm!: THREE.Mesh;
  private corridorLights: THREE.PointLight[] = [];
  private tubeMaterials: THREE.MeshStandardMaterial[] = [];
  private deskLamp!: THREE.PointLight;
  private flashlight!: THREE.SpotLight;
  private entityZ = -7.6;
  private doorOpenAngle = 0;
  private tension = 12;
  private lastTelemetryTime = 0;
  private disposableResources: Array<{ dispose: () => void }> = [];

  constructor(container: HTMLElement, callbacks: SceneCallbacks) {
    this.container = container;
    this.callbacks = callbacks;

    this.isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(
      this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2)
    );
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#050608');
    this.scene.fog = new THREE.FogExp2('#050608', 0.115);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTex;
    this.disposableResources.push(envTex);
    pmrem.dispose();

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(64, w / h, 0.1, 45);
    this.camera.rotation.order = 'YXZ';

    this.raycaster.layers.set(1);
    this.raycaster.far = 5.5;

    this.buildWorld();
    this.bindEvents();

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.clock.start();
    this.tick();
  }

  private track<T extends { dispose: () => void }>(res: T): T {
    this.disposableResources.push(res);
    return res;
  }

  private buildWorld(): void {
    const concreteTex = this.track(createProceduralSurfaceTexture('concrete', this.renderer));
    concreteTex.repeat.set(3, 9);
    const plasterTex = this.track(createProceduralSurfaceTexture('plaster', this.renderer));
    plasterTex.repeat.set(4, 2);
    const steelTex = this.track(createProceduralSurfaceTexture('steel', this.renderer));
    const woodTex = this.track(createProceduralSurfaceTexture('wood', this.renderer));
    const crtTex = this.track(createProceduralSurfaceTexture('crt', this.renderer));

    const floorMat = this.track(
      new THREE.MeshStandardMaterial({
        map: concreteTex,
        roughness: 0.88,
        metalness: 0.08,
      })
    );
    const wallMat = this.track(
      new THREE.MeshStandardMaterial({
        map: plasterTex,
        roughness: 0.92,
        metalness: 0.04,
      })
    );
    const ceilingMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#121318',
        roughness: 0.95,
        metalness: 0.05,
      })
    );
    const trimMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#22252d',
        roughness: 0.52,
        metalness: 0.45,
      })
    );

    // Corridor Enclosure: x in [-3.2, 3.2], z in [-12, 6.2], height = 3.6
    const floor = new THREE.Mesh(this.track(new THREE.PlaneGeometry(6.4, 18.4)), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -2.9);
    floor.receiveShadow = true;
    this.scene.add(floor);

    const ceiling = new THREE.Mesh(this.track(new THREE.PlaneGeometry(6.4, 18.4)), ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(0, 3.6, -2.9);
    this.scene.add(ceiling);

    const leftWall = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.2, 3.6, 18.4)), wallMat);
    leftWall.position.set(-3.3, 1.8, -2.9);
    leftWall.receiveShadow = true;
    this.scene.add(leftWall);

    const rightWall = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.2, 3.6, 18.4)), wallMat);
    rightWall.position.set(3.3, 1.8, -2.9);
    rightWall.receiveShadow = true;
    this.scene.add(rightWall);

    const backWall = new THREE.Mesh(this.track(new THREE.BoxGeometry(6.6, 3.6, 0.2)), wallMat);
    backWall.position.set(0, 1.8, 6.3);
    this.scene.add(backWall);

    // Far end wall with doorway cutout (left/right/header around [-0.95..0.95, 0..2.55])
    const farLeft = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.35, 3.6, 0.25)), wallMat);
    farLeft.position.set(-2.12, 1.8, -12.05);
    this.scene.add(farLeft);

    const farRight = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.35, 3.6, 0.25)), wallMat);
    farRight.position.set(2.12, 1.8, -12.05);
    this.scene.add(farRight);

    const farTop = new THREE.Mesh(this.track(new THREE.BoxGeometry(2.1, 1.05, 0.25)), wallMat);
    farTop.position.set(0, 3.07, -12.05);
    this.scene.add(farTop);

    // Escape void behind exit door
    const exitGlowPlane = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(2.4, 3.0)),
      this.track(new THREE.MeshBasicMaterial({ color: '#0e1722' }))
    );
    exitGlowPlane.position.set(0, 1.5, -13.6);
    this.scene.add(exitGlowPlane);

    // Architectural pilasters along walls (InstancedMesh for > 10 repeated ribs)
    const ribGeo = this.track(new THREE.BoxGeometry(0.16, 3.6, 0.28));
    const ribs = new THREE.InstancedMesh(ribGeo, trimMat, 12);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 6; i++) {
      const zPos = 4.2 - i * 3.0;
      dummy.position.set(-3.16, 1.8, zPos);
      dummy.updateMatrix();
      ribs.setMatrixAt(i * 2, dummy.matrix);

      dummy.position.set(3.16, 1.8, zPos);
      dummy.updateMatrix();
      ribs.setMatrixAt(i * 2 + 1, dummy.matrix);
    }
    ribs.instanceMatrix.needsUpdate = true;
    ribs.computeBoundingSphere();
    this.scene.add(ribs);

    // Lighting: Cool Hemisphere fill + Warm Desk PointLight + Overhead Fluorescent PointLights + Player Flashlight
    const hemi = new THREE.HemisphereLight('#2a3f5f', '#100c0b', 0.48);
    this.scene.add(hemi);

    const keyDir = new THREE.DirectionalLight('#b7c8e0', 0.55);
    keyDir.position.set(1.5, 3.4, 3.0);
    keyDir.castShadow = !this.isSoftwareGl;
    keyDir.shadow.mapSize.set(1024, 1024);
    keyDir.shadow.camera.near = 0.5;
    keyDir.shadow.camera.far = 20;
    keyDir.shadow.bias = -0.0005;
    keyDir.shadow.normalBias = 0.02;
    this.scene.add(keyDir);

    // Overhead flickering ceiling fluorescent fixtures (3 composite groups)
    [-8.5, -2.5, 3.2].forEach((zPos, idx) => {
      const rig = new THREE.Group();
      rig.position.set(0, 3.55, zPos);

      const housing = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.32, 0.08, 1.35)),
        this.track(new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.45, metalness: 0.7 }))
      );
      rig.add(housing);

      const tubeMat = this.track(
        new THREE.MeshStandardMaterial({
          color: '#dce8f5',
          emissive: new THREE.Color('#9fbdd9'),
          emissiveIntensity: idx === 1 ? 0.5 : 1.15,
          roughness: 0.25,
          metalness: 0.1,
        })
      );
      this.tubeMaterials.push(tubeMat);

      const tube = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.032, 0.032, 1.18, 12)), tubeMat);
      tube.rotation.x = Math.PI / 2;
      tube.position.y = -0.05;
      rig.add(tube);

      const cage = new THREE.Mesh(
        this.track(new THREE.BoxGeometry(0.24, 0.07, 1.24)),
        this.track(new THREE.MeshStandardMaterial({ color: '#2b2e36', wireframe: true, roughness: 0.6, metalness: 0.6 }))
      );
      cage.position.y = -0.05;
      rig.add(cage);

      this.scene.add(rig);

      const pLight = new THREE.PointLight('#a7c4e0', idx === 1 ? 1.1 : 2.1, 9.5, 1.6);
      pLight.position.set(0, 3.35, zPos);
      this.scene.add(pLight);
      this.corridorLights.push(pLight);
    });

    // Player subtle flashlight attached to camera
    this.flashlight = new THREE.SpotLight('#fff0d6', 2.8, 14, Math.PI / 4.8, 0.62, 1.4);
    this.flashlight.position.set(0, 0, 0);
    this.flashlight.target.position.set(0, 0, -1);
    this.camera.add(this.flashlight);
    this.camera.add(this.flashlight.target);
    this.scene.add(this.camera);

    // 1. Investigator Desk + CRT Monitor (Composite 7-part Group)
    this.buildInvestigatorDesk(woodTex, crtTex);

    // 2. Rotary Desk Phone (Composite 5-part Group)
    this.buildDeskPhone(steelTex);

    // 3. Rusted Brass Key (Composite 4-part Group)
    this.buildRustedKey();

    // 4. Power Breaker Box on Left Wall (Composite 4-part Group)
    this.buildBreakerBox(steelTex);

    // 5. Heavy Steel Bulkhead Exit Door (Composite 6-part Group)
    this.buildBulkheadDoor(steelTex);

    // 6. The Stalker Entity ("الكيان") (Composite 7-part Group)
    this.buildStalkerEntity();
  }

  private registerInteractable(
    targetId: InteractTargetId,
    labelAr: string,
    position: THREE.Vector3,
    size: THREE.Vector3
  ): THREE.Mesh {
    const hitbox = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(size.x, size.y, size.z)),
      this.track(new THREE.MeshBasicMaterial({ visible: false }))
    );
    hitbox.position.copy(position);
    hitbox.layers.set(1);
    hitbox.userData.interactId = targetId;
    hitbox.userData.labelAr = labelAr;
    this.scene.add(hitbox);
    this.interactables.push(hitbox);
    return hitbox;
  }

  private buildInvestigatorDesk(woodTex: THREE.CanvasTexture, crtTex: THREE.CanvasTexture): void {
    const desk = new THREE.Group();
    desk.position.set(2.15, 0, 2.35);

    const woodMat = this.track(new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.78, metalness: 0.05 }));
    const metalLegMat = this.track(new THREE.MeshStandardMaterial({ color: '#1f2126', roughness: 0.42, metalness: 0.72 }));

    const top = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.1, 0.07, 1.8)), woodMat);
    top.position.y = 0.78;
    top.castShadow = true;
    top.receiveShadow = true;
    desk.add(top);

    [
      [-0.48, -0.82],
      [0.48, -0.82],
      [-0.48, 0.82],
      [0.48, 0.82],
    ].forEach(([lx, lz]) => {
      const leg = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.032, 0.024, 0.75, 10)), metalLegMat);
      leg.position.set(lx, 0.375, lz);
      desk.add(leg);
    });

    const drawers = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.92, 0.44, 0.56)), woodMat);
    drawers.position.set(0, 0.52, 0.52);
    desk.add(drawers);

    // CRT Terminal
    const crtBody = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.42, 0.36, 0.44)),
      this.track(new THREE.MeshStandardMaterial({ color: '#2b2d30', roughness: 0.65, metalness: 0.12 }))
    );
    crtBody.position.set(0.15, 1.0, 0.42);
    crtBody.rotation.y = -Math.PI / 2.6;
    desk.add(crtBody);

    const crtScreen = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(0.36, 0.28)),
      this.track(
        new THREE.MeshStandardMaterial({
          map: crtTex,
          emissiveMap: crtTex,
          emissive: new THREE.Color('#34d399'),
          emissiveIntensity: 0.7,
          roughness: 0.2,
          metalness: 0.1,
        })
      )
    );
    crtScreen.position.set(-0.04, 1.0, 0.33);
    crtScreen.rotation.y = -Math.PI / 2.6;
    desk.add(crtScreen);

    this.scene.add(desk);

    // Warm tungsten desk lamp glow
    this.deskLamp = new THREE.PointLight('#ff9f43', 1.9, 5.2, 1.8);
    this.deskLamp.position.set(2.05, 1.55, 2.1);
    this.scene.add(this.deskLamp);
  }

  private buildDeskPhone(steelTex: THREE.CanvasTexture): void {
    const phone = new THREE.Group();
    phone.position.set(1.96, 0.815, 1.72);
    phone.rotation.y = -Math.PI / 2.2;

    const bodyMat = this.track(new THREE.MeshStandardMaterial({ color: '#141518', roughness: 0.38, metalness: 0.15 }));
    const brassMat = this.track(new THREE.MeshStandardMaterial({ map: steelTex, color: '#8f7245', roughness: 0.35, metalness: 0.78 }));

    const base = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.24, 0.09, 0.22)), bodyMat);
    base.position.y = 0.045;
    phone.add(base);

    const dial = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.055, 0.055, 0.015, 20)), brassMat);
    dial.position.set(0.05, 0.092, 0);
    dial.rotation.z = -0.35;
    phone.add(dial);

    // Lathe receiver handset
    const lathePts = [
      new THREE.Vector2(0.01, 0),
      new THREE.Vector2(0.036, 0.02),
      new THREE.Vector2(0.022, 0.05),
      new THREE.Vector2(0.018, 0.18),
      new THREE.Vector2(0.036, 0.21),
      new THREE.Vector2(0.01, 0.23),
    ];
    const handset = new THREE.Mesh(this.track(new THREE.LatheGeometry(lathePts, 16)), bodyMat);
    handset.rotation.x = Math.PI / 2;
    handset.position.set(-0.04, 0.115, -0.115);
    phone.add(handset);

    // TubeGeometry coiled cord
    const cordPts: THREE.Vector3[] = [];
    for (let i = 0; i <= 18; i++) {
      const t = i / 18;
      cordPts.push(new THREE.Vector3(-0.06 + Math.sin(t * Math.PI * 6) * 0.02, 0.04 + Math.cos(t * Math.PI * 6) * 0.015, 0.1 + t * 0.12));
    }
    const cordCurve = new THREE.CatmullRomCurve3(cordPts);
    const cord = new THREE.Mesh(this.track(new THREE.TubeGeometry(cordCurve, 24, 0.008, 8, false)), bodyMat);
    phone.add(cord);

    this.scene.add(phone);
    this.registerInteractable(
      'phone',
      'فحص الهاتف المرتبط برقمك [E / نقر]',
      new THREE.Vector3(1.96, 0.92, 1.72),
      new THREE.Vector3(0.45, 0.35, 0.45)
    );
  }

  private buildRustedKey(): void {
    this.keyGroup = new THREE.Group();
    this.keyGroup.position.set(1.88, 0.83, 2.38);

    const keyMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#c48d3c',
        emissive: new THREE.Color('#3a2508'),
        emissiveIntensity: 0.65,
        roughness: 0.3,
        metalness: 0.88,
      })
    );

    const bow = new THREE.Mesh(this.track(new THREE.TorusGeometry(0.042, 0.011, 10, 20)), keyMat);
    bow.rotation.x = Math.PI / 2;
    this.keyGroup.add(bow);

    const shaft = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.009, 0.009, 0.14, 10)), keyMat);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 0.11;
    this.keyGroup.add(shaft);

    const collar = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.016, 0.016, 0.018, 10)), keyMat);
    collar.rotation.z = Math.PI / 2;
    collar.position.x = 0.055;
    this.keyGroup.add(collar);

    const teeth = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.036, 0.008, 0.032)), keyMat);
    teeth.position.set(0.16, 0, 0.02);
    this.keyGroup.add(teeth);

    this.scene.add(this.keyGroup);
    this.registerInteractable(
      'key',
      'التقاط المفتاح الصدئ [E / نقر]',
      new THREE.Vector3(1.94, 0.88, 2.38),
      new THREE.Vector3(0.42, 0.32, 0.42)
    );
  }

  private buildBreakerBox(steelTex: THREE.CanvasTexture): void {
    const boxGroup = new THREE.Group();
    boxGroup.position.set(-3.14, 1.38, 0.5);

    const cabinetMat = this.track(new THREE.MeshStandardMaterial({ map: steelTex, color: '#393e47', roughness: 0.55, metalness: 0.7 }));
    const cabinet = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.16, 0.66, 0.48)), cabinetMat);
    boxGroup.add(cabinet);

    const plate = new THREE.Mesh(
      this.track(new THREE.BoxGeometry(0.02, 0.14, 0.24)),
      this.track(new THREE.MeshStandardMaterial({ color: '#b48224', roughness: 0.45, metalness: 0.2 }))
    );
    plate.position.set(0.085, 0.16, 0);
    boxGroup.add(plate);

    this.breakerLedMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#22c55e',
        emissive: new THREE.Color('#22c55e'),
        emissiveIntensity: 1.6,
        roughness: 0.2,
      })
    );
    const led = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.022, 12, 12)), this.breakerLedMat);
    led.position.set(0.09, -0.18, 0.12);
    boxGroup.add(led);

    this.breakerLeverPivot = new THREE.Group();
    this.breakerLeverPivot.position.set(0.09, -0.02, -0.1);
    const lever = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(0.014, 0.014, 0.18, 10)),
      this.track(new THREE.MeshStandardMaterial({ color: '#9e1b24', roughness: 0.35, metalness: 0.5 }))
    );
    lever.rotation.z = -Math.PI / 3;
    lever.position.set(0.06, 0.04, 0);
    this.breakerLeverPivot.add(lever);
    boxGroup.add(this.breakerLeverPivot);

    this.scene.add(boxGroup);
    this.registerInteractable(
      'breaker',
      'تبديل قاطع الكهرباء [E / نقر]',
      new THREE.Vector3(-3.0, 1.38, 0.5),
      new THREE.Vector3(0.45, 0.8, 0.6)
    );
  }

  private buildBulkheadDoor(steelTex: THREE.CanvasTexture): void {
    const frameMat = this.track(new THREE.MeshStandardMaterial({ color: '#1b1d22', roughness: 0.5, metalness: 0.72 }));
    const doorMat = this.track(new THREE.MeshStandardMaterial({ map: steelTex, color: '#383d45', roughness: 0.58, metalness: 0.68 }));
    const brassMat = this.track(new THREE.MeshStandardMaterial({ color: '#b0894a', roughness: 0.32, metalness: 0.85 }));

    const leftPost = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.14, 2.55, 0.32)), frameMat);
    leftPost.position.set(-0.92, 1.275, -11.95);
    this.scene.add(leftPost);

    const rightPost = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.14, 2.55, 0.32)), frameMat);
    rightPost.position.set(0.92, 1.275, -11.95);
    this.scene.add(rightPost);

    const topBeam = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.98, 0.14, 0.32)), frameMat);
    topBeam.position.set(0, 2.52, -11.95);
    this.scene.add(topBeam);

    // Door pivot at left hinge
    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(-0.85, 0, -11.92);

    const slab = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.7, 2.44, 0.1)), doorMat);
    slab.position.set(0.85, 1.22, 0);
    slab.castShadow = true;
    this.doorPivot.add(slab);

    const brace = new THREE.Mesh(this.track(new THREE.BoxGeometry(1.52, 0.14, 0.13)), frameMat);
    brace.position.set(0.85, 1.22, 0);
    this.doorPivot.add(brace);

    const handle = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.18, 0.04, 0.12)), brassMat);
    handle.position.set(1.5, 1.12, 0.08);
    this.doorPivot.add(handle);

    this.scene.add(this.doorPivot);

    // Security Keypad next to right post
    const keypad = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.14, 0.24, 0.06)), frameMat);
    keypad.position.set(1.08, 1.32, -11.88);
    this.scene.add(keypad);

    this.doorLedMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#ef4444',
        emissive: new THREE.Color('#ef4444'),
        emissiveIntensity: 1.8,
        roughness: 0.2,
      })
    );
    const doorLed = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.024, 12, 12)), this.doorLedMat);
    doorLed.position.set(1.08, 1.4, -11.84);
    this.scene.add(doorLed);

    this.registerInteractable(
      'door',
      'فحص الباب الفولاذي المغلق [E / نقر]',
      new THREE.Vector3(0, 1.25, -11.75),
      new THREE.Vector3(2.0, 2.4, 0.6)
    );
  }

  private buildStalkerEntity(): void {
    this.entityGroup = new THREE.Group();
    this.entityGroup.position.set(-0.95, 0, this.entityZ);

    const cloakMat = this.track(new THREE.MeshStandardMaterial({ color: '#0c0d11', roughness: 0.94, metalness: 0.05 }));
    const skinMat = this.track(new THREE.MeshStandardMaterial({ color: '#8f8980', roughness: 0.68, metalness: 0.08 }));
    const eyeMat = this.track(
      new THREE.MeshStandardMaterial({
        color: '#ff2b3a',
        emissive: new THREE.Color('#ff1a2a'),
        emissiveIntensity: 2.2,
        roughness: 0.2,
      })
    );

    // Skirt/cloak bottom-center grounded at y=0
    const cloak = new THREE.Mesh(this.track(new THREE.ConeGeometry(0.42, 1.45, 14)), cloakMat);
    cloak.position.y = 0.725;
    cloak.castShadow = true;
    this.entityGroup.add(cloak);

    const torso = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.18, 0.26, 0.65, 12)), cloakMat);
    torso.position.y = 1.58;
    this.entityGroup.add(torso);

    this.entityLeftArm = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.04, 0.025, 0.95, 8)), cloakMat);
    this.entityLeftArm.position.set(-0.28, 1.38, 0.08);
    this.entityLeftArm.rotation.z = 0.14;
    this.entityGroup.add(this.entityLeftArm);

    this.entityRightArm = new THREE.Mesh(this.track(new THREE.CylinderGeometry(0.04, 0.025, 0.95, 8)), cloakMat);
    this.entityRightArm.position.set(0.28, 1.38, 0.08);
    this.entityRightArm.rotation.z = -0.14;
    this.entityGroup.add(this.entityRightArm);

    this.entityHead = new THREE.Group();
    this.entityHead.position.set(0, 2.02, 0.04);

    const mask = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.15, 16, 16)), skinMat);
    mask.scale.set(0.86, 1.22, 0.92);
    this.entityHead.add(mask);

    const eyeL = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.022, 10, 10)), eyeMat);
    eyeL.position.set(-0.045, 0.02, 0.13);
    this.entityHead.add(eyeL);

    const eyeR = new THREE.Mesh(this.track(new THREE.SphereGeometry(0.022, 10, 10)), eyeMat);
    eyeR.position.set(0.045, 0.02, 0.13);
    this.entityHead.add(eyeR);

    this.entityGroup.add(this.entityHead);
    this.scene.add(this.entityGroup);
  }

  public setState(next: Partial<HorrorSceneState>): void {
    const prevPower = this.gameState.powerOn;
    const prevUnlocked = this.gameState.doorUnlocked;
    this.gameState = { ...this.gameState, ...next };

    if (this.keyGroup) {
      this.keyGroup.visible = !this.gameState.hasKey;
    }

    if (prevPower !== this.gameState.powerOn) {
      this.breakerLedMat.color.set(this.gameState.powerOn ? '#22c55e' : '#ef4444');
      this.breakerLedMat.emissive.set(this.gameState.powerOn ? '#22c55e' : '#ef4444');
      this.breakerLeverPivot.rotation.x = this.gameState.powerOn ? 0 : 0.9;
    }

    if (prevUnlocked !== this.gameState.doorUnlocked) {
      this.doorLedMat.color.set(this.gameState.doorUnlocked ? '#22c55e' : '#ef4444');
      this.doorLedMat.emissive.set(this.gameState.doorUnlocked ? '#22c55e' : '#ef4444');
    }
  }

  public resetPlayer(): void {
    this.playerPos.set(0, 1.65, 4.4);
    this.targetPos.set(0, 1.65, 4.4);
    this.yaw = 0;
    this.pitch = -0.04;
    this.targetYaw = 0;
    this.targetPitch = -0.04;
    this.entityZ = -7.6;
    this.doorOpenAngle = 0;
    this.doorPivot.rotation.y = 0;
    this.tension = 12;
    this.totalWalked = 0;
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onWindowBlur);

    dom.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
  }

  private onResize = (): void => {
    if (this.disposed) return;
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    this.keys.add(e.code);
    if (this.gameState.mode === 'playing' && (e.code === 'KeyE' || e.code === 'Space')) {
      if (this.hoveredTarget) {
        e.preventDefault();
        this.callbacks.onInteract(this.hoveredTarget);
      }
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private onWindowBlur = (): void => {
    this.keys.clear();
    this.isDragging = false;
  };

  private onPointerDown = (e: PointerEvent): void => {
    if (this.gameState.mode !== 'playing') return;
    this.isDragging = true;
    this.dragMovedDist = 0;
    this.pointerDownPos = { x: e.clientX, y: e.clientY };
    this.lastPointerPos = { x: e.clientX, y: e.clientY };
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.gameState.mode !== 'playing') return;
    if (this.isDragging) {
      const dx = e.clientX - this.lastPointerPos.x;
      const dy = e.clientY - this.lastPointerPos.y;
      this.dragMovedDist += Math.hypot(dx, dy);
      this.targetYaw -= dx * 0.0042;
      this.targetPitch = THREE.MathUtils.clamp(this.targetPitch - dy * 0.0036, -0.75, 0.72);
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (!this.isDragging) return;
    this.isDragging = false;

    if (this.gameState.mode === 'playing' && this.dragMovedDist < 7) {
      const rect = this.renderer.domElement.getBoundingClientRect();
      _rayMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      _rayMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(_rayMouse, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactables, false);
      if (hits.length > 0) {
        const hitId = hits[0].object.userData.interactId as InteractTargetId;
        if (hitId === 'key' && this.gameState.hasKey) return;
        this.callbacks.onInteract(hitId);
      } else if (this.hoveredTarget) {
        this.callbacks.onInteract(this.hoveredTarget);
      }
    }
  };

  private updateHoverRaycast(nowMs: number): void {
    if (nowMs - this.lastRaycastMs < 65) return;
    this.lastRaycastMs = nowMs;

    _rayMouse.set(0, 0);
    this.raycaster.setFromCamera(_rayMouse, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, false);

    let nextTarget: InteractTargetId | null = null;
    let nextLabel: string | null = null;

    if (hits.length > 0) {
      const candidate = hits[0].object.userData.interactId as InteractTargetId;
      if (!(candidate === 'key' && this.gameState.hasKey)) {
        nextTarget = candidate;
        nextLabel = String(hits[0].object.userData.labelAr || '');
      }
    }

    if (nextTarget !== this.hoveredTarget) {
      this.hoveredTarget = nextTarget;
      this.callbacks.onHoverTarget(nextTarget, nextLabel);
    }
  }

  private tick = (): void => {
    if (this.disposed) return;

    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.05);
    const elapsed = this.clock.elapsedTime;

    if (this.gameState.mode === 'title') {
      // Atmospheric Title Screen slow camera pan
      this.camera.position.set(Math.sin(elapsed * 0.22) * 0.55, 1.55 + Math.sin(elapsed * 0.4) * 0.06, 4.1 + Math.cos(elapsed * 0.16) * 0.8);
      this.camera.rotation.set(-0.04, Math.sin(elapsed * 0.18) * 0.18, 0);
    } else if (this.gameState.mode === 'playing') {
      // Smooth look damping
      if (this.keys.has('KeyQ')) this.targetYaw += 1.65 * dt;
      if (this.keys.has('KeyR')) this.targetYaw -= 1.65 * dt;

      this.yaw = THREE.MathUtils.damp(this.yaw, this.targetYaw, 14, dt);
      this.pitch = THREE.MathUtils.damp(this.pitch, this.targetPitch, 14, dt);

      // Movement along camera horizontal heading
      _forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)).normalize();
      _right.crossVectors(_forward, _up).normalize();
      _moveDelta.set(0, 0, 0);

      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) _moveDelta.add(_forward);
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) _moveDelta.sub(_forward);
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) _moveDelta.add(_right);
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) _moveDelta.sub(_right);

      const isMoving = _moveDelta.lengthSq() > 0.001;
      if (isMoving) {
        _moveDelta.normalize().multiplyScalar(2.85 * dt);
        this.targetPos.add(_moveDelta);
        this.totalWalked += _moveDelta.length();
        this.bobPhase += dt * 9.5;
        this.callbacks.onFootstep();
      } else {
        this.bobPhase += dt * 1.8;
      }

      // Corridor collision clamping & desk avoidance
      this.targetPos.x = THREE.MathUtils.clamp(this.targetPos.x, -2.75, 2.75);
      const minZ = this.gameState.doorUnlocked ? -12.6 : -11.35;
      this.targetPos.z = THREE.MathUtils.clamp(this.targetPos.z, minZ, 5.5);

      // Simple desk bounding box push-out (x > 1.32, z in [1.15, 3.55])
      if (this.targetPos.x > 1.25 && this.targetPos.z > 1.1 && this.targetPos.z < 3.6) {
        this.targetPos.x = 1.25;
      }

      this.playerPos.x = THREE.MathUtils.damp(this.playerPos.x, this.targetPos.x, 12, dt);
      this.playerPos.z = THREE.MathUtils.damp(this.playerPos.z, this.targetPos.z, 12, dt);

      const bobOffset = isMoving ? Math.sin(this.bobPhase) * 0.042 : Math.sin(this.bobPhase) * 0.008;
      this.camera.position.set(this.playerPos.x, 1.65 + bobOffset, this.playerPos.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);

      this.updateHoverRaycast(performance.now());
    }

    // Flickering overhead fluorescents
    const flickerWave = Math.sin(elapsed * 29) * Math.sin(elapsed * 7.3);
    const flickerDip = flickerWave > 0.78 ? 0.12 : 1.0;
    if (flickerDip < 0.2 && this.gameState.powerOn && Math.random() < 0.08) {
      this.callbacks.onFlickerBuzz();
    }

    this.corridorLights.forEach((l, idx) => {
      if (!this.gameState.powerOn) {
        l.intensity = 0.03;
      } else {
        const base = idx === 1 ? 1.1 * flickerDip : 2.1;
        l.intensity = THREE.MathUtils.damp(l.intensity, base, 14, dt);
      }
    });
    this.tubeMaterials.forEach((m, idx) => {
      if (!this.gameState.powerOn) {
        m.emissiveIntensity = 0.02;
      } else {
        m.emissiveIntensity = idx === 1 ? 0.65 * flickerDip : 1.1;
      }
    });
    this.deskLamp.intensity = this.gameState.powerOn ? 1.9 + Math.sin(elapsed * 5) * 0.08 : 0.25;
    this.flashlight.intensity = this.gameState.powerOn ? 2.4 : 4.2;

    // Door smooth hinge opening
    const targetDoorAngle = this.gameState.doorUnlocked ? -Math.PI * 0.56 : 0;
    this.doorOpenAngle = THREE.MathUtils.damp(this.doorOpenAngle, targetDoorAngle, 3.2, dt);
    this.doorPivot.rotation.y = this.doorOpenAngle;

    // Stalker Entity subtle creeping & uncanny head twitch
    if (this.gameState.mode === 'playing') {
      const stalkSpeed = this.gameState.powerOn ? 0.09 : 0.34;
      if (this.entityZ < this.playerPos.z - 2.35 && !this.gameState.doorUnlocked) {
        this.entityZ += stalkSpeed * dt;
      }
      this.entityGroup.position.z = this.entityZ;
      this.entityGroup.position.x = -0.95 + Math.sin(elapsed * 0.45) * 0.38;
      this.entityHead.rotation.z = Math.sin(elapsed * 1.9) * 0.18 + (flickerDip < 0.2 ? 0.25 : 0);
      this.entityHead.lookAt(this.camera.position.x, 1.7, this.camera.position.z);
      this.entityLeftArm.rotation.x = Math.sin(elapsed * 1.4) * 0.12;
      this.entityRightArm.rotation.x = -Math.sin(elapsed * 1.4) * 0.12;

      this.entityGroup.getWorldPosition(_worldPos);
      const entDist = _worldPos.distanceTo(this.playerPos);
      const doorDist = Math.abs(this.playerPos.z - -11.9);
      const rawTension = THREE.MathUtils.clamp((1 - (entDist - 2.2) / 10.5) * 100 + (this.gameState.powerOn ? 0 : 22), 10, 100);
      this.tension = THREE.MathUtils.damp(this.tension, rawTension, 2.5, dt);

      if (elapsed - this.lastTelemetryTime > 0.25) {
        this.lastTelemetryTime = elapsed;
        this.callbacks.onStateTick({
          tension: Math.round(this.tension),
          distanceToDoor: Number(doorDist.toFixed(1)),
          entityDistance: Number(entDist.toFixed(1)),
          playerMoved: this.totalWalked > 0.6,
        });
      }
    }

    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) return;
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);

    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onWindowBlur);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.disposableResources.forEach((r) => r.dispose());
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
