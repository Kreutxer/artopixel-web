import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Circle,
  Copy,
  Download,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal,
  FlipVertical,
  Grid3x3,
  Home,
  ImagePlus,
  Loader2,
  Menu,
  Moon,
  Move,
  PaintBucket,
  Pencil,
  Plus,
  Redo2,
  RotateCw,
  Scissors,
  Spline,
  Square,
  SquareDashed,
  Sun,
  Undo2,
  X,
} from 'lucide-react';
import {
  DrawAction,
  applyOutline,
  bresenham,
  brushOffsets,
  computeOpaqueBounds,
  createNewProject,
  ensureProjectFrames,
  evalDeCasteljau,
  forEachMirrored,
  inWritableBounds,
  replaceColorInBuffer,
  resizeProjectCanvas,
  shiftArgbLightness,
  wrapCoord,
} from '../engine/pixelEngine';
import { PRESET_PALETTES, argbToCss, argbToHex6 } from '../engine/paletteQuantizer';
import {
  downloadProjectPng,
  renderCompositeToCanvas,
  renderFrameToCanvas,
  saveProject,
} from '../engine/storage';
import { downloadProjectAseprite, parseAsepriteBuffer } from '../engine/asepriteParser';
import {
  downloadProjectGif,
  downloadProjectSpritesheet,
} from '../engine/gifEncoder';
import {
  BrushShape,
  GridRect,
  MirrorMode,
  PixelFrame,
  PixelLayer,
  PixelProject,
  PixelTool,
} from '../engine/types';
import { ColorPanel } from './ColorPanel';
import { LayersPanel } from './LayersPanel';
import { MinimapPanel } from './MinimapPanel';
import { TimelinePanel } from './TimelinePanel';

type ShortcutAction =
  | PixelTool
  | 'brushScrub'
  | 'brushDec'
  | 'brushInc'
  | 'pixelPerfect';

const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  pencil: 'b',
  eraser: 'e',
  shade: 's',
  fill: 'g',
  eyedropper: 'i',
  line: 'l',
  rectangle: 'r',
  circle: 'c',
  curve: 'u',
  marquee: 'm',
  move: 'v',
  brushScrub: 'f',
  brushDec: '[',
  brushInc: ']',
  pixelPerfect: 'p',
};

const SHORTCUT_LABELS: Array<[ShortcutAction, string]> = [
  ['pencil', 'Pencil'],
  ['eraser', 'Eraser'],
  ['shade', 'Shade (Lighten / Darken)'],
  ['fill', 'Fill Bucket'],
  ['eyedropper', 'Eyedropper'],
  ['line', 'Line'],
  ['rectangle', 'Rectangle'],
  ['circle', 'Circle'],
  ['curve', 'Curve'],
  ['marquee', 'Marquee Select'],
  ['move', 'Move Layer(s)'],
  ['pixelPerfect', 'Toggle Pixel Perfect'],
  ['brushScrub', 'Scrub Brush Size (+ Move)'],
  ['brushDec', 'Decrease Brush Size'],
  ['brushInc', 'Increase Brush Size'],
];

function loadShortcuts(): Record<ShortcutAction, string> {
  try {
    const raw = localStorage.getItem('artopixel_shortcuts_v1');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return { ...DEFAULT_SHORTCUTS, ...parsed };
      }
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_SHORTCUTS };
}

const ZOOM_STEPS = [
  0.25, 0.5,
  ...Array.from({ length: 40 }, (_, i) => i + 1),
];

function stepZoom(cur: number, dir: 1 | -1): number {
  if (dir > 0) {
    const next = ZOOM_STEPS.find((s) => s > cur + 0.001);
    return next ?? ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < cur - 0.001) return ZOOM_STEPS[i];
  }
  return ZOOM_STEPS[0];
}

