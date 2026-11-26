import { Dispatch, MutableRefObject, SetStateAction, useCallback } from 'react';
import { createCanvasDoc, ensureProjectCanvases } from '../engine/pixelEngine';
import { GridRect, PixelProject } from '../engine/types';

export function useCanvasTabs<H>({
  project,
  setProject,
  openCanvasIds,
  setOpenCanvasIds,
  zoom,
  baseZoom,
  pan,
  undoRef,
  redoRef,
  canvasHistoryRef,
  canvasViewportRef,
  floatingSelRef,
  commitFloatingSelection,
  forceHistoryTick,
  setSelection,
  setIsPlaying,
  setRevision,
}: {
  project: PixelProject;
  setProject: Dispatch<SetStateAction<PixelProject>>;
  openCanvasIds: string[];
  setOpenCanvasIds: Dispatch<SetStateAction<string[]>>;
  zoom: number;
  baseZoom: number;
  pan: { x: number; y: number };
  undoRef: MutableRefObject<H[]>;
  redoRef: MutableRefObject<H[]>;
  canvasHistoryRef: MutableRefObject<Map<string, { undo: H[]; redo: H[] }>>;
  canvasViewportRef: MutableRefObject<
    Map<string, { zoom: number; baseZoom: number; pan: { x: number; y: number } }>
  >;
  floatingSelRef: MutableRefObject<unknown | null>;
  commitFloatingSelection: () => void;
  forceHistoryTick: Dispatch<SetStateAction<number>>;
  setSelection: Dispatch<SetStateAction<GridRect | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setRevision: Dispatch<SetStateAction<number>>;
}) {
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
    [project, zoom, baseZoom, pan, commitFloatingSelection]
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
    (name: string, width: number, height: number, folderId: string | null = null) => {
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
      const created = { ...createCanvasDoc(name, width, height), folderId };
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
    [project, zoom, baseZoom, pan, commitFloatingSelection]
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

  const createCanvasFolder = useCallback((name: string, parentId: string | null = null): string => {
    const id = `cfolder_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setProject((prev) => ({
      ...prev,
      canvasFolders: [
        ...(prev.canvasFolders ?? []),
        { id, name: name.trim() || 'New Folder', collapsed: false, parentId },
      ],
    }));
    setRevision((r) => r + 1);
    return id;
  }, []);

  const renameCanvasFolder = useCallback((folderId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProject((prev) => ({
      ...prev,
      canvasFolders: (prev.canvasFolders ?? []).map((f) =>
        f.id === folderId ? { ...f, name: trimmed } : f
      ),
    }));
    setRevision((r) => r + 1);
  }, []);

  const toggleCanvasFolder = useCallback((folderId: string) => {
    setProject((prev) => ({
      ...prev,
      canvasFolders: (prev.canvasFolders ?? []).map((f) =>
        f.id === folderId ? { ...f, collapsed: !f.collapsed } : f
      ),
    }));
    setRevision((r) => r + 1);
  }, []);

  const deleteCanvasFolder = useCallback((folderId: string) => {
    setProject((prev) => {
      const folders = prev.canvasFolders ?? [];
      const target = folders.find((f) => f.id === folderId);
      const promotedParentId = target?.parentId ?? null;
      return {
        ...prev,
        canvasFolders: folders
          .filter((f) => f.id !== folderId)
          .map((f) =>
            f.parentId === folderId ? { ...f, parentId: promotedParentId } : f
          ),
        canvases: (prev.canvases ?? []).map((c) =>
          c.folderId === folderId ? { ...c, folderId: promotedParentId } : c
        ),
      };
    });
    setRevision((r) => r + 1);
  }, []);

  const moveCanvasFolder = useCallback((folderId: string, parentId: string | null) => {
    if (folderId === parentId) return;
    setProject((prev) => {
      const folders = prev.canvasFolders ?? [];
      if (parentId) {
        let cur: string | null | undefined = parentId;
        const visited = new Set<string>();
        while (cur) {
          if (cur === folderId) return prev;
          if (visited.has(cur)) break;
          visited.add(cur);
          cur = folders.find((f) => f.id === cur)?.parentId ?? null;
        }
      }
      return {
        ...prev,
        canvasFolders: folders.map((f) =>
          f.id === folderId ? { ...f, parentId } : f
        ),
      };
    });
    setRevision((r) => r + 1);
  }, []);

  const moveCanvasToFolder = useCallback((canvasId: string, folderId: string | null) => {
    setProject((prev) => ({
      ...prev,
      canvases: (prev.canvases ?? []).map((c) =>
        c.id === canvasId ? { ...c, folderId } : c
      ),
    }));
    setRevision((r) => r + 1);
  }, []);

  return {
    switchCanvas,
    hideCanvasTab,
    openCanvasTab,
    addCanvasTab,
    renameCanvasTab,
    reorderCanvasTab,
    deleteCanvasTab,
    createCanvasFolder,
    renameCanvasFolder,
    toggleCanvasFolder,
    deleteCanvasFolder,
    moveCanvasFolder,
    moveCanvasToFolder,
  };
}
