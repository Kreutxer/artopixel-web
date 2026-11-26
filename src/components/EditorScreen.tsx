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
  Grid2x2,
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
  applyLayerPixelTransform,
  applyOutline,
  bresenham,
  brushOffsets,
  createCanvasDoc,
  ensureProjectCanvases,
  ensureProjectFrames,
  evalDeCasteljau,
  forEachMirrored,
  inWritableBounds,
  replaceColorInBuffer,
  resizeProjectCanvas,
  shiftArgbLightness,
  wrapCoord,
} from '../engine/pixelEngine';
import { PRESET_PALETTES, argbToCss } from '../engine/paletteQuantizer';
import {
  renderCompositeToCanvas,
  renderFrameToCanvas,
  saveActiveCanvas,
  saveProject,
} from '../engine/storage';
import { importProjectFromFile } from '../engine/importer';
import {
  BrushShape,
  GridRect,
  MirrorMode,
  PixelFrame,
  PixelLayer,
  PixelProject,
  PixelTool,
} from '../engine/types';
import {
  ShortcutAction,
  loadShortcuts,
} from '../hooks/useShortcuts';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { ColorPanel } from './ColorPanel';
import { LayersPanel } from './LayersPanel';
import { MinimapPanel } from './MinimapPanel';
import { TimelinePanel } from './TimelinePanel';
import { CanvasContextMenu } from './editor/CanvasContextMenu';
import { CanvasTabsBar } from './editor/CanvasTabsBar';
import { ExportModal } from './editor/ExportModal';
import { LayerPill } from './editor/LayerPill';
import { ReplaceColorModal } from './editor/ReplaceColorModal';
import { ResizeCanvasModal } from './editor/ResizeCanvasModal';
import { SettingsModal } from './editor/SettingsModal';
import { ShortcutsModal } from './editor/ShortcutsModal';
import { ToolsDock } from './editor/ToolsDock';
import {
  GridMode,
  HoveredLayerCache,
  ThemeCache,
  renderEditorViewport,
} from './editor/drawViewport';

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
  uiScale = 1,
  onChangeUiScale,
  onToggleTheme,
  onBack,
}: {
  initialProject: PixelProject;
  theme: 'light' | 'dark';
  uiScale?: number;
  onChangeUiScale?: (next: number) => void;
  onToggleTheme: () => void;
  onBack: () => void;
}) {
  const [project, setProject] = useState<PixelProject>(() =>
    ensureProjectCanvases(initialProject)
  );
  const [openCanvasIds, setOpenCanvasIds] = useState<string[]>(() =>
    (ensureProjectCanvases(initialProject).canvases ?? []).map((c) => c.id)
  );
  const [isPlaying, setIsPlaying] = useState(false);
  const [onionSkin, setOnionSkin] = useState(false);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [tabsOpen, setTabsOpen] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('artopixel_tabs_open_v1');
      if (saved !== null) return saved !== 'false';
    } catch {
      // ignore
    }
    return true;
  });
  const [timelineHeight, setTimelineHeight] = useState(156);
  const [timelineResizing, setTimelineResizing] = useState(false);
  const [layersWidth, setLayersWidth] = useState(276);
  const [layersResizing, setLayersResizing] = useState(false);
  const [dimOtherLayers, setDimOtherLayers] = useState(false);
  const [tool, setTool] = useState<PixelTool>('pencil');
  const [mirror, setMirror] = useState<MirrorMode>('none');
  const [lastMirrorMode, setLastMirrorMode] = useState<Exclude<MirrorMode, 'none'>>('horizontal');
  const [mirrorMenuOpen, setMirrorMenuOpen] = useState(false);
  const mirrorMenuRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(() => setMirrorMenuOpen(false), mirrorMenuOpen);
  useEffect(() => {
    if (!mirrorMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (mirrorMenuRef.current && !mirrorMenuRef.current.contains(e.target as Node)) {
        setMirrorMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [mirrorMenuOpen]);
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
  const [brushSize, setBrushSize] = useState(1);
  const [previewingSize, setPreviewingSize] = useState(false);
  const [activeColor, setActiveColor] = useState<number>(0xff000000);
  const [palette, setPalette] = useState<number[]>(
    () => initialProject.sharedPalette ?? PRESET_PALETTES[0].colors
  );
  const [showMinimap, setShowMinimap] = useState(true);
  const [gridMode, setGridMode] = useState<GridMode>('tile');
  const [lastGridMode, setLastGridMode] = useState<Exclude<GridMode, 'off'>>('tile');
  const [gridMenuOpen, setGridMenuOpen] = useState(false);
  const gridMenuRef = useRef<HTMLDivElement | null>(null);
  useEscapeKey(() => setGridMenuOpen(false), gridMenuOpen);
  useEffect(() => {
    if (!gridMenuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (gridMenuRef.current && !gridMenuRef.current.contains(e.target as Node)) {
        setGridMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [gridMenuOpen]);
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
  const [collapsedHudLeft, setCollapsedHudLeft] = useState(180);
  const [hiddenLayerToast, setHiddenLayerToast] = useState(false);
  const [layerFinderToast, setLayerFinderToast] = useState<string | null>(null);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
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
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceFromColor, setReplaceFromColor] = useState<number>(0xff000000);
  const [replaceToColor, setReplaceToColor] = useState<number>(0xff000000);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(initialProject.name);
  const [canvasCtxMenu, setCanvasCtxMenu] = useState<{
    x: number;
    y: number;
    gx: number;
    gy: number;
  } | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  const [zoom, setZoom] = useState(1);
  const [baseZoom, setBaseZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [revision, setRevision] = useState(0);
  const [selection, setSelection] = useState<GridRect | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSubOpen, setImportSubOpen] = useState(false);
  const importModeRef = useRef<'place' | 'open'>('place');
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
  const canvasHistoryRef = useRef<Map<string, { undo: HistoryAction[]; redo: HistoryAction[] }>>(new Map());
  const canvasViewportRef = useRef<Map<string, { zoom: number; baseZoom: number; pan: { x: number; y: number } }>>(new Map());
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
  const themeCacheRef = useRef<ThemeCache | null>(null);
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
  const hoveredLayerCacheRef = useRef<HoveredLayerCache | null>(null);
  const panStartRef = useRef({ x: 0, y: 0 });
  const floatingSelRef = useRef<{
    pixels: Uint32Array;
    w: number;
    h: number;
    clearedOrig: Map<number, number>;
    origPixels?: Uint32Array;
    origW?: number;
    origH?: number;
  } | null>(null);
  const resizingSelRef = useRef<{
    handle: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
    startLeft: number;
    startTop: number;
    startW: number;
    startH: number;
    startClientX: number;
    startClientY: number;
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

  const brushSizeRef = useRef(brushSize);
  brushSizeRef.current = brushSize;
  const effectivePerfect = perfectShape || shiftHeld;
  const didMountAutosaveRef = useRef(false);
  const latestProjectRef = useRef(project);
  latestProjectRef.current = project;

  useEffect(() => {
    if (!didMountAutosaveRef.current) {
      didMountAutosaveRef.current = true;
      return;
    }
    setSaveStatus('saving');
    const t = setTimeout(async () => {
      try {
        await saveActiveCanvas(latestProjectRef.current);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      }
    }, 400);
    return () => clearTimeout(t);
  }, [revision, project.name, project.fps, project.referenceDataUrl, project.referenceVisible]);

  useEffect(() => {
    const canvas = viewportRef.current;
    if (!canvas) return;
    const activeCanvasId = project.canvases?.[project.activeCanvasIndex ?? 0]?.id;
    const savedVp = activeCanvasId ? canvasViewportRef.current.get(activeCanvasId) : undefined;
    if (savedVp) {
      setBaseZoom(savedVp.baseZoom);
      setZoom(savedVp.zoom);
      setPan(savedVp.pan);
      return;
    }
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
  }, [project.id, project.activeCanvasIndex, project.width, project.height]);

  const setProjectSync = useCallback(
    (updater: React.SetStateAction<PixelProject>) => {
      setProject((prev) => {
        const next = typeof updater === 'function' ? updater(prev) : updater;
        const frames = next.frames;
        const fIdx = next.activeFrameIndex ?? 0;
        let syncedFrames = frames;
        if (frames && frames[fIdx]) {
          syncedFrames = [...frames];
          syncedFrames[fIdx] = {
            ...syncedFrames[fIdx],
            layers: next.layers,
            groups: next.groups,
            activeLayerIndex: next.activeLayerIndex,
          };
        }
        const canvases = next.canvases;
        const cIdx = next.activeCanvasIndex ?? 0;
        let syncedCanvases = canvases;
        if (canvases && canvases[cIdx]) {
          syncedCanvases = [...canvases];
          syncedCanvases[cIdx] = {
            ...syncedCanvases[cIdx],
            width: next.width,
            height: next.height,
            layers: next.layers,
            groups: next.groups,
            activeLayerIndex: next.activeLayerIndex,
            frames: syncedFrames,
            activeFrameIndex: next.activeFrameIndex,
            fps: next.fps,
          };
        }
        return {
          ...next,
          frames: syncedFrames,
          canvases: syncedCanvases,
        };
      });
    },
    []
  );

  const switchCanvas = useCallback(
    (targetIdx: number) => {
      const canvases = project.canvases ?? [];
      const curIdx = project.activeCanvasIndex ?? 0;
      if (targetIdx === curIdx || targetIdx < 0 || targetIdx >= canvases.length) return;
      setIsPlaying(false);
      if (floatingSelRef.current) {
        commitFloatingSelection();
      }
      const curCanvas = canvases[curIdx];
      if (curCanvas) {
        canvasHistoryRef.current.set(curCanvas.id, {
          undo: [...undoRef.current],
          redo: [...redoRef.current],
        });
        canvasViewportRef.current.set(curCanvas.id, { zoom, baseZoom, pan });
      }
      const nextCanvases = [...canvases];
      if (nextCanvases[curIdx]) {
        const fIdx = project.activeFrameIndex ?? 0;
        const syncedFrames = project.frames ? [...project.frames] : undefined;
        if (syncedFrames && syncedFrames[fIdx]) {
          syncedFrames[fIdx] = {
            ...syncedFrames[fIdx],
            layers: project.layers,
            groups: project.groups,
            activeLayerIndex: project.activeLayerIndex,
          };
        }
        nextCanvases[curIdx] = {
          ...nextCanvases[curIdx],
          width: project.width,
          height: project.height,
          layers: project.layers,
          groups: project.groups,
          activeLayerIndex: project.activeLayerIndex,
          frames: syncedFrames,
          activeFrameIndex: project.activeFrameIndex,
          fps: project.fps,
        };
      }
      const target = nextCanvases[targetIdx];
      const targetHist = canvasHistoryRef.current.get(target.id);
      undoRef.current = targetHist ? [...targetHist.undo] : [];
      redoRef.current = targetHist ? [...targetHist.redo] : [];
      forceHistoryTick((t) => t + 1);
      setSelection(null);
      floatingSelRef.current = null;
      setProject((prev) =>
        ensureProjectCanvases({
          ...prev,
          canvases: nextCanvases,
          activeCanvasIndex: targetIdx,
        })
      );
    },
    [project, zoom, baseZoom, pan]
  );

  const hideCanvasTab = useCallback(
    (id: string) => {
      if (openCanvasIds.length <= 1) return;
      const canvases = project.canvases ?? [];
      const curCanvas = canvases[project.activeCanvasIndex ?? 0];
      const remainingIds = openCanvasIds.filter((oid) => oid !== id);
      setOpenCanvasIds(remainingIds);
      if (curCanvas?.id === id) {
        const nextIdx = canvases.findIndex((c) => remainingIds.includes(c.id));
        if (nextIdx >= 0) {
          switchCanvas(nextIdx);
        }
      }
    },
    [openCanvasIds, project.canvases, project.activeCanvasIndex, switchCanvas]
  );

  const openCanvasTab = useCallback((id: string) => {
    setOpenCanvasIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }, []);

  const addCanvasTab = useCallback(
    (name: string, width: number, height: number) => {
      setIsPlaying(false);
      if (floatingSelRef.current) {
        commitFloatingSelection();
      }
      const canvases = project.canvases ?? [];
      const curIdx = project.activeCanvasIndex ?? 0;
      const curCanvas = canvases[curIdx];
      if (curCanvas) {
        canvasHistoryRef.current.set(curCanvas.id, {
          undo: [...undoRef.current],
          redo: [...redoRef.current],
        });
        canvasViewportRef.current.set(curCanvas.id, { zoom, baseZoom, pan });
      }
      const nextCanvases = [...canvases];
      if (nextCanvases[curIdx]) {
        const fIdx = project.activeFrameIndex ?? 0;
        const syncedFrames = project.frames ? [...project.frames] : undefined;
        if (syncedFrames && syncedFrames[fIdx]) {
          syncedFrames[fIdx] = {
            ...syncedFrames[fIdx],
            layers: project.layers,
            groups: project.groups,
            activeLayerIndex: project.activeLayerIndex,
          };
        }
        nextCanvases[curIdx] = {
          ...nextCanvases[curIdx],
          width: project.width,
          height: project.height,
          layers: project.layers,
          groups: project.groups,
          activeLayerIndex: project.activeLayerIndex,
          frames: syncedFrames,
          activeFrameIndex: project.activeFrameIndex,
          fps: project.fps,
        };
      }
      const created = createCanvasDoc(name, width, height);
      nextCanvases.push(created);
      setOpenCanvasIds((prev) => [...prev, created.id]);
      undoRef.current = [];
      redoRef.current = [];
      forceHistoryTick((t) => t + 1);
      setSelection(null);
      floatingSelRef.current = null;
      setProject((prev) =>
        ensureProjectCanvases({
          ...prev,
          canvases: nextCanvases,
          activeCanvasIndex: nextCanvases.length - 1,
        })
      );
      setRevision((r) => r + 1);
    },
    [project, zoom, baseZoom, pan]
  );

  const renameCanvasTab = useCallback((idx: number, name: string) => {
    setProject((prev) => {
      const canvases = prev.canvases ?? [];
      if (!canvases[idx]) return prev;
      const next = [...canvases];
      next[idx] = { ...next[idx], name };
      return { ...prev, canvases: next };
    });
    setRevision((r) => r + 1);
  }, []);

  const reorderCanvasTab = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setProject((prev) => {
      const canvases = prev.canvases ?? [];
      if (
        fromIdx < 0 ||
        toIdx < 0 ||
        fromIdx >= canvases.length ||
        toIdx >= canvases.length
      ) {
        return prev;
      }
      const curIdx = prev.activeCanvasIndex ?? 0;
      const activeId = canvases[curIdx]?.id;
      const next = [...canvases];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      const nextActiveIdx = Math.max(0, next.findIndex((c) => c.id === activeId));
      return {
        ...prev,
        canvases: next,
        activeCanvasIndex: nextActiveIdx,
      };
    });
    setRevision((r) => r + 1);
  }, []);

  const deleteCanvasTab = useCallback(
    (idx: number) => {
      const canvases = project.canvases ?? [];
      if (canvases.length <= 1 || idx < 0 || idx >= canvases.length) return;
      setIsPlaying(false);
      const removed = canvases[idx];
      if (removed) {
        canvasHistoryRef.current.delete(removed.id);
        canvasViewportRef.current.delete(removed.id);
        setOpenCanvasIds((prev) => prev.filter((id) => id !== removed.id));
      }
      const curIdx = project.activeCanvasIndex ?? 0;
      const nextCanvases = canvases.filter((_, i) => i !== idx);
      const nextActiveIdx =
        idx === curIdx
          ? Math.min(idx, nextCanvases.length - 1)
          : idx < curIdx
            ? curIdx - 1
            : curIdx;
      const target = nextCanvases[nextActiveIdx];
      if (idx === curIdx) {
        const targetHist = canvasHistoryRef.current.get(target.id);
        undoRef.current = targetHist ? [...targetHist.undo] : [];
        redoRef.current = targetHist ? [...targetHist.redo] : [];
        forceHistoryTick((t) => t + 1);
        setSelection(null);
        floatingSelRef.current = null;
      }
      setProject((prev) =>
        ensureProjectCanvases({
          ...prev,
          canvases: nextCanvases,
          activeCanvasIndex: nextActiveIdx,
        })
      );
      setRevision((r) => r + 1);
    },
    [project.canvases, project.activeCanvasIndex]
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
    renderEditorViewport({
      canvas: viewportRef.current,
      project,
      zoom,
      pan,
      tiledMode,
      gridMode,
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
      activeFrameId: activeFrameIdRef.current,
      compositeCanvas: compositeRef.current,
      prevOnionCanvas: prevOnionRef.current,
      nextOnionCanvas: nextOnionRef.current,
      previewPixels: previewPixelsRef.current,
      curveStart: curveStartRef.current,
      curveEnd: curveEndRef.current,
      curveControls: curveControlsRef.current,
      hoverPt: hoverPtRef.current,
      isPanning: isPanningRef.current,
      isScrubbing: Boolean(fScrubRef.current),
      isDraggingMirror: Boolean(draggingMirrorRef.current),
      isDrawing: isDrawingRef.current,
      ctrlHeld: ctrlHeldRef.current,
      themeCacheRef,
      hoveredLayerCacheRef,
    });
  }, [
    project,
    zoom,
    pan,
    tiledMode,
    gridMode,
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

  const resizeFloatingSelection = useCallback(
    (newW: number, newH: number, nextLeft?: number, nextTop?: number) => {
      const fl = floatingSelRef.current;
      const cur = selectionRef.current;
      if (!fl || !cur) return;
      const targetW = Math.max(1, Math.min(1024, Math.round(newW)));
      const targetH = Math.max(1, Math.min(1024, Math.round(newH)));
      const origPixels = fl.origPixels ?? new Uint32Array(fl.pixels);
      const origW = fl.origW ?? fl.w;
      const origH = fl.origH ?? fl.h;
      if (!fl.origPixels) {
        fl.origPixels = origPixels;
        fl.origW = origW;
        fl.origH = origH;
      }

      const scaled = new Uint32Array(targetW * targetH);
      for (let y = 0; y < targetH; y++) {
        const sy = Math.min(origH - 1, Math.floor((y * origH) / targetH));
        for (let x = 0; x < targetW; x++) {
          const sx = Math.min(origW - 1, Math.floor((x * origW) / targetW));
          scaled[y * targetW + x] = origPixels[sy * origW + sx];
        }
      }
      fl.pixels = scaled;
      fl.w = targetW;
      fl.h = targetH;

      const nextRect: GridRect = {
        left: nextLeft ?? cur.left,
        top: nextTop ?? cur.top,
        width: targetW,
        height: targetH,
      };
      selectionRef.current = nextRect;
      setSelection(nextRect);
      syncFloatingPreview(nextRect);
      setRevision((r) => r + 1);
    },
    [syncFloatingPreview]
  );

  const handleImportFile = useCallback(
    async (file: File) => {
      try {
        const imported = await importProjectFromFile(file);
        if (importModeRef.current === 'open') {
          setIsPlaying(false);
          if (floatingSelRef.current) {
            commitFloatingSelection();
          }
          const canvases = project.canvases ?? [];
          const curIdx = project.activeCanvasIndex ?? 0;
          const curCanvas = canvases[curIdx];
          if (curCanvas) {
            canvasHistoryRef.current.set(curCanvas.id, {
              undo: [...undoRef.current],
              redo: [...redoRef.current],
            });
            canvasViewportRef.current.set(curCanvas.id, { zoom, baseZoom, pan });
          }
          const nextCanvases = [...canvases];
          if (nextCanvases[curIdx]) {
            const fIdx = project.activeFrameIndex ?? 0;
            const syncedFrames = project.frames ? [...project.frames] : undefined;
            if (syncedFrames && syncedFrames[fIdx]) {
              syncedFrames[fIdx] = {
                ...syncedFrames[fIdx],
                layers: project.layers,
                groups: project.groups,
                activeLayerIndex: project.activeLayerIndex,
              };
            }
            nextCanvases[curIdx] = {
              ...nextCanvases[curIdx],
              width: project.width,
              height: project.height,
              layers: project.layers,
              groups: project.groups,
              activeLayerIndex: project.activeLayerIndex,
              frames: syncedFrames,
              activeFrameIndex: project.activeFrameIndex,
              fps: project.fps,
            };
          }
          const importedTabs =
            imported.canvases && imported.canvases.length > 0
              ? imported.canvases.map((c) => ({
                  ...c,
                  id:
                    typeof crypto !== 'undefined' && crypto.randomUUID
                      ? crypto.randomUUID()
                      : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                }))
              : [
                  {
                    id:
                      typeof crypto !== 'undefined' && crypto.randomUUID
                        ? crypto.randomUUID()
                        : `c_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                    name: imported.name || 'Imported',
                    width: imported.width,
                    height: imported.height,
                    layers: imported.layers,
                    groups: imported.groups,
                    activeLayerIndex: imported.activeLayerIndex,
                    frames: imported.frames,
                    activeFrameIndex: imported.activeFrameIndex,
                    fps: imported.fps,
                  },
                ];
          const firstNewIdx = nextCanvases.length;
          nextCanvases.push(...importedTabs);
          setOpenCanvasIds((prev) => [...prev, ...importedTabs.map((t) => t.id)]);
          undoRef.current = [];
          redoRef.current = [];
          forceHistoryTick((t) => t + 1);
          setSelection(null);
          floatingSelRef.current = null;
          setProject((prev) =>
            ensureProjectCanvases({
              ...prev,
              canvases: nextCanvases,
              activeCanvasIndex: firstNewIdx,
            })
          );
          setRevision((r) => r + 1);
          return;
        }
        if (floatingSelRef.current) {
          commitFloatingSelection();
        }
        const off = document.createElement('canvas');
        renderCompositeToCanvas(imported, off);
        const ctx = off.getContext('2d');
        if (!ctx) {
          throw new Error('Could not initialize canvas context.');
        }
        const imgData = ctx.getImageData(0, 0, imported.width, imported.height).data;
        const srcW = imported.width;
        const srcH = imported.height;
        const buf = new Uint32Array(srcW * srcH);
        for (let i = 0; i < srcW * srcH; i++) {
          const si = i * 4;
          const r = imgData[si];
          const g = imgData[si + 1];
          const b = imgData[si + 2];
          const a = imgData[si + 3];
          buf[i] = a === 0 ? 0 : (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
        }

        const newLayer: PixelLayer = {
          id: `layer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: imported.name || 'Imported',
          visible: true,
          opacity: 1,
          groupId: null,
          pixels: new Uint32Array(project.width * project.height),
        };
        setProjectSync((p) => ({
          ...p,
          layers: [...p.layers, newLayer],
          activeLayerIndex: p.layers.length,
        }));

        const placedRect: GridRect = {
          left: Math.floor((project.width - srcW) / 2),
          top: Math.floor((project.height - srcH) / 2),
          width: srcW,
          height: srcH,
        };
        floatingSelRef.current = {
          pixels: buf,
          w: srcW,
          h: srcH,
          clearedOrig: new Map(),
          origPixels: new Uint32Array(buf),
          origW: srcW,
          origH: srcH,
        };
        selectionRef.current = placedRect;
        setSelection(placedRect);
        setTool('marquee');
        syncFloatingPreview(placedRect);
        setRevision((r) => r + 1);
        setLayerFinderToast(`Placed "${newLayer.name}" — drag corners to resize, Enter to apply`);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Failed to import selected file.');
      }
    },
    [project.width, project.height, commitFloatingSelection, setProjectSync, syncFloatingPreview]
  );

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

    if (
      !tiledMode &&
      !(tool === 'marquee' && selection) &&
      (gx < 0 || gy < 0 || gx >= project.width || gy >= project.height)
    ) {
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
      if (selection) {
        const cRect = viewportRef.current?.getBoundingClientRect();
        const ptrX = cRect ? e.clientX - cRect.left : 0;
        const ptrY = cRect ? e.clientY - cRect.top : 0;
        const sx0 = pan.x + selection.left * zoom;
        const sy0 = pan.y + selection.top * zoom;
        const sw = selection.width * zoom;
        const sh = selection.height * zoom;
        const handles: Array<{
          id: 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';
          hx: number;
          hy: number;
        }> = [
          { id: 'nw', hx: sx0, hy: sy0 },
          { id: 'n', hx: sx0 + sw / 2, hy: sy0 },
          { id: 'ne', hx: sx0 + sw, hy: sy0 },
          { id: 'e', hx: sx0 + sw, hy: sy0 + sh / 2 },
          { id: 'se', hx: sx0 + sw, hy: sy0 + sh },
          { id: 's', hx: sx0 + sw / 2, hy: sy0 + sh },
          { id: 'sw', hx: sx0, hy: sy0 + sh },
          { id: 'w', hx: sx0, hy: sy0 + sh / 2 },
        ];
        const hitHandle = handles.find(
          (h) => Math.abs(ptrX - h.hx) <= 9 && Math.abs(ptrY - h.hy) <= 9
        );
        if (hitHandle) {
          liftSelectionToFloating(selection);
          resizingSelRef.current = {
            handle: hitHandle.id,
            startLeft: selection.left,
            startTop: selection.top,
            startW: selection.width,
            startH: selection.height,
            startClientX: e.clientX,
            startClientY: e.clientY,
          };
          return;
        }
      }
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
      setBrushSize(nextSize);
      return;
    }
    if (fScrubRef.current) {
      const delta = Math.round((e.clientX - fScrubRef.current.startX) / 5);
      const nextSize = Math.max(1, Math.min(128, fScrubRef.current.startSize + delta));
      setBrushSize(nextSize);
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

    if (tool === 'marquee' && resizingSelRef.current) {
      const rs = resizingSelRef.current;
      const dx = Math.round((e.clientX - rs.startClientX) / zoom);
      const dy = Math.round((e.clientY - rs.startClientY) / zoom);
      const hasW = rs.handle.includes('w');
      const hasE = rs.handle.includes('e');
      const hasN = rs.handle.includes('n');
      const hasS = rs.handle.includes('s');

      let newW = rs.startW;
      let newH = rs.startH;
      if (hasE) newW = Math.max(1, rs.startW + dx);
      if (hasW) newW = Math.max(1, rs.startW - dx);
      if (hasS) newH = Math.max(1, rs.startH + dy);
      if (hasN) newH = Math.max(1, rs.startH - dy);

      if (e.shiftKey && (hasW || hasE) && (hasN || hasS)) {
        const ratio = rs.startW / Math.max(1, rs.startH);
        if (Math.abs(newW - rs.startW) >= Math.abs(newH - rs.startH)) {
          newH = Math.max(1, Math.round(newW / ratio));
        } else {
          newW = Math.max(1, Math.round(newH * ratio));
        }
      }

      const newLeft = hasW ? rs.startLeft + (rs.startW - newW) : rs.startLeft;
      const newTop = hasN ? rs.startTop + (rs.startH - newH) : rs.startTop;
      resizeFloatingSelection(newW, newH, newLeft, newTop);
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
      resizingSelRef.current = null;
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
      setBrushSize(nextSize);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setSaveStatus('saving');
        saveProject(project)
          .then(() => setSaveStatus('saved'))
          .catch(() => setSaveStatus('error'));
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
          setBrushSize((s) => Math.max(1, s - step));
        }
        if (pressed === sc.brushInc) {
          const step = e.shiftKey ? 8 : 1;
          setBrushSize((s) => Math.min(128, s + step));
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
    project,
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
        return pixelPerfect ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M2.5 21.5l1.15-4.7 3.55 3.55-4.7 1.15z" />
            <path d="M9.1 18.45l9.35-9.35-3.55-3.55-9.35 9.35 3.55 3.55z" />
            <path d="M20.2 7.35l.8-.8a2.1 2.1 0 0 0-3-3l-.8.8 3 3z" />
          </svg>
        ) : (
          <Pencil size={18} />
        );
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
        className="editor-header"
        style={{
          height: 54,
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 10px',
          gap: 10,
          position: 'relative',
          zIndex: 45,
        }}
      >
        <input
          ref={importInputRef}
          type="file"
          accept="image/*,.apxl,.ase,.aseprite"
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
                <div
                  style={{ position: 'relative' }}
                  onMouseEnter={() => setImportSubOpen(true)}
                  onMouseLeave={() => setImportSubOpen(false)}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-haspopup="menu"
                    aria-expanded={importSubOpen}
                    className="btn"
                    style={{ width: '100%', border: 'none', justifyContent: 'space-between' }}
                    onClick={() => setImportSubOpen((v) => !v)}
                  >
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <ImagePlus size={14} /> Import
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                  </button>
                  {importSubOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        ...(typeof window !== 'undefined' && window.innerWidth < 400
                          ? { left: 0, top: '100%', paddingTop: 4 }
                          : { left: '100%', top: -4, paddingLeft: 4 }),
                        zIndex: 61,
                      }}
                    >
                      <div
                        role="menu"
                        className="floating-card menu-pop"
                        style={{
                          width: 176,
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
                            importModeRef.current = 'place';
                            setImportSubOpen(false);
                            setShowMoreMenu(false);
                            importInputRef.current?.click();
                          }}
                        >
                          Place into Canvas
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          className="btn"
                          style={{ border: 'none', justifyContent: 'flex-start' }}
                          onClick={() => {
                            importModeRef.current = 'open';
                            setImportSubOpen(false);
                            setShowMoreMenu(false);
                            importInputRef.current?.click();
                          }}
                        >
                          Import as New Tab
                        </button>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  className="btn"
                  style={{ border: 'none', justifyContent: 'space-between' }}
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
                  <span>Save</span>
                  <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                    Ctrl+S
                  </span>
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
                    <span>Settings</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>▶</span>
                  </button>
                  {optionsSubOpen && (
                    <div
                      style={{
                        position: 'absolute',
                        ...(typeof window !== 'undefined' && window.innerWidth < 400
                          ? { left: 0, top: '100%', paddingTop: 4 }
                          : { left: '100%', top: -4, paddingLeft: 4 }),
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
                            setShowSettingsModal(true);
                          }}
                        >
                          Interface Scale…
                        </button>
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
                          Shortcuts…
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
                    setTiledMode((v) => !v);
                  }}
                >
                  {tiledMode ? 'Tiled / Seamless: On' : 'Tiled / Seamless Mode'}
                </button>
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
        <div
          className="editor-header-divider"
          style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }}
        />

        {/* Left-aligned Tool Options + Inline Palette */}
        <div
          className="editor-header-center"
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
              gap: 4,
              height: 34,
              padding: '0 4px',
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--surface-elevated)',
            }}
          >
            <button
              type="button"
              className="icon-btn"
              style={{ width: 26, height: 26, borderRadius: 6 }}
              aria-label={`Brush shape: ${brushShape}. Click to switch`}
              title={`Brush shape: ${brushShape} (click to switch)`}
              onClick={() => setBrushShape((s) => (s === 'round' ? 'square' : 'round'))}
            >
              {brushShape === 'round' ? (
                <Circle size={13} fill="currentColor" />
              ) : (
                <Square size={13} fill="currentColor" />
              )}
            </button>
            <div
              aria-hidden="true"
              style={{ width: 1, height: 16, background: 'var(--border)', flexShrink: 0 }}
            />
            {editingBrushSize ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const parsed = parseInt(brushSizeDraft, 10);
                  if (!isNaN(parsed)) {
                    setBrushSize(Math.max(1, Math.min(128, parsed)));
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
                      setBrushSize(Math.max(1, Math.min(128, parsed)));
                    }
                    setEditingBrushSize(false);
                  }}
                  className="mono"
                  style={{
                    width: 46,
                    height: 24,
                    padding: '0 4px',
                    borderRadius: 6,
                    border: '1px solid var(--accent)',
                    background: 'var(--surface)',
                    color: 'var(--text-primary)',
                    fontSize: 12,
                    textAlign: 'center',
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="btn mono"
                style={{
                  border: 'none',
                  minWidth: 44,
                  height: 26,
                  padding: '0 6px',
                  justifyContent: 'center',
                  fontSize: 12,
                  fontWeight: 700,
                  background: 'transparent',
                  borderRadius: 6,
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
                      setBrushSize(nextSize);
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

          <div
            ref={gridMenuRef}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 10,
              border: gridMode !== 'off'
                ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)'
                : '1px solid var(--border)',
              background: gridMode !== 'off' ? 'var(--accent-container)' : 'var(--surface-elevated)',
              padding: 2,
              gap: 1,
            }}
          >
            <button
              type="button"
              className="icon-btn"
              style={{
                width: 'auto',
                minWidth: 32,
                height: 32,
                padding: '0 6px',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: gridMode !== 'off' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              aria-label={
                gridMode !== 'off'
                  ? `Grid: ${gridMode}. Click to turn off`
                  : `Turn on ${lastGridMode} grid`
              }
              aria-pressed={gridMode !== 'off'}
              title={
                gridMode !== 'off'
                  ? `Grid: ${gridMode} (click to turn off)`
                  : `Grid: off (click to enable ${lastGridMode})`
              }
              onClick={() => {
                setGridMenuOpen(false);
                setGridMode((cur) => (cur === 'off' ? lastGridMode : 'off'));
              }}
            >
              {(gridMode === 'tile' || (gridMode === 'off' && lastGridMode === 'tile')) ? (
                <Grid2x2 size={17} />
              ) : (
                <Grid3x3 size={17} />
              )}
              {gridMode !== 'off' && (
                <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>
                  {gridMode === 'pixel' ? '1' : gridMode === 'tile' ? '16' : '1+16'}
                </span>
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{
                width: 22,
                height: 32,
                border: 'none',
                background: 'transparent',
                color: gridMode !== 'off' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              aria-label="Choose grid mode"
              aria-haspopup="menu"
              aria-expanded={gridMenuOpen}
              title="Choose grid mode (Pixel 1×1 / Tile 16×16 / Both)"
              onClick={() => setGridMenuOpen((v) => !v)}
            >
              <ChevronDown size={12} />
            </button>
            {gridMenuOpen && (() => {
              const rect = gridMenuRef.current?.getBoundingClientRect();
              const menuLeft = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 180)) : 8;
              const menuTop = rect ? rect.bottom + 6 : 54;
              return (
                <div
                  role="menu"
                  aria-label="Grid mode"
                  className="floating-card menu-pop"
                  style={{
                    position: 'fixed',
                    top: menuTop,
                    left: menuLeft,
                    width: 172,
                    padding: 5,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 60,
                    transformOrigin: 'top left',
                  }}
                >
                  {(
                    [
                      ['pixel', 'Pixel (1×1)', <Grid3x3 key="px" size={14} />],
                      ['tile', 'Tile (16×16)', <Grid2x2 key="tl" size={14} />],
                      ['both', 'Both (1×1 + 16×16)', <Grid3x3 key="bt" size={14} />],
                    ] as Array<[Exclude<GridMode, 'off'>, string, React.ReactNode]>
                  ).map(([mode, label, icon]) => {
                    const active = gridMode === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className="btn"
                        style={{
                          border: 'none',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          color: active ? 'var(--accent)' : 'var(--text-primary)',
                          background: active ? 'var(--accent-container)' : 'transparent',
                        }}
                        onClick={() => {
                          setLastGridMode(mode);
                          setGridMode(mode);
                          setGridMenuOpen(false);
                        }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          {icon}
                          {label}
                        </span>
                        {active && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
          <div
            ref={mirrorMenuRef}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              borderRadius: 10,
              border: mirror !== 'none'
                ? '1px solid color-mix(in srgb, var(--accent) 50%, transparent)'
                : '1px solid var(--border)',
              background: mirror !== 'none' ? 'var(--accent-container)' : 'var(--surface-elevated)',
              padding: 2,
              gap: 1,
            }}
          >
            <button
              type="button"
              className="icon-btn"
              style={{
                width: 'auto',
                minWidth: 32,
                height: 32,
                padding: '0 6px',
                gap: 4,
                border: 'none',
                background: 'transparent',
                color: mirror !== 'none' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              aria-label={
                mirror !== 'none'
                  ? `Mirror: ${mirror}. Click to turn off`
                  : `Turn on ${lastMirrorMode} mirror`
              }
              aria-pressed={mirror !== 'none'}
              title={
                mirror !== 'none'
                  ? `Mirror: ${mirror} (click to turn off)`
                  : `Mirror: off (click to enable ${lastMirrorMode})`
              }
              onClick={() => {
                setMirrorMenuOpen(false);
                setMirror((cur) => (cur === 'none' ? lastMirrorMode : 'none'));
              }}
            >
              {(mirror === 'vertical' || (mirror === 'none' && lastMirrorMode === 'vertical')) ? (
                <FlipVertical size={17} />
              ) : (
                <FlipHorizontal size={17} />
              )}
              {mirror !== 'none' && (
                <span className="mono" style={{ fontSize: 10, fontWeight: 700 }}>
                  {mirror === 'horizontal' ? 'H' : mirror === 'vertical' ? 'V' : 'Q'}
                </span>
              )}
            </button>
            <button
              type="button"
              className="icon-btn"
              style={{
                width: 22,
                height: 32,
                border: 'none',
                background: 'transparent',
                color: mirror !== 'none' ? 'var(--accent)' : 'var(--text-secondary)',
              }}
              aria-label="Choose mirror axis"
              aria-haspopup="menu"
              aria-expanded={mirrorMenuOpen}
              title="Choose mirror axis (Horizontal / Vertical / Quad)"
              onClick={() => setMirrorMenuOpen((v) => !v)}
            >
              <ChevronDown size={12} />
            </button>
            {mirrorMenuOpen && (() => {
              const rect = mirrorMenuRef.current?.getBoundingClientRect();
              const menuLeft = rect ? Math.max(8, Math.min(rect.left, window.innerWidth - 168)) : 8;
              const menuTop = rect ? rect.bottom + 6 : 54;
              return (
                <div
                  role="menu"
                  aria-label="Mirror mode"
                  className="floating-card menu-pop"
                  style={{
                    position: 'fixed',
                    top: menuTop,
                    left: menuLeft,
                    width: 156,
                    padding: 5,
                    background: 'var(--surface)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    zIndex: 60,
                    transformOrigin: 'top left',
                  }}
                >
                  {(
                    [
                      ['horizontal', 'Horizontal (X)'],
                      ['vertical', 'Vertical (Y)'],
                      ['quad', 'Quad (X + Y)'],
                    ] as Array<[Exclude<MirrorMode, 'none'>, string]>
                  ).map(([mode, label]) => {
                    const active = mirror === mode;
                    return (
                      <button
                        key={mode}
                        type="button"
                        role="menuitemradio"
                        aria-checked={active}
                        className="btn"
                        style={{
                          border: 'none',
                          justifyContent: 'space-between',
                          fontSize: 12,
                          color: active ? 'var(--accent)' : 'var(--text-primary)',
                          background: active ? 'var(--accent-container)' : 'transparent',
                        }}
                        onClick={() => {
                          setLastMirrorMode(mode);
                          setMirror(mode);
                          setMirrorMenuOpen(false);
                        }}
                      >
                        <span>{label}</span>
                        {active && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          <ColorPanel
            activeColor={activeColor}
            palette={palette}
            isEyedropperActive={tool === 'eyedropper'}
            onToggleEyedropper={() => onSelectTool('eyedropper')}
            onSelectColor={(c) => setActiveColor(c)}
            onSetPalette={(cols) => {
              setPalette(cols);
              setProject((p) => ({ ...p, sharedPalette: cols }));
              setRevision((r) => r + 1);
            }}
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

      <main aria-label="Canvas workspace" style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <CanvasTabsBar
          canvases={project.canvases ?? []}
          activeCanvasIndex={project.activeCanvasIndex ?? 0}
          openCanvasIds={openCanvasIds}
          open={tabsOpen}
          onToggleOpen={() =>
            setTabsOpen((v) => {
              const next = !v;
              try {
                localStorage.setItem('artopixel_tabs_open_v1', String(next));
              } catch {
                // ignore
              }
              return next;
            })
          }
          onSelectCanvas={switchCanvas}
          onHideCanvasTab={hideCanvasTab}
          onOpenCanvasTab={openCanvasTab}
          onAddCanvas={addCanvasTab}
          onRenameCanvas={renameCanvasTab}
          onReorderCanvas={reorderCanvasTab}
          onDeleteCanvas={deleteCanvasTab}
          onCollapsedHudLeftChange={setCollapsedHudLeft}
        />
        <div
          aria-live="polite"
          className="mono ui-scaled"
          style={{
            position: 'absolute',
            top: tabsOpen ? 41 : 7,
            left: tabsOpen ? 12 : collapsedHudLeft,
            transition:
              'top 220ms cubic-bezier(0.22, 1, 0.36, 1), left 220ms cubic-bezier(0.22, 1, 0.36, 1)',
            zIndex: 31,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 11,
          }}
        >
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
              pointerEvents: 'auto',
              width: 48,
              height: 24,
              flexShrink: 0,
              background: 'color-mix(in srgb, var(--surface) 75%, transparent)',
              border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
              borderRadius: 8,
              padding: 0,
              textAlign: 'center',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-primary)',
              font: 'inherit',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {Math.round((zoom / baseZoom) * 100)}%
          </button>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 24,
              color: 'var(--text-muted)',
              background: 'color-mix(in srgb, var(--surface) 75%, transparent)',
              padding: '0 8px',
              borderRadius: 8,
              border: '1px solid color-mix(in srgb, var(--border) 70%, transparent)',
            }}
          >
            <span style={{ textTransform: 'capitalize', color: 'var(--text-secondary)' }}>
              {tool}
            </span>
            {(tool === 'pencil' || tool === 'shade') && pixelPerfect && (
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                • Pixel Perfect
              </span>
            )}
            {mirror !== 'none' && (
              <span style={{ color: 'var(--text-secondary)' }}>
                • Mirror: {mirror}
              </span>
            )}
            {tiledMode && (
              <span style={{ color: 'var(--text-secondary)' }}>
                • Tiled
              </span>
            )}
          </div>
        </div>
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
            setCanvasCtxMenu({ x: e.clientX, y: e.clientY, gx, gy });
          }}
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'%3E%3Cpath d='M12 4v16M4 12h16' stroke='%23000000' stroke-width='3' stroke-linecap='round'/%3E%3Cpath d='M12 4v16M4 12h16' stroke='%23ffffff' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E") 12 12, crosshair`,
            touchAction: 'none',
          }}
        />

        {!layersOpen && (
          <LayerPill
            layers={project.layers}
            activeLayerIndex={project.activeLayerIndex}
            topOffset={(tool === 'move' || hiddenLayerToast ? 47 : 7) + (tabsOpen ? 34 : 0)}
            dimOtherLayers={dimOtherLayers}
            onToggleDimOthers={() => setDimOtherLayers((v) => !v)}
            onToggleVisibility={() => {
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
            onSetOpacity={(val) => {
              setProjectSync((p) => {
                const next = [...p.layers];
                next[p.activeLayerIndex] = { ...next[p.activeLayerIndex], opacity: val };
                return { ...p, layers: next };
              });
              setRevision((r) => r + 1);
            }}
            onSelectLayer={(idx) => setProjectSync((p) => ({ ...p, activeLayerIndex: idx }))}
          />
        )}

        {canvasCtxMenu && (
          <CanvasContextMenu
            x={canvasCtxMenu.x}
            y={canvasCtxMenu.y}
            tool={tool}
            shadeLighten={shadeLighten}
            hasSelection={Boolean(selection)}
            hasClipboard={Boolean(clipboard)}
            canRotate={project.width === project.height}
            onClose={() => setCanvasCtxMenu(null)}
            onOutline={() => {
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
            onFlipLayerH={() => {
              const layer = project.layers[project.activeLayerIndex];
              if (!layer) return;
              const { oldPixels, newPixels } = applyLayerPixelTransform(
                layer.pixels,
                project.width,
                project.height,
                (x, y, w) => y * w + (w - 1 - x)
              );
              pushAction({ layerId: layer.id, oldPixels, newPixels });
              setRevision((r) => r + 1);
            }}
            onFlipLayerV={() => {
              const layer = project.layers[project.activeLayerIndex];
              if (!layer) return;
              const { oldPixels, newPixels } = applyLayerPixelTransform(
                layer.pixels,
                project.width,
                project.height,
                (x, y, w, h) => (h - 1 - y) * w + x
              );
              pushAction({ layerId: layer.id, oldPixels, newPixels });
              setRevision((r) => r + 1);
            }}
            onRotateLayer90={() => {
              if (project.width !== project.height) return;
              const layer = project.layers[project.activeLayerIndex];
              if (!layer) return;
              const { oldPixels, newPixels } = applyLayerPixelTransform(
                layer.pixels,
                project.width,
                project.height,
                (x, y, n) => x * n + (n - 1 - y)
              );
              pushAction({ layerId: layer.id, oldPixels, newPixels });
              setRevision((r) => r + 1);
            }}
            onResizeLayer={() => {
              if (floatingSelRef.current) {
                commitFloatingSelection();
              }
              const layer = project.layers[project.activeLayerIndex];
              if (!layer) return;
              let minX = project.width;
              let minY = project.height;
              let maxX = -1;
              let maxY = -1;
              for (let y = 0; y < project.height; y++) {
                for (let x = 0; x < project.width; x++) {
                  const argb = layer.pixels[y * project.width + x];
                  if (((argb >>> 24) & 0xff) > 0) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                  }
                }
              }
              if (maxX < minX || maxY < minY) {
                setLayerFinderToast('Active layer is empty');
                return;
              }
              const bounds: GridRect = {
                left: minX,
                top: minY,
                width: maxX - minX + 1,
                height: maxY - minY + 1,
              };
              selectionRef.current = bounds;
              setSelection(bounds);
              setTool('marquee');
              liftSelectionToFloating(bounds);
            }}
            onEyedropper={() => {
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
            }}
            onShade={(lighten) => {
              setShadeLighten(lighten);
              setTool('shade');
            }}
            onOpenReplaceColor={() => {
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
            }}
            onCut={() => {
              if (!selection) return;
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
            }}
            onCopy={() => {
              if (!selection) return;
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
            }}
            onPaste={() => {
              if (!clipboard) return;
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
            }}
            onFlipH={() => flipSelection('h')}
            onFlipV={() => flipSelection('v')}
            onRotate90={rotateSelection90}
            onDeselect={cancelFloatingSelection}
          />
        )}

        <MinimapPanel
          minimapRef={minimapRef}
          visible={showMinimap}
          leftInset={typeof window !== 'undefined' && window.innerWidth < 640 ? 68 : 12}
          topInset={tabsOpen ? Math.round(34 * uiScale) + 8 : 12}
          rightInset={
            layersOpen
              ? Math.round(
                  Math.min(
                    layersWidth,
                    typeof window !== 'undefined' ? window.innerWidth * 0.74 : layersWidth
                  ) * uiScale
                ) + 12
              : 26
          }
          bottomInset={timelineOpen ? Math.round(timelineHeight * uiScale) + 12 : Math.round(24 * uiScale)}
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
              className="floating-card menu-pop"
              style={{
                position: 'absolute',
                left: popupLeft,
                top: popupTop,
                padding: 4,
                display: 'flex',
                gap: 2,
                zIndex: 30,
                transformOrigin: 'top center',
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
                      <>
                        <div
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '0 4px',
                            fontSize: 11,
                            color: 'var(--text-secondary)',
                          }}
                        >
                          <span>W</span>
                          <input
                            type="number"
                            aria-label="Selection width"
                            min={1}
                            max={1024}
                            value={selection.width}
                            onChange={(e) => {
                              const w = parseInt(e.target.value, 10);
                              if (!isNaN(w) && w >= 1) {
                                resizeFloatingSelection(w, selection.height);
                              }
                            }}
                            className="field-input mono"
                            style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
                          />
                          <span>×</span>
                          <input
                            type="number"
                            aria-label="Selection height"
                            min={1}
                            max={1024}
                            value={selection.height}
                            onChange={(e) => {
                              const h = parseInt(e.target.value, 10);
                              if (!isNaN(h) && h >= 1) {
                                resizeFloatingSelection(selection.width, h);
                              }
                            }}
                            className="field-input mono"
                            style={{ width: 48, padding: '2px 4px', fontSize: 11 }}
                          />
                        </div>
                        <button
                          type="button"
                          className="icon-btn active"
                          title="Apply move/transform (Enter)"
                          aria-label="Apply selection transform"
                          onClick={commitFloatingSelection}
                        >
                          <Check size={16} />
                        </button>
                      </>
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

        <ToolsDock
          tool={tool}
          pixelPerfect={pixelPerfect}
          moveAllLayers={moveAllLayers}
          shapeFilled={shapeFilled}
          bottomOffset={timelineOpen ? timelineHeight + 12 : 24}
          disableTransition={timelineResizing}
          canUndo={undoRef.current.length > 0}
          canRedo={redoRef.current.length > 0}
          onSelectTool={onSelectTool}
          onSetShapeFilled={setShapeFilled}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
        <LayersPanel
          project={project}
          revision={revision}
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
          onCopyLayersToFrame={(indices, targetFrameIndex) => {
            const frames = project.frames ?? [];
            const curIdx = project.activeFrameIndex ?? 0;
            if (frames.length <= 1) return;
            const sorted = [...new Set(indices)]
              .filter((idx) => idx >= 0 && idx < project.layers.length)
              .sort((a, b) => a - b);
            if (sorted.length === 0) return;

            const prevFrames = [...frames];
            if (prevFrames[curIdx]) {
              prevFrames[curIdx] = {
                ...prevFrames[curIdx],
                layers: project.layers,
                groups: project.groups,
                activeLayerIndex: project.activeLayerIndex,
              };
            }

            const now = Date.now();
            const nextFrames = prevFrames.map((frame, fIdx) => {
              const shouldCopy =
                targetFrameIndex === 'all'
                  ? fIdx !== curIdx
                  : fIdx === targetFrameIndex;
              if (!shouldCopy) return frame;
              const cloned = sorted.map((idx, offset) => {
                const src = project.layers[idx];
                return {
                  ...src,
                  id: `layer_${now}_${fIdx}_${offset}_${Math.random().toString(36).slice(2, 6)}`,
                  groupId: null,
                  pixels: new Uint32Array(src.pixels),
                };
              });
              const mergedLayers = [...frame.layers, ...cloned];
              return {
                ...frame,
                layers: mergedLayers,
                activeLayerIndex: mergedLayers.length - 1,
              };
            });

            pushHistory({
              kind: 'frames',
              prevFrames,
              prevActiveFrameIndex: curIdx,
              nextFrames,
              nextActiveFrameIndex: curIdx,
            });
            setProject((prev) => ({
              ...prev,
              frames: nextFrames,
            }));
            setRevision((r) => r + 1);
            const label = sorted.length === 1 ? project.layers[sorted[0]].name : `${sorted.length} layers`;
            setLayerFinderToast(
              targetFrameIndex === 'all'
                ? `Copied ${label} to all other frames`
                : `Copied ${label} to Frame ${targetFrameIndex + 1}`
            );
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

        {importError && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 55,
              maxWidth: 'min(420px, calc(100vw - 24px))',
            }}
          >
            <div
              role="alert"
              className="floating-card menu-pop"
              style={{
                padding: '6px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--danger)',
                borderColor: 'var(--danger)',
              }}
            >
              <span>{importError}</span>
              <button
                type="button"
                className="icon-btn"
                style={{ width: 24, height: 24, flexShrink: 0 }}
                aria-label="Dismiss import error"
                onClick={() => setImportError(null)}
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        {layerFinderToast && (
          <div
            style={{
              position: 'absolute',
              top: !layersOpen && (tool === 'move' || hiddenLayerToast) ? 94 : 52,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 45,
              pointerEvents: 'none',
            }}
          >
            <div
              role="status"
              className="floating-card menu-pop"
              style={{
                padding: '5px 12px',
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text-primary)',
                transformOrigin: 'top center',
              }}
            >
              {layerFinderToast}
            </div>
          </div>
        )}

        {hiddenLayerToast && (
          <div
            style={{
              position: 'absolute',
              top: 12,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 45,
            }}
          >
            <div
              role="status"
              className="floating-card menu-pop"
              style={{
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                transformOrigin: 'top center',
              }}
            >
              <span>Active layer is hidden</span>
              <button
                type="button"
                className="btn primary"
                style={{ padding: '3px 8px', fontSize: 11 }}
                onClick={() => {
                  setProjectSync((p) => {
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
          </div>
        )}

        {deletedLayerToast && (
          <div
            role="status"
            className="floating-card menu-pop-up"
            style={{
              position: 'absolute',
              bottom: timelineOpen
                ? Math.round(timelineHeight * uiScale) + 12
                : Math.round(24 * uiScale),
              right: layersOpen
                ? Math.round(
                    Math.min(
                      layersWidth,
                      typeof window !== 'undefined' ? window.innerWidth * 0.74 : layersWidth
                    ) * uiScale
                  ) + 12
                : Math.round(26 * uiScale),
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
      </main>

      {showHelpModal && (
        <ShortcutsModal
          shortcuts={shortcuts}
          onApply={(next) => {
            setShortcuts(next);
            try {
              localStorage.setItem('artopixel_shortcuts_v1', JSON.stringify(next));
            } catch {
              // ignore
            }
          }}
          onClose={() => setShowHelpModal(false)}
        />
      )}

      {showResizeModal && (
        <ResizeCanvasModal
          project={project}
          onApplyResize={(newW, newH, dx, dy) => {
            undoRef.current = [];
            redoRef.current = [];
            forceHistoryTick((t) => t + 1);
            setProject((p) => resizeProjectCanvas(p, newW, newH, dx, dy));
            setSelection(null);
            floatingSelRef.current = null;
            setRevision((r) => r + 1);
          }}
          onClose={() => setShowResizeModal(false)}
        />
      )}

      {showReplaceModal && (
        <ReplaceColorModal
          initialFromColor={replaceFromColor}
          initialToColor={replaceToColor}
          palette={palette}
          onApply={(fromCol, toCol, allFrames) => {
            if (allFrames && project.frames && project.frames.length > 1) {
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
                    fromCol,
                    toCol,
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
                  fromCol,
                  toCol,
                  selection
                );
                if (oldPixels.size > 0) {
                  pushAction({ layerId: layer.id, oldPixels, newPixels });
                  setRevision((r) => r + 1);
                }
              }
            }
          }}
          onClose={() => setShowReplaceModal(false)}
        />
      )}

      {showExportModal && (
        <ExportModal
          project={project}
          palette={palette}
          onClose={() => setShowExportModal(false)}
        />
      )}

      {showSettingsModal && (
        <SettingsModal
          uiScale={uiScale}
          onChangeUiScale={(next) => onChangeUiScale?.(next)}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
}
