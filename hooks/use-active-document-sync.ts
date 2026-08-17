"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Contents, ContentsManager } from "@jupyterlab/services";

export const ACTIVE_DOCUMENT_POLL_INTERVAL_MS = 5_000;
export const ACTIVE_DOCUMENT_RENAMED_EVENT = "orion:active-document-renamed";
export const ACTIVE_DOCUMENT_DELETED_EVENT = "orion:active-document-deleted";
const CHANGE_COALESCE_INTERVAL_MS = 100;

/** Detail emitted when a clean active file follows a Jupyter rename. */
export interface ActiveDocumentRenamedEventDetail {
  oldPath: string;
  newPath: string;
}

/** Detail emitted when a known Jupyter delete should close the active editor. */
export interface ActiveDocumentDeletedEventDetail {
  path: string;
}

export type ActiveDocumentDeletionSource = "contents-manager" | "poll";

/**
 * Result of an editor reload request. `"deferred"` means the editor could not
 * reload yet (for example while agent cells are still executing) and the change
 * is still outstanding, so the sync layer must keep retrying.
 */
export type ActiveDocumentReloadOutcome = "deferred" | void;

/** Notifies the app shell that the clean active editor should follow a rename. */
export function dispatchActiveDocumentRenamed(
  detail: ActiveDocumentRenamedEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<ActiveDocumentRenamedEventDetail>(
      ACTIVE_DOCUMENT_RENAMED_EVENT,
      { detail },
    ),
  );
}

/** Notifies the app shell that a known delete should use its workspace flow. */
export function dispatchActiveDocumentDeleted(
  detail: ActiveDocumentDeletedEventDetail,
): void {
  window.dispatchEvent(
    new CustomEvent<ActiveDocumentDeletedEventDetail>(
      ACTIVE_DOCUMENT_DELETED_EVENT,
      { detail },
    ),
  );
}

/** Durable identity returned by Jupyter for one saved document revision. */
export interface ActiveDocumentVersion {
  fingerprint: string;
  lastModified: string | null;
  size: number | null;
  hash: string | null;
}

/** Synchronization state for the active Jupyter-backed editor document. */
export type ActiveDocumentSyncState =
  | { status: "current" }
  | { status: "refreshing" }
  | { status: "conflicted"; version: ActiveDocumentVersion }
  | { status: "renamed"; newPath: string }
  | { status: "deleted" };

interface UseActiveDocumentSyncOptions {
  path: string | null;
  contentsManager: ContentsManager | null;
  isDirty: () => boolean;
  onReload: () => Promise<ActiveDocumentReloadOutcome>;
  onRenamed?: (newPath: string) => void;
  onDeleted?: (source: ActiveDocumentDeletionSource) => void;
  pollIntervalMs?: number;
}

export interface ActiveDocumentSyncController {
  state: ActiveDocumentSyncState;
  recordLoadedModel: (model: Partial<Contents.IModel>) => void;
  runLocalWrite: <T extends Partial<Contents.IModel> | void>(
    write: () => Promise<T>,
  ) => Promise<T>;
  checkNow: () => Promise<void>;
  reloadDiskVersion: () => Promise<void>;
}

/** Builds a comparable version from the metadata available in a Contents model. */
export function activeDocumentVersion(
  model: Partial<Contents.IModel>,
): ActiveDocumentVersion {
  const hash = typeof model.hash === "string" ? model.hash : null;
  const hashAlgorithm =
    typeof model.hash_algorithm === "string" ? model.hash_algorithm : "";
  const lastModified =
    typeof model.last_modified === "string" ? model.last_modified : null;
  const size = typeof model.size === "number" ? model.size : null;
  const fingerprint = hash
    ? `hash:${hashAlgorithm}:${hash}`
    : `metadata:${lastModified ?? ""}:${size ?? ""}`;

  return { fingerprint, lastModified, size, hash };
}

