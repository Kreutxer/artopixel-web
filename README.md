# ArtoPixel Web

A browser-based pixel-art and frame-by-frame animation studio built with **React 19**, **TypeScript**, **Vite**, and **HTML5 2D Canvas** (`imageSmoothingEnabled = false`). Works completely offline in the browser with IndexedDB persistence.

---

## Features

### Drawing & Pixel Tools
- **Pencil (`B`) & Pixel-Perfect Mode (`P`)**: Clean single-pixel strokes with optional L-corner removal for crisp pixel art lines.
- **Eraser (`E`)**, **Fill Bucket (`G`)**, **Line (`L`)**, and **Bezier Curve (`U`)** with draggable control points.
- **Categorized Shape Tool (`R` / `C`)**: Rectangle and Circle/Ellipse tools with Outline and Filled variants (`Shift` locks 1:1 proportions).
- **Brush Size & Shape**: Round or Square brushes (`1–128 px`), adjustable by dragging left/right on the size badge, typing, holding `F` + moving the mouse, or pressing `[` / `]`.
- **Mirror Modes**: None, Horizontal, Vertical, and Quad symmetry with draggable mirror axes.
- **Tiled / Seamless Mode**: Live `3×3` wrap-around preview and drawing for seamless tilesets and textures.
- **Canvas & Color Tools**:
  - **1px Auto-Outline** around opaque pixels on the active layer or selection.
  - **Replace Color** (active layer or across all animation frames).
  - **Resize Canvas & Trim Empty** (`4–1024 px` with 9-point anchor).
  - **Flip Horizontal / Vertical** and **Rotate 90° CW**.

### Layers, Groups & Inspection
- **Layers & 1-Level Groups**: Drag-and-drop reordering, group/ungroup (`Ctrl+G` / `Ctrl+Shift+G`), merge, duplicate, double-click inline rename, and group deletion confirmation.
- **Layer Alpha Lock**: Lock transparent pixels so strokes and fills only paint on existing opaque pixels.
- **Non-Destructive Dim Other Layers**: Temporarily dim non-active layers to `25%` in the viewport without changing saved opacities or exports.
- **Figma-Style Layer Finder (`Ctrl + Hover` / `Ctrl + Left-Click`)**: Hold `Ctrl` while hovering to highlight the exact pixel silhouette of the topmost visible layer under the cursor; click to select it immediately.
- **Collapsed Active Layer Pill**: Quick opacity slider, visibility toggle, and layer switcher when the Layers drawer is collapsed.

### Animation Timeline & Onion Skin
- **Multi-Frame Timeline**: Resizable, collapsible bottom timeline with drag-to-reorder frames, **Add**, **Duplicate**, **Delete**, and **1–30 FPS** playback preview.
- **2-Color Onion Skin**: Ghost previous frames (coral) and next frames (blue) behind the active frame while drawing.
- **Per-Frame Undo / Redo (`Ctrl+Z` / `Ctrl+Shift+Z`)**: Tracks both pixel strokes per frame and structural frame operations (Add, Duplicate, Delete, Reorder).

### Color & Palettes
- **Top-Bar Palette Strip**: Smooth mouse-wheel horizontal scrolling with `<` / `>` indicators, right-click to remove swatches, and `+` to add the active color.
- **Color Picker Popover**: HSV color wheel, Value & Alpha sliders, Hex input, built-in presets, custom saved palettes, and **Image-to-Palette Extractor** (Median Cut).
- **Hold-to-Eyedropper (`I` / `Alt`)**: Samples pixels while held and returns to your previous tool on release.
- **Canvas Right-Click Menu**: Quick access to **Color ▶** (`Eyedropper`, `Darken`, `Lighten`, `Replace Color…`) and **Selection ▶** (`Cut`, `Copy`, `Paste`, `Flip H/V`, `Rotate 90°`, `Deselect`).

### Import, Export & Workspace
- **Import**: Open `.png` / standard images (`4×4` to `1024×1024 px`) and multi-frame `.ase` / `.aseprite` files.
- **Export**:
  - **PNG Image** (`1x`, `2x`, `4x`, `8x`, `16x`)
  - **Spritesheet (PNG)** (Horizontal strip or Grid with configurable columns)
  - **Animated GIF** (offline LZW GIF89a encoder at project FPS)
  - **Aseprite (`.aseprite`)** (multi-frame 32-bit RGBA with layers, groups, opacity, and palette)
- **Light & Dark Themes**: Instant top-bar theme toggle with adaptive canvas checkerboard.
- **Customizable Shortcuts**: Rebind tool and brush shortcuts in `☰ → Options → Shortcuts`.

---

## Quick Start

### Prerequisites
- **Node.js** 18+ and **npm**

### Install & Run Locally
```bash
npm install
npm run dev
```
*(In Windows PowerShell, use `npm.cmd run dev` if script execution policy blocks `npm`.)*

### Production Build
```bash
npm run build
```
Outputs the production bundle to `dist/`.

---

## Default Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `B` | Pencil (`P` toggles Pixel-Perfect) |
| `E` | Eraser |
| `S` | Shade (Lighten / Darken) |
| `G` | Fill Bucket |
| `I` | Eyedropper (hold) |
| `L` / `R` / `C` / `U` | Line / Rectangle / Circle / Curve |
| `M` | Marquee Select |
| `V` | Move Layer(s) |
| `[` / `]` or `F` + Move | Decrease / Increase / Scrub Brush Size |
| `Space + Drag` / Pinch | Pan or Zoom Canvas |
| `Ctrl + Hover` / `Ctrl + Click` | Inspect & Select Layer at Pixel |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / Redo |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / Ungroup Selected Layers |
| `Shift` (while dragging) | 1:1 Lock (Shapes & Move) |

---

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite 6, Lucide Icons
- **Rendering**: HTML5 2D Canvas (`Uint32Array` pixel buffers, nearest-neighbor scaling)
- **Storage**: Browser IndexedDB (`artopixel_web_db`) & `localStorage` for preferences/shortcuts
