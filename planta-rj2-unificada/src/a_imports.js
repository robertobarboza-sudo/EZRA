import * as T from 'three/webgpu';
import * as TSL from 'three/tsl';
import { WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
// pós-processamento estilo Unreal (TSL / WebGPU): iluminação global em tela, antisserrilhado temporal, motion blur, bloom e profundidade de campo
import { ssgi } from 'three/addons/tsl/display/SSGINode.js';
import { traa } from 'three/addons/tsl/display/TRAANode.js';
import { motionBlur } from 'three/addons/tsl/display/MotionBlur.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { dof } from 'three/addons/tsl/display/DepthOfFieldNode.js';
// cores como na calibração original (hex tratado como linear)
T.ColorManagement.enabled = false;
const THREE = {
  ...T, WebGLRenderer, OrbitControls, SkeletonUtils, RoomEnvironment, GLTFLoader, GLTFExporter, EXRLoader,
  BufferGeometryUtils: { ...BGU, mergeBufferGeometries: BGU.mergeGeometries },
};
window.THREE = THREE; window.MeshoptDecoder = MeshoptDecoder;
let PT = null;   // three-gpu-pathtracer: carregado sob demanda no modo "Foto realista"
const loadPathTracer = () => PT || (PT = import('three-gpu-pathtracer'));
