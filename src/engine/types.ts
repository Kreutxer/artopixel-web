export type PixelTool =
  | 'pencil'
  | 'eraser'
  | 'shade'
  | 'fill'
  | 'eyedropper'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'curve'
  | 'marquee'
  | 'move';

export type MirrorMode = 'none' | 'horizontal' | 'vertical' | 'quad';
export type BrushShape = 'round' | 'square';

export interface PixelLayer {
  id: string;
  name: string;
  visible: boolean;
  opacity: number;
  alphaLocked?: boolean;
  groupId: string | null;
  pixels: Uint32Array;
}

export interface LayerGroup {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
}

export interface PixelFrame {
  id: string;
  layers: PixelLayer[];
  groups: LayerGroup[];
  activeLayerIndex: number;
}

export interface CanvasFolder {
  id: string;
  name: string;
  collapsed: boolean;
  parentId?: string | null;
}

export interface CanvasDoc {
  id: string;
  name: string;
  width: number;
  height: number;
  folderId?: string | null;
  layers: PixelLayer[];
  groups: LayerGroup[];
  activeLayerIndex: number;
  frames?: PixelFrame[];
  activeFrameIndex?: number;
  fps?: number;
}

export interface PixelProject {
  id: string;
  name: string;
  width: number;
  height: number;
  layers: PixelLayer[];
  groups: LayerGroup[];
  activeLayerIndex: number;
  frames?: PixelFrame[];
  activeFrameIndex?: number;
  fps?: number;
  canvases?: CanvasDoc[];
  canvasFolders?: CanvasFolder[];
  activeCanvasIndex?: number;
  sharedPalette?: number[];
  referenceDataUrl: string | null;
  referenceVisible: boolean;
  updatedAt: number;
}

export interface SavedPalette {
  id: string;
  name: string;
  colors: number[]; // ARGB 32-bit ints
  isPreset?: boolean;
}

export interface GridRect {
  left: number;
  top: number;
  width: number;
  height: number;
}
