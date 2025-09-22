"use client";
// Mark as client component

// Import necessary modules and components
import React, { useEffect, useMemo, useState, useCallback } from "react";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Upload,
  FileText,
  Image as ImageIcon,
  Video,
  Music,
  Archive as ArchiveIcon,
  Calendar,
  Trash2,
} from "lucide-react";
import type { Topic } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ago, fmtDateTime } from "@/lib/datetime";
import { Checkbox } from "@/components/ui/checkbox";

type DbMediaType =
  | "document"
  | "image"
  | "video"
  | "audio"
  | "presentation"
  | "other";

type DbFile = {
  id: string;
  file_name: string;
  media_type: DbMediaType | null;
  size_bytes: number | null;
  uploaded_at: string;
  include_in_rag: boolean;
  vector_status:
    | "not_ingested"
    | "ingesting"
    | "indigested"
    | "ingested"
    | "excluded"
    | "deleted";
  mime_type: string | null;
  storage_path: string;
};

// Maximum file size for uploads
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

// Backend URL from environment variables
const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL!;

// Determine icon based on media type
function iconFor(media?: DbMediaType | null) {
  switch (media) {
    case "image":
      return ImageIcon;
    case "video":
      return Video;
    case "audio":
      return Music;
    case "presentation":
    case "document":
    case "other":
    default:
      return FileText;
  }
}

// Format bytes into readable string
function fmtSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

// Detect media type based on file extension
function detectMediaType(name: string): DbMediaType {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg"].includes(ext)) return "image";
  if (["mp4", "mov"].includes(ext)) return "video";
  if (["mp3", "wav"].includes(ext)) return "audio";
  if (["ppt", "pptx"].includes(ext)) return "presentation";
  if (["pdf", "doc", "docx", "txt", "md"].includes(ext)) return "document";
  return "other";
}

// Get authentication token for API requests
async function getAuthToken(supabase: ReturnType<typeof supabaseBrowser>) {
  // Get current session and return access token
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? "";
}