export function EditorScreen({
  initialProject,
  theme,
  onToggleTheme,
  onBack,
}: {
  initialProject: PixelProject;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onBack: () => void;
}) {
  const [project, setProject] = useState<PixelProject>(() =>
    ensureProjectFrames(initialProject)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(true);
  const [timelineHeight, setTimelineHeight] = useState(124);
  const [timelineResizing, setTimelineResizing] = useState(false);
  const [layersWidth, setLayersWidth] = useState(244);
  const [layersResizing, setLayersResizing] = useState(false);
  const [dimOtherLayers, setDimOtherLayers] = useState(false);
  const [tool, setTool] = useState<PixelTool>('pencil');
  const [mirror, setMirror] = useState<MirrorMode>('none');
  const [mirrorPos, setMirrorPos] = useState({
    x: initialProject.width / 2,
    y: initialProject.height / 2,
  });
  const [pixelPerfect, setPixelPerfect] = useState(false);
  const [perfectShape, setPerfectShape] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  const [shapeFilled, setShapeFilled] = useState(false);
  const [shadeLighten, setShadeLighten] = useState(false);
  const [moveAllLayers, setMoveAllLayers] = useState(false);
  const [tiledMode, setTiledMode] = useState(false);
  const [brushShape, setBrushShape] = useState<BrushShape>('round');
  const [brushSizes, setBrushSizes] = useState<Record<string, number>>({});
  const [previewingSize, setPreviewingSize] = useState(false);
  const [activeColor, setActiveColor] = useState<number>(0xff000000);
  const [palette, setPalette] = useState<number[]>(PRESET_PALETTES[0].colors);
  const [showMinimap, setShowMinimap] = useState(true);
  const [showPixelGrid, setShowPixelGrid] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [layersOpen, setLayersOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('artopixel_layers_open_v1');
      if (saved !== null) return saved !== 'false';
    } catch {
      // ignore
    }
    return typeof window !== 'undefined' ? window.innerWidth >= 768 : true;
  });
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [hiddenLayerToast, setHiddenLayerToast] = useState(false);
  const [layerFinderToast, setLayerFinderToast] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [shortcuts, setShortcuts] = useState<Record<ShortcutAction, string>>(() =>
    loadShortcuts()
  );
  const [draftShortcuts, setDraftShortcuts] = useState<Record<ShortcutAction, string>>(() =>
    loadShortcuts()
  );
  const [confirmDiscardShortcuts, setConfirmDiscardShortcuts] = useState(false);
  const [listeningAction, setListeningAction] = useState<ShortcutAction | null>(null);
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const eyedropperPrevToolRef = useRef<PixelTool | null>(null);
  const [editingBrushSize, setEditingBrushSize] = useState(false);
  const [brushSizeDraft, setBrushSizeDraft] = useState('1');
  const [deletedLayerToast, setDeletedLayerToast] = useState<{
    layers: PixelLayer[];
    activeLayerIndex: number;
  } | null>(null);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [optionsSubOpen, setOptionsSubOpen] = useState(false);
  const [showResizeModal, setShowResizeModal] = useState(false);
  const [resizeW, setResizeW] = useState(initialProject.width);
  const [resizeH, setResizeH] = useState(initialProject.height);
  const [resizeAnchorX, setResizeAnchorX] = useState<'left' | 'center' | 'right'>('center');
  const [resizeAnchorY, setResizeAnchorY] = useState<'top' | 'center' | 'bottom'>('center');
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceFromColor, setReplaceFromColor] = useState<number>(0xff000000);
  const [replaceToColor, setReplaceToColor] = useState<number>(0xff000000);
  const [replaceAllFrames, setReplaceAllFrames] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [lastShape, setLastShape] = useState<'rectangle' | 'circle'>('rectangle');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialProject.name);
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{
    x: number;
    y: number;
    gx: number;
    gy: number;
  } | null>(null);
  const [ctxColorSubOpen, setCtxColorSubOpen] = useState(false);
  const [ctxSelSubOpen, setCtxSelSubOpen] = useState(false);
  const [layerPillOpen, setLayerPillOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const shapeMenuRef = useRef<HTMLDivElement | null>(null);
  const canvasCtxMenuRef = useRef<HTMLDivElement | null>(null);
  const layerPillRef = useRef<HTMLDivElement | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState<'png' | 'spritesheet' | 'gif' | 'aseprite'>('png');
  const [exportScale, setExportScale] = useState(8);
  const [sheetLayout, setSheetLayout] = useState<'horizontal' | 'grid'>('horizontal');
  const [sheetCols, setSheetCols] = useState(4);

  const [zoom, setZoom] = useState(1);
  const [baseZoom, setBaseZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<GridRect | null>(null);
  const [clipboard, setClipboard] = useState<{
    pixels: Uint32Array;
    w: number;
    h: number;
  } | null>(null);

  type FrameHistoryAction = {
    kind: 'frames';
    prevFrames: PixelFrame[];
    prevActiveFrameIndex: number;
    nextFrames: PixelFrame[];
    nextActiveFrameIndex: number;
  };
  type HistoryAction = (DrawAction & { kind?: 'draw' }) | FrameHistoryAction;

  const undoRef = useRef<HistoryAction[]>([]);
  const redoRef = useRef<HistoryAction[]>([]);
  const [, forceHistoryTick] = useState(0);

  const viewportRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const compositeRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const prevOnionRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const nextOnionRef = useRef<HTMLCanvasElement>(document.createElement('canvas'));
  const activeFrameIdRef = useRef<string>(
    project.frames?.[project.activeFrameIndex ?? 0]?.id ?? 'frame-0'
  );
  activeFrameIdRef.current =
    project.frames?.[project.activeFrameIndex ?? 0]?.id ?? 'frame-0';
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const themeCacheRef = useRef<{
    theme: string;
    cLight: string;
    cDark: string;
    accent: string;
    borderCol: string;
    patCanvas: HTMLCanvasElement;
  } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    dist: number;
    midX: number;
    midY: number;
    zoom: number;
    panX: number;
    panY: number;
  } | null>(null);

  const strokeOldRef = useRef<Map<number, number> | null>(null);
  const strokeNewRef = useRef<Map<number, number> | null>(null);
  const strokePathRef = useRef<Array<[number, number]>>([]);
  const shadedSetRef = useRef<Set<number>>(new Set());
  const lastPtRef = useRef<[number, number] | null>(null);
  const shapeStartRef = useRef<[number, number] | null>(null);
  const previewPixelsRef = useRef<Map<number, number>>(new Map());
  const isDrawingRef = useRef(false);
  const isPanningRef = useRef(false);
  const spaceHeldRef = useRef(false);
  const fHeldRef = useRef(false);
  const fScrubRef = useRef<{ startX: number; startSize: number } | null>(null);
  const lastClientXRef = useRef<number | null>(null);
  const draggingMirrorRef = useRef<'x' | 'y' | 'xy' | null>(null);
  const hoverPtRef = useRef<[number, number] | null>(null);
  const ctrlHeldRef = useRef(false);
  const hoveredLayerCacheRef = useRef<{
    key: string;
    edges: number[];
    minX: number;
    minY: number;
    name: string;
  } | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const floatingSelRef = useRef<{
    pixels: Uint32Array;
    w: number;
    h: number;
    clearedOrig: Map<number, number>;
  } | null>(null);
  const movingSelRef = useRef<{
    startGx: number;
    startGy: number;
    origLeft: number;
    origTop: number;
  } | null>(null);
  const selectionRef = useRef<GridRect | null>(null);
  selectionRef.current = selection;
  const selectedLayerIdsRef = useRef<string[]>([]);
  const moveDragRef = useRef<{
    startGx: number;
    startGy: number;
    lastDx: number;
    lastDy: number;
    snapshots: Array<{ layerId: string; layerIdx: number; orig: Uint32Array }>;
  } | null>(null);

  const curveStartRef = useRef<{ x: number; y: number } | null>(null);
  const curveEndRef = useRef<{ x: number; y: number } | null>(null);
  const curveControlsRef = useRef<Array<{ x: number; y: number }>>([]);
  const curveAdjustingRef = useRef(false);
  const curveHandleRef = useRef<number | null>(null);
  const [hasCurve, setHasCurve] = useState(false);

  const brushSize = brushSizes[tool] ?? 1;
  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const effectivePerfect = perfectShape || shiftHeld;

  useEffect(() => {
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try {
        await saveProject(project);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [project, revision]);

  useEffect(() => {
    const canvas = viewportRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const fitScale = Math.min(
      (rect.width * 0.72) / project.width,
      (rect.height * 0.72) / project.height
    );
    const initialZoom = Math.max(0.1, fitScale);
    setBaseZoom(initialZoom);
    setZoom(initialZoom);
    setPan({
      x: (rect.width - project.width * initialZoom) / 2,
      y: (rect.height - project.height * initialZoom) / 2,
    });
    setMirrorPos({ x: project.width / 2, y: project.height / 2 });
  }, [project.id, project.width, project.height]);

  const setProjectSync = useCallback(
    (updater: React.SetStateAction<PixelProject>) => {
      setProject((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const frames = next.frames;
        const fIdx = next.activeFrameIndex ?? 0;
        if (frames && frames[fIdx]) {
          const nextFrames = [...frames];
          nextFrames[fIdx] = {
            ...nextFrames[fIdx],
            layers: next.layers,
            groups: next.groups,
            activeLayerIndex: next.activeLayerIndex,
          };
          return { ...next, frames: nextFrames };
        }
        return next;
      });
    },
    []
  );

  const switchFrame = useCallback((targetIdx: number) => {
    setIsPlaying(false);
    setProject((prev) => {
      const frames = prev.frames ?? [];
      if (targetIdx < 0 || targetIdx >= frames.length) return prev;
      const curIdx = prev.activeFrameIndex ?? 0;
      const nextFrames = [...frames];
      if (nextFrames[curIdx]) {
        nextFrames[curIdx] = {
          ...nextFrames[curIdx],
          layers: prev.layers,
          groups: prev.groups,
          activeLayerIndex: prev.activeLayerIndex,
        };
      }
      const target = nextFrames[targetIdx];
      return {
        ...prev,
        frames: nextFrames,
        activeFrameIndex: targetIdx,
        layers: target.layers,
        groups: target.groups,
        activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
      };
    });
    setSelection(null);
    floatingSelRef.current = null;
    setRevision((r) => r + 1);
  }, []);

  const pushHistory = useCallback((action: HistoryAction) => {
    undoRef.current.push(action);
    if (undoRef.current.length > 80) undoRef.current.shift();
    redoRef.current = [];
    forceHistoryTick((t) => t + 1);
  }, []);

  const reorderFrame = useCallback(
    (fromIdx: number, toIdx: number) => {
      if (fromIdx === toIdx) return;
      setIsPlaying(false);
      const frames = project.frames ?? [];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= frames.length ||
        toIdx >= frames.length
      ) {
        return;
      }
      const curIdx = project.activeFrameIndex ?? 0;
      const prevFrames = [...frames];
      if (prevFrames[curIdx]) {
        prevFrames[curIdx] = {
          ...prevFrames[curIdx],
          layers: project.layers,
          groups: project.groups,
          activeLayerIndex: project.activeLayerIndex,
        };
      }
      const activeId = prevFrames[curIdx]?.id;
      const nextFrames = [...prevFrames];
      const [moved] = nextFrames.splice(fromIdx, 1);
      nextFrames.splice(toIdx, 0, moved);
      const nextActiveIdx = activeId
        ? Math.max(0, nextFrames.findIndex((f) => f.id === activeId))
        : toIdx;
      const target = nextFrames[nextActiveIdx];

      pushHistory({
        kind: 'frames',
        prevFrames,
        prevActiveFrameIndex: curIdx,
        nextFrames,
        nextActiveFrameIndex: nextActiveIdx,
      });
      setProject((prev) => ({
        ...prev,
        frames: nextFrames,
        activeFrameIndex: nextActiveIdx,
        layers: target.layers,
        groups: target.groups,
        activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
      }));
      setRevision((r) => r + 1);
    },
    [project, pushHistory]
  );

  const addFrame = useCallback(() => {
    setIsPlaying(false);
    const frames = project.frames ?? [];
    const curIdx = project.activeFrameIndex ?? 0;
    const prevFrames = [...frames];
    if (prevFrames[curIdx]) {
      prevFrames[curIdx] = {
        ...prevFrames[curIdx],
        layers: project.layers,
        groups: project.groups,
        activeLayerIndex: project.activeLayerIndex,
      };
    }
    const newLayer: PixelLayer = {
      id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Layer 1',
      visible: true,
      opacity: 1,
      groupId: null,
      pixels: new Uint32Array(project.width * project.height),
    };
    const newFrame: PixelFrame = {
      id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      layers: [newLayer],
      groups: [],
      activeLayerIndex: 0,
    };
    const insertAt = curIdx + 1;
    const nextFrames = [...prevFrames];
    nextFrames.splice(insertAt, 0, newFrame);

    pushHistory({
      kind: 'frames',
      prevFrames,
      prevActiveFrameIndex: curIdx,
      nextFrames,
      nextActiveFrameIndex: insertAt,
    });
    setProject((prev) => ({
      ...prev,
      frames: nextFrames,
      activeFrameIndex: insertAt,
      layers: newFrame.layers,
      groups: newFrame.groups,
      activeLayerIndex: 0,
    }));
    setSelection(null);
    floatingSelRef.current = null;
    setRevision((r) => r + 1);
  }, [project, pushHistory]);

  const duplicateFrame = useCallback(() => {
    setIsPlaying(false);
    const frames = project.frames ?? [];
    const curIdx = project.activeFrameIndex ?? 0;
    const prevFrames = [...frames];
    if (prevFrames[curIdx]) {
      prevFrames[curIdx] = {
        ...prevFrames[curIdx],
        layers: project.layers,
        groups: project.groups,
        activeLayerIndex: project.activeLayerIndex,
      };
    }
    const src = prevFrames[curIdx];
    if (!src) return;
    const clonedFrame: PixelFrame = {
      id: `frame_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      layers: src.layers.map((l) => ({
        ...l,
        id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pixels: new Uint32Array(l.pixels),
      })),
      groups: src.groups.map((g) => ({ ...g })),
      activeLayerIndex: src.activeLayerIndex,
    };
    const insertAt = curIdx + 1;
    const nextFrames = [...prevFrames];
    nextFrames.splice(insertAt, 0, clonedFrame);

    pushHistory({
      kind: 'frames',
      prevFrames,
      prevActiveFrameIndex: curIdx,
      nextFrames,
      nextActiveFrameIndex: insertAt,
    });
    setProject((prev) => ({
      ...prev,
      frames: nextFrames,
      activeFrameIndex: insertAt,
      layers: clonedFrame.layers,
      groups: clonedFrame.groups,
      activeLayerIndex: clonedFrame.activeLayerIndex,
    }));
    setSelection(null);
    floatingSelRef.current = null;
    setRevision((r) => r + 1);
  }, [project, pushHistory]);

  const deleteFrame = useCallback(() => {
    setIsPlaying(false);
    const frames = project.frames ?? [];
    if (frames.length <= 1) return;
    const curIdx = project.activeFrameIndex ?? 0;
    const prevFrames = [...frames];
    if (prevFrames[curIdx]) {
      prevFrames[curIdx] = {
        ...prevFrames[curIdx],
        layers: project.layers,
        groups: project.groups,
        activeLayerIndex: project.activeLayerIndex,
      };
    }
    const nextFrames = prevFrames.filter((_, idx) => idx !== curIdx);
    const nextIdx = Math.min(curIdx, nextFrames.length - 1);
    const target = nextFrames[nextIdx];

    pushHistory({
      kind: 'frames',
      prevFrames,
      prevActiveFrameIndex: curIdx,
      nextFrames,
      nextActiveFrameIndex: nextIdx,
    });
    setProject((prev) => ({
      ...prev,
      frames: nextFrames,
      activeFrameIndex: nextIdx,
      layers: target.layers,
      groups: target.groups,
      activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
    }));
    setSelection(null);
    floatingSelRef.current = null;
    setRevision((r) => r + 1);
  }, [project, pushHistory]);

  const pushAction = useCallback(
    (action: DrawAction) => {
      if (action.oldPixels.size === 0) return;
      pushHistory({
        ...action,
        kind: 'draw',
        frameId: action.frameId ?? activeFrameIdRef.current,
      });
    },
    [pushHistory]
  );

  useEffect(() => {
    if (!shapeMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-shape-toggle="true"]')) return;
      if (shapeMenuRef.current && !shapeMenuRef.current.contains(target)) {
        setShapeMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [shapeMenuOpen]);

  useEffect(() => {
    if (!layerPillOpen) return;
    const onDown = (e: PointerEvent) => {
      if (layerPillRef.current && !layerPillRef.current.contains(e.target as Node)) {
        setLayerPillOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [layerPillOpen]);

  useEffect(() => {
    if (layersOpen) setLayerPillOpen(false);
  }, [layersOpen]);

  useEffect(() => {
    if (!canvasCtxMenu) return;
    const onDown = (e: PointerEvent) => {
      if (canvasCtxMenuRef.current && !canvasCtxMenuRef.current.contains(e.target as Node)) {
        setCanvasCtxMenu(null);
        setCtxColorSubOpen(false);
        setCtxSelSubOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [canvasCtxMenu]);

  const handleImportFile = useCallback(async (file: File) => {
    const lower = file.name.toLowerCase();
    if (lower.endsWith('.ase') || lower.endsWith('.aseprite')) {
      try {
        const buf = await file.arrayBuffer();
        const baseName = file.name.replace(/\.(ase|aseprite)$/i, '') || 'Aseprite Sprite';
        const { project: imported } = await parseAsepriteBuffer(buf, baseName);
        const normalized = ensureProjectFrames(imported);
        await saveProject(normalized);
        undoRef.current = [];
        redoRef.current = [];
        forceHistoryTick((t) => t + 1);
        setProject(normalized);
        setSelection(null);
        floatingSelRef.current = null;
        setRevision((r) => r + 1);
      } catch (err) {
        window.alert(err instanceof Error ? err.message : 'Failed to parse Aseprite file.');
      }
      return;
    }

    if (!file.type.startsWith('image/')) {
      window.alert('Please choose an image (PNG/JPG/WebP), .ase, or .aseprite file.');
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w < 4 || h < 4 || w > 1024 || h > 1024) {
        window.alert(`Image must be between 4×4 and 1024×1024 pixels (got ${w}×${h}).`);
        return;
      }
      const off = document.createElement('canvas');
      off.width = w;
      off.height = h;
      const ctx = off.getContext('2d');
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, w, h).data;
      const baseName = file.name.replace(/\.[^.]+$/, '') || `Sprite ${w}x${h}`;
      const proj = ensureProjectFrames(createNewProject(baseName, w, h));
      const px = proj.layers[0].pixels;
      for (let i = 0; i < w * h; i++) {
        const off4 = i * 4;
        const r = data[off4];
        const g = data[off4 + 1];
        const b = data[off4 + 2];
        const a = data[off4 + 3];
        px[i] = a === 0 ? 0 : (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
      }
      await saveProject(proj);
      undoRef.current = [];
      redoRef.current = [];
      forceHistoryTick((t) => t + 1);
      setProject(proj);
      setSelection(null);
      floatingSelRef.current = null;
      setRevision((r) => r + 1);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      window.alert('Could not decode the selected image file.');
    };
    img.src = url;
  }, []);

  const handleUndo = useCallback(() => {
    const action = undoRef.current.pop();
    if (!action) return;
    if (action.kind === 'frames') {
      setIsPlaying(false);
      const target = action.prevFrames[action.prevActiveFrameIndex] ?? action.prevFrames[0];
      setProject((prev) => ({
        ...prev,
        frames: action.prevFrames,
        activeFrameIndex: action.prevActiveFrameIndex,
        layers: target.layers,
        groups: target.groups,
        activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
      }));
      setSelection(null);
      floatingSelRef.current = null;
      redoRef.current.push(action);
      setRevision((r) => r + 1);
      forceHistoryTick((t) => t + 1);
      return;
    }
    const targetFrame = action.frameId
      ? project.frames?.find((f) => f.id === action.frameId)
      : undefined;
    const targetLayers = targetFrame ? targetFrame.layers : project.layers;
    const apply = (layerId: string, pixels: Map<number, number>) => {
      const layer = targetLayers.find((l) => l.id === layerId);
      if (layer) {
        pixels.forEach((val, idx) => {
          layer.pixels[idx] = val;
        });
      }
    };
    apply(action.layerId, action.oldPixels);
    action.extraLayers?.forEach((ex) => apply(ex.layerId, ex.oldPixels));
    if (action.frameId && action.frameId !== activeFrameIdRef.current) {
      const targetIdx = project.frames?.findIndex((f) => f.id === action.frameId) ?? -1;
      if (targetIdx >= 0) switchFrame(targetIdx);
    }
    redoRef.current.push(action);
    setRevision((r) => r + 1);
    forceHistoryTick((t) => t + 1);
  }, [project, switchFrame]);

  const handleRedo = useCallback(() => {
    const action = redoRef.current.pop();
    if (!action) return;
    if (action.kind === 'frames') {
      setIsPlaying(false);
      const target = action.nextFrames[action.nextActiveFrameIndex] ?? action.nextFrames[0];
      setProject((prev) => ({
        ...prev,
        frames: action.nextFrames,
        activeFrameIndex: action.nextActiveFrameIndex,
        layers: target.layers,
        groups: target.groups,
        activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
      }));
      setSelection(null);
      floatingSelRef.current = null;
      undoRef.current.push(action);
      setRevision((r) => r + 1);
      forceHistoryTick((t) => t + 1);
      return;
    }
    const targetFrame = action.frameId
      ? project.frames?.find((f) => f.id === action.frameId)
      : undefined;
    const targetLayers = targetFrame ? targetFrame.layers : project.layers;
    const apply = (layerId: string, pixels: Map<number, number>) => {
      const layer = targetLayers.find((l) => l.id === layerId);
      if (layer) {
        pixels.forEach((val, idx) => {
          layer.pixels[idx] = val;
        });
      }
    };
    apply(action.layerId, action.newPixels);
    action.extraLayers?.forEach((ex) => apply(ex.layerId, ex.newPixels));
    if (action.frameId && action.frameId !== activeFrameIdRef.current) {
      const targetIdx = project.frames?.findIndex((f) => f.id === action.frameId) ?? -1;
      if (targetIdx >= 0) switchFrame(targetIdx);
    }
    undoRef.current.push(action);
    setRevision((r) => r + 1);
    forceHistoryTick((t) => t + 1);
  }, [project, switchFrame]);

  useEffect(() => {
    if (!isPlaying) return;
    const frameCount = project.frames?.length ?? 1;
    if (frameCount <= 1) {
      setIsPlaying(false);
      return;
    }
    const fps = Math.max(1, Math.min(30, project.fps ?? 8));
    const timer = window.setInterval(() => {
      setProject((prev) => {
        const frames = prev.frames ?? [];
        if (frames.length <= 1) return prev;
        const curIdx = prev.activeFrameIndex ?? 0;
        const nextFrames = [...frames];
        if (nextFrames[curIdx]) {
          nextFrames[curIdx] = {
            ...nextFrames[curIdx],
            layers: prev.layers,
            groups: prev.groups,
            activeLayerIndex: prev.activeLayerIndex,
          };
        }
        const nextIdx = (curIdx + 1) % nextFrames.length;
        const target = nextFrames[nextIdx];
        return {
          ...prev,
          frames: nextFrames,
          activeFrameIndex: nextIdx,
          layers: target.layers,
          groups: target.groups,
          activeLayerIndex: Math.min(target.activeLayerIndex, target.layers.length - 1),
        };
      });
      setRevision((r) => r + 1);
    }, Math.round(1000 / fps));
    return () => window.clearInterval(timer);
  }, [isPlaying, project.fps, project.frames?.length]);

  useEffect(() => {
    if (!onionSkin || isPlaying) return;
    const frames = project.frames ?? [];
    const fIdx = project.activeFrameIndex ?? 0;
    const w = project.width;
    const h = project.height;

    const buildTinted = (
      frame: PixelFrame | undefined,
      target: HTMLCanvasElement,
      rTint: number,
      gTint: number,
      bTint: number
    ) => {
      if (!frame) return;
      renderFrameToCanvas(w, h, frame, target);
      const ctx = target.getContext('2d');
      if (!ctx) return;
      const img = ctx.getImageData(0, 0, w, h);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) {
          d[i] = Math.round(d[i] * 0.35 + rTint * 0.65);
          d[i + 1] = Math.round(d[i + 1] * 0.35 + gTint * 0.65);
          d[i + 2] = Math.round(d[i + 2] * 0.35 + bTint * 0.65);
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    if (fIdx > 0) buildTinted(frames[fIdx - 1], prevOnionRef.current, 232, 90, 45);
    if (fIdx + 1 < frames.length) buildTinted(frames[fIdx + 1], nextOnionRef.current, 59, 130, 246);
  }, [onionSkin, isPlaying, project, revision]);

  const drawMinimap = useCallback(() => {
    if (!minimapRef.current) return;
    const m = minimapRef.current;
    const ctx = m.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, m.width, m.height);
    ctx.imageSmoothingEnabled = false;
    const sc = Math.min(m.width / project.width, m.height / project.height);
    const dw = project.width * sc;
    const dh = project.height * sc;
    ctx.drawImage(
      compositeRef.current,
      (m.width - dw) / 2,
      (m.height - dh) / 2,
      dw,
      dh
    );
  }, [project.width, project.height]);

  useEffect(() => {
    renderCompositeToCanvas(
      project,
      compositeRef.current,
      dimOtherLayers ? { activeIdx: project.activeLayerIndex, factor: 0.25 } : undefined
    );
    drawMinimap();
    drawViewportRef.current();
  }, [project, revision, showMinimap, dimOtherLayers, drawMinimap]);

  const drawViewport = useCallback(() => {
    const canvas = viewportRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const w = project.width;
    const h = project.height;
    const cw = w * zoom;
    const ch = h * zoom;

    let cache = themeCacheRef.current;
    if (!cache || cache.theme !== theme) {
      const cs = getComputedStyle(document.documentElement);
      const cLight = cs.getPropertyValue('--checker-light').trim();
      const cDark = cs.getPropertyValue('--checker-dark').trim();
      const accent = cs.getPropertyValue('--accent').trim();
      const borderCol = cs.getPropertyValue('--border').trim();

      const patCanvas = document.createElement('canvas');
      patCanvas.width = 32;
      patCanvas.height = 32;
      const pctx = patCanvas.getContext('2d')!;
      pctx.fillStyle = cLight;
      pctx.fillRect(0, 0, 32, 32);
      pctx.fillStyle = cDark;
      pctx.fillRect(16, 0, 16, 16);
      pctx.fillRect(0, 16, 16, 16);

      cache = { theme, cLight, cDark, accent, borderCol, patCanvas };
      themeCacheRef.current = cache;
    }
    const { accent, borderCol, patCanvas } = cache;

    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.imageSmoothingEnabled = false;

    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = borderCol;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    const pattern = ctx.createPattern(patCanvas, 'repeat');
    if (pattern) {
      ctx.save();
      ctx.scale(zoom, zoom);
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (tiledMode) {
      ctx.save();
      ctx.globalAlpha = 0.72;
      for (let ty = -1; ty <= 1; ty++) {
        for (let tx = -1; tx <= 1; tx++) {
          if (tx === 0 && ty === 0) continue;
          ctx.drawImage(compositeRef.current, tx * cw, ty * ch, cw, ch);
        }
      }
      ctx.restore();
    }

    if (onionSkin && !isPlaying) {
      const frames = project.frames ?? [];
      const fIdx = project.activeFrameIndex ?? 0;
      ctx.save();
      ctx.globalAlpha = 0.28;
      if (fIdx > 0 && frames[fIdx - 1]) {
        ctx.drawImage(prevOnionRef.current, 0, 0, cw, ch);
      }
      if (fIdx + 1 < frames.length && frames[fIdx + 1]) {
        ctx.drawImage(nextOnionRef.current, 0, 0, cw, ch);
      }
      ctx.restore();
    }

    ctx.drawImage(compositeRef.current, 0, 0, cw, ch);

    previewPixelsRef.current.forEach((argb, idx) => {
      const px = idx % w;
      const py = Math.floor(idx / w);
      ctx.fillStyle = argbToCss(argb);
      ctx.fillRect(px * zoom, py * zoom, zoom, zoom);
    });

    if (showPixelGrid && zoom >= 6) {
      ctx.strokeStyle = 'rgba(128,128,128,0.22)';
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      for (let x = 1; x < w; x++) {
        ctx.moveTo(x * zoom, 0);
        ctx.lineTo(x * zoom, ch);
      }
      for (let y = 1; y < h; y++) {
        ctx.moveTo(0, y * zoom);
        ctx.lineTo(cw, y * zoom);
      }
      ctx.stroke();
    }

    if (mirror !== 'none') {
      const mx = mirrorPos.x * zoom;
      const my = mirrorPos.y * zoom;
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      if (mirror === 'horizontal' || mirror === 'quad') {
        ctx.moveTo(mx, 0);
        ctx.lineTo(mx, ch);
      }
      if (mirror === 'vertical' || mirror === 'quad') {
        ctx.moveTo(0, my);
        ctx.lineTo(cw, my);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = accent;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      if (mirror === 'horizontal' || mirror === 'quad') {
        ctx.beginPath();
        ctx.moveTo(mx, -2);
        ctx.lineTo(mx - 7, -13);
        ctx.lineTo(mx + 7, -13);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      if (mirror === 'vertical' || mirror === 'quad') {
        ctx.beginPath();
        ctx.moveTo(-2, my);
        ctx.lineTo(-13, my - 7);
        ctx.lineTo(-13, my + 7);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      ctx.restore();
    }

    if (selection) {
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        selection.left * zoom,
        selection.top * zoom,
        selection.width * zoom,
        selection.height * zoom
      );
      ctx.strokeStyle = accent;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(
        selection.left * zoom,
        selection.top * zoom,
        selection.width * zoom,
        selection.height * zoom
      );
      ctx.restore();
    }

    if (curveStartRef.current && curveEndRef.current && curveControlsRef.current.length > 0) {
      const pts = [
        curveStartRef.current,
        ...curveControlsRef.current,
        curveEndRef.current,
      ];
      ctx.save();
      ctx.strokeStyle = 'rgba(150,160,180,0.85)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const sx = (pt.x + 0.5) * zoom;
        const sy = (pt.y + 0.5) * zoom;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.stroke();

      pts.forEach((pt, i) => {
        ctx.beginPath();
        ctx.arc((pt.x + 0.5) * zoom, (pt.y + 0.5) * zoom, i === 0 || i === pts.length - 1 ? 4 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 || i === pts.length - 1 ? '#ffffff' : accent;
        ctx.fill();
      });
      ctx.restore();
    }

    ctx.strokeStyle = tiledMode ? accent : borderCol;
    ctx.lineWidth = tiledMode ? 1.6 : 1.2;
    ctx.strokeRect(0, 0, cw, ch);

    if (previewingSize) {
      const cx = Math.floor(w / 2);
      const cy = Math.floor(h / 2);
      ctx.save();
      ctx.fillStyle = tool === 'eraser' ? 'rgba(255,255,255,0.28)' : argbToCss(activeColor);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      if (brushSize <= 16) {
        const offsets = brushOffsets(brushSize, brushShape);
        for (const [dx, dy] of offsets) {
          const gx = cx + dx;
          const gy = cy + dy;
          if (gx < 0 || gy < 0 || gx >= w || gy >= h) continue;
          ctx.fillRect(gx * zoom, gy * zoom, zoom, zoom);
          ctx.strokeRect(gx * zoom, gy * zoom, zoom, zoom);
        }
      } else {
        const startOff = -Math.floor((brushSize - 1) / 2);
        const rx = (cx + startOff) * zoom;
        const ry = (cy + startOff) * zoom;
        const rSize = brushSize * zoom;
        ctx.globalAlpha = 0.5;
        if (brushShape === 'round') {
          ctx.beginPath();
          ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.stroke();
        } else {
          ctx.fillRect(rx, ry, rSize, rSize);
          ctx.globalAlpha = 1;
          ctx.strokeRect(rx, ry, rSize, rSize);
        }
      }

      const startOff = brushSize <= 1 ? 0 : -Math.floor((brushSize - 1) / 2);
      const rx = (cx + startOff) * zoom;
      const ry = (cy + startOff) * zoom;
      const rSize = brushSize * zoom;
      const label = `${brushSize}px`;
      ctx.font = '700 11px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      const tw = ctx.measureText(label).width;
      const pillW = tw + 12;
      const pillH = 20;
      const pillX = rx + rSize / 2 - pillW / 2;
      const pillY = rSize >= 54 ? ry + rSize / 2 - pillH / 2 : ry - pillH - 6;
      ctx.fillStyle = 'rgba(20, 23, 31, 0.88)';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, 6);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, pillX + pillW / 2, pillY + pillH / 2 + 0.5);
      ctx.restore();
    }

    if (hoverPtRef.current && !isPanningRef.current && !fScrubRef.current && !draggingMirrorRef.current) {
      const [hx, hy] = hoverPtRef.current;
      if (tiledMode || (hx >= 0 && hy >= 0 && hx < w && hy < h)) {
        const isBrushSized =
          tool === 'pencil' || tool === 'eraser' || tool === 'shade' || tool === 'line';
        const size = isBrushSized ? brushSize : 1;
        const startOff = size <= 1 ? 0 : -Math.floor((size - 1) / 2);
        ctx.save();
        if (isBrushSized && size <= 24) {
          const offsets = brushOffsets(size, brushShape);
          ctx.fillStyle =
            tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(activeColor);
          ctx.globalAlpha = tool === 'eraser' ? 1 : 0.45;
          for (const [dx, dy] of offsets) {
            const gx = hx + dx;
            const gy = hy + dy;
            if (!tiledMode && (gx < 0 || gy < 0 || gx >= w || gy >= h)) continue;
            ctx.fillRect(gx * zoom, gy * zoom, zoom, zoom);
          }
          ctx.globalAlpha = 1;
        }
        const rx = (hx + startOff) * zoom;
        const ry = (hy + startOff) * zoom;
        const rSize = size * zoom;
        if (isBrushSized && size > 1 && brushShape === 'round') {
          if (size > 24) {
            ctx.fillStyle =
              tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(activeColor);
            ctx.globalAlpha = 0.35;
            ctx.beginPath();
            ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }
          ctx.beginPath();
          ctx.arc(rx + rSize / 2, ry + rSize / 2, rSize / 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 1;
          ctx.stroke();
        } else {
          if (size > 24 && isBrushSized) {
            ctx.fillStyle =
              tool === 'eraser' ? 'rgba(255,255,255,0.22)' : argbToCss(activeColor);
            ctx.globalAlpha = 0.35;
            ctx.fillRect(rx, ry, rSize, rSize);
            ctx.globalAlpha = 1;
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.6)';
          ctx.lineWidth = 2;
          ctx.strokeRect(rx, ry, rSize, rSize);
          ctx.strokeStyle = 'rgba(255,255,255,0.92)';
          ctx.lineWidth = 1;
          ctx.strokeRect(rx, ry, rSize, rSize);
        }
        ctx.restore();
      }
    }

    if (
      ctrlHeldRef.current &&
      hoverPtRef.current &&
      !isPanningRef.current &&
      !isDrawingRef.current
    ) {
      const [hx, hy] = hoverPtRef.current;
      if (hx >= 0 && hy >= 0 && hx < w && hy < h) {
        const hIdx = hy * w + hx;
        let foundLayerIdx = -1;
        for (let i = project.layers.length - 1; i >= 0; i--) {
          const lay = project.layers[i];
          if (!lay.visible) continue;
          if (lay.groupId) {
            const grp = project.groups.find((g) => g.id === lay.groupId);
            if (grp && !grp.visible) continue;
          }
          if (((lay.pixels[hIdx] >>> 24) & 0xff) > 0) {
            foundLayerIdx = i;
            break;
          }
        }

        if (foundLayerIdx >= 0) {
          const lay = project.layers[foundLayerIdx];
          const cacheKey = `${activeFrameIdRef.current}:${lay.id}:${revision}`;
          let cached = hoveredLayerCacheRef.current;
          if (!cached || cached.key !== cacheKey) {
            const edges: number[] = [];
            let minX = w;
            let minY = h;
            const px = lay.pixels;
            for (let py = 0; py < h; py++) {
              for (let pxx = 0; pxx < w; pxx++) {
                if (((px[py * w + pxx] >>> 24) & 0xff) === 0) continue;
                if (pxx < minX) minX = pxx;
                if (py < minY) minY = py;
                if (py === 0 || ((px[(py - 1) * w + pxx] >>> 24) & 0xff) === 0) {
                  edges.push(pxx, py, pxx + 1, py);
                }
                if (py === h - 1 || ((px[(py + 1) * w + pxx] >>> 24) & 0xff) === 0) {
                  edges.push(pxx, py + 1, pxx + 1, py + 1);
                }
                if (pxx === 0 || ((px[py * w + (pxx - 1)] >>> 24) & 0xff) === 0) {
                  edges.push(pxx, py, pxx, py + 1);
                }
                if (pxx === w - 1 || ((px[py * w + (pxx + 1)] >>> 24) & 0xff) === 0) {
                  edges.push(pxx + 1, py, pxx + 1, py + 1);
                }
              }
            }
            cached = { key: cacheKey, edges, minX, minY, name: lay.name };
            hoveredLayerCacheRef.current = cached;
          }

          if (cached.edges.length > 0) {
            ctx.save();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 1.75;
            ctx.beginPath();
            const eArr = cached.edges;
            for (let i = 0; i < eArr.length; i += 4) {
              ctx.moveTo(eArr[i] * zoom, eArr[i + 1] * zoom);
              ctx.lineTo(eArr[i + 2] * zoom, eArr[i + 3] * zoom);
            }
            ctx.stroke();

            // Tiny Figma-style layer name badge above the hovered silhouette
            ctx.font = '600 11px system-ui, -apple-system, sans-serif';
            const labelW = ctx.measureText(cached.name).width + 10;
            const lx = cached.minX * zoom;
            const ly = cached.minY * zoom - 20;
            ctx.fillStyle = '#3b82f6';
            ctx.beginPath();
            ctx.roundRect(lx, ly, labelW, 17, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.fillText(cached.name, lx + 5, ly + 12);
            ctx.restore();
          }
        }
      }
    }

    ctx.restore();
    ctx.restore();
  }, [
    project,
    zoom,
    pan,
    tiledMode,
    showPixelGrid,
    mirror,
    mirrorPos,
    selection,
    previewingSize,
    brushSize,
    brushShape,
    tool,
    activeColor,
    revision,
    theme,
    onionSkin,
    isPlaying,
  ]);

  const drawViewportRef = useRef(drawViewport);
  drawViewportRef.current = drawViewport;

  useEffect(() => {
    drawViewport();
  }, [drawViewport]);

  useEffect(() => {
    const canvas = viewportRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => drawViewportRef.current());
    ro.observe(canvas);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!hiddenLayerToast) return;
    const t = setTimeout(() => setHiddenLayerToast(false), 3500);
    return () => clearTimeout(t);
  }, [hiddenLayerToast]);

  useEffect(() => {
    if (!layerFinderToast) return;
    const t = setTimeout(() => setLayerFinderToast(null), 1600);
    return () => clearTimeout(t);
  }, [layerFinderToast]);

  useEffect(() => {
    if (!deletedLayerToast) return;
    const t = setTimeout(() => setDeletedLayerToast(null), 4000);
    return () => clearTimeout(t);
  }, [deletedLayerToast]);

  const hasUnsavedShortcuts =
    JSON.stringify(draftShortcuts) !== JSON.stringify(shortcuts);

  const attemptCloseShortcuts = useCallback(() => {
    setListeningAction(null);
    if (JSON.stringify(draftShortcuts) !== JSON.stringify(shortcuts)) {
      setConfirmDiscardShortcuts(true);
    } else {
      setShowHelpModal(false);
    }
  }, [draftShortcuts, shortcuts]);

  const applyDraftShortcuts = useCallback(() => {
    setShortcuts(draftShortcuts);
    try {
      localStorage.setItem('artopixel_shortcuts_v1', JSON.stringify(draftShortcuts));
    } catch {
      // ignore
    }
    setListeningAction(null);
    setConfirmDiscardShortcuts(false);
    setShowHelpModal(false);
  }, [draftShortcuts]);

  useEffect(() => {
    if (!showMoreMenu && !showExportModal && !showHelpModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowMoreMenu(false);
        setShowExportModal(false);
        if (showHelpModal) attemptCloseShortcuts();
      }
    };
    const onPointerDown = (e: PointerEvent) => {
      if (
        showMoreMenu &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(e.target as Node)
      ) {
        setShowMoreMenu(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [showMoreMenu, showExportModal, showHelpModal, attemptCloseShortcuts]);
  const screenToGrid = (clientX: number, clientY: number): [number, number] => {
    const rect = viewportRef.current!.getBoundingClientRect();
    const gx = Math.floor((clientX - rect.left - pan.x) / zoom);
    const gy = Math.floor((clientY - rect.top - pan.y) / zoom);
    return [gx, gy];
  };

  const writePixel = (x: number, y: number, color: number) => {
    const [wx, wy] = wrapCoord(x, y, project.width, project.height, tiledMode);
    if (!inWritableBounds(wx, wy, project.width, project.height, selection)) return;
    const layer = project.layers[project.activeLayerIndex];
    if (!layer.visible) return;
    const idx = wy * project.width + wx;
    if (layer.alphaLocked && ((layer.pixels[idx] >>> 24) & 0xff) === 0) return;
    if (layer.pixels[idx] === color) return;
    if (!strokeOldRef.current!.has(idx)) {
      strokeOldRef.current!.set(idx, layer.pixels[idx]);
    }
    strokeNewRef.current!.set(idx, color);
    layer.pixels[idx] = color;
  };

  const shadePixel = (x: number, y: number) => {
    const [wx, wy] = wrapCoord(x, y, project.width, project.height, tiledMode);
    if (!inWritableBounds(wx, wy, project.width, project.height, selection)) return;
    const layer = project.layers[project.activeLayerIndex];
    if (!layer.visible) return;
    const idx = wy * project.width + wx;
    if (shadedSetRef.current.has(idx)) return;
    const cur = layer.pixels[idx];
    if (((cur >>> 24) & 0xff) === 0) return;
    shadedSetRef.current.add(idx);
    const next = shiftArgbLightness(cur, shadeLighten ? 0.08 : -0.08);
    if (next === cur) return;
    if (!strokeOldRef.current!.has(idx)) strokeOldRef.current!.set(idx, cur);
    strokeNewRef.current!.set(idx, next);
    layer.pixels[idx] = next;
  };

  const applyBrushPoint = (x: number, y: number) => {
    const prevPt = strokePathRef.current[strokePathRef.current.length - 1];
    if (prevPt && prevPt[0] === x && prevPt[1] === y) return;

    if (
      pixelPerfect &&
      (tool === 'pencil' || tool === 'shade') &&
      brushSize === 1 &&
      strokePathRef.current.length >= 2
    ) {
      const a = strokePathRef.current[strokePathRef.current.length - 2];
      const b = strokePathRef.current[strokePathRef.current.length - 1];
      const diag = Math.abs(x - a[0]) === 1 && Math.abs(y - a[1]) === 1;
      const corner = (b[0] === a[0] && b[1] === y) || (b[1] === a[1] && b[0] === x);
      if (diag && corner) {
        forEachMirrored(b[0], b[1], project.width, project.height, mirror, (mx, my) => {
          const [wx, wy] = wrapCoord(mx, my, project.width, project.height, tiledMode);
          const idx = wy * project.width + wx;
          if (strokeOldRef.current?.has(idx)) {
            project.layers[project.activeLayerIndex].pixels[idx] =
              strokeOldRef.current.get(idx)!;
            strokeOldRef.current.delete(idx);
            strokeNewRef.current?.delete(idx);
          }
          shadedSetRef.current.delete(idx);
        }, mirrorPos.x, mirrorPos.y);
        strokePathRef.current.pop();
      }
    }
    strokePathRef.current.push([x, y]);
    const offsets = brushOffsets(brushSize, brushShape);
    forEachMirrored(x, y, project.width, project.height, mirror, (mx, my) => {
      for (const [dx, dy] of offsets) {
        if (tool === 'shade') shadePixel(mx + dx, my + dy);
        else writePixel(mx + dx, my + dy, tool === 'eraser' ? 0 : activeColor);
      }
    }, mirrorPos.x, mirrorPos.y);
  };

  const updateShapePreview = (rawEndX: number, rawEndY: number) => {
    previewPixelsRef.current.clear();
    const [x0, y0] = shapeStartRef.current!;
    let endX = rawEndX;
    let endY = rawEndY;
    if (effectivePerfect && (tool === 'rectangle' || tool === 'circle')) {
      const dx = rawEndX - x0;
      const dy = rawEndY - y0;
      const side = Math.max(Math.abs(dx), Math.abs(dy));
      endX = x0 + side * (dx === 0 ? 1 : Math.sign(dx));
      endY = y0 + side * (dy === 0 ? 1 : Math.sign(dy));
    }

    const plot = (x: number, y: number) => {
      forEachMirrored(x, y, project.width, project.height, mirror, (mx, my) => {
        const [wx, wy] = wrapCoord(mx, my, project.width, project.height, tiledMode);
        if (inWritableBounds(wx, wy, project.width, project.height, selection)) {
          previewPixelsRef.current.set(wy * project.width + wx, activeColor);
        }
      }, mirrorPos.x, mirrorPos.y);
    };

    if (tool === 'line') {
      const offs = brushOffsets(brushSize, brushShape);
      bresenham(x0, y0, endX, endY, (lx, ly) => {
        for (const [dx, dy] of offs) plot(lx + dx, ly + dy);
      });
    } else if (tool === 'rectangle') {
      const minX = Math.min(x0, endX), maxX = Math.max(x0, endX);
      const minY = Math.min(y0, endY), maxY = Math.max(y0, endY);
      if (shapeFilled) {
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) plot(x, y);
        }
      } else {
        for (let x = minX; x <= maxX; x++) {
          plot(x, minY);
          plot(x, maxY);
        }
        for (let y = minY; y <= maxY; y++) {
          plot(minX, y);
          plot(maxX, y);
        }
      }
    } else if (tool === 'circle') {
      const minX = Math.min(x0, endX), maxX = Math.max(x0, endX);
      const minY = Math.min(y0, endY), maxY = Math.max(y0, endY);
      const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
      const rx = (maxX - minX) / 2, ry = (maxY - minY) / 2;
      if (shapeFilled) {
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const nx = rx === 0 ? 0 : (x - cx) / rx;
            const ny = ry === 0 ? 0 : (y - cy) / ry;
            if (nx * nx + ny * ny <= 1.08) plot(x, y);
          }
        }
      } else {
        const steps = Math.max(24, Math.ceil((rx + ry) * 4));
        let prev: [number, number] | null = null;
        for (let i = 0; i <= steps; i++) {
          const th = (i / steps) * Math.PI * 2;
          const px = Math.round(cx + rx * Math.cos(th));
          const py = Math.round(cy + ry * Math.sin(th));
          if (prev) bresenham(prev[0], prev[1], px, py, plot);
          else plot(px, py);
          prev = [px, py];
        }
      }
    }
    drawViewport();
  };

  const updateCurvePreview = () => {
    previewPixelsRef.current.clear();
    if (!curveStartRef.current || !curveEndRef.current) return;
    const pts = [
      curveStartRef.current,
      ...curveControlsRef.current,
      curveEndRef.current,
    ];
    const plot = (x: number, y: number) => {
      forEachMirrored(x, y, project.width, project.height, mirror, (mx, my) => {
        const [wx, wy] = wrapCoord(mx, my, project.width, project.height, tiledMode);
        if (inWritableBounds(wx, wy, project.width, project.height, selection)) {
          previewPixelsRef.current.set(wy * project.width + wx, activeColor);
        }
      }, mirrorPos.x, mirrorPos.y);
    };
    const steps = Math.max(24, pts.length * 20);
    let prev: [number, number] | null = null;
    for (let i = 0; i <= steps; i++) {
      const pt = evalDeCasteljau(pts, i / steps);
      const px = Math.round(pt.x), py = Math.round(pt.y);
      if (prev) bresenham(prev[0], prev[1], px, py, plot);
      else plot(px, py);
      prev = [px, py];
    }
    drawViewport();
  };

  const commitPreview = () => {
    if (previewPixelsRef.current.size === 0) return;
    const layer = project.layers[project.activeLayerIndex];
    const oldMap = new Map<number, number>();
    const newMap = new Map<number, number>();
    previewPixelsRef.current.forEach((col, idx) => {
      if (layer.alphaLocked && ((layer.pixels[idx] >>> 24) & 0xff) === 0) return;
      if (layer.pixels[idx] !== col) {
        oldMap.set(idx, layer.pixels[idx]);
        newMap.set(idx, col);
        layer.pixels[idx] = col;
      }
    });
    previewPixelsRef.current.clear();
    if (oldMap.size > 0) {
      pushAction({ layerId: layer.id, oldPixels: oldMap, newPixels: newMap });
      setRevision((r) => r + 1);
    }
  };

  const commitCurve = () => {
    commitPreview();
    curveStartRef.current = null;
    curveEndRef.current = null;
    curveControlsRef.current = [];
    curveAdjustingRef.current = false;
    curveHandleRef.current = null;
    setHasCurve(false);
    drawViewport();
  };

  const cancelCurve = () => {
    previewPixelsRef.current.clear();
    curveStartRef.current = null;
    curveEndRef.current = null;
    curveControlsRef.current = [];
    curveAdjustingRef.current = false;
    curveHandleRef.current = null;
    setHasCurve(false);
    drawViewport();
  };

  const syncFloatingPreview = useCallback(
    (rect: GridRect) => {
      previewPixelsRef.current.clear();
      const fl = floatingSelRef.current;
      if (!fl) return;
      for (let sy = 0; sy < fl.h; sy++) {
        for (let sx = 0; sx < fl.w; sx++) {
          const val = fl.pixels[sy * fl.w + sx];
          if (val === 0) continue;
          const dx = rect.left + sx;
          const dy = rect.top + sy;
          if (dx >= 0 && dy >= 0 && dx < project.width && dy < project.height) {
            previewPixelsRef.current.set(dy * project.width + dx, val);
          }
        }
      }
      drawViewport();
    },
    [project.width, project.height, drawViewport]
  );

  const liftSelectionToFloating = useCallback(
    (rect: GridRect) => {
      if (floatingSelRef.current) return floatingSelRef.current;
      const layer = project.layers[project.activeLayerIndex];
      const buf = new Uint32Array(rect.width * rect.height);
      const clearedOrig = new Map<number, number>();
      for (let sy = 0; sy < rect.height; sy++) {
        for (let sx = 0; sx < rect.width; sx++) {
          const gx = rect.left + sx;
          const gy = rect.top + sy;
          if (gx < 0 || gy < 0 || gx >= project.width || gy >= project.height) continue;
          const idx = gy * project.width + gx;
          const val = layer.pixels[idx];
          buf[sy * rect.width + sx] = val;
          if (val !== 0) {
            clearedOrig.set(idx, val);
            layer.pixels[idx] = 0;
          }
        }
      }
      const fl = { pixels: buf, w: rect.width, h: rect.height, clearedOrig };
      floatingSelRef.current = fl;
      setRevision((r) => r + 1);
      syncFloatingPreview(rect);
      return fl;
    },
    [project, syncFloatingPreview]
  );

  const commitFloatingSelection = useCallback(() => {
    const fl = floatingSelRef.current;
    const rect = selectionRef.current;
    if (!fl || !rect) return;
    const layer = project.layers[project.activeLayerIndex];
    const oldMap = new Map<number, number>();
    const newMap = new Map<number, number>();
    fl.clearedOrig.forEach((origVal, idx) => {
      oldMap.set(idx, origVal);
      newMap.set(idx, 0);
    });
    for (let sy = 0; sy < fl.h; sy++) {
      for (let sx = 0; sx < fl.w; sx++) {
        const val = fl.pixels[sy * fl.w + sx];
        if (val === 0) continue;
        const gx = rect.left + sx;
        const gy = rect.top + sy;
        if (gx < 0 || gy < 0 || gx >= project.width || gy >= project.height) continue;
        const idx = gy * project.width + gx;
        if (!oldMap.has(idx)) oldMap.set(idx, layer.pixels[idx]);
        newMap.set(idx, val);
        layer.pixels[idx] = val;
      }
    }
    floatingSelRef.current = null;
    previewPixelsRef.current.clear();
    if (oldMap.size > 0) {
      pushAction({ layerId: layer.id, oldPixels: oldMap, newPixels: newMap });
    }
    setRevision((r) => r + 1);
  }, [project, pushAction]);

  const cancelFloatingSelection = useCallback(() => {
    const fl = floatingSelRef.current;
    if (fl) {
      const layer = project.layers[project.activeLayerIndex];
      fl.clearedOrig.forEach((origVal, idx) => {
        layer.pixels[idx] = origVal;
      });
      floatingSelRef.current = null;
      previewPixelsRef.current.clear();
      setRevision((r) => r + 1);
    }
    setSelection(null);
  }, [project]);

  const deleteSelectionPixels = useCallback(() => {
    const rect = selectionRef.current;
    if (!rect) return;
    const layer = project.layers[project.activeLayerIndex];
    const fl = floatingSelRef.current;
    if (fl) {
      const newMap = new Map<number, number>();
      fl.clearedOrig.forEach((_, idx) => newMap.set(idx, 0));
      if (fl.clearedOrig.size > 0) {
        pushAction({ layerId: layer.id, oldPixels: fl.clearedOrig, newPixels: newMap });
      }
      floatingSelRef.current = null;
      previewPixelsRef.current.clear();
      setRevision((r) => r + 1);
      return;
    }
    const oldM = new Map<number, number>();
    const newM = new Map<number, number>();
    for (let sy = 0; sy < rect.height; sy++) {
      for (let sx = 0; sx < rect.width; sx++) {
        const gx = rect.left + sx;
        const gy = rect.top + sy;
        if (gx < 0 || gy < 0 || gx >= project.width || gy >= project.height) continue;
        const idx = gy * project.width + gx;
        if (layer.pixels[idx] !== 0) {
          oldM.set(idx, layer.pixels[idx]);
          newM.set(idx, 0);
          layer.pixels[idx] = 0;
        }
      }
    }
    if (oldM.size > 0) {
      pushAction({ layerId: layer.id, oldPixels: oldM, newPixels: newM });
      setRevision((r) => r + 1);
    }
  }, [project, pushAction]);

  const flipSelection = useCallback(
    (axis: 'h' | 'v') => {
      const rect = selectionRef.current;
      if (!rect) return;
      const fl = liftSelectionToFloating(rect);
      const next = new Uint32Array(fl.w * fl.h);
      for (let y = 0; y < fl.h; y++) {
        for (let x = 0; x < fl.w; x++) {
          const dx = axis === 'h' ? fl.w - 1 - x : x;
          const dy = axis === 'v' ? fl.h - 1 - y : y;
          next[dy * fl.w + dx] = fl.pixels[y * fl.w + x];
        }
      }
      fl.pixels = next;
      syncFloatingPreview(rect);
    },
    [liftSelectionToFloating, syncFloatingPreview]
  );

  const rotateSelection90 = useCallback(() => {
    const rect = selectionRef.current;
    if (!rect) return;
    const fl = liftSelectionToFloating(rect);
    const nw = fl.h;
    const nh = fl.w;
    const next = new Uint32Array(nw * nh);
    for (let y = 0; y < fl.h; y++) {
      for (let x = 0; x < fl.w; x++) {
        const dx = fl.h - 1 - y;
        const dy = x;
        next[dy * nw + dx] = fl.pixels[y * fl.w + x];
      }
    }
    fl.pixels = next;
    fl.w = nw;
    fl.h = nh;
    const nextRect = { ...rect, width: nw, height: nh };
    setSelection(nextRect);
    syncFloatingPreview(nextRect);
  }, [liftSelectionToFloating, syncFloatingPreview]);

  const getMoveTargetIndices = useCallback(
    (forceAll = false): number[] => {
      if (forceAll || moveAllLayers) {
        return project.layers.map((_, i) => i);
      }
      if (selectedLayerIdsRef.current.length > 0) {
        const idxs = project.layers
          .map((l, i) => (selectedLayerIdsRef.current.includes(l.id) ? i : -1))
          .filter((i) => i >= 0);
        if (idxs.length > 0) return idxs;
      }
      return [project.activeLayerIndex];
    },
    [project.layers, project.activeLayerIndex, moveAllLayers]
  );

  const shiftBuffer = useCallback(
    (src: Uint32Array, dst: Uint32Array, dx: number, dy: number) => {
      const w = project.width;
      const h = project.height;
      dst.fill(0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const val = src[y * w + x];
          if (val === 0) continue;
          let nx = x + dx;
          let ny = y + dy;
          if (tiledMode) {
            nx = ((nx % w) + w) % w;
            ny = ((ny % h) + h) % h;
          } else if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            continue;
          }
          dst[ny * w + nx] = val;
        }
      }
    },
    [project.width, project.height, tiledMode]
  );

  const nudgeMoveLayers = useCallback(
    (dx: number, dy: number) => {
      const indices = getMoveTargetIndices(shiftHeld);
      const diffs: Array<{
        layerId: string;
        oldPixels: Map<number, number>;
        newPixels: Map<number, number>;
      }> = [];
      for (const idx of indices) {
        const layer = project.layers[idx];
        const orig = new Uint32Array(layer.pixels);
        shiftBuffer(orig, layer.pixels, dx, dy);
        const oldPixels = new Map<number, number>();
        const newPixels = new Map<number, number>();
        for (let i = 0; i < orig.length; i++) {
          if (orig[i] !== layer.pixels[i]) {
            oldPixels.set(i, orig[i]);
            newPixels.set(i, layer.pixels[i]);
          }
        }
        if (oldPixels.size > 0) {
          diffs.push({ layerId: layer.id, oldPixels, newPixels });
        }
      }
      if (diffs.length > 0) {
        pushAction({
          layerId: diffs[0].layerId,
          oldPixels: diffs[0].oldPixels,
          newPixels: diffs[0].newPixels,
          extraLayers: diffs.slice(1),
        });
        setRevision((r) => r + 1);
      }
    },
    [getMoveTargetIndices, shiftHeld, project.layers, shiftBuffer, pushAction]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      pinchRef.current = { dist, midX, midY, zoom, panX: pan.x, panY: pan.y };
      isDrawingRef.current = false;
      isPanningRef.current = false;
      previewPixelsRef.current.clear();
      return;
    }

    if (fHeldRef.current) {
      fScrubRef.current = { startX: e.clientX, startSize: brushSize };
      setPreviewingSize(true);
      return;
    }

    if (mirror !== 'none' && e.button === 0 && !spaceHeldRef.current) {
      const rect = viewportRef.current!.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const mxScreen = pan.x + mirrorPos.x * zoom;
      const myScreen = pan.y + mirrorPos.y * zoom;
      const hitTopTri =
        (mirror === 'horizontal' || mirror === 'quad') &&
        Math.abs(sx - mxScreen) <= 12 &&
        sy >= pan.y - 18 &&
        sy <= pan.y + 2;
      const hitLeftTri =
        (mirror === 'vertical' || mirror === 'quad') &&
        Math.abs(sy - myScreen) <= 12 &&
        sx >= pan.x - 18 &&
        sx <= pan.x + 2;
      if (hitTopTri) {
        draggingMirrorRef.current = 'x';
        return;
      }
      if (hitLeftTri) {
        draggingMirrorRef.current = 'y';
        return;
      }
    }

    if (e.button === 1 || spaceHeldRef.current) {
      isPanningRef.current = true;
      panStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      return;
    }

    const [gx, gy] = screenToGrid(e.clientX, e.clientY);

    if (e.button === 0 && (e.ctrlKey || e.metaKey) && !spaceHeldRef.current) {
      if (gx >= 0 && gy >= 0 && gx < project.width && gy < project.height) {
        const idx = gy * project.width + gx;
        for (let i = project.layers.length - 1; i >= 0; i--) {
          const lay = project.layers[i];
          if (!lay.visible) continue;
          if (lay.groupId) {
            const grp = project.groups.find((g) => g.id === lay.groupId);
            if (grp && !grp.visible) continue;
          }
          if (((lay.pixels[idx] >>> 24) & 0xff) > 0) {
            setProjectSync((p) => ({ ...p, activeLayerIndex: i }));
            setLayerFinderToast(`Selected: ${lay.name}`);
            break;
          }
        }
      }
      return;
    }

    if (e.button === 2) {
      if (tool === 'curve' && curveAdjustingRef.current && curveControlsRef.current.length > 1) {
        const hitR = Math.max(1.0, 2.2 / zoom);
        const idx = curveControlsRef.current.findIndex(
          (pt) => Math.hypot(pt.x - gx, pt.y - gy) <= hitR
        );
        if (idx >= 0) {
          curveControlsRef.current.splice(idx, 1);
          updateCurvePreview();
          return;
        }
      }
      return;
    }

    if (!tiledMode && (gx < 0 || gy < 0 || gx >= project.width || gy >= project.height)) {
      return;
    }

    if (tool === 'eyedropper') {
      const [wx, wy] = wrapCoord(gx, gy, project.width, project.height, tiledMode);
      const idx = wy * project.width + wx;
      for (let i = project.layers.length - 1; i >= 0; i--) {
        if (!project.layers[i].visible) continue;
        const argb = project.layers[i].pixels[idx];
        if (((argb >>> 24) & 0xff) > 0) {
          setActiveColor(argb);
          if (eyedropperPrevToolRef.current === null) {
            setTool('pencil');
          }
          break;
        }
      }
      return;
    }

    if (tool === 'fill') {
      const layer = project.layers[project.activeLayerIndex];
      if (!layer.visible) {
        setHiddenLayerToast(true);
        return;
      }
      const oldMap = new Map<number, number>();
      const newMap = new Map<number, number>();
      const [wx, wy] = wrapCoord(gx, gy, project.width, project.height, tiledMode);
      forEachMirrored(wx, wy, project.width, project.height, mirror, (sx, sy) => {
        if (!inWritableBounds(sx, sy, project.width, project.height, selection)) return;
        const startIdx = sy * project.width + sx;
        const target = layer.pixels[startIdx];
        if (layer.alphaLocked && ((target >>> 24) & 0xff) === 0) return;
        if (target === activeColor) return;
        const q = [startIdx];
        let head = 0;
        const vis = new Uint8Array(project.width * project.height);
        vis[startIdx] = 1;
        while (head < q.length) {
          const idx = q[head++];
          if (!oldMap.has(idx)) oldMap.set(idx, layer.pixels[idx]);
          newMap.set(idx, activeColor);
          layer.pixels[idx] = activeColor;
          const cx = idx % project.width, cy = Math.floor(idx / project.width);
          for (const [rx, ry] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
            const [nx, ny] = wrapCoord(rx, ry, project.width, project.height, tiledMode);
            if (!inWritableBounds(nx, ny, project.width, project.height, selection)) continue;
            const nIdx = ny * project.width + nx;
            if (!vis[nIdx] && layer.pixels[nIdx] === target) {
              vis[nIdx] = 1;
              q.push(nIdx);
            }
          }
        }
      }, mirrorPos.x, mirrorPos.y);
      if (oldMap.size > 0) {
        pushAction({ layerId: layer.id, oldPixels: oldMap, newPixels: newMap });
        setRevision((r) => r + 1);
      }
      return;
    }

    if (!project.layers[project.activeLayerIndex]?.visible) {
      setHiddenLayerToast(true);
    }

    isDrawingRef.current = true;
    if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      shapeStartRef.current = [gx, gy];
      updateShapePreview(gx, gy);
      return;
    }

    if (tool === 'curve') {
      if (!curveAdjustingRef.current) {
        curveStartRef.current = { x: gx, y: gy };
        curveEndRef.current = { x: gx, y: gy };
        curveControlsRef.current = [{ x: gx, y: gy }];
        curveHandleRef.current = -2;
        setHasCurve(true);
        updateCurvePreview();
      } else {
        const hitR = Math.max(1.0, 2.2 / zoom);
        let found: number | null = null;
        curveControlsRef.current.forEach((pt, idx) => {
          if (found === null && Math.hypot(pt.x - gx, pt.y - gy) <= hitR) found = idx;
        });
        if (found === null && Math.hypot(curveStartRef.current!.x - gx, curveStartRef.current!.y - gy) <= hitR) {
          found = -1;
        }
        if (found === null && Math.hypot(curveEndRef.current!.x - gx, curveEndRef.current!.y - gy) <= hitR) {
          found = -2;
        }
        if (found !== null) {
          curveHandleRef.current = found;
        } else {
          const chain = [
            curveStartRef.current!,
            ...curveControlsRef.current,
            curveEndRef.current!,
          ];
          let bestIdx = curveControlsRef.current.length;
          let bestDist = Infinity;
          for (let i = 0; i < chain.length - 1; i++) {
            const a = chain[i];
            const b = chain[i + 1];
            const vx = b.x - a.x;
            const vy = b.y - a.y;
            const lenSq = vx * vx + vy * vy;
            const t = lenSq > 0 ? Math.max(0, Math.min(1, ((gx - a.x) * vx + (gy - a.y) * vy) / lenSq)) : 0;
            const px = a.x + t * vx;
            const py = a.y + t * vy;
            const d = Math.hypot(gx - px, gy - py);
            if (d < bestDist) {
              bestDist = d;
              bestIdx = i;
            }
          }
          curveControlsRef.current.splice(bestIdx, 0, { x: gx, y: gy });
          curveHandleRef.current = bestIdx;
          updateCurvePreview();
        }
      }
      return;
    }

    if (tool === 'move') {
      isDrawingRef.current = true;
      const indices = getMoveTargetIndices(e.shiftKey);
      const snapshots = indices.map((idx) => ({
        layerId: project.layers[idx].id,
        layerIdx: idx,
        orig: new Uint32Array(project.layers[idx].pixels),
      }));
      moveDragRef.current = {
        startGx: gx,
        startGy: gy,
        lastDx: 0,
        lastDy: 0,
        snapshots,
      };
      return;
    }

    if (tool === 'marquee') {
      if (
        selection &&
        gx >= selection.left &&
        gx < selection.left + selection.width &&
        gy >= selection.top &&
        gy < selection.top + selection.height
      ) {
        liftSelectionToFloating(selection);
        movingSelRef.current = {
          startGx: gx,
          startGy: gy,
          origLeft: selection.left,
          origTop: selection.top,
        };
        return;
      }
      commitFloatingSelection();
      shapeStartRef.current = [gx, gy];
      setSelection({ left: gx, top: gy, width: 1, height: 1 });
      return;
    }

    strokeOldRef.current = new Map();
    strokeNewRef.current = new Map();
    strokePathRef.current = [];
    shadedSetRef.current.clear();
    lastPtRef.current = [gx, gy];
    applyBrushPoint(gx, gy);
    setRevision((r) => r + 1);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    lastClientXRef.current = e.clientX;
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pinchRef.current && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const rect = viewportRef.current!.getBoundingClientRect();
      const base = pinchRef.current;
      const scale = base.dist > 0 ? dist / base.dist : 1;
      const nextZoom = Math.min(40, Math.max(0.15, base.zoom * scale));
      const worldX = (base.midX - rect.left - base.panX) / base.zoom;
      const worldY = (base.midY - rect.top - base.panY) / base.zoom;
      setZoom(nextZoom);
      setPan({
        x: midX - rect.left - worldX * nextZoom,
        y: midY - rect.top - worldY * nextZoom,
      });
      return;
    }
    if (draggingMirrorRef.current) {
      const rect = viewportRef.current!.getBoundingClientRect();
      const rawX = (e.clientX - rect.left - pan.x) / zoom;
      const rawY = (e.clientY - rect.top - pan.y) / zoom;
      const snapX = Math.max(1, Math.min(project.width - 1, Math.round(rawX)));
      const snapY = Math.max(1, Math.min(project.height - 1, Math.round(rawY)));
      const mode = draggingMirrorRef.current;
      setMirrorPos((prev) => ({
        x: mode === 'x' || mode === 'xy' ? snapX : prev.x,
        y: mode === 'y' || mode === 'xy' ? snapY : prev.y,
      }));
      return;
    }
    if (fHeldRef.current) {
      if (!fScrubRef.current) {
        fScrubRef.current = { startX: e.clientX, startSize: brushSizeRef.current };
      }
      const delta = Math.round((e.clientX - fScrubRef.current.startX) / 5);
      const nextSize = Math.max(1, Math.min(128, fScrubRef.current.startSize + delta));
      setBrushSizes((prev) => ({ ...prev, [tool]: nextSize }));
      return;
    }
    if (fScrubRef.current) {
      const delta = Math.round((e.clientX - fScrubRef.current.startX) / 5);
      const nextSize = Math.max(1, Math.min(128, fScrubRef.current.startSize + delta));
      setBrushSizes((prev) => ({ ...prev, [tool]: nextSize }));
      return;
    }
    if (isPanningRef.current) {
      setPan({ x: e.clientX - panStartRef.current.x, y: e.clientY - panStartRef.current.y });
      return;
    }
    const [gx, gy] = screenToGrid(e.clientX, e.clientY);
    ctrlHeldRef.current = e.ctrlKey || e.metaKey;
    const prevHover = hoverPtRef.current;
    const hoverChanged = !prevHover || prevHover[0] !== gx || prevHover[1] !== gy;
    hoverPtRef.current = [gx, gy];

    if (!isDrawingRef.current) {
      if (hoverChanged) drawViewport();
      return;
    }

    if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      updateShapePreview(gx, gy);
      return;
    }
    if (tool === 'curve') {
      if (!curveAdjustingRef.current && curveStartRef.current) {
        curveEndRef.current = { x: gx, y: gy };
        curveControlsRef.current[0] = {
          x: (curveStartRef.current.x + gx) / 2,
          y: (curveStartRef.current.y + gy) / 2,
        };
        updateCurvePreview();
      } else if (curveHandleRef.current !== null) {
        if (curveHandleRef.current === -1) curveStartRef.current = { x: gx, y: gy };
        else if (curveHandleRef.current === -2) curveEndRef.current = { x: gx, y: gy };
        else curveControlsRef.current[curveHandleRef.current] = { x: gx, y: gy };
        updateCurvePreview();
      }
      return;
    }
    if (tool === 'move' && moveDragRef.current) {
      const dx = gx - moveDragRef.current.startGx;
      const dy = gy - moveDragRef.current.startGy;
      if (dx === moveDragRef.current.lastDx && dy === moveDragRef.current.lastDy) {
        return;
      }
      moveDragRef.current.lastDx = dx;
      moveDragRef.current.lastDy = dy;
      for (const snap of moveDragRef.current.snapshots) {
        const layer = project.layers[snap.layerIdx];
        if (layer) shiftBuffer(snap.orig, layer.pixels, dx, dy);
      }
      setRevision((r) => r + 1);
      return;
    }

    if (tool === 'marquee' && movingSelRef.current && selectionRef.current) {
      const dx = gx - movingSelRef.current.startGx;
      const dy = gy - movingSelRef.current.startGy;
      const nextRect = {
        ...selectionRef.current,
        left: movingSelRef.current.origLeft + dx,
        top: movingSelRef.current.origTop + dy,
      };
      setSelection(nextRect);
      syncFloatingPreview(nextRect);
      return;
    }
    if (tool === 'marquee' && shapeStartRef.current) {
      const [sx, sy] = shapeStartRef.current;
      const minX = Math.max(0, Math.min(sx, gx));
      const maxX = Math.min(project.width - 1, Math.max(sx, gx));
      const minY = Math.max(0, Math.min(sy, gy));
      const maxY = Math.min(project.height - 1, Math.max(sy, gy));
      setSelection({
        left: minX,
        top: minY,
        width: maxX - minX + 1,
        height: maxY - minY + 1,
      });
      return;
    }

    const [lx, ly] = lastPtRef.current ?? [gx, gy];
    if (lastPtRef.current && lx === gx && ly === gy) return;
    bresenham(lx, ly, gx, gy, applyBrushPoint);
    lastPtRef.current = [gx, gy];
    setRevision((r) => r + 1);
  };

  const handlePointerUp = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (e) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      activePointersRef.current.delete(e.pointerId);
    } else {
      activePointersRef.current.clear();
    }
    if (activePointersRef.current.size < 2) {
      pinchRef.current = null;
    }
    if (fScrubRef.current) {
      fScrubRef.current = null;
      if (!fHeldRef.current) setPreviewingSize(false);
    }
    draggingMirrorRef.current = null;
    isPanningRef.current = false;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;

    if (tool === 'line' || tool === 'rectangle' || tool === 'circle') {
      commitPreview();
      shapeStartRef.current = null;
      return;
    }
    if (tool === 'curve') {
      curveAdjustingRef.current = true;
      curveHandleRef.current = null;
      return;
    }
    if (tool === 'move') {
      const md = moveDragRef.current;
      moveDragRef.current = null;
      if (md && (md.lastDx !== 0 || md.lastDy !== 0)) {
        const diffs: Array<{
          layerId: string;
          oldPixels: Map<number, number>;
          newPixels: Map<number, number>;
        }> = [];
        for (const snap of md.snapshots) {
          const layer = project.layers[snap.layerIdx];
          if (!layer) continue;
          const oldPixels = new Map<number, number>();
          const newPixels = new Map<number, number>();
          for (let i = 0; i < snap.orig.length; i++) {
            if (snap.orig[i] !== layer.pixels[i]) {
              oldPixels.set(i, snap.orig[i]);
              newPixels.set(i, layer.pixels[i]);
            }
          }
          if (oldPixels.size > 0) {
            diffs.push({ layerId: snap.layerId, oldPixels, newPixels });
          }
        }
        if (diffs.length > 0) {
          pushAction({
            layerId: diffs[0].layerId,
            oldPixels: diffs[0].oldPixels,
            newPixels: diffs[0].newPixels,
            extraLayers: diffs.slice(1),
          });
        }
      }
      return;
    }

    if (tool === 'marquee') {
      movingSelRef.current = null;
      shapeStartRef.current = null;
      return;
    }

    if (strokeOldRef.current && strokeOldRef.current.size > 0) {
      pushAction({
        layerId: project.layers[project.activeLayerIndex].id,
        oldPixels: strokeOldRef.current,
        newPixels: strokeNewRef.current!,
      });
    }
    strokeOldRef.current = null;
    strokeNewRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (fHeldRef.current) {
      const step = brushSize >= 32 ? 4 : brushSize >= 12 ? 2 : 1;
      const nextSize = Math.max(
        1,
        Math.min(128, brushSize + (e.deltaY < 0 ? step : -step))
      );
      setBrushSizes((prev) => ({ ...prev, [tool]: nextSize }));
      return;
    }
    const rect = viewportRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const curRel = zoom / baseZoom;
    const nextRel = e.shiftKey
      ? Math.max(0.25, Math.min(40, Math.round((curRel + (e.deltaY < 0 ? 0.25 : -0.25)) * 4) / 4))
      : stepZoom(curRel, e.deltaY < 0 ? 1 : -1);
    const nextZoom = Math.min(80, Math.max(0.1, nextRel * baseZoom));
    if (Math.abs(nextZoom - zoom) < 0.0001) return;
    const ratio = nextZoom / zoom;
    setPan({ x: mx - (mx - pan.x) * ratio, y: my - (my - pan.y) * ratio });
    setZoom(nextZoom);
  };

  useEffect(() => {
    if (showHelpModal) {
      setDraftShortcuts(shortcuts);
      setConfirmDiscardShortcuts(false);
    } else {
      setListeningAction(null);
      setConfirmDiscardShortcuts(false);
    }
  }, [showHelpModal]);

  useEffect(() => {
    if (!listeningAction) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') {
        setListeningAction(null);
        return;
      }
      if (['Shift', 'Control', 'Meta'].includes(e.key)) return;
      const key = e.key.toLowerCase();
      setDraftShortcuts((prev) => {
        const next = { ...prev };
        const oldKey = prev[listeningAction];
        for (const [act, k] of Object.entries(prev) as Array<[ShortcutAction, string]>) {
          if (act !== listeningAction && k === key) {
            next[act] = oldKey;
          }
        }
        next[listeningAction] = key;
        return next;
      });
      setListeningAction(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [listeningAction]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (listeningAction) return;
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const sc = shortcutsRef.current;
      const pressed = e.key.toLowerCase();
      if (e.code === 'Space') spaceHeldRef.current = true;
      if (e.key === 'Shift') setShiftHeld(true);
      if (e.key === 'Control' || e.key === 'Meta') {
        if (!ctrlHeldRef.current) {
          ctrlHeldRef.current = true;
          drawViewportRef.current();
        }
      }
      if (pressed === sc.brushScrub && !e.ctrlKey && !e.metaKey) {
        if (!e.repeat) {
          fHeldRef.current = true;
          fScrubRef.current =
            lastClientXRef.current !== null
              ? { startX: lastClientXRef.current, startSize: brushSizeRef.current }
              : null;
          setPreviewingSize(true);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if (selectionRef.current) {
        if (e.key === 'Backspace' || e.key === 'Delete') {
          e.preventDefault();
          deleteSelectionPixels();
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          commitFloatingSelection();
          return;
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          cancelFloatingSelection();
          return;
        }
        const arrowDelta: Record<string, [number, number]> = {
          ArrowLeft: [-1, 0],
          ArrowRight: [1, 0],
          ArrowUp: [0, -1],
          ArrowDown: [0, 1],
        };
        const delta = arrowDelta[e.key];
        if (delta) {
          e.preventDefault();
          const cur = selectionRef.current;
          liftSelectionToFloating(cur);
          const nextRect = {
            ...cur,
            left: cur.left + delta[0],
            top: cur.top + delta[1],
          };
          setSelection(nextRect);
          syncFloatingPreview(nextRect);
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+' || e.key === '-' || e.key === '0')) {
        e.preventDefault();
        const canvas = viewportRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        if (e.key === '0') {
          setZoom(baseZoom);
          setPan({
            x: (rect.width - project.width * baseZoom) / 2,
            y: (rect.height - project.height * baseZoom) / 2,
          });
        } else {
          const dir = e.key === '-' ? -1 : 1;
          const nextRel = stepZoom(zoom / baseZoom, dir);
          const nextZoom = Math.min(80, Math.max(0.1, nextRel * baseZoom));
          const mx = rect.width / 2;
          const my = rect.height / 2;
          const ratio = nextZoom / zoom;
          setPan({ x: mx - (mx - pan.x) * ratio, y: my - (my - pan.y) * ratio });
          setZoom(nextZoom);
        }
        return;
      }
      if (tool === 'move' && !selectionRef.current) {
        const step = e.shiftKey ? 8 : 1;
        const arrowDelta: Record<string, [number, number]> = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        };
        const delta = arrowDelta[e.key];
        if (delta) {
          e.preventDefault();
          nudgeMoveLayers(delta[0], delta[1]);
          return;
        }
      }
      if (!e.ctrlKey && !e.metaKey) {
        if (pressed === sc.eyedropper) {
          e.preventDefault();
          if (!e.repeat && toolRef.current !== 'eyedropper') {
            eyedropperPrevToolRef.current = toolRef.current;
            setTool('eyedropper');
          }
          return;
        }
        if (pressed === sc.pixelPerfect) {
          setPixelPerfect((v) => !v);
          return;
        }
        const toolActions: PixelTool[] = [
          'pencil',
          'eraser',
          'shade',
          'fill',
          'line',
          'rectangle',
          'circle',
          'curve',
          'marquee',
          'move',
        ];
        const matched = toolActions.find((act) => sc[act] === pressed);
        if (matched) onSelectTool(matched);
        if (pressed === sc.brushDec) {
          const step = e.shiftKey ? 8 : 1;
          setBrushSizes((prev) => ({ ...prev, [tool]: Math.max(1, (prev[tool] ?? 1) - step) }));
        }
        if (pressed === sc.brushInc) {
          const step = e.shiftKey ? 8 : 1;
          setBrushSizes((prev) => ({ ...prev, [tool]: Math.min(128, (prev[tool] ?? 1) + step) }));
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const released = e.key.toLowerCase();
      if (e.code === 'Space') spaceHeldRef.current = false;
      if (e.key === 'Shift') setShiftHeld(false);
      if (e.key === 'Control' || e.key === 'Meta') {
        if (ctrlHeldRef.current) {
          ctrlHeldRef.current = false;
          drawViewportRef.current();
        }
      }
      if (released === shortcutsRef.current.eyedropper) {
        if (e.key === 'Alt') e.preventDefault();
        if (eyedropperPrevToolRef.current !== null) {
          setTool(eyedropperPrevToolRef.current);
          eyedropperPrevToolRef.current = null;
        }
      }
      if (released === shortcutsRef.current.brushScrub) {
        fHeldRef.current = false;
        fScrubRef.current = null;
        setPreviewingSize(false);
      }
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setShiftHeld(false);
      fHeldRef.current = false;
      fScrubRef.current = null;
      setPreviewingSize(false);
      if (eyedropperPrevToolRef.current !== null) {
        setTool(eyedropperPrevToolRef.current);
        eyedropperPrevToolRef.current = null;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, [
    handleUndo,
    handleRedo,
    tool,
    deleteSelectionPixels,
    commitFloatingSelection,
    cancelFloatingSelection,
    liftSelectionToFloating,
    syncFloatingPreview,
    nudgeMoveLayers,
  ]);
  const onSelectTool = (t: PixelTool) => {
    if (t !== 'marquee' && floatingSelRef.current) {
      commitFloatingSelection();
    }
    if (t !== 'curve' && hasCurve) {
      cancelCurve();
    }
    if (t === 'move' && tool === 'move') {
      setMoveAllLayers((v) => !v);
      return;
    }
    if (t === 'pencil' && tool === 'pencil') {
      setPixelPerfect((v) => !v);
      return;
    }
    if ((t === 'rectangle' || t === 'circle') && tool === t) {
      setShapeFilled((f) => !f);
      return;
    }
    if (t === 'shade' && tool === 'shade') {
      setShadeLighten((l) => !l);
      return;
    }
    setTool(t);
  };

  const activeToolIcon = (t: PixelTool) => {
    switch (t) {
      case 'pencil':
        return <Pencil size={18} fill={pixelPerfect ? 'currentColor' : 'none'} />;
      case 'eraser':
        return <Eraser size={18} />;
      case 'fill':
        return <PaintBucket size={18} />;
      case 'line':
        return (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="5" y1="19" x2="19" y2="5" />
          </svg>
        );
      case 'rectangle':
        return <Square size={18} fill={shapeFilled ? 'currentColor' : 'none'} />;
      case 'circle':
        return <Circle size={18} fill={shapeFilled ? 'currentColor' : 'none'} />;
      case 'curve':
        return <Spline size={18} />;
      case 'marquee':
        return <SquareDashed size={18} />;
      case 'move':
        return <Move size={18} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <header
        style={{
          height: 54,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 10,
          position: 'relative',
          zIndex: 35,
        }}
      >
        <input
          ref={importInputRef}
          type="file"
          accept="image/*,.ase,.aseprite"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleImportFile(f);
            e.target.value = '';
          }}
        />

        {/* Left: Menu + Project Identity */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexShrink: 0 }}>
          <div ref={moreMenuRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="icon-btn"
              aria-label="Main menu"
              aria-expanded={showMoreMenu}
              aria-haspopup="menu"
              title="Menu"
              onClick={() => setShowMoreMenu((v) => !v)}
            >
              <Menu size={19} />
            </button>

            {showMoreMenu && (
              <div
                role="menu"
                className="floating-card menu-pop"
                style={{
                  position: 'absolute',
                  top: 44,
                  left: 0,
                  width: 220,
                  padding: 6,
                  background: 'var(--surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                  zIndex: 60,
                  transformOrigin: 'top left',
                }}
              >
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    onBack();
                  }}
                >
                  <Home size={14} /> Home
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    importInputRef.current?.click();
                  }}
                >
                  <ImagePlus size={14} /> Import Image / .aseprite
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={async () => {
                    setShowMoreMenu(false);
                    setSaveStatus('saving');
                    try {
                      await saveProject(project);
                      setSaveStatus('saved');
                    } catch {
                      setSaveStatus('error');
                    }
                  }}
                >
                  Save
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '3px 4px' }} />
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setOptionsSubOpen(true)}
                  onMouseLeave={() => setOptionsSubOpen(false)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={optionsSubOpen}
                    className="btn"
                    style={{ width: '100%', border: 'none', justifyContent: 'space-between' }}
                    onClick={() => setOptionsSubOpen((v) => !v)}
                  >
                    <span>Options</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                  </button>
                  {optionsSubOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -4,
                        left: '100%',
                        paddingLeft: 4,
                        zIndex: 61,
                      }}
                    >
                      <div
                        role="menu"
                        className="floating-card menu-pop"
                        style={{
                          width: 170,
                          padding: 6,
                          background: 'var(--surface)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 2,
                          transformOrigin: 'top left',
                        }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          className="btn"
                          style={{ border: 'none', justifyContent: 'flex-start' }}
                          onClick={() => {
                            setOptionsSubOpen(false);
                            setShowMoreMenu(false);
                            setShowHelpModal(true);
                          }}
                        >
                          Shortcuts
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setResizeW(project.width);
                    setResizeH(project.height);
                    setResizeAnchorX('center');
                    setResizeAnchorY('center');
                    setShowResizeModal(true);
                  }}
                >
                  Resize Canvas…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    const layer = project.layers[project.activeLayerIndex];
                    if (!layer) return;
                    const { oldPixels, newPixels } = applyOutline(
                      layer.pixels,
                      project.width,
                      project.height,
                      activeColor,
                      selection
                    );
                    if (oldPixels.size > 0) {
                      pushAction({ layerId: layer.id, oldPixels, newPixels });
                      setRevision((r) => r + 1);
                    }
                  }}
                >
                  1px Outline
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setReplaceFromColor(activeColor);
                    setReplaceToColor(activeColor);
                    setShowReplaceModal(true);
                  }}
                >
                  Replace Color…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    setTiledMode((v) => !v);
                  }}
                >
                  {tiledMode ? 'Tiled / Seamless: On' : 'Tiled / Seamless Mode'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    const layer = project.layers[project.activeLayerIndex];
                    const w = project.width, h = project.height;
                    const copy = new Uint32Array(layer.pixels);
                    const oldM = new Map<number, number>();
                    const newM = new Map<number, number>();
                    for (let y = 0; y < h; y++) {
                      for (let x = 0; x < w; x++) {
                        const dst = y * w + (w - 1 - x);
                        const val = copy[y * w + x];
                        if (layer.pixels[dst] !== val) {
                          oldM.set(dst, layer.pixels[dst]);
                          newM.set(dst, val);
                          layer.pixels[dst] = val;
                        }
                      }
                    }
                    pushAction({ layerId: layer.id, oldPixels: oldM, newPixels: newM });
                    setRevision((r) => r + 1);
                  }}
                >
                  Flip Horizontal
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'flex-start' }}
                  onClick={() => {
                    setShowMoreMenu(false);
                    const layer = project.layers[project.activeLayerIndex];
                    const w = project.width, h = project.height;
                    const copy = new Uint32Array(layer.pixels);
                    const oldM = new Map<number, number>();
                    const newM = new Map<number, number>();
                    for (let y = 0; y < h; y++) {
                      for (let x = 0; x < w; x++) {
                        const dst = (h - 1 - y) * w + x;
                        const val = copy[y * w + x];
                        if (layer.pixels[dst] !== val) {
                          oldM.set(dst, layer.pixels[dst]);
                          newM.set(dst, val);
                          layer.pixels[dst] = val;
                        }
                      }
                    }
                    pushAction({ layerId: layer.id, oldPixels: oldM, newPixels: newM });
                    setRevision((r) => r + 1);
                  }}
                >
                  Flip Vertical
                </button>
                {project.width === project.height && (
                  <button
                    type="button"
                    role="menuitem"
                    className="btn"
                    style={{ border: 'none', justifyContent: 'flex-start' }}
                    onClick={() => {
                      setShowMoreMenu(false);
                      const layer = project.layers[project.activeLayerIndex];
                      const n = project.width;
                      const copy = new Uint32Array(layer.pixels);
                      const oldM = new Map<number, number>();
                      const newM = new Map<number, number>();
                      for (let y = 0; y < n; y++) {
                        for (let x = 0; x < n; x++) {
                          const dst = x * n + (n - 1 - y);
                          const val = copy[y * n + x];
                          if (layer.pixels[dst] !== val) {
                            oldM.set(dst, layer.pixels[dst]);
                            newM.set(dst, val);
                            layer.pixels[dst] = val;
                          }
                        }
                      }
                      pushAction({ layerId: layer.id, oldPixels: oldM, newPixels: newM });
                      setRevision((r) => r + 1);
                    }}
                  >
                    Rotate 90° CW
                  </button>
                )}
              </div>
            )}
          </div>

          <div style={{ minWidth: 0, maxWidth: 170 }}>
            {editingName ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = nameDraft.trim();
                  if (trimmed) setProject((p) => ({ ...p, name: trimmed }));
                  setEditingName(false);
                }}
              >
                <input
                  autoFocus
                  aria-label="Project name"
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  onBlur={() => {
                    const trimmed = nameDraft.trim();
                    if (trimmed) setProject((p) => ({ ...p, name: trimmed }));
                    setEditingName(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setEditingName(false);
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '1px 5px',
                    borderRadius: 5,
                    border: '1px solid var(--accent)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    fontWeight: 700,
                    fontSize: 13.5,
                    outline: 'none',
                  }}
                />
              </form>
            ) : (
              <h1
                onDoubleClick={() => {
                  setNameDraft(project.name);
                  setEditingName(true);
                }}
                title="Double-click to rename"
                style={{
                  margin: 0,
                  fontWeight: 700,
                  fontSize: 13.5,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  cursor: 'text',
                }}
              >
                {project.name}
              </h1>
            )}
            <div
              className="mono"
              style={{
                fontSize: 11,
                lineHeight: 1.3,
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>
                {project.width}×{project.height}
              </span>
              <button
                type="button"
                onClick={() => {
                  const canvas = viewportRef.current;
                  if (!canvas) return;
                  const rect = canvas.getBoundingClientRect();
                  setZoom(baseZoom);
                  setPan({
                    x: (rect.width - project.width * baseZoom) / 2,
                    y: (rect.height - project.height * baseZoom) / 2,
                  });
                }}
                title="Click to reset zoom to 100%"
                style={{
                  background: 'var(--surface-elevated)',
                  border: '1px solid var(--border)',
                  borderRadius: 5,
                  padding: '0 5px',
                  color: 'var(--text-primary)',
                  font: 'inherit',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {Math.round((zoom / baseZoom) * 100)}%
              </button>
              <span
                role="status"
                aria-label={
                  saveStatus === 'saving'
                    ? 'Saving project'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : 'All changes saved'
                }
                title={
                  saveStatus === 'saving'
                    ? 'Saving…'
                    : saveStatus === 'error'
                      ? 'Save failed'
                      : 'Saved'
                }
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: 2,
                  color:
                    saveStatus === 'error'
                      ? 'var(--danger)'
                      : saveStatus === 'saving'
                        ? 'var(--accent)'
                        : 'var(--text-muted)',
                  transition: 'color 180ms ease, transform 180ms ease',
                }}
              >
                {saveStatus === 'saving' ? (
                  <Loader2 size={12} className="spin" />
                ) : saveStatus === 'error' ? (
                  <AlertCircle size={12} />
                ) : (
                  <Check size={12} />
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Separator between file name and tool controls */}
        <div style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }} />

        {/* Left-aligned Tool Options + Inline Palette */}
        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-start',
            gap: 8,
          }}
        >

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 2,
              padding: 2,
              borderRadius: 10,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
            }}
          >
            <button
              type="button"
              className="icon-btn"
              style={{ width: 32, height: 32 }}
              aria-label={`Brush shape: ${brushShape}. Click to switch`}
              title={`Brush shape: ${brushShape} (click to switch)`}
              onClick={() => setBrushShape((s) => (s === 'round' ? 'square' : 'round'))}
            >
              {brushShape === 'round' ? (
                <Circle size={14} fill="currentColor" />
              ) : (
                <Square size={14} fill="currentColor" />
              )}
            </button>
            {editingBrushSize ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseInt(brushSizeDraft, 10);
                  if (!isNaN(parsed)) {
                    setBrushSizes((prev) => ({
                      ...prev,
                      [tool]: Math.max(1, Math.min(128, parsed)),
                    }));
                  }
                  setEditingBrushSize(false);
                }}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <input
                  autoFocus
                  type="number"
                  aria-label="Brush size in pixels"
                  min={1}
                  max={128}
                  value={brushSizeDraft}
                  onChange={(e) => setBrushSizeDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(brushSizeDraft, 10);
                    if (!isNaN(parsed)) {
                      setBrushSizes((prev) => ({
                        ...prev,
                        [tool]: Math.max(1, Math.min(128, parsed)),
                      }));
                    }
                    setEditingBrushSize(false);
                  }}
                  className="mono"
                  style={{
                    width: 50,
                    padding: '3px 6px',
                    borderRadius: 6,
                    border: '1px solid var(--accent)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="btn mono"
                style={{
                  border: 'none',
                  padding: '4px 8px',
                  fontSize: 12,
                  background: 'var(--surface)',
                  borderRadius: 7,
                  cursor: 'ew-resize',
                  touchAction: 'none',
                }}
                aria-label={`Brush size ${brushSize}px. Drag left or right to resize, or click to type`}
                title="Drag left/right to resize • Click to type"
                onPointerDown={(e) => {
                  e.preventDefault();
                  const startX = e.clientX;
                  const startSize = brushSize;
                  let moved = false;
                  setPreviewingSize(true);

                  const onMove = (ev: PointerEvent) => {
                    const dx = ev.clientX - startX;
                    if (Math.abs(dx) >= 4) moved = true;
                    if (moved) {
                      const nextSize = Math.max(1, Math.min(128, Math.round(startSize + dx / 6)));
                      setBrushSizes((prev) => ({ ...prev, [tool]: nextSize }));
                    }
                  };

                  const onUp = () => {
                    setPreviewingSize(false);
                    window.removeEventListener('pointermove', onMove);
                    window.removeEventListener('pointerup', onUp);
                    window.removeEventListener('pointercancel', onUp);
                    if (!moved) {
                      setBrushSizeDraft(String(startSize));
                      setEditingBrushSize(true);
                    }
                  };

                  window.addEventListener('pointermove', onMove);
                  window.addEventListener('pointerup', onUp);
                  window.addEventListener('pointercancel', onUp);
                }}
              >
                {brushSize}px
              </button>
            )}
          </div>

          <button
            type="button"
            className={`icon-btn ${showPixelGrid ? 'active' : ''}`}
            aria-label="Toggle Pixel Grid"
            aria-pressed={showPixelGrid}
            title="Pixel Grid"
            onClick={() => setShowPixelGrid((v) => !v)}
          >
            <Grid3x3 size={17} />
          </button>
          <button
            type="button"
            className={`icon-btn ${mirror !== 'none' ? 'active' : ''}`}
            aria-label={`Mirror: ${mirror}`}
            aria-pressed={mirror !== 'none'}
            title={`Mirror: ${mirror}`}
            onClick={() => {
              const order: MirrorMode[] = ['none', 'horizontal', 'vertical', 'quad'];
              setMirror(order[(order.indexOf(mirror) + 1) % order.length]);
            }}
          >
            <FlipHorizontal size={18} />
          </button>

          <ColorPanel
            activeColor={activeColor}
            palette={palette}
            isEyedropperActive={tool === 'eyedropper'}
            onToggleEyedropper={() => onSelectTool('eyedropper')}
            onSelectColor={(c) => setActiveColor(c)}
            onSetPalette={(cols) => setPalette(cols)}
          />
        </div>

        {/* Right Zone: Theme Switch & Export */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            type="button"
            role="switch"
            aria-checked={theme === 'dark'}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={theme === 'dark' ? 'Dark Theme (click for Light)' : 'Light Theme (click for Dark)'}
            onClick={onToggleTheme}
            style={{
              position: 'relative',
              width: 54,
              height: 30,
              borderRadius: 999,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
              padding: '0 6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            <Sun size={13} style={{ opacity: theme === 'light' ? 0 : 0.7 }} />
            <Moon size={13} style={{ opacity: theme === 'dark' ? 0 : 0.7 }} />
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                top: 3,
                left: theme === 'dark' ? 27 : 3,
                width: 22,
                height: 22,
                borderRadius: '50%',
                background: 'var(--accent)',
                color: 'var(--on-accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'left 180ms cubic-bezier(0.22, 1, 0.36, 1)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
              }}
            >
              {theme === 'dark' ? <Moon size={12} /> : <Sun size={12} />}
            </span>
          </button>

          <button
            type="button"
            className="btn primary"
            style={{ height: 34, padding: '0 11px', fontSize: 12.5 }}
            aria-label="Export sprite"
            title="Export sprite"
            onClick={() => setShowExportModal(true)}
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>
      </header>

      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={viewportRef}
          aria-label="Pixel art canvas"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={() => {
            if (hoverPtRef.current) {
              hoverPtRef.current = null;
              drawViewport();
            }
          }}
          onWheel={handleWheel}
          onDoubleClick={(e) => {
            if (mirror === 'none') return;
            const rect = viewportRef.current!.getBoundingClientRect();
            const sx = e.clientX - rect.left;
            const sy = e.clientY - rect.top;
            const mxScreen = pan.x + mirrorPos.x * zoom;
            const myScreen = pan.y + mirrorPos.y * zoom;
            if (
              (mirror === 'horizontal' || mirror === 'quad') &&
              Math.abs(sx - mxScreen) <= 12 &&
              sy >= pan.y - 18 &&
              sy <= pan.y + 2
            ) {
              setMirrorPos((prev) => ({ ...prev, x: Math.round(project.width / 2) }));
            } else if (
              (mirror === 'vertical' || mirror === 'quad') &&
              Math.abs(sy - myScreen) <= 12 &&
              sx >= pan.x - 18 &&
              sx <= pan.x + 2
            ) {
              setMirrorPos((prev) => ({ ...prev, y: Math.round(project.height / 2) }));
            }
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            const [gx, gy] = screenToGrid(e.clientX, e.clientY);
            setCtxColorSubOpen(false);
            setCtxSelSubOpen(false);
            setCanvasCtxMenu({ x: e.clientX, y: e.clientY, gx, gy });
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: 'crosshair',
            touchAction: 'none',
          }}
        />

        {!layersOpen && (() => {
          const activeLayer = project.layers[project.activeLayerIndex];
          if (!activeLayer) return null;
          return (
            <div
              ref={layerPillRef}
              style={{
                position: 'absolute',
                top: tool === 'move' || hiddenLayerToast ? 52 : 12,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 28,
              }}
            >
              <div
                className="floating-card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: '3px 6px 3px 10px',
                  borderRadius: 999,
                }}
              >
                <button
                  type="button"
                  onClick={() => setLayerPillOpen((v) => !v)}
                  aria-expanded={layerPillOpen}
                  aria-label={`Active layer: ${activeLayer.name}. Click for opacity and layer switcher`}
                  title="Click for Opacity & Layer Switcher"
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    fontWeight: 600,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '3px 4px',
                    cursor: 'pointer',
                    maxWidth: 180,
                  }}
                >
                  <span
                    style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {activeLayer.name}
                  </span>
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                    {Math.round(activeLayer.opacity * 100)}%
                  </span>
                  <ChevronDown size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 26, height: 26, borderRadius: '50%' }}
                  aria-label={activeLayer.visible ? 'Hide active layer' : 'Show active layer'}
                  title={activeLayer.visible ? 'Hide layer' : 'Show layer'}
                  onClick={() => {
                    setProjectSync((p) => {
                      const next = [...p.layers];
                      next[p.activeLayerIndex] = {
                        ...next[p.activeLayerIndex],
                        visible: !next[p.activeLayerIndex].visible,
                      };
                      return { ...p, layers: next };
                    });
                    setRevision((r) => r + 1);
                  }}
                >
                  {activeLayer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                </button>
              </div>

              {layerPillOpen && (
                <div
                  className="floating-card menu-pop"
                  style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    width: 224,
                    padding: 10,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    zIndex: 40,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)' }}>
                      Opacity
                    </span>
                    <input
                      type="range"
                      aria-label="Active layer opacity"
                      className="color-slider"
                      min={0}
                      max={1}
                      step={0.01}
                      value={activeLayer.opacity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setProjectSync((p) => {
                          const next = [...p.layers];
                          next[p.activeLayerIndex] = { ...next[p.activeLayerIndex], opacity: val };
                          return { ...p, layers: next };
                        });
                        setRevision((r) => r + 1);
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        height: 10,
                        background: `linear-gradient(to right, var(--accent) ${Math.round(activeLayer.opacity * 100)}%, var(--surface-elevated) ${Math.round(activeLayer.opacity * 100)}%)`,
                      }}
                    />
                    <span className="mono" style={{ fontSize: 11, minWidth: 32, textAlign: 'right' }}>
                      {Math.round(activeLayer.opacity * 100)}%
                    </span>
                  </div>

                  {project.layers.length > 1 && (
                    <div
                      style={{
                        borderTop: '1px solid var(--border)',
                        paddingTop: 6,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        maxHeight: 150,
                        overflowY: 'auto',
                      }}
                    >
                      {[...project.layers].reverse().map((lay, revIdx) => {
                        const actualIdx = project.layers.length - 1 - revIdx;
                        const isCur = actualIdx === project.activeLayerIndex;
                        return (
                          <button
                            key={lay.id}
                            type="button"
                            className={`btn ${isCur ? 'primary' : ''}`}
                            style={{
                              border: 'none',
                              justifyContent: 'space-between',
                              padding: '4px 8px',
                              fontSize: 12,
                            }}
                            onClick={() => {
                              setProjectSync((p) => ({ ...p, activeLayerIndex: actualIdx }));
                              setLayerPillOpen(false);
                            }}
                          >
                            <span
                              style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {lay.name}
                            </span>
                            {!lay.visible && <EyeOff size={12} style={{ opacity: 0.65, flexShrink: 0 }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {canvasCtxMenu && (
          <div
            ref={canvasCtxMenuRef}
            role="menu"
            className="floating-card menu-pop"
            style={{
              position: 'fixed',
              left: Math.min(canvasCtxMenu.x, window.innerWidth - 190),
              top: Math.min(canvasCtxMenu.y, window.innerHeight - 140),
              width: 170,
              padding: 5,
              background: 'var(--surface)',
              zIndex: 70,
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              transformOrigin: 'top left',
            }}
          >
            <div
              style={{ position: 'relative' }}
              onMouseEnter={() => {
                setCtxColorSubOpen(true);
                setCtxSelSubOpen(false);
              }}
              onMouseLeave={() => setCtxColorSubOpen(false)}
            >
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                aria-expanded={ctxColorSubOpen}
                className="btn"
                style={{
                  width: '100%',
                  border: 'none',
                  justifyContent: 'space-between',
                  fontSize: 12.5,
                }}
                onClick={() => setCtxColorSubOpen((v) => !v)}
              >
                <span>Color</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
              </button>

              {ctxColorSubOpen && (
                <div
                  style={{
                    position: 'absolute',
                    top: -4,
                    left: '100%',
                    paddingLeft: 4,
                    zIndex: 71,
                  }}
                >
                  <div
                    role="menu"
                    className="floating-card menu-pop"
                    style={{
                      width: 164,
                      padding: 5,
                      background: 'var(--surface)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      transformOrigin: 'top left',
                    }}
                  >
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        const { gx, gy } = canvasCtxMenu;
                        if (gx >= 0 && gy >= 0 && gx < project.width && gy < project.height) {
                          const idx = gy * project.width + gx;
                          for (let i = project.layers.length - 1; i >= 0; i--) {
                            if (!project.layers[i].visible) continue;
                            const argb = project.layers[i].pixels[idx];
                            if (((argb >>> 24) & 0xff) > 0) {
                              setActiveColor(argb);
                              break;
                            }
                          }
                        }
                        setCanvasCtxMenu(null);
                        setCtxColorSubOpen(false);
                      }}
                    >
                      Eyedropper
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`btn ${tool === 'shade' && !shadeLighten ? 'primary' : ''}`}
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        setShadeLighten(false);
                        setTool('shade');
                        setCanvasCtxMenu(null);
                        setCtxColorSubOpen(false);
                      }}
                    >
                      Darken
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className={`btn ${tool === 'shade' && shadeLighten ? 'primary' : ''}`}
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        setShadeLighten(true);
                        setTool('shade');
                        setCanvasCtxMenu(null);
                        setCtxColorSubOpen(false);
                      }}
                    >
                      Lighten
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      className="btn"
                      style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                      onClick={() => {
                        const { gx, gy } = canvasCtxMenu;
                        let picked = activeColor;
                        if (gx >= 0 && gy >= 0 && gx < project.width && gy < project.height) {
                          const idx = gy * project.width + gx;
                          for (let i = project.layers.length - 1; i >= 0; i--) {
                            if (!project.layers[i].visible) continue;
                            const argb = project.layers[i].pixels[idx];
                            if (((argb >>> 24) & 0xff) > 0) {
                              picked = argb;
                              break;
                            }
                          }
                        }
                        setReplaceFromColor(picked);
                        setReplaceToColor(activeColor);
                        setShowReplaceModal(true);
                        setCanvasCtxMenu(null);
                        setCtxColorSubOpen(false);
                      }}
                    >
                      Replace Color…
                    </button>
                  </div>
                </div>
              )}
            </div>

            {(selection || clipboard) && (
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => {
                  setCtxSelSubOpen(true);
                  setCtxColorSubOpen(false);
                }}
                onMouseLeave={() => setCtxSelSubOpen(false)}
              >
                <button
                  type="button"
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={ctxSelSubOpen}
                  className="btn"
                  style={{
                    width: '100%',
                    border: 'none',
                    justifyContent: 'space-between',
                    fontSize: 12.5,
                  }}
                  onClick={() => setCtxSelSubOpen((v) => !v)}
                >
                  <span>Selection</span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                </button>

                {ctxSelSubOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -4,
                      left: '100%',
                      paddingLeft: 4,
                      zIndex: 71,
                    }}
                  >
                    <div
                      role="menu"
                      className="floating-card menu-pop"
                      style={{
                        width: 164,
                        padding: 5,
                        background: 'var(--surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                        transformOrigin: 'top left',
                      }}
                    >
                      {selection && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              if (floatingSelRef.current) {
                                setClipboard({
                                  pixels: new Uint32Array(floatingSelRef.current.pixels),
                                  w: floatingSelRef.current.w,
                                  h: floatingSelRef.current.h,
                                });
                              } else {
                                const layer = project.layers[project.activeLayerIndex];
                                const buf = new Uint32Array(selection.width * selection.height);
                                for (let sy = 0; sy < selection.height; sy++) {
                                  for (let sx = 0; sx < selection.width; sx++) {
                                    const px = selection.left + sx;
                                    const py = selection.top + sy;
                                    if (px >= 0 && py >= 0 && px < project.width && py < project.height) {
                                      buf[sy * selection.width + sx] = layer.pixels[py * project.width + px];
                                    }
                                  }
                                }
                                setClipboard({ pixels: buf, w: selection.width, h: selection.height });
                              }
                              deleteSelectionPixels();
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Cut
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              if (floatingSelRef.current) {
                                setClipboard({
                                  pixels: new Uint32Array(floatingSelRef.current.pixels),
                                  w: floatingSelRef.current.w,
                                  h: floatingSelRef.current.h,
                                });
                              } else {
                                const layer = project.layers[project.activeLayerIndex];
                                const buf = new Uint32Array(selection.width * selection.height);
                                for (let sy = 0; sy < selection.height; sy++) {
                                  for (let sx = 0; sx < selection.width; sx++) {
                                    const px = selection.left + sx;
                                    const py = selection.top + sy;
                                    if (px >= 0 && py >= 0 && px < project.width && py < project.height) {
                                      buf[sy * selection.width + sx] = layer.pixels[py * project.width + px];
                                    }
                                  }
                                }
                                setClipboard({ pixels: buf, w: selection.width, h: selection.height });
                              }
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Copy
                          </button>
                        </>
                      )}
                      {clipboard && (
                        <button
                          type="button"
                          role="menuitem"
                          className="btn"
                          style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                          onClick={() => {
                            commitFloatingSelection();
                            const sx0 = Math.max(
                              0,
                              Math.min(
                                project.width - clipboard.w,
                                Math.floor(canvasCtxMenu.gx - clipboard.w / 2)
                              )
                            );
                            const sy0 = Math.max(
                              0,
                              Math.min(
                                project.height - clipboard.h,
                                Math.floor(canvasCtxMenu.gy - clipboard.h / 2)
                              )
                            );
                            floatingSelRef.current = {
                              pixels: new Uint32Array(clipboard.pixels),
                              w: clipboard.w,
                              h: clipboard.h,
                              clearedOrig: new Map(),
                            };
                            const nextRect = {
                              left: sx0,
                              top: sy0,
                              width: clipboard.w,
                              height: clipboard.h,
                            };
                            setSelection(nextRect);
                            syncFloatingPreview(nextRect);
                            setCanvasCtxMenu(null);
                            setCtxSelSubOpen(false);
                          }}
                        >
                          Paste
                        </button>
                      )}
                      {selection && (
                        <>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              flipSelection('h');
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Flip Horizontal
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              flipSelection('v');
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Flip Vertical
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              rotateSelection90();
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Rotate 90°
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            className="btn"
                            style={{ border: 'none', justifyContent: 'flex-start', fontSize: 12.5 }}
                            onClick={() => {
                              cancelFloatingSelection();
                              setCanvasCtxMenu(null);
                              setCtxSelSubOpen(false);
                            }}
                          >
                            Deselect
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <MinimapPanel
          minimapRef={minimapRef}
          visible={showMinimap}
          rightInset={layersOpen ? layersWidth + 12 : 26}
          bottomInset={timelineOpen ? timelineHeight + 12 : 24}
          onToggleVisible={() => setShowMinimap((v) => !v)}
          onResize={drawMinimap}
        />

        {(hasCurve || selection) && (() => {
          let popupLeft = 260;
          let popupTop = 16;
          if (hasCurve && curveStartRef.current && curveEndRef.current) {
            const pts = [
              curveStartRef.current,
              ...curveControlsRef.current,
              curveEndRef.current,
            ];
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            for (const pt of pts) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }
            const rect = viewportRef.current?.getBoundingClientRect();
            const vw = rect?.width ?? 800;
            const vh = rect?.height ?? 600;
            const cxScreen = pan.x + ((minX + maxX) / 2 + 0.5) * zoom;
            const topScreen = pan.y + minY * zoom - 52;
            const bottomScreen = pan.y + (maxY + 1) * zoom + 12;
            popupLeft = Math.max(12, Math.min(vw - 140, cxScreen - 58));
            popupTop = topScreen >= 12 ? topScreen : Math.min(vh - 56, bottomScreen);
          } else if (selection) {
            const rect = viewportRef.current?.getBoundingClientRect();
            const vw = rect?.width ?? 800;
            const vh = rect?.height ?? 600;
            const cxScreen = pan.x + (selection.left + selection.width / 2) * zoom;
            const topScreen = pan.y + selection.top * zoom - 52;
            const bottomScreen = pan.y + (selection.top + selection.height) * zoom + 12;
            popupLeft = Math.max(12, Math.min(vw - 290, cxScreen - 140));
            popupTop = topScreen >= 12 ? topScreen : Math.min(vh - 56, bottomScreen);
          }
          return (
            <div
              className="floating-card"
              style={{
                position: 'absolute',
                left: popupLeft,
                top: popupTop,
                padding: 4,
                display: 'flex',
                gap: 2,
                zIndex: 30,
              }}
            >
              {hasCurve ? (
                <>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Add curve control point"
                    title="Add control point"
                    onClick={() => {
                      if (curveEndRef.current && curveControlsRef.current.length > 0) {
                        const last =
                          curveControlsRef.current[curveControlsRef.current.length - 1];
                        curveControlsRef.current.push({
                          x: (last.x + curveEndRef.current.x) / 2,
                          y: (last.y + curveEndRef.current.y) / 2,
                        });
                        updateCurvePreview();
                      }
                    }}
                  >
                    <Plus size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn active"
                    aria-label="Apply curve"
                    title="Apply curve"
                    onClick={commitCurve}
                  >
                    <Check size={18} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Cancel curve"
                    title="Cancel curve"
                    onClick={cancelCurve}
                  >
                    <X size={18} />
                  </button>
                </>
              ) : (
                selection && (
                  <>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Copy selection"
                      aria-label="Copy selection"
                      onClick={() => {
                        if (floatingSelRef.current) {
                          setClipboard({
                            pixels: new Uint32Array(floatingSelRef.current.pixels),
                            w: floatingSelRef.current.w,
                            h: floatingSelRef.current.h,
                          });
                          return;
                        }
                        const layer = project.layers[project.activeLayerIndex];
                        const buf = new Uint32Array(selection.width * selection.height);
                        for (let sy = 0; sy < selection.height; sy++) {
                          for (let sx = 0; sx < selection.width; sx++) {
                            const gx = selection.left + sx;
                            const gy = selection.top + sy;
                            if (gx >= 0 && gy >= 0 && gx < project.width && gy < project.height) {
                              buf[sy * selection.width + sx] =
                                layer.pixels[gy * project.width + gx];
                            }
                          }
                        }
                        setClipboard({ pixels: buf, w: selection.width, h: selection.height });
                      }}
                    >
                      <Copy size={16} />
                    </button>
                    {clipboard && (
                      <button
                        type="button"
                        className="icon-btn"
                        title="Paste as movable selection"
                        aria-label="Paste"
                        onClick={() => {
                          commitFloatingSelection();
                          const sx0 = Math.floor((project.width - clipboard.w) / 2);
                          const sy0 = Math.floor((project.height - clipboard.h) / 2);
                          floatingSelRef.current = {
                            pixels: new Uint32Array(clipboard.pixels),
                            w: clipboard.w,
                            h: clipboard.h,
                            clearedOrig: new Map(),
                          };
                          const nextRect = {
                            left: sx0,
                            top: sy0,
                            width: clipboard.w,
                            height: clipboard.h,
                          };
                          setSelection(nextRect);
                          syncFloatingPreview(nextRect);
                        }}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      title="Flip Horizontal"
                      aria-label="Flip selection horizontal"
                      onClick={() => flipSelection('h')}
                    >
                      <FlipHorizontal size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Flip Vertical"
                      aria-label="Flip selection vertical"
                      onClick={() => flipSelection('v')}
                    >
                      <FlipVertical size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Rotate 90°"
                      aria-label="Rotate selection 90 degrees"
                      onClick={rotateSelection90}
                    >
                      <RotateCw size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Delete selection pixels (Backspace / Delete)"
                      aria-label="Delete selection pixels"
                      onClick={deleteSelectionPixels}
                    >
                      <Scissors size={16} />
                    </button>
                    {floatingSelRef.current && (
                      <button
                        type="button"
                        className="icon-btn active"
                        title="Apply move/transform (Enter)"
                        aria-label="Apply selection transform"
                        onClick={commitFloatingSelection}
                      >
                        <Check size={16} />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      title="Deselect / Cancel (Escape)"
                      aria-label="Deselect"
                      onClick={cancelFloatingSelection}
                    >
                      <X size={16} />
                    </button>
                  </>
                )
              )}
            </div>
          );
        })()}

        <div
          style={{
            position: 'absolute',
            left: 12,
            bottom: timelineOpen ? timelineHeight + 12 : 24,
            width: 48,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            transition: timelineResizing
              ? 'none'
              : 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >

          <div
            className="floating-card dock-tools"
            aria-hidden={dockCollapsed}
            style={{
              width: 48,
              padding: dockCollapsed ? 0 : '4px 0',
              borderWidth: dockCollapsed ? 0 : 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              maxHeight: dockCollapsed ? 0 : '48vh',
              opacity: dockCollapsed ? 0 : 1,
              transform: dockCollapsed ? 'translateY(8px) scale(0.96)' : 'translateY(0) scale(1)',
              overflowY: dockCollapsed ? 'hidden' : 'auto',
              pointerEvents: dockCollapsed ? 'none' : 'auto',
            }}
          >
            {(
              [
                ['pencil', pixelPerfect ? 'Pencil: Pixel Perfect On (B) — Click again to toggle' : 'Pencil (B) — Click again for Pixel Perfect'],
                ['eraser', 'Eraser (E)'],
                ['fill', 'Fill (G)'],
                ['line', 'Line (L)'],
                ['curve', 'Curve (U)'],
                ['marquee', 'Marquee (M)'],
                [
                  'move',
                  moveAllLayers
                    ? 'Move: All Layers (V) — Click again for Selected'
                    : 'Move: Selected Layer(s) (V) — Click again for All',
                ],
              ] as Array<[PixelTool, string]>
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                className={`icon-btn ${tool === t ? 'active' : ''}`}
                aria-label={label}
                aria-pressed={tool === t}
                title={label}
                tabIndex={dockCollapsed ? -1 : 0}
                onClick={() => {
                  setShapeMenuOpen(false);
                  onSelectTool(t);
                }}
                style={{ width: 40, height: 38, flexShrink: 0 }}
              >
                {activeToolIcon(t)}
              </button>
            ))}

            {/* Categorized Shape Tool (Square / Circle + Filled variants) */}
            <button
              type="button"
              data-shape-toggle="true"
              className={`icon-btn ${tool === 'rectangle' || tool === 'circle' ? 'active' : ''}`}
              aria-label="Shapes (Square, Circle, Filled)"
              aria-expanded={shapeMenuOpen}
              aria-haspopup="menu"
              title="Shapes (Square / Circle / Filled)"
              tabIndex={dockCollapsed ? -1 : 0}
              onClick={() => setShapeMenuOpen((v) => !v)}
              style={{ width: 40, height: 38, flexShrink: 0, position: 'relative' }}
            >
              {(tool === 'circle' || (tool !== 'rectangle' && lastShape === 'circle')) ? (
                <Circle size={18} fill={shapeFilled ? 'currentColor' : 'none'} />
              ) : (
                <Square size={18} fill={shapeFilled ? 'currentColor' : 'none'} />
              )}
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  right: 3,
                  bottom: 3,
                  width: 0,
                  height: 0,
                  borderLeft: '4px solid transparent',
                  borderBottom: '4px solid currentColor',
                  opacity: 0.7,
                }}
              />
            </button>
          </div>

          {shapeMenuOpen && !dockCollapsed && (
            <div
              ref={shapeMenuRef}
              role="menu"
              aria-label="Shape tools"
              className="floating-card menu-pop"
              style={{
                position: 'absolute',
                left: 56,
                bottom: 56,
                padding: 6,
                background: 'var(--surface)',
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 4,
                zIndex: 45,
                transformOrigin: 'bottom left',
              }}
            >
              {(
                [
                  ['rectangle', false, 'Square Outline (R)'],
                  ['rectangle', true, 'Square Filled'],
                  ['circle', false, 'Circle Outline (C)'],
                  ['circle', true, 'Circle Filled'],
                ] as const
              ).map(([shapeTool, filled, label]) => {
                const isSelected = tool === shapeTool && shapeFilled === filled;
                return (
                  <button
                    key={`${shapeTool}-${String(filled)}`}
                    type="button"
                    role="menuitem"
                    className={`icon-btn ${isSelected ? 'active' : ''}`}
                    aria-label={label}
                    title={label}
                    style={{ width: 38, height: 38 }}
                    onClick={() => {
                      setLastShape(shapeTool);
                      setShapeFilled(filled);
                      onSelectTool(shapeTool);
                      setShapeMenuOpen(false);
                    }}
                  >
                    {shapeTool === 'rectangle' ? (
                      <Square size={18} fill={filled ? 'currentColor' : 'none'} />
                    ) : (
                      <Circle size={18} fill={filled ? 'currentColor' : 'none'} />
                    )}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className="floating-card"
            aria-label={dockCollapsed ? 'Expand tools' : 'Collapse tools'}
            aria-expanded={!dockCollapsed}
            title={dockCollapsed ? 'Expand tools' : 'Collapse tools'}
            onClick={() => {
              setShapeMenuOpen(false);
              setDockCollapsed((v) => !v);
            }}
            style={{
              width: 48,
              height: 48,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: dockCollapsed ? 'var(--accent)' : 'var(--text-secondary)',
              borderColor: dockCollapsed ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {dockCollapsed ? activeToolIcon(tool) : <ChevronDown size={20} />}
          </button>
        </div>

        <div
          className="floating-card"
          style={{
            position: 'absolute',
            left: 70,
            bottom: timelineOpen ? timelineHeight + 12 : 24,
            padding: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            transition: timelineResizing
              ? 'none'
              : 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <button
            type="button"
            className="icon-btn"
            aria-label="Undo"
            title="Undo (Ctrl+Z)"
            disabled={undoRef.current.length === 0}
            onClick={handleUndo}
          >
            <Undo2 size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Redo"
            title="Redo (Ctrl+Shift+Z)"
            disabled={redoRef.current.length === 0}
            onClick={handleRedo}
          >
            <Redo2 size={20} />
          </button>
        </div>
        <LayersPanel
          project={project}
          open={layersOpen}
          width={layersWidth}
          isResizing={layersResizing}
          dimOtherLayers={dimOtherLayers}
          onToggleDimOthers={() => setDimOtherLayers((v) => !v)}
          onWidthChange={setLayersWidth}
          onResizingChange={setLayersResizing}
          onToggleOpen={() =>
            setLayersOpen((v) => {
              const next = !v;
              try {
                localStorage.setItem('artopixel_layers_open_v1', String(next));
              } catch {
                // ignore
              }
              return next;
            })
          }
          onSelectLayer={(idx) => setProjectSync((p) => ({ ...p, activeLayerIndex: idx }))}
          onAddLayer={() =>
            setProjectSync((p) => ({
              ...p,
              layers: [
                ...p.layers,
                {
                  id: `layer_${Date.now()}`,
                  name: `Layer ${p.layers.length + 1}`,
                  visible: true,
                  opacity: 1,
                  groupId: null,
                  pixels: new Uint32Array(p.width * p.height),
                },
              ],
              activeLayerIndex: p.layers.length,
            }))
          }
          onToggleVisibility={(idx) => {
            setProjectSync((p) => {
              const next = [...p.layers];
              next[idx] = { ...next[idx], visible: !next[idx].visible };
              return { ...p, layers: next };
            });
            setRevision((r) => r + 1);
          }}
          onToggleAlphaLock={(idx) => {
            setProjectSync((p) => {
              const next = [...p.layers];
              next[idx] = { ...next[idx], alphaLocked: !next[idx].alphaLocked };
              return { ...p, layers: next };
            });
          }}
          onSetOpacity={(idx, opacity) => {
            setProjectSync((p) => {
              const next = [...p.layers];
              next[idx] = { ...next[idx], opacity };
              return { ...p, layers: next };
            });
            setRevision((r) => r + 1);
          }}
          onReorderLayer={(oldIdx, newIdx) => {
            setProjectSync((p) => {
              const next = [...p.layers];
              const activeId = next[p.activeLayerIndex].id;
              const [moved] = next.splice(oldIdx, 1);
              next.splice(newIdx, 0, moved);
              return {
                ...p,
                layers: next,
                activeLayerIndex: next.findIndex((l) => l.id === activeId),
              };
            });
            setRevision((r) => r + 1);
          }}
          onRenameLayer={(idx, name) =>
            setProjectSync((p) => {
              const next = [...p.layers];
              next[idx] = { ...next[idx], name };
              return { ...p, layers: next };
            })
          }
          onDuplicateLayers={(indices) => {
            setProjectSync((p) => {
              const next = [...p.layers];
              indices.forEach((idx) => {
                const src = next[idx];
                next.push({
                  ...src,
                  id: `layer_${Date.now()}_${Math.random()}`,
                  name: `${src.name} Copy`,
                  pixels: new Uint32Array(src.pixels),
                });
              });
              return { ...p, layers: next, activeLayerIndex: next.length - 1 };
            });
            setRevision((r) => r + 1);
          }}
          onMergeLayers={(indices) => {
            setProjectSync((p) => {
              const sorted = [...new Set(indices)].sort((a, b) => a - b);
              if (sorted.length === 1 && sorted[0] > 0) sorted.unshift(sorted[0] - 1);
              if (sorted.length < 2) return p;
              const next = [...p.layers];
              const base = { ...next[sorted[0]], pixels: new Uint32Array(next[sorted[0]].pixels) };
              for (let k = 1; k < sorted.length; k++) {
                const top = next[sorted[k]];
                for (let i = 0; i < base.pixels.length; i++) {
                  const src = top.pixels[i];
                  if (((src >>> 24) & 0xff) > 0) base.pixels[i] = src;
                }
              }
              next[sorted[0]] = base;
              for (let k = sorted.length - 1; k >= 1; k--) next.splice(sorted[k], 1);
              return { ...p, layers: next, activeLayerIndex: Math.min(sorted[0], next.length - 1) };
            });
            setRevision((r) => r + 1);
          }}
          onGroupLayers={(indices, gName) => {
            const gid = `grp_${Date.now()}`;
            setProjectSync((p) => {
              const next = p.layers.map((l, idx) =>
                indices.includes(idx) ? { ...l, groupId: gid } : l
              );
              return {
                ...p,
                groups: [...p.groups, { id: gid, name: gName || 'Group', visible: true, collapsed: false }],
                layers: next,
              };
            });
          }}
          onUngroupLayers={(indices) =>
            setProjectSync((p) => ({
              ...p,
              layers: p.layers.map((l, idx) =>
                indices.includes(idx) ? { ...l, groupId: null } : l
              ),
            }))
          }
          onDeleteLayers={(indices) => {
            setDeletedLayerToast({
              layers: project.layers,
              activeLayerIndex: project.activeLayerIndex,
            });
            setProjectSync((p) => {
              const remaining = p.layers.filter((_, idx) => !indices.includes(idx));
              const next =
                remaining.length > 0
                  ? remaining
                  : [
                    {
                      id: `layer_${Date.now()}`,
                      name: 'Layer 1',
                      visible: true,
                      opacity: 1,
                      groupId: null,
                      pixels: new Uint32Array(p.width * p.height),
                    },
                  ];
              return {
                ...p,
                layers: next,
                activeLayerIndex: Math.min(p.activeLayerIndex, next.length - 1),
              };
            });
            setRevision((r) => r + 1);
          }}
          onToggleGroupCollapse={(gid) =>
            setProjectSync((p) => ({
              ...p,
              groups: p.groups.map((g) =>
                g.id === gid ? { ...g, collapsed: !g.collapsed } : g
              ),
            }))
          }
          onToggleGroupVisibility={(gid) => {
            setProjectSync((p) => ({
              ...p,
              groups: p.groups.map((g) =>
                g.id === gid ? { ...g, visible: !g.visible } : g
              ),
            }));
            setRevision((r) => r + 1);
          }}
          onDeleteGroup={(gid) => {
            setProjectSync((p) => ({
              ...p,
              groups: p.groups.filter((g) => g.id !== gid),
              layers: p.layers.map((l) => (l.groupId === gid ? { ...l, groupId: null } : l)),
            }));
            setRevision((r) => r + 1);
          }}
          onSelectedIdsChange={(ids) => {
            selectedLayerIdsRef.current = ids;
          }}
        />

        <TimelinePanel
          project={project}
          activeFrameIndex={project.activeFrameIndex ?? 0}
          fps={project.fps ?? 8}
          isPlaying={isPlaying}
          onionSkin={onionSkin}
          revision={revision}
          layersOpen={layersOpen}
          layersWidth={layersWidth}
          layersResizing={layersResizing}
          open={timelineOpen}
          panelHeight={timelineHeight}
          isResizing={timelineResizing}
          onToggleOpen={() => setTimelineOpen((v) => !v)}
          onPanelHeightChange={setTimelineHeight}
          onResizingChange={setTimelineResizing}
          onSelectFrame={switchFrame}
          onReorderFrame={reorderFrame}
          onAddFrame={addFrame}
          onDuplicateFrame={duplicateFrame}
          onDeleteFrame={deleteFrame}
          onTogglePlay={() => setIsPlaying((v) => !v)}
          onSetFps={(fps) => setProject((p) => ({ ...p, fps }))}
          onToggleOnionSkin={() => setOnionSkin((v) => !v)}
        />

        {tool === 'move' && (
          <div
            className="floating-card"
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '4px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              zIndex: 30,
            }}
          >
            <button
              type="button"
              className={`btn ${!moveAllLayers ? 'primary' : ''}`}
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              onClick={() => setMoveAllLayers(false)}
            >
              Selected Layer(s)
            </button>
            <button
              type="button"
              className={`btn ${moveAllLayers ? 'primary' : ''}`}
              style={{ padding: '4px 9px', fontSize: 11.5 }}
              onClick={() => setMoveAllLayers(true)}
            >
              All Layers ({project.layers.length})
            </button>
          </div>
        )}

        {layerFinderToast && (
          <div
            role="status"
            className="floating-card"
            style={{
              position: 'absolute',
              top: 52,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '5px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text-primary)',
              zIndex: 45,
              pointerEvents: 'none',
            }}
          >
            {layerFinderToast}
          </div>
        )}

        {hiddenLayerToast && (
          <div
            role="status"
            className="floating-card"
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              padding: '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              zIndex: 45,
            }}
          >
            <span>Active layer is hidden</span>
            <button
              type="button"
              className="btn primary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => {
                setProject((p) => {
                  const next = [...p.layers];
                  const cur = next[p.activeLayerIndex];
                  if (cur) next[p.activeLayerIndex] = { ...cur, visible: true };
                  return { ...p, layers: next };
                });
                setHiddenLayerToast(false);
                setRevision((r) => r + 1);
              }}
            >
              Show Layer
            </button>
          </div>
        )}

        {deletedLayerToast && (
          <div
            role="status"
            className="floating-card"
            style={{
              position: 'absolute',
              bottom: timelineOpen ? timelineHeight + 12 : 24,
              right: layersOpen ? `calc(min(${layersWidth}px, 74vw) + 12px)` : 26,
              transition: timelineResizing || layersResizing
                ? 'none'
                : 'bottom 220ms cubic-bezier(0.22, 1, 0.36, 1), right 200ms cubic-bezier(0.22, 1, 0.36, 1)',
              padding: '6px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              fontSize: 12,
              zIndex: 45,
            }}
          >
            <span>Layer deleted</span>
            <button
              type="button"
              className="btn primary"
              style={{ padding: '3px 8px', fontSize: 11 }}
              onClick={() => {
                setProject((p) => ({
                  ...p,
                  layers: deletedLayerToast.layers,
                  activeLayerIndex: deletedLayerToast.activeLayerIndex,
                }));
                setDeletedLayerToast(null);
                setRevision((r) => r + 1);
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{ width: 28, height: 28 }}
              aria-label="Dismiss notification"
              onClick={() => setDeletedLayerToast(null)}
            >
              <X size={13} />
            </button>
          </div>
        )}
      </div>

      {showHelpModal && (
        <div className="modal-backdrop" onClick={attemptCloseShortcuts}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-title"
            className="floating-card"
            style={{
              width: 'min(420px, calc(100vw - 24px))',
              maxHeight: '85vh',
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              overflow: 'hidden',
              position: 'relative',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Fixed top header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '14px 16px 10px',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <h3 id="help-modal-title" style={{ margin: 0, fontSize: 15 }}>
                Shortcuts & Studio Tips
              </h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btn"
                  style={{ fontSize: 11.5, padding: '4px 10px' }}
                  onClick={() => {
                    setDraftShortcuts({ ...DEFAULT_SHORTCUTS });
                    setListeningAction(null);
                  }}
                >
                  Reset Defaults
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  style={{ width: 30, height: 30 }}
                  aria-label="Close shortcuts"
                  title="Close"
                  onClick={attemptCloseShortcuts}
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Scrollable shortcuts list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--text-secondary)' }}>
                Click any shortcut key below, then press a new key to rebind it.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12.5 }}>
                {SHORTCUT_LABELS.map(([action, label]) => {
                  const isListening = listeningAction === action;
                  const keyText = isListening
                    ? 'Press key…'
                    : draftShortcuts[action] === ' '
                      ? 'Space'
                      : draftShortcuts[action] === 'alt'
                        ? 'Alt'
                        : draftShortcuts[action].toUpperCase();
                  return (
                    <div
                      key={action}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10,
                        padding: '4px 0',
                        borderBottom: '1px solid var(--border)',
                      }}
                    >
                      <span style={{ color: 'var(--text-primary)' }}>{label}</span>
                      <button
                        type="button"
                        className={`btn mono ${isListening ? 'primary' : ''}`}
                        style={{ minWidth: 56, justifyContent: 'center', padding: '4px 10px', fontSize: 12 }}
                        onClick={() => setListeningAction(isListening ? null : action)}
                      >
                        {keyText}
                      </button>
                    </div>
                  );
                })}
                {[
                  ['Space + Drag / Pinch', 'Pan or zoom canvas'],
                  ['Ctrl + + / - / 0', 'Zoom in / out / reset to 100%'],
                  ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / Redo'],
                  ['Ctrl+G / Ctrl+Shift+G', 'Group / Ungroup selected layers'],
                  ['Arrows / Enter / Del', 'Nudge, apply, or delete selection'],
                  ['Ctrl + Left-Click', 'Auto-select layer at pixel'],
                  ['Right-click canvas', 'Context menu (Color > Darken / Lighten)'],
                ].map(([k, desc]) => (
                  <div
                    key={k}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '4px 0',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span className="mono" style={{ fontWeight: 700, color: 'var(--text-secondary)', fontSize: 11.5 }}>
                      {k}
                    </span>
                    <span style={{ color: 'var(--text-secondary)', textAlign: 'right', fontSize: 12 }}>
                      {desc}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fixed bottom footer */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                padding: '10px 16px 14px',
                borderTop: '1px solid var(--border)',
                background: 'var(--surface)',
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: 11.5, color: hasUnsavedShortcuts ? 'var(--accent)' : 'var(--text-muted)' }}>
                {hasUnsavedShortcuts ? 'Unsaved changes' : 'All changes applied'}
              </span>
              <button
                type="button"
                className="btn primary"
                disabled={!hasUnsavedShortcuts}
                onClick={applyDraftShortcuts}
              >
                Apply
              </button>
            </div>

            {/* Unsaved changes prompt */}
            {confirmDiscardShortcuts && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--backdrop)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 16,
                  zIndex: 10,
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="floating-card"
                  style={{
                    width: 'min(300px, 100%)',
                    padding: 16,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 12,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14 }}>Save shortcut changes?</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-secondary)' }}>
                    You have unapplied shortcut changes. Do you want to save them before closing?
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setConfirmDiscardShortcuts(false)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setConfirmDiscardShortcuts(false);
                        setShowHelpModal(false);
                      }}
                    >
                      Discard
                    </button>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={applyDraftShortcuts}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showResizeModal && (
        <div className="modal-backdrop" onClick={() => setShowResizeModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="resize-modal-title"
            className="floating-card"
            style={{
              width: 'min(360px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 id="resize-modal-title" style={{ margin: 0, fontSize: 15 }}>
                Resize Canvas
              </h3>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                aria-label="Close resize dialog"
                onClick={() => setShowResizeModal(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                Width (4–1024)
                <input
                  type="number"
                  min={4}
                  max={1024}
                  value={resizeW}
                  onChange={(e) => setResizeW(Math.max(4, Math.min(1024, Number(e.target.value) || 4)))}
                  className="mono"
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '6px 8px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
              <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                Height (4–1024)
                <input
                  type="number"
                  min={4}
                  max={1024}
                  value={resizeH}
                  onChange={(e) => setResizeH(Math.max(4, Math.min(1024, Number(e.target.value) || 4)))}
                  className="mono"
                  style={{
                    width: '100%',
                    marginTop: 4,
                    padding: '6px 8px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                  }}
                />
              </label>
            </div>
            <div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Anchor
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 34px)', gap: 4 }}>
                {(['top', 'center', 'bottom'] as const).map((ay) =>
                  (['left', 'center', 'right'] as const).map((ax) => {
                    const active = resizeAnchorX === ax && resizeAnchorY === ay;
                    return (
                      <button
                        key={`${ay}-${ax}`}
                        type="button"
                        className={`icon-btn ${active ? 'active' : ''}`}
                        style={{ width: 34, height: 34, fontSize: 11 }}
                        aria-label={`Anchor ${ay} ${ax}`}
                        onClick={() => {
                          setResizeAnchorX(ax);
                          setResizeAnchorY(ay);
                        }}
                      >
                        •
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                className="btn"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const bounds = computeOpaqueBounds(project);
                  if (!bounds) return;
                  undoRef.current = [];
                  redoRef.current = [];
                  forceHistoryTick((t) => t + 1);
                  setProject((p) => resizeProjectCanvas(p, bounds.width, bounds.height, -bounds.left, -bounds.top));
                  setSelection(null);
                  floatingSelRef.current = null;
                  setRevision((r) => r + 1);
                  setShowResizeModal(false);
                }}
              >
                Trim Empty
              </button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="btn" onClick={() => setShowResizeModal(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => {
                    const dx =
                      resizeAnchorX === 'left'
                        ? 0
                        : resizeAnchorX === 'center'
                          ? Math.floor((resizeW - project.width) / 2)
                          : resizeW - project.width;
                    const dy =
                      resizeAnchorY === 'top'
                        ? 0
                        : resizeAnchorY === 'center'
                          ? Math.floor((resizeH - project.height) / 2)
                          : resizeH - project.height;
                    undoRef.current = [];
                    redoRef.current = [];
                    forceHistoryTick((t) => t + 1);
                    setProject((p) => resizeProjectCanvas(p, resizeW, resizeH, dx, dy));
                    setSelection(null);
                    floatingSelRef.current = null;
                    setRevision((r) => r + 1);
                    setShowResizeModal(false);
                  }}
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showReplaceModal && (
        <div className="modal-backdrop" onClick={() => setShowReplaceModal(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="replace-modal-title"
            className="floating-card"
            style={{
              width: 'min(360px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 id="replace-modal-title" style={{ margin: 0, fontSize: 15 }}>
                Replace Color
              </h3>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 28, height: 28 }}
                aria-label="Close replace color dialog"
                onClick={() => setShowReplaceModal(false)}
              >
                <X size={15} />
              </button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                From
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input
                    type="color"
                    value={`#${argbToHex6(replaceFromColor)}`}
                    onChange={(e) => {
                      const rgb = parseInt(e.target.value.slice(1), 16);
                      setReplaceFromColor((0xff000000 | rgb) >>> 0);
                    }}
                    style={{ width: 32, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  />
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    #{argbToHex6(replaceFromColor)}
                  </span>
                </div>
              </label>
              <label style={{ flex: 1, fontSize: 12, color: 'var(--text-secondary)' }}>
                To
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                  <input
                    type="color"
                    value={`#${argbToHex6(replaceToColor)}`}
                    onChange={(e) => {
                      const rgb = parseInt(e.target.value.slice(1), 16);
                      setReplaceToColor((0xff000000 | rgb) >>> 0);
                    }}
                    style={{ width: 32, height: 28, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  />
                  <span className="mono" style={{ fontSize: 12, color: 'var(--text-primary)' }}>
                    #{argbToHex6(replaceToColor)}
                  </span>
                </div>
              </label>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {palette.slice(0, 16).map((c, idx) => (
                <button
                  key={`${c}-${idx}`}
                  type="button"
                  title={`Set To color #${argbToHex6(c)}`}
                  onClick={() => setReplaceToColor(c)}
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 4,
                    background: argbToCss(c),
                    border: c === replaceToColor ? '2px solid var(--accent)' : '1px solid var(--border)',
                    cursor: 'pointer',
                    padding: 0,
                  }}
                />
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={replaceAllFrames}
                onChange={(e) => setReplaceAllFrames(e.target.checked)}
              />
              <span>Apply to all frames (active layer index)</span>
            </label>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
              <button type="button" className="btn" onClick={() => setShowReplaceModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={() => {
                  if (replaceAllFrames && project.frames && project.frames.length > 1) {
                    const curFrameIdx = project.activeFrameIndex ?? 0;
                    project.frames.forEach((f, fIdx) => {
                      const targetLayer =
                        fIdx === curFrameIdx
                          ? project.layers[project.activeLayerIndex]
                          : f.layers[Math.min(project.activeLayerIndex, f.layers.length - 1)];
                      if (targetLayer) {
                        const { oldPixels, newPixels } = replaceColorInBuffer(
                          targetLayer.pixels,
                          project.width,
                          project.height,
                          replaceFromColor,
                          replaceToColor,
                          selection
                        );
                        if (oldPixels.size > 0) {
                          pushAction({
                            frameId: f.id,
                            layerId: targetLayer.id,
                            oldPixels,
                            newPixels,
                          });
                        }
                      }
                    });
                    setRevision((r) => r + 1);
                  } else {
                    const layer = project.layers[project.activeLayerIndex];
                    if (layer) {
                      const { oldPixels, newPixels } = replaceColorInBuffer(
                        layer.pixels,
                        project.width,
                        project.height,
                        replaceFromColor,
                        replaceToColor,
                        selection
                      );
                      if (oldPixels.size > 0) {
                        pushAction({ layerId: layer.id, oldPixels, newPixels });
                        setRevision((r) => r + 1);
                      }
                    }
                  }
                  setShowReplaceModal(false);
                }}
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}

      {showExportModal && (
        <div
          className="modal-backdrop"
          onClick={() => setShowExportModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="export-modal-title"
            className="floating-card"
            style={{
              width: 'min(380px, calc(100vw - 24px))',
              padding: 18,
              background: 'var(--surface)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="export-modal-title" style={{ margin: '0 0 14px', fontSize: 15 }}>
              Export Sprite
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                  fontSize: 12.5,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Format</span>
                <select
                  aria-label="Export format"
                  value={exportFormat}
                  onChange={(e) =>
                    setExportFormat(
                      e.target.value as 'png' | 'spritesheet' | 'gif' | 'aseprite'
                    )
                  }
                  style={{
                    width: 210,
                    padding: '6px 8px',
                    borderRadius: 7,
                    border: '1px solid var(--border)',
                    background: 'var(--surface-elevated)',
                    color: 'var(--text-primary)',
                    fontSize: 12.5,
                  }}
                >
                  <option value="png">PNG Image</option>
                  <option value="spritesheet">Spritesheet (PNG)</option>
                  <option value="gif">Animated GIF</option>
                  <option value="aseprite">Aseprite (.aseprite)</option>
                </select>
              </label>

              {exportFormat !== 'aseprite' && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    fontSize: 12.5,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <span>Size</span>
                  <select
                    aria-label="Export scale"
                    value={exportScale}
                    onChange={(e) => setExportScale(Number(e.target.value))}
                    className="mono"
                    style={{
                      width: 210,
                      padding: '6px 8px',
                      borderRadius: 7,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-elevated)',
                      color: 'var(--text-primary)',
                      fontSize: 12,
                    }}
                  >
                    {[1, 2, 4, 8, 16].map((s) => (
                      <option key={s} value={s}>
                        {s}x ({project.width * s}×{project.height * s} px)
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {exportFormat === 'spritesheet' && (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      fontSize: 12.5,
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <span>Layout</span>
                    <select
                      aria-label="Spritesheet layout"
                      value={sheetLayout}
                      onChange={(e) =>
                        setSheetLayout(e.target.value as 'horizontal' | 'grid')
                      }
                      style={{
                        width: 210,
                        padding: '6px 8px',
                        borderRadius: 7,
                        border: '1px solid var(--border)',
                        background: 'var(--surface-elevated)',
                        color: 'var(--text-primary)',
                        fontSize: 12.5,
                      }}
                    >
                      <option value="horizontal">Horizontal Strip</option>
                      <option value="grid">Grid</option>
                    </select>
                  </label>
                  {sheetLayout === 'grid' && (
                    <label
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        fontSize: 12.5,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <span>Columns</span>
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, project.frames?.length ?? 1)}
                        value={sheetCols}
                        onChange={(e) =>
                          setSheetCols(Math.max(1, Number(e.target.value) || 1))
                        }
                        className="mono"
                        style={{
                          width: 210,
                          padding: '6px 8px',
                          borderRadius: 7,
                          border: '1px solid var(--border)',
                          background: 'var(--surface-elevated)',
                          color: 'var(--text-primary)',
                          fontSize: 12,
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </div>

            <div
              className="mono"
              style={{
                fontSize: 11.5,
                color: 'var(--text-muted)',
                padding: '6px 8px',
                borderRadius: 7,
                background: 'var(--surface-elevated)',
                marginBottom: 14,
              }}
            >
              {exportFormat === 'png' && (
                <>Output: {project.width * exportScale}×{project.height * exportScale} px</>
              )}
              {exportFormat === 'spritesheet' && (() => {
                const n = project.frames?.length ?? 1;
                const cols = sheetLayout === 'horizontal' ? n : Math.max(1, Math.min(sheetCols, n));
                const rows = sheetLayout === 'horizontal' ? 1 : Math.ceil(n / cols);
                return (
                  <>
                    Sheet: {n} frame{n === 1 ? '' : 's'} • {cols * project.width * exportScale}×{rows * project.height * exportScale} px
                  </>
                );
              })()}
              {exportFormat === 'gif' && (
                <>
                  GIF: {project.frames?.length ?? 1} frame{(project.frames?.length ?? 1) === 1 ? '' : 's'} @ {project.fps ?? 8} FPS • {project.width * exportScale}×{project.height * exportScale} px
                </>
              )}
              {exportFormat === 'aseprite' && (
                <>
                  {project.frames?.length ?? 1} frame{(project.frames?.length ?? 1) === 1 ? '' : 's'}, {project.layers.length} layer{project.layers.length === 1 ? '' : 's'}
                  {project.groups.length > 0 ? `, ${project.groups.length} group(s)` : ''} • 32-bit RGBA
                </>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" className="btn" onClick={() => setShowExportModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn primary"
                onClick={async () => {
                  if (exportFormat === 'png') {
                    downloadProjectPng(project, exportScale);
                  } else if (exportFormat === 'spritesheet') {
                    downloadProjectSpritesheet(project, exportScale, sheetLayout, sheetCols);
                  } else if (exportFormat === 'gif') {
                    downloadProjectGif(project, exportScale, project.fps ?? 8);
                  } else {
                    await downloadProjectAseprite(project, palette);
                  }
                  setShowExportModal(false);
                }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
