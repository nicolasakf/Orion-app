"use client";

import * as React from "react";
import { Check, Copy, ExternalLink, Loader2, UploadCloud } from "lucide-react";
import { toast } from "sonner";

import { CloudAuthDialog } from "@/components/cloud/cloud-auth-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ORION_USER_DOCS_PUBLISH_NOTEBOOKS_URL } from "@/lib/constants/user-docs";
import { getOrionCloudConfig } from "@/lib/cloud/config";
import {
  listPublishedNotebooks,
  type PublishNotebookResponse,
} from "@/lib/cloud/publishing";
import { useCloudUser } from "@/hooks/use-cloud-user";

interface PublishNotebookInput {
  publishId?: string;
  title: string;
  description: string;
  hideInputCells: boolean;
  allowSourceDownload: boolean;
  apiBaseUrl: string;
  accessToken: string;
}

interface NotebookPublishDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTitle: string;
  onPublish: (input: PublishNotebookInput) => Promise<PublishNotebookResponse>;
}

/** Dialog that signs in and publishes the active notebook to Orion Cloud. */
export function NotebookPublishDialog({
  open,
  onOpenChange,
  defaultTitle,
  onPublish,
}: NotebookPublishDialogProps) {
  const cloudConfig = React.useMemo(() => getOrionCloudConfig(), []);
  const { configured, user, accessToken, refresh } = useCloudUser();
  const [authOpen, setAuthOpen] = React.useState(false);
  const [title, setTitle] = React.useState(defaultTitle);
  const [description, setDescription] = React.useState("");
  const [hideInputCells, setHideInputCells] = React.useState(true);
  const [allowSourceDownload, setAllowSourceDownload] = React.useState(false);
  const [publishId, setPublishId] = React.useState<string>("");
  const [published, setPublished] = React.useState<PublishNotebookResponse[]>([]);
  const [result, setResult] = React.useState<PublishNotebookResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setTitle(defaultTitle);
    setResult(null);
    setCopied(false);
  }, [defaultTitle, open]);

  React.useEffect(() => {
    if (!open || !cloudConfig || !accessToken) return;
    void listPublishedNotebooks({
      apiBaseUrl: cloudConfig.apiBaseUrl,
      accessToken,
    }).then(setPublished);
  }, [accessToken, cloudConfig, open]);

  const selectedExisting = published.find((entry) => entry.id === publishId);

  React.useEffect(() => {
    if (!selectedExisting) return;
    setTitle(selectedExisting.title);
    setDescription(selectedExisting.description);
    setAllowSourceDownload(selectedExisting.allowSourceDownload);
  }, [selectedExisting]);

  const handlePublish = async () => {
    if (!configured || !cloudConfig) {
      toast.error("Set NEXT_PUBLIC_ORION_API_BASE_URL and Supabase cloud env vars to publish.");
      return;
    }
    if (!user || !accessToken) {
      setAuthOpen(true);
      return;
    }

    setLoading(true);
    try {
      const nextResult = await onPublish({
        publishId: publishId || undefined,
        title,
        description,
        hideInputCells,
        allowSourceDownload,
        apiBaseUrl: cloudConfig.apiBaseUrl,
        accessToken,
      });
      setResult(nextResult);
      setPublishId(nextResult.id);
      setPublished((current) => {
        const others = current.filter((entry) => entry.id !== nextResult.id);
        return [nextResult, ...others];
      });
      toast.success("Notebook published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish notebook.");
    } finally {
      setLoading(false);
    }
  };

  const copyUrl = async () => {
    if (!result?.url) return;
    await navigator.clipboard.writeText(result.url);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Publish notebook</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Create a shareable Orion page. Published notebooks are interactive HTML pages and do not give viewers access to your Python kernel.
                </p>
                <Button variant="link" className="h-auto p-0 text-sm" asChild>
                  <a
                    href={ORION_USER_DOCS_PUBLISH_NOTEBOOKS_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Learn more
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              </div>
            </DialogDescription>
          </DialogHeader>

          {!configured ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              Orion Cloud is not configured in this local app.
            </div>
          ) : null}

          <div className="space-y-4">
            {published.length > 0 ? (
              <div className="space-y-2">
                <Label htmlFor="publish-target">Publish target</Label>
                <select
                  id="publish-target"
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                  value={publishId}
                  onChange={(event) => setPublishId(event.target.value)}
                >
                  <option value="">New published notebook</option>
                  {published.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      Update: {entry.title}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor="publish-title">Title</Label>
              <Input
                id="publish-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                maxLength={160}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="publish-description">Description</Label>
              <Textarea
                id="publish-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={hideInputCells}
                onCheckedChange={(checked) => setHideInputCells(checked === true)}
              />
              Hide input cells in published page
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={allowSourceDownload}
                onCheckedChange={(checked) => setAllowSourceDownload(checked === true)}
              />
              Allow viewers to download the source .ipynb
            </label>
            {result ? (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                <div className="font-medium">Published</div>
                <a
                  href={result.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-primary underline-offset-4 hover:underline"
                >
                  {result.url}
                </a>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            {result ? (
              <>
                <Button type="button" variant="outline" onClick={copyUrl}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  Copy link
                </Button>
                <Button type="button" variant="outline" asChild>
                  <a href={result.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Open
                  </a>
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              onClick={handlePublish}
              disabled={loading || !configured || (!!user && !title.trim())}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
              {user ? "Publish" : "Sign in to publish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CloudAuthDialog
        open={authOpen}
        onOpenChange={setAuthOpen}
        onAuthenticated={refresh}
      />
    </>
  );
}