// Main component for uploading and managing topic files
export function TopicUpload({
  topic,
}: {
  topic: Topic;
  onUpdateTopic: (t: Topic) => void;
}) {
  // Initialize state and Supabase client
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [files, setFiles] = useState<DbFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [busy, setBusy] = useState(false);

  // State for delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<DbFile | null>(null);

  // Function to refresh the list of files from the database
  const refreshFiles = useCallback(async () => {
    // Fetch files associated with the topic from Supabase
    const { data, error } = await supabase
      .from("topic_files")
      .select(
        "id,file_name,media_type,size_bytes,uploaded_at,include_in_rag,vector_status,mime_type,storage_path"
      )
      .eq("topic_id", topic.id)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false });

    if (error) throw error;
    setFiles((data ?? []) as DbFile[]);
  }, [supabase, topic.id]);

  // Handlers for drag-and-drop file upload
  const onDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDrag(true);
    else if (e.type === "dragleave") setDrag(false);
  }, []);
  // Handle file drop event
  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDrag(false);
      if (busy) return;
      const list = e.dataTransfer?.files;
      if (!list || list.length === 0) return;
      await handleFiles(Array.from(list));
    },
    [busy]
  );

  // Load files on component mount and when topic changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        // Ensure user is authenticated
        const { data: auth } = await supabase.auth.getUser();
        if (!auth?.user) {
          if (!cancelled) setFiles([]);
          return;
        }
        if (!cancelled) await refreshFiles();
      } catch (e: any) {
        if (!cancelled) {
          setErr(e?.message ?? "Failed to load files");
          setFiles([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, topic.id, refreshFiles]);

  // Handle file selection from file input
  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    if (busy) return;
    const list = e.target.files;
    if (!list || list.length === 0) return;
    await handleFiles(Array.from(list));
    e.target.value = "";
  }

  // Main function to handle file uploads
  async function handleFiles(list: File[]) {
    setErr(null);
    setBusy(true);
    try {
      // Ensure user is authenticated
      const { data: auth } = await supabase.auth.getUser();
      if (!auth?.user) throw new Error("Not authenticated");

      // Validate file sizes
      for (const f of list) {
        if (f.size > MAX_BYTES) {
          throw new Error(
            `"${f.name}" is over 50MB (size: ${fmtSize(f.size)}).`
          );
        }
      }

      // Ensure backend URL is configured
      if (!BACKEND_URL) {
        throw new Error(
          "Backend URL is not configured (NEXT_PUBLIC_BACKEND_URL)."
        );
      }

      for (const file of list) {
        const storagePath = `${auth.user.id}/${topic.id}/${Date.now()}_${
          file.name
        }`;

        // Upload file to Supabase storage
        const { error: upErr } = await supabase.storage
          .from("topic-files")
          .upload(storagePath, file, { cacheControl: "3600", upsert: false });
        if (upErr) throw upErr;

        // Insert file metadata into database
        const media_type: DbMediaType = detectMediaType(file.name);
        const { data: tfRow, error: tfErr } = await supabase
          .from("topic_files")
          .insert({
            topic_id: topic.id,
            user_id: auth.user.id,
            storage_path: storagePath,
            file_name: file.name,
            mime_type: file.type || null,
            media_type,
            size_bytes: file.size,
            include_in_rag: true,
            vector_status: "ingesting",
          })
          .select(
            "id,file_name,media_type,size_bytes,uploaded_at,include_in_rag,vector_status,mime_type,storage_path"
          )
          .single();

        // Handle insertion error
        if (tfErr) throw tfErr;

        // Add file to state to render immediately
        setFiles((prev) => [tfRow as DbFile, ...prev]);

        // Call backend API to ingest the file
        const token = await getAuthToken(supabase);
        const resp = await fetch(`${BACKEND_URL}/api/rag/ingest`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ topic_file_id: tfRow.id }),
        });

        // Handle ingestion error
        if (!resp.ok) {
          const body = await resp.json().catch(() => ({}));
          throw new Error(
            body?.detail || `Ingestion failed for "${file.name}"`
          );
        }
        // Refresh file list to get updated status
        await refreshFiles();
      }
    } catch (e: any) {
      setErr(e?.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  // Function to set chunks active/inactive based on file inclusion
  const setChunksActiveForFile = useCallback(
    async (topicFileId: string, active: boolean) => {
      // Get documents associated with the topic file
      const { data: docs, error: docErr } = await supabase
        .from("documents")
        .select("id")
        .eq("topic_file_id", topicFileId);
      if (docErr) throw docErr;

      // Extract document IDs
      const ids = (docs ?? []).map((d: any) => d.id);
      if (!ids.length) return;

      // Update chunks to be active/inactive
      const { error: chErr } = await supabase
        .from("chunks")
        .update({ is_active: active })
        .in("document_id", ids);
      if (chErr) throw chErr;
    },
    [supabase]
  );

  // Toggle whether a file is included in RAG
  const toggleInclude = useCallback(
    async (file: DbFile, next: boolean) => {
      if (busy) return;
      setBusy(true);
      setErr(null);

      // Update UI
      setFiles((prev) =>
        prev.map((p) =>
          p.id === file.id
            ? {
                ...p,
                include_in_rag: next,
                vector_status: next
                  ? p.vector_status === "excluded"
                    ? "ingested"
                    : p.vector_status
                  : "excluded",
              }
            : p
        )
      );

      // Persist changes to database
      try {
        const { error: tfErr } = await supabase
          .from("topic_files")
          .update({
            include_in_rag: next,
            vector_status: next ? "ingested" : "excluded",
          })
          .eq("id", file.id);
        if (tfErr) throw tfErr;

        // Update chunks to be active/inactive
        await setChunksActiveForFile(file.id, next);
        await refreshFiles();

        // Handle errors and revert UI changes if needed
      } catch (e: any) {
        setErr(e?.message || "Failed to update file state");
        setFiles((prev) =>
          prev.map((p) =>
            p.id === file.id ? { ...p, include_in_rag: !next } : p
          )
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, supabase, refreshFiles, setChunksActiveForFile]
  );

  // Function to delete a file and its associated data
  const deleteFile = useCallback(
    async (file: DbFile) => {
      setBusy(true);
      setErr(null);
      try {
        // Get documents associated with the topic file
        const { data: docs, error: docErr } = await supabase
          .from("documents")
          .select("id")
          .eq("topic_file_id", file.id);
        if (docErr) throw docErr;
        const docIds = (docs ?? []).map((d: any) => d.id);

        // Delete chunks and documents associated with the file
        if (docIds.length) {
          const { error: chErr } = await supabase
            .from("chunks")
            .delete()
            .in("document_id", docIds);
          if (chErr) throw chErr;

          const { error: dErr } = await supabase
            .from("documents")
            .delete()
            .in("id", docIds);
          if (dErr) throw dErr;
        }

        // Delete file from supabase storage
        await supabase.storage.from("topic-files").remove([file.storage_path]);

        // Mark the topic file as deleted in the database
        const { error: tfErr } = await supabase
          .from("topic_files")
          .update({
            deleted_at: new Date().toISOString(),
            vector_status: "deleted",
            include_in_rag: false,
          })
          .eq("id", file.id);
        if (tfErr) throw tfErr;

        // Refresh file list
        await refreshFiles();
      } catch (e: any) {
        setErr(e?.message || "Failed to delete file");
      } finally {
        setBusy(false);
      }
    },
    [supabase, refreshFiles]
  );

  // Render component
  return (
    // Main container
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight mt-5">
          Manage Knowledge Base
        </h2>
        <p className="text-sm text-muted-foreground mt-3">
          Add documents to build your knowledge base. Supported formats: PDF,
          Word, Text files, MP4, MP3, PPTX, PNG, JPEG (<strong>max 50MB</strong>{" "}
          each)
        </p>
      </div>

      {/* File upload card */}
      <Card
        className={`border shadow-none border-dashed transition-colors ${
          drag ? "border-primary bg-primary/5" : "border-muted-foreground/20"
        } ${busy ? "opacity-70 pointer-events-none" : ""}`}
        onDragEnter={onDrag}
        onDragLeave={onDrag}
        onDragOver={onDrag}
        onDrop={onDrop}
        onClick={() => !busy && document.getElementById("file-input")?.click()}
      >
        {/* File upload area */}
        <CardContent className="p-8 text-center">
          <Upload className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="font-medium mb-1">Upload your files</h3>
          <p className="text-sm text-muted-foreground mb-3">
            Drag and drop files here, or click to browse
          </p>
          <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary">PDF</Badge>
            <Badge variant="secondary">Images</Badge>
            <Badge variant="secondary">Videos</Badge>
            <Badge variant="secondary">Audio</Badge>
            <Badge variant="secondary">Text</Badge>
            <Badge variant="secondary">Presentations</Badge>
          </div>
          <input
            id="file-input"
            type="file"
            multiple
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md,.ppt,.pptx,.png,.jpg,.jpeg,.mp3,.wav,.mp4,.mov" // Accepted file types
            onChange={handleFilesSelected} // Handle file selection
            disabled={busy}
            aria-disabled={busy}
          />
          <p className="text-xs text-muted-foreground mt-3">
            Files must be under 50MB
          </p>
          {err && <p className="text-xs text-destructive mt-3">{err}</p>}
        </CardContent>
      </Card>

      {/* Uploaded files list header*/}
      <Card className="shadow-none bg-transparent border-none p-0 mt-6">
        <CardHeader className="px-0 pt-0">
          <CardTitle className="text-lg">
            Uploaded Files{loading ? "" : ` (${files.length})`}
          </CardTitle>
          <CardDescription>
            Documents in this topic that are available for chat, summaries, and
            quizzes
          </CardDescription>
        </CardHeader>

        {/* Uploaded files list */}
        <CardContent className="px-0">
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 p-4 border rounded-lg"
                >
                  <Skeleton className="h-10 w-10 rounded-lg" />
                  <div className="flex-1 min-w-0 space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="h-5 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : err && files.length === 0 ? (
            <p className="text-sm text-destructive">{err}</p>
          ) : files.length === 0 ? (
            // No files uploaded message
            <Card className="shadow-none">
              <CardContent className="p-12 text-center">
                <ArchiveIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  No uploaded files
                </h3>
                <p className="text-muted-foreground">
                  Once you upload files to this topic, they’ll appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            // List of uploaded files
            <div className="space-y-3">
              {files.map((f) => {
                const Icon = iconFor(f.media_type);
                const status =
                  f.vector_status === "ingested"
                    ? "Ready"
                    : f.vector_status === "ingesting"
                    ? "Processing"
                    : f.vector_status === "excluded"
                    ? "Excluded"
                    : "Uploaded";

                // Determine status text color
                const statusTone =
                  f.vector_status === "ingested"
                    ? "text-green-600"
                    : f.vector_status === "ingesting"
                    ? "text-orange-600"
                    : f.vector_status === "excluded"
                    ? "text-muted-foreground"
                    : "text-muted-foreground";

                // Render component
                return (
                  <div
                    key={f.id}
                    className="flex items-center gap-4 p-4 border rounded-lg"
                  >
                    <div className="flex items-center justify-center w-10 h-10 bg-muted rounded-lg">
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* File details */}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-sm mb-0.5">
                        {f.file_name}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{fmtSize(f.size_bytes ?? 0)}</span>
                        <span>•</span>
                        <span
                          className="inline-flex items-center gap-1"
                          title={fmtDateTime(f.uploaded_at)}
                        >
                          <Calendar className="h-3 w-3" />
                          Uploaded {ago(f.uploaded_at)}
                        </span>
                        <span>•</span>
                        <span
                          className={`inline-flex items-center gap-1 ${statusTone}`}
                        >
                          {status}
                        </span>
                      </div>
                    </div>

                    {/* File actions - include/exclude and delete*/}
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={!!f.include_in_rag}
                        onCheckedChange={(val) =>
                          toggleInclude(f, val === true)
                        }
                        disabled={busy}
                        aria-label={`Toggle active for ${f.file_name}`}
                        title={f.include_in_rag ? "Set inactive" : "Set active"}
                        className="
      h-4 w-4 rounded-[3px] 
      border border-black 
      data-[state=checked]:bg-black data-[state=checked]:border-black
      data-[state=checked]:text-white
      focus-visible:ring-0 focus-visible:ring-offset-0
      disabled:opacity-60
    "
                      />
                      {/* Delete file button */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setFileToDelete(f);
                          setConfirmOpen(true);
                        }}
                        disabled={busy}
                        aria-label={`Delete ${f.file_name}`}
                        title="Delete file"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {fileToDelete ? (
                <>
                  This will remove <strong>{fileToDelete.file_name}</strong>{" "}
                  from your knowledge base. This action cannot be undone.
                </>
              ) : (
                "This action cannot be undone."
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!fileToDelete) return;
                await deleteFile(fileToDelete);
                setConfirmOpen(false);
                setFileToDelete(null);
              }}
              disabled={busy}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
