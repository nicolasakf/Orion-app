"use client";

import { Separator } from "@/components/ui/separator";
import {
  SettingsNumberField,
  SettingsTextField,
  SettingsTextareaField,
  formatLineList,
  parseLineList,
} from "@/components/settings-dialog/settings-form-fields";
import { SettingsSectionLayout } from "@/components/settings-dialog/settings-section-layout";
import { useOrionSettings } from "@/hooks/use-orion-settings";
import type { AgentSettingsSection } from "@/components/settings-dialog/types";

/** Agent advanced settings sections backed by `settings.agent` in settings.json. */
export function AgentAdvancedSection({ section }: { section: AgentSettingsSection }) {
  const { effectiveSettings, setUserSettings } = useOrionSettings();
  const agent = effectiveSettings.agent;

  const updateAgent = <K extends keyof typeof agent>(
    key: K,
    patch: Partial<(typeof agent)[K]>
  ) => {
    void setUserSettings((current) => ({
      ...current,
      agent: {
        ...current.agent,
        [key]: {
          ...current.agent[key],
          ...patch,
        },
      },
    }));
  };

  switch (section) {
    case "context":
      return (
        <SettingsSectionLayout
          title="Context"
          description="Chat context compaction and wire payload retention."
        >
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <SettingsNumberField
              id="agent-compaction-auto-threshold"
              label="Auto-compaction threshold"
              description="Fraction of the context cap that triggers auto-compaction (0–1)."
              value={agent.context.compactionAutoThreshold}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) =>
                updateAgent("context", { compactionAutoThreshold: value })
              }
            />
            <SettingsNumberField
              id="agent-compaction-retention-turns"
              label="Compaction retention turns"
              description="Recent user-turn pairs kept verbatim after compaction."
              value={agent.context.compactionRetentionTurns}
              min={1}
              onChange={(value) =>
                updateAgent("context", { compactionRetentionTurns: value })
              }
            />
            <SettingsNumberField
              id="agent-optimizer-retention-turns"
              label="Optimizer retention turns"
              description="Recent user-turn pairs kept in the wire payload optimizer."
              value={agent.context.optimizerRetentionTurns}
              min={1}
              onChange={(value) =>
                updateAgent("context", { optimizerRetentionTurns: value })
              }
            />
          </div>
        </SettingsSectionLayout>
      );
    case "tool-output":
      return (
        <SettingsSectionLayout
          title="Tool output"
          description="Limits on tool results sent back to the model."
        >
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <SettingsNumberField
              id="agent-text-char-budget"
              label="Text character budget"
              value={agent.toolOutput.textCharBudget}
              min={1}
              onChange={(value) => updateAgent("toolOutput", { textCharBudget: value })}
            />
            <SettingsNumberField
              id="agent-image-base64-char-budget"
              label="Image base64 character budget"
              value={agent.toolOutput.imageBase64CharBudget}
              min={1}
              onChange={(value) =>
                updateAgent("toolOutput", { imageBase64CharBudget: value })
              }
            />
            <SettingsNumberField
              id="agent-max-omitted-ratio"
              label="Max omitted ratio"
              description="Maximum fraction of content omitted when truncating (0–1)."
              value={agent.toolOutput.maxOmittedRatio}
              min={0}
              max={1}
              step={0.01}
              onChange={(value) => updateAgent("toolOutput", { maxOmittedRatio: value })}
            />
          </div>
        </SettingsSectionLayout>
      );
    case "terminal":
      return (
        <SettingsSectionLayout
          title="Terminal"
          description="Shell tool timing, output handling, and agent terminal lifecycle settings."
        >
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <SettingsNumberField
              id="agent-terminal-poll-interval-ms"
              label="Poll interval (ms)"
              description="Poll interval for bash and await_command loops."
              value={agent.terminal.pollIntervalMs}
              min={1}
              onChange={(value) => updateAgent("terminal", { pollIntervalMs: value })}
            />
            <SettingsNumberField
              id="agent-terminal-foreground-budget-ms"
              label="Foreground budget (ms)"
              description="Foreground wait before bash returns a still-running status."
              value={agent.terminal.foregroundBudgetMs}
              min={1}
              onChange={(value) => updateAgent("terminal", { foregroundBudgetMs: value })}
            />
            <SettingsNumberField
              id="agent-terminal-await-budget-ms"
              label="Await budget (ms)"
              description="Wait budget for await_command."
              value={agent.terminal.awaitBudgetMs}
              min={1}
              onChange={(value) => updateAgent("terminal", { awaitBudgetMs: value })}
            />
            <SettingsNumberField
              id="agent-terminal-max-block-ms"
              label="Max block wait (ms)"
              description="Maximum block wait for terminal tools."
              value={agent.terminal.maxBlockMs}
              min={1}
              onChange={(value) => updateAgent("terminal", { maxBlockMs: value })}
            />
            <SettingsNumberField
              id="agent-terminal-output-spill-threshold-chars"
              label="Output spill threshold (chars)"
              description="Bash output size above which results spill to a file."
              value={agent.terminal.outputSpillThresholdChars}
              min={1}
              onChange={(value) =>
                updateAgent("terminal", { outputSpillThresholdChars: value })
              }
            />
            <SettingsNumberField
              id="agent-terminal-output-preview-head-chars"
              label="Output preview head (chars)"
              description="Head preview size when output is spilled to a file."
              value={agent.terminal.outputPreviewHeadChars}
              min={1}
              onChange={(value) =>
                updateAgent("terminal", { outputPreviewHeadChars: value })
              }
            />
            <SettingsNumberField
              id="agent-terminal-output-preview-tail-chars"
              label="Output preview tail (chars)"
              description="Tail preview size when output is spilled to a file."
              value={agent.terminal.outputPreviewTailChars}
              min={1}
              onChange={(value) =>
                updateAgent("terminal", { outputPreviewTailChars: value })
              }
            />
            <SettingsNumberField
              id="agent-terminal-pool-idle-timeout-ms"
              label="Pool idle timeout (ms)"
              description="Idle time before an unused terminal is reclaimed."
              value={agent.terminal.poolIdleTimeoutMs}
              min={1}
              onChange={(value) => updateAgent("terminal", { poolIdleTimeoutMs: value })}
            />
            <SettingsNumberField
              id="agent-terminal-pool-reaper-interval-ms"
              label="Pool reaper interval (ms)"
              description="How often idle terminals are checked for cleanup."
              value={agent.terminal.poolReaperIntervalMs}
              min={1}
              onChange={(value) =>
                updateAgent("terminal", { poolReaperIntervalMs: value })
              }
            />
          </div>
        </SettingsSectionLayout>
      );
    case "filesystem":
      return (
        <SettingsSectionLayout
          title="Filesystem"
          description="Directory ignores, binary extensions, and Ask-mode bash guard patterns."
        >
          <div className="space-y-4 max-w-2xl">
            <SettingsTextareaField
              id="agent-filesystem-ignore-dirs"
              label="Ignored directory names"
              description="One directory name per line (not full paths)."
              rows={8}
              monospace
              value={formatLineList(agent.filesystem.ignoreDirs)}
              onChange={(value) =>
                updateAgent("filesystem", { ignoreDirs: parseLineList(value) })
              }
            />
            <Separator />
            <SettingsTextareaField
              id="agent-filesystem-binary-extensions"
              label="Binary extensions"
              description="One extension per line, including the leading dot."
              rows={8}
              monospace
              value={formatLineList(agent.filesystem.binaryExtensions)}
              onChange={(value) =>
                updateAgent("filesystem", { binaryExtensions: parseLineList(value) })
              }
            />
            <Separator />
            <SettingsTextareaField
              id="agent-filesystem-blocked-bash-patterns"
              label="Blocked bash command patterns"
              description="One regular-expression source per line for Ask-mode read-only bash."
              rows={8}
              monospace
              value={formatLineList(agent.filesystem.blockedBashCommandPatterns)}
              onChange={(value) =>
                updateAgent("filesystem", {
                  blockedBashCommandPatterns: parseLineList(value),
                })
              }
            />
          </div>
        </SettingsSectionLayout>
      );
    case "web":
      return (
        <SettingsSectionLayout
          title="Web"
          description="Web fetch and search tool limits."
        >
          <div className="grid gap-4 sm:grid-cols-2 max-w-2xl">
            <SettingsNumberField
              id="agent-web-tool-timeout-ms"
              label="Tool timeout (ms)"
              value={agent.web.toolTimeoutMs}
              min={1}
              onChange={(value) => updateAgent("web", { toolTimeoutMs: value })}
            />
            <SettingsNumberField
              id="agent-web-fetch-max-response-bytes"
              label="Fetch max response bytes"
              value={agent.web.fetchMaxResponseBytes}
              min={1}
              onChange={(value) =>
                updateAgent("web", { fetchMaxResponseBytes: value })
              }
            />
            <SettingsNumberField
              id="agent-web-fetch-max-redirects"
              label="Fetch max redirects"
              value={agent.web.fetchMaxRedirects}
              min={0}
              onChange={(value) => updateAgent("web", { fetchMaxRedirects: value })}
            />
            <SettingsNumberField
              id="agent-web-search-default-num-results"
              label="Search default results"
              value={agent.web.searchDefaultNumResults}
              min={1}
              onChange={(value) =>
                updateAgent("web", { searchDefaultNumResults: value })
              }
            />
            <div className="sm:col-span-2">
              <SettingsTextField
                id="agent-web-exa-mcp-url"
                label="Exa MCP URL"
                value={agent.web.exaMcpUrl}
                onChange={(value) => {
                  if (!value.trim()) return;
                  updateAgent("web", { exaMcpUrl: value.trim() });
                }}
              />
            </div>
          </div>
        </SettingsSectionLayout>
      );
    default:
      return null;
  }
}
