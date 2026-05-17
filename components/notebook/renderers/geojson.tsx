"use client";

import type { JSX } from "react";
import type { NotebookMimeRendererProps } from "./types";

type Position = [number, number];

interface GeoJsonGeometry {
  type?: string;
  coordinates?: unknown;
  geometries?: GeoJsonGeometry[];
}

interface GeoJsonFeature {
  type?: "Feature";
  geometry?: GeoJsonGeometry | null;
  properties?: Record<string, unknown> | null;
}

interface GeoJsonFeatureCollection {
  type?: string;
  features?: GeoJsonFeature[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function isPosition(value: unknown): value is Position {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  );
}

function collectPositions(coordinates: unknown, positions: Position[]): void {
  if (isPosition(coordinates)) {
    positions.push([coordinates[0], coordinates[1]]);
    return;
  }
  if (Array.isArray(coordinates)) {
    for (const child of coordinates) {
      collectPositions(child, positions);
    }
  }
}

function featuresFromGeoJson(value: unknown): GeoJsonFeature[] {
  const root = asRecord(value);
  if (!root) {
    return [];
  }
  if (root.type === "FeatureCollection" && Array.isArray(root.features)) {
    return root.features
      .map((feature) => asRecord(feature) as GeoJsonFeature | null)
      .filter((feature): feature is GeoJsonFeature => feature !== null);
  }
  if (root.type === "Feature") {
    return [root as GeoJsonFeature];
  }
  return [{ type: "Feature", geometry: root as GeoJsonGeometry, properties: null }];
}

function geometryPositions(geometry: GeoJsonGeometry | null | undefined): Position[] {
  const positions: Position[] = [];
  if (!geometry) {
    return positions;
  }
  if (geometry.type === "GeometryCollection") {
    for (const child of geometry.geometries ?? []) {
      positions.push(...geometryPositions(child));
    }
    return positions;
  }
  collectPositions(geometry.coordinates, positions);
  return positions;
}

function boundsForPositions(positions: Position[]) {
  if (positions.length === 0) {
    return null;
  }
  const xs = positions.map(([x]) => x);
  const ys = positions.map(([, y]) => y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function pathFromCoordinates(
  coordinates: unknown,
  project: (position: Position) => Position
): string {
  if (!Array.isArray(coordinates)) {
    return "";
  }
  if (coordinates.every(isPosition)) {
    return coordinates
      .map((position, index) => {
        const [x, y] = project(position);
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }
  return coordinates
    .map((child) => pathFromCoordinates(child, project))
    .filter(Boolean)
    .join(" ");
}

function renderGeometry(
  geometry: GeoJsonGeometry | null | undefined,
  project: (position: Position) => Position,
  key: string
): JSX.Element[] {
  if (!geometry) {
    return [];
  }
  if (geometry.type === "GeometryCollection") {
    return (geometry.geometries ?? []).flatMap((child, index) =>
      renderGeometry(child, project, `${key}-${index}`)
    );
  }
  if (geometry.type === "Point" && isPosition(geometry.coordinates)) {
    const [cx, cy] = project(geometry.coordinates);
    return [<circle key={key} cx={cx} cy={cy} r="4" className="fill-primary" />];
  }
  if (geometry.type === "MultiPoint" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(isPosition).map((position, index) => {
      const [cx, cy] = project(position);
      return <circle key={`${key}-${index}`} cx={cx} cy={cy} r="4" className="fill-primary" />;
    });
  }

  const path = pathFromCoordinates(geometry.coordinates, project);
  if (!path) {
    return [];
  }

  const isArea = geometry.type === "Polygon" || geometry.type === "MultiPolygon";
  return [
    <path
      key={key}
      d={path}
      className={isArea ? "fill-primary/20 stroke-primary" : "fill-none stroke-primary"}
      strokeWidth="2"
    />,
  ];
}

function featureLabel(feature: GeoJsonFeature, index: number): string {
  const properties = feature.properties ?? {};
  const name = properties.name ?? properties.label ?? properties.title;
  return typeof name === "string" ? name : `Feature ${index + 1}`;
}

/**
 * Render GeoJSON as a lightweight SVG map preview with feature metadata.
 */
export function GeoJsonOutputRenderer({
  value,
}: NotebookMimeRendererProps): JSX.Element {
  const features = featuresFromGeoJson(value);
  const positions = features.flatMap((feature) => geometryPositions(feature.geometry));
  const bounds = boundsForPositions(positions);

  const project = ([x, y]: Position): Position => {
    if (!bounds) {
      return [0, 0];
    }
    const width = Math.max(bounds.maxX - bounds.minX, 0.000001);
    const height = Math.max(bounds.maxY - bounds.minY, 0.000001);
    return [
      24 + ((x - bounds.minX) / width) * 312,
      216 - ((y - bounds.minY) / height) * 192,
    ];
  };

  return (
    <div className="rounded-md border">
      <div className="border-b bg-muted/30 p-3">
        <div className="font-medium">GeoJSON</div>
        <div className="text-sm text-muted-foreground">
          {features.length} feature{features.length === 1 ? "" : "s"}
        </div>
      </div>
      {bounds ? (
        <div className="p-3">
          <svg
            viewBox="0 0 360 240"
            className="h-60 w-full rounded-md border bg-background"
            role="img"
            aria-label="GeoJSON preview"
          >
            <rect x="0" y="0" width="360" height="240" className="fill-muted/20" />
            {features.flatMap((feature, index) =>
              renderGeometry(feature.geometry, project, `feature-${index}`)
            )}
          </svg>
        </div>
      ) : (
        <div className="p-3 text-sm text-muted-foreground">
          No plottable coordinates were found.
        </div>
      )}
      <div className="max-h-48 overflow-auto border-t p-3 text-sm">
        {features.map((feature, index) => (
          <div key={index} className="mb-2 last:mb-0">
            <div className="font-medium">{featureLabel(feature, index)}</div>
            <div className="text-xs text-muted-foreground">
              {feature.geometry?.type ?? "Unknown geometry"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
