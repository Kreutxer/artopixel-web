import { Dispatch, MutableRefObject, SetStateAction, useCallback } from 'react';
import { GridRect, PixelFrame, PixelLayer, PixelProject } from '../engine/types';

export interface FramesHistoryPayload {
  kind: 'frames';
  prevFrames: PixelFrame[];
  prevActiveFrameIndex: number;
  nextFrames: PixelFrame[];
  nextActiveFrameIndex: number;
}

export function useTimelineFrames({
  project,
  setProject,
  pushHistory,
  floatingSelRef,
  setSelection,
  setIsPlaying,
  setRevision,
}: {
  project: PixelProject;
  setProject: Dispatch<SetStateAction<PixelProject>>;
  pushHistory: (action: FramesHistoryPayload) => void;
  floatingSelRef: MutableRefObject<unknown | null>;
  setSelection: Dispatch<SetStateAction<GridRect | null>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setRevision: Dispatch<SetStateAction<number>>;
}) {
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

  return {
    switchFrame,
    reorderFrame,
    addFrame,
    duplicateFrame,
    deleteFrame,
  };
}