/** Compares revisions while allowing a metadata baseline to gain a later hash. */
function versionsMatch(
  left: ActiveDocumentVersion,
  right: ActiveDocumentVersion,
): boolean {
  if (left.hash && right.hash) return left.fingerprint === right.fingerprint;
  return (
    left.lastModified !== null &&
    right.lastModified !== null &&
    left.lastModified === right.lastModified &&
    left.size === right.size
  );
}

/** Returns whether a Jupyter Contents model refers to the requested path. */
function modelMatchesPath(
  model: Partial<Contents.IModel> | null,
  path: string,
): boolean {
  return model?.path === path || model?.serverPath === path;
}

/**
 * Keeps the active editor aligned with Jupyter writes and out-of-process file
 * changes without ever replacing a dirty buffer automatically.
 */
export function useActiveDocumentSync({
  path,
  contentsManager,
  isDirty,
  onReload,
  onRenamed,
  onDeleted,
  pollIntervalMs = ACTIVE_DOCUMENT_POLL_INTERVAL_MS,
}: UseActiveDocumentSyncOptions): ActiveDocumentSyncController {
  const [state, setState] = useState<ActiveDocumentSyncState>({
    status: "current",
  });
  const stateRef = useRef<ActiveDocumentSyncState>(state);
  stateRef.current = state;
  const baselineRef = useRef<ActiveDocumentVersion | null>(null);
  const baselineGenerationRef = useRef(0);
  const pendingVersionRef = useRef<ActiveDocumentVersion | null>(null);
  const pendingRenameRef = useRef<string | null>(null);
  const localWriteDepthRef = useRef(0);
  const hashFetchSupportedRef = useRef(true);
  const deletedNotifiedRef = useRef(false);
  const coalesceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef<Promise<void> | null>(null);
  const isDirtyRef = useRef(isDirty);
  const onReloadRef = useRef(onReload);
  const onRenamedRef = useRef(onRenamed);
  const onDeletedRef = useRef(onDeleted);

  isDirtyRef.current = isDirty;
  onReloadRef.current = onReload;
  onRenamedRef.current = onRenamed;
  onDeletedRef.current = onDeleted;

  /** Records the version that is currently represented in the editor. */
  const recordLoadedModel = useCallback(
    (model: Partial<Contents.IModel>): void => {
      baselineRef.current = activeDocumentVersion(model);
      baselineGenerationRef.current += 1;
      pendingVersionRef.current = null;
      pendingRenameRef.current = null;
      deletedNotifiedRef.current = false;
      setState({ status: "current" });
    },
    [],
  );

  const handleChangedVersionRef = useRef<
    ((version: ActiveDocumentVersion) => Promise<void>) | null
  >(null);

  /** Restores a non-terminal status after a refresh attempt that changed nothing. */
  const clearRefreshingState = useCallback((): void => {
    setState((previous) =>
      previous.status === "refreshing" ? { status: "current" } : previous,
    );
  }, []);

  /** Reloads a clean document, or records a conflict for a dirty document. */
  const handleChangedVersion = useCallback(
    async (version: ActiveDocumentVersion): Promise<void> => {
      if (baselineRef.current && versionsMatch(baselineRef.current, version)) {
        baselineRef.current = version;
        return;
      }
      if (pendingVersionRef.current && versionsMatch(pendingVersionRef.current, version)) return;

      if (isDirtyRef.current()) {
        pendingVersionRef.current = version;
        setState({ status: "conflicted", version });
        return;
      }

      if (refreshInFlightRef.current) {
        // Re-check once the in-flight reload settles so a change that landed
        // during it is applied instead of dropped until the next poll.
        await refreshInFlightRef.current;
        await handleChangedVersionRef.current?.(version);
        return;
      }

      const refresh = (async () => {
        setState({ status: "refreshing" });
        try {
          const generationBeforeReload = baselineGenerationRef.current;
          const outcome = await onReloadRef.current();
          if (outcome === "deferred") {
            // The editor could not apply the change yet. Leave the baseline
            // stale so polling retries until the reload can actually happen.
            pendingVersionRef.current = null;
            clearRefreshingState();
            return;
          }
          // Only fall back to the triggering version when the editor did not
          // record the revision it actually loaded.
          if (baselineGenerationRef.current === generationBeforeReload) {
            baselineRef.current = version;
          }
          pendingVersionRef.current = null;
          setState({ status: "current" });
        } catch (error) {
          console.warn("Failed to refresh externally changed document:", error);
          if (isDirtyRef.current()) {
            pendingVersionRef.current = version;
            setState({ status: "conflicted", version });
          } else {
            clearRefreshingState();
          }
        } finally {
          refreshInFlightRef.current = null;
        }
      })();
      refreshInFlightRef.current = refresh;
      await refresh;
    },
    [clearRefreshingState],
  );

  handleChangedVersionRef.current = handleChangedVersion;

  /** Fetches only the active document metadata used for polling. */
  const fetchVersion = useCallback(async (): Promise<ActiveDocumentVersion | null> => {
    if (!contentsManager || !path) return null;

    let model: Contents.IModel;
    if (hashFetchSupportedRef.current) {
      try {
        model = await contentsManager.get(path, {
          content: false,
          hash: true,
        });
      } catch (error) {
        // Jupyter Server 1.x and older content providers reject `hash` with a
        // 400. Any other failure (offline, 5xx, missing path) is transient, so
        // fall back for this call only instead of downgrading every later poll.
        const status = (error as { response?: { status?: unknown } })?.response
          ?.status;
        if (status === 400) hashFetchSupportedRef.current = false;
        try {
          model = await contentsManager.get(path, { content: false });
        } catch (fallbackError) {
          throw fallbackError ?? error;
        }
      }
    } else {
      model = await contentsManager.get(path, { content: false });
    }

    return activeDocumentVersion(model);
  }, [contentsManager, path]);

  /** Checks the active path for an out-of-process change. */
  const checkNow = useCallback(async (): Promise<void> => {
    if (!contentsManager || !path || document.visibilityState === "hidden") {
      return;
    }
    // A same-manager rename already supplied the destination. Polling the old
    // path would incorrectly turn the pending rename conflict into a deletion.
    if (pendingRenameRef.current) return;
    // A reported deletion is terminal until the document is loaded again.
    if (deletedNotifiedRef.current) return;
    if (!baselineRef.current) return;

    try {
      const baselineGeneration = baselineGenerationRef.current;
      const version = await fetchVersion();
      if (!version) return;
      if (baselineGenerationRef.current !== baselineGeneration) return;
      await handleChangedVersion(version);
    } catch (error) {
      const status = (error as { response?: { status?: unknown } })?.response?.status;
      if (status === 404) {
        deletedNotifiedRef.current = true;
        setState({ status: "deleted" });
        onDeletedRef.current?.("poll");
        return;
      }
      console.warn("Failed to poll active document metadata:", error);
    }
  }, [contentsManager, fetchVersion, handleChangedVersion, path]);

  /** Wraps an editor-owned save so its own Contents signal is ignored. */
  const runLocalWrite = useCallback(
    async <T extends Partial<Contents.IModel> | void>(
      write: () => Promise<T>,
    ): Promise<T> => {
      localWriteDepthRef.current += 1;
      try {
        const model = await write();
        if (model) recordLoadedModel(model);
        return model;
      } finally {
        localWriteDepthRef.current = Math.max(0, localWriteDepthRef.current - 1);
      }
    },
    [recordLoadedModel],
  );

  /** Explicitly accepts the pending disk version and discards the editor buffer. */
  const reloadDiskVersion = useCallback(async (): Promise<void> => {
    if (pendingRenameRef.current) {
      const newPath = pendingRenameRef.current;
      pendingRenameRef.current = null;
      onRenamedRef.current?.(newPath);
      return;
    }
    const previousState = stateRef.current;
    setState({ status: "refreshing" });
    try {
      const outcome = await onReloadRef.current();
      if (outcome === "deferred") {
        // Nothing was replaced yet, so keep the unresolved state visible
        // instead of implying the disk version is now in the editor.
        setState(previousState.status === "refreshing" ? { status: "current" } : previousState);
        return;
      }
      const version = pendingVersionRef.current ?? (await fetchVersion());
      if (version) baselineRef.current = version;
      pendingVersionRef.current = null;
      pendingRenameRef.current = null;
      setState({ status: "current" });
    } catch (error) {
      const pendingVersion = pendingVersionRef.current;
      setState(
        pendingVersion
          ? { status: "conflicted", version: pendingVersion }
          : { status: "current" },
      );
      throw error;
    }
  }, [fetchVersion]);

  useEffect(() => {
    if (pendingRenameRef.current === path) {
      // The editor already follows the new path, so an unsaved buffer here is
      // ordinary unsaved work rather than an unresolved divergence.
      baselineRef.current = pendingVersionRef.current;
      baselineGenerationRef.current += 1;
      pendingRenameRef.current = null;
      pendingVersionRef.current = null;
      hashFetchSupportedRef.current = true;
      deletedNotifiedRef.current = false;
      setState({ status: "current" });
      return;
    }
    baselineRef.current = null;
    baselineGenerationRef.current += 1;
    pendingVersionRef.current = null;
    // A rename the app never followed must not keep polling disabled here.
    pendingRenameRef.current = null;
    hashFetchSupportedRef.current = true;
    deletedNotifiedRef.current = false;
    setState({ status: "current" });
  }, [contentsManager, path]);

  useEffect(() => {
    if (!contentsManager || !path) return;

    const scheduleVersion = (model: Partial<Contents.IModel>): void => {
      const version = activeDocumentVersion(model);
      if (coalesceTimerRef.current) clearTimeout(coalesceTimerRef.current);
      coalesceTimerRef.current = setTimeout(() => {
        coalesceTimerRef.current = null;
        void handleChangedVersion(version);
      }, CHANGE_COALESCE_INTERVAL_MS);
    };

    const handleFileChanged = (
      _sender: ContentsManager,
      args: Contents.IChangedArgs,
    ): void => {
      if (localWriteDepthRef.current > 0) return;

      if (args.type === "save" && modelMatchesPath(args.newValue, path)) {
        scheduleVersion(args.newValue ?? { path });
        return;
      }
      if (args.type === "delete" && modelMatchesPath(args.oldValue, path)) {
        if (deletedNotifiedRef.current) return;
        deletedNotifiedRef.current = true;
        setState({ status: "deleted" });
        onDeletedRef.current?.("contents-manager");
        return;
      }
      if (args.type === "rename" && modelMatchesPath(args.oldValue, path)) {
        const newPath = args.newValue?.path;
        if (typeof newPath === "string" && newPath.length > 0) {
          pendingRenameRef.current = newPath;
          pendingVersionRef.current = activeDocumentVersion(
            args.newValue ?? { path: newPath },
          );
          setState(
            isDirtyRef.current()
              ? { status: "renamed", newPath }
              : { status: "current" },
          );
          onRenamedRef.current?.(newPath);
        }
      }
    };

    if (!contentsManager.fileChanged?.connect) return;
    contentsManager.fileChanged.connect(handleFileChanged);
    return () => {
      contentsManager.fileChanged.disconnect(handleFileChanged);
      if (coalesceTimerRef.current) {
        clearTimeout(coalesceTimerRef.current);
        coalesceTimerRef.current = null;
      }
    };
  }, [contentsManager, handleChangedVersion, path]);

  useEffect(() => {
    if (!contentsManager || !path) return;

    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") void checkNow();
    }, pollIntervalMs);
    const handleVisible = (): void => {
      if (document.visibilityState !== "hidden") void checkNow();
    };
    window.addEventListener("focus", handleVisible);
    document.addEventListener("visibilitychange", handleVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", handleVisible);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [checkNow, contentsManager, path, pollIntervalMs]);

  return {
    state,
    recordLoadedModel,
    runLocalWrite,
    checkNow,
    reloadDiskVersion,
  };
}
