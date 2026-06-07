"use client";

import { Separator } from "@/components/ui/separator";
import {
  SettingsNumberField,
  SettingsSwitchField,
  SettingsTextField,
} from "@/components/settings-dialog/settings-form-fields";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import { NOTEBOOK_CHART_COLORS } from "@/lib/settings/builtin-defaults";

/** Notebook tab: display, output rendering, export, and editor preferences. */
export function NotebookTab() {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const notebook = effectiveSettings.notebook;

  const updateNotebook = (
    patch: Partial<typeof notebook>
  ) => {
    void setUserSettings((current) => ({
      ...current,
      notebook: {
        ...current.notebook,
        ...patch,
      },
    }));
  };

  const updateOutput = (
    patch: Partial<typeof notebook.output>
  ) => {
    void setUserSettings((current) => ({
      ...current,
      notebook: {
        ...current.notebook,
        output: {
          ...current.notebook.output,
          ...patch,
        },
      },
    }));
  };

  const updateExport = (
    patch: Partial<typeof notebook.export>
  ) => {
    void setUserSettings((current) => ({
      ...current,
      notebook: {
        ...current.notebook,
        export: {
          ...current.notebook.export,
          ...patch,
        },
      },
    }));
  };

  const updateEditor = (
    patch: Partial<typeof notebook.editor>
  ) => {
    void setUserSettings((current) => ({
      ...current,
      notebook: {
        ...current.notebook,
        editor: {
          ...current.notebook.editor,
          ...patch,
        },
      },
    }));
  };

  return (
    <SettingsSectionLayout
      title="Notebook"
      description="Control notebook display, output rendering, export, and editor behavior."
    >
      <div className="space-y-6 max-w-2xl">
        <section className="space-y-3">
          <h3 className="text-sm font-bold">Display</h3>
          <div className="grid gap-3">
            <SettingsSwitchField
              id="notebook-scrollbar-visible"
              label="Show notebook scrollbar"
              description="Shows the scrollbar when scrolling in the notebook editor."
              checked={notebook.scrollbarVisible}
              onCheckedChange={(checked) => updateNotebook({ scrollbarVisible: checked })}
            />
            <SettingsSwitchField
              id="notebook-presentation-hide-inputs"
              label="Hide cell inputs (presentation mode)"
              description="Hides code cell source editors in the UI without changing notebook files."
              checked={notebook.presentationHideAllCellInputs}
              onCheckedChange={(checked) =>
                updateNotebook({ presentationHideAllCellInputs: checked })
              }
            />
          </div>
        </section>

        <Separator />

        <section className="space-y-4">
          <h3 className="text-sm font-bold">Output</h3>
          <p className="text-sm text-muted-foreground">
            Controls how notebook cell outputs render in the editor.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <SettingsNumberField
              id="notebook-text-output-auto-collapse-threshold"
              label="Text auto-collapse threshold"
              description="Character count above which long text outputs auto-collapse on first render."
              value={notebook.output.textOutputAutoCollapseThreshold}
              min={1}
              onChange={(value) =>
                updateOutput({ textOutputAutoCollapseThreshold: value })
              }
            />
            <SettingsNumberField
              id="notebook-collapsed-height-default-px"
              label="Collapsed height (px)"
              description="Default height in pixels for collapsed outputs."
              value={notebook.output.collapsedHeightDefaultPx}
              min={1}
              onChange={(value) => updateOutput({ collapsedHeightDefaultPx: value })}
            />
            <SettingsNumberField
              id="notebook-collapsed-height-min-px"
              label="Minimum collapsed height (px)"
              description="Minimum height in pixels when resizing a collapsed output."
              value={notebook.output.collapsedHeightMinPx}
              min={1}
              onChange={(value) => updateOutput({ collapsedHeightMinPx: value })}
            />
            <SettingsNumberField
              id="notebook-default-plot-height-px"
              label="Default plot height (px)"
              description="Default height in pixels for Plotly chart outputs."
              value={notebook.output.defaultPlotHeightPx}
              min={1}
              onChange={(value) => updateOutput({ defaultPlotHeightPx: value })}
            />
            <SettingsNumberField
              id="notebook-plot-min-resize-width-px"
              label="Minimum plot width (px)"
              description="Minimum width in pixels when resizing a Plotly chart."
              value={notebook.output.plotMinResizeWidthPx}
              min={1}
              onChange={(value) => updateOutput({ plotMinResizeWidthPx: value })}
            />
            <SettingsNumberField
              id="notebook-plot-min-resize-height-px"
              label="Minimum plot height (px)"
              description="Minimum height in pixels when resizing a Plotly chart."
              value={notebook.output.plotMinResizeHeightPx}
              min={1}
              onChange={(value) => updateOutput({ plotMinResizeHeightPx: value })}
            />
            <SettingsNumberField
              id="notebook-plotly-hover-corner-ratio"
              label="Plotly hover corner ratio"
              description="Corner rounding ratio for Plotly hover labels (0–1)."
              value={notebook.output.plotlyHoverCornerRatio}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateOutput({ plotlyHoverCornerRatio: value })}
            />
            <SettingsNumberField
              id="notebook-minimap-output-preview-max-lines"
              label="Minimap preview lines"
              description="Maximum number of lines shown in minimap output previews."
              value={notebook.output.minimapOutputPreviewMaxLines}
              min={1}
              onChange={(value) =>
                updateOutput({ minimapOutputPreviewMaxLines: value })
              }
            />
            <SettingsNumberField
              id="notebook-minimap-heading-navigate-delay-ms"
              label="Minimap heading delay (ms)"
              description="Delay in milliseconds before minimap heading navigation runs."
              value={notebook.output.minimapHeadingNavigateDelayMs}
              min={1}
              onChange={(value) =>
                updateOutput({ minimapHeadingNavigateDelayMs: value })
              }
            />
          </div>
          <SettingsTextField
            id="notebook-chart-colors"
            label="Chart colors"
            description={`Comma-separated hex colors for Recharts table charts. Default palette has ${NOTEBOOK_CHART_COLORS.length} colors.`}
            value={notebook.output.chartColors.join(", ")}
            placeholder={NOTEBOOK_CHART_COLORS.join(", ")}
            onChange={(value) => {
              const colors = value
                .split(",")
                .map((color) => color.trim())
                .filter((color) => color.length > 0);
              if (colors.length === 0) return;
              updateOutput({ chartColors: colors });
            }}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <h3 className="text-sm font-bold">Export</h3>
          <SettingsTextField
            id="notebook-export-sans-font-family"
            label="Sans font family"
            description="CSS font stack used for HTML and PDF notebook export."
            value={notebook.export.sansFontFamily}
            onChange={(value) => {
              if (!value.trim()) return;
              updateExport({ sansFontFamily: value });
            }}
          />
        </section>

        <Separator />

        <section className="space-y-4">
          <h3 className="text-sm font-bold">Editor</h3>
          <SettingsNumberField
            id="notebook-editor-double-press-timeout-ms"
            label="Double-press timeout (ms)"
            description="Window for double-key notebook shortcuts (for example, d d)."
            value={notebook.editor.doublePressTimeoutMs}
            min={1}
            onChange={(value) => updateEditor({ doublePressTimeoutMs: value })}
          />
        </section>
      </div>
    </SettingsSectionLayout>
  );
}
