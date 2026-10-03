import type { Entry } from "shared/feedsApi/types";

const MASONRY_GAP = 12;
const MIN_COLUMN_WIDTH = 360;
const MAX_COLUMN_WIDTH = 480;
// Past this the grid centres and leaves side margins, so an ultrawide stays readable.
const MAX_COLUMNS = 5;
// Aspect = width / height.
const IMAGE_ASPECT = 3 / 2; // entries carry no image size, so every image card gets the same shape
const TEXT_ASPECT = 16 / 9; // card without an image: a compact masthead
// A lone column is the phone: a portrait card there would swallow most of the screen.
const SINGLE_COLUMN_MIN_ASPECT = 4 / 3;

export interface MasonryItem {
  id: string;
  aspect: number;
}

interface MasonryPosition {
  x: number;
  y: number;
  width: number;
  height: number;
  column: number;
}

export interface MasonryLayout {
  columns: number;
  columnWidth: number;
  width: number;
  height: number;
  positions: Map<string, MasonryPosition>;
  columnItems: string[][];
}

export type Direction = "up" | "down" | "left" | "right";

export const tileAspect = (entry: Pick<Entry, "imageUrl">): number =>
  entry.imageUrl ? IMAGE_ASPECT : TEXT_ASPECT;

export const layoutMasonry = ({
  containerWidth,
  items,
  gap = MASONRY_GAP,
}: {
  containerWidth: number;
  items: MasonryItem[];
  gap?: number;
}): MasonryLayout => {
  const available = Number.isFinite(containerWidth) && containerWidth > 0 ? containerWidth : 0;
  const fitting = Math.min(
    MAX_COLUMNS,
    Math.max(1, Math.floor((available + gap) / (MIN_COLUMN_WIDTH + gap))),
  );
  const columns = items.length === 0 ? fitting : Math.min(fitting, items.length);
  // A lone column fills a phone, but stops at the cap on a pane that is merely too narrow for two.
  const columnWidth =
    fitting === 1
      ? Math.min(available, MAX_COLUMN_WIDTH)
      : Math.min(MAX_COLUMN_WIDTH, Math.floor((available - (columns - 1) * gap) / columns));

  const width = columns * columnWidth + (columns - 1) * gap;
  const offsetX = Math.floor((available - width) / 2);

  const columnHeights = Array.from({ length: columns }, () => 0);
  const columnItems: string[][] = Array.from({ length: columns }, () => []);
  const positions = new Map<string, MasonryPosition>();

  for (const item of items) {
    let column = 0;
    for (let i = 1; i < columns; i += 1) {
      if (columnHeights[i] < columnHeights[column]) column = i;
    }
    const aspect = fitting === 1 ? Math.max(item.aspect, SINGLE_COLUMN_MIN_ASPECT) : item.aspect;
    const height = Math.round(columnWidth / aspect);
    positions.set(item.id, {
      x: offsetX + column * (columnWidth + gap),
      y: columnHeights[column],
      width: columnWidth,
      height,
      column,
    });
    columnItems[column].push(item.id);
    columnHeights[column] += height + gap;
  }

  const tallest = Math.max(...columnHeights, 0);

  return {
    columns,
    columnWidth,
    width,
    height: tallest === 0 ? 0 : tallest - gap,
    positions,
    columnItems,
  };
};

const centreOf = (position: MasonryPosition): number => position.y + position.height / 2;

export const neighbourOf = ({
  layout,
  id,
  direction,
}: {
  layout: MasonryLayout;
  id: string;
  direction: Direction;
}): string | undefined => {
  const position = layout.positions.get(id);
  if (!position) return undefined;

  if (direction === "up" || direction === "down") {
    const column = layout.columnItems[position.column];
    const index = column.indexOf(id);
    return column[direction === "up" ? index - 1 : index + 1];
  }

  const targetIndex = position.column + (direction === "left" ? -1 : 1);
  if (targetIndex < 0 || targetIndex >= layout.columns) return undefined;
  const targetColumn = layout.columnItems[targetIndex];

  const centre = centreOf(position);
  let best: string | undefined;
  let bestDistance = Infinity;
  // Top to bottom with a strict comparison, so an exact tie keeps the upper candidate.
  for (const candidate of targetColumn) {
    const candidatePosition = layout.positions.get(candidate);
    if (!candidatePosition) continue;
    const distance = Math.abs(centreOf(candidatePosition) - centre);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
};
