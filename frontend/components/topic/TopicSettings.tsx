"use client";
// Mark as client component

// Import necessary modules and components
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import {
  Save,
  Archive as ArchiveIcon,
  Trash2,
  AlertTriangle,
  Loader2,
  Plus,
  Check,
  ChevronsUpDown,
} from "lucide-react";

import type { Topic } from "@/components/AppShell";

// Define types for Category
type Category = { id: string; name: string };

// Main component for Topic Settings
export function TopicSettings({
  topic,
  onUpdateTopic,
}: {
  topic: Topic;
  onUpdateTopic: (t: Topic) => void;
}) {
  // Initialize router and supabase client
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowser(), []);

  // State variables
  const [name, setName] = React.useState(topic.name);
  const [catPopoverOpen, setCatPopoverOpen] = React.useState(false);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<
    string | null
  >(null);
  const [categoryInput, setCategoryInput] = React.useState("");

  // Loading and action states
  const [loadingCats, setLoadingCats] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [changed, setChanged] = React.useState(false);

  // Feedback states
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Effect to set initial category input based on topic's category
  React.useEffect(() => {
    const initial =
      topic.category && topic.category.toLowerCase() !== "general"
        ? topic.category
        : "";
    setCategoryInput(initial);
  }, [topic.category]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingCats(true);
      setError(null);
      try {
        // Get the authenticated user
        const { data: auth } = await supabase.auth.getUser();
        const authed = auth?.user;
        if (!authed) {
          setCategories([]);
          return;
        }
        // Fetch categories for the authenticated user
        const { data, error } = await supabase
          .from("categories")
          .select("id,name")
          .eq("user_id", authed.id)
          .order("name", { ascending: true });

        if (error) throw error;
        if (!cancelled) {
          setCategories(data ?? []);

          // If the topic has a category, try to set it as selected
          if (topic.category) {
            const match = (data ?? []).find(
              (c) => c.name.toLowerCase() === topic.category.toLowerCase()
            );
            if (match) setSelectedCategoryId(match.id);
          }
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load categories");
      } finally {
        if (!cancelled) setLoadingCats(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, topic.category]);

  // Memoized filtered categories based on user input
  const filtered = React.useMemo(() => {
    const q = categoryInput.trim().toLowerCase();
    if (!q) return categories;
    // Filter categories based on user input
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categoryInput]);

  const showCreateNew =
    categoryInput.trim().length > 0 &&
    !categories.some(
      (c) => c.name.toLowerCase() === categoryInput.trim().toLowerCase()
    );

    // Function to mark that changes have been made
  const markChanged = () => {
    setChanged(true);
    setSuccess(null);
    setError(null);
  };

  // Function to ensure the category exists or create a new one
  const ensureCategory = async (): Promise<{ id: string; name: string }> => {
    const typed = categoryInput.trim();
    if (!typed) throw new Error("Please select or create a category.");

    const {
      data: { user },
    } = await supabase.auth.getUser(); // Get the authenticated user
    if (!user) throw new Error("You must be signed in.");

    // If a category is selected, return it
    if (selectedCategoryId) {
      const found = categories.find((c) => c.id === selectedCategoryId);
      if (found) return { id: found.id, name: found.name };
    }

    const existingByName = categories.find(
      (c) => c.name.toLowerCase() === typed.toLowerCase()
    );

    // If a category with the typed name already exists, select it
    if (existingByName) {
      setSelectedCategoryId(existingByName.id);
      return { id: existingByName.id, name: existingByName.name };
    }

    // Create a new category
    const { data: insertedCat, error: insertErr } = await supabase
      .from("categories")
      .insert({ name: typed, user_id: user.id })
      .select("id,name")
      .single();

    if (insertErr) {
      // If insertion fails, try to fetch the category again
      const { data: foundCat } = await supabase
        .from("categories")
        .select("id,name")
        .eq("name", typed)
        .eq("user_id", user.id)
        .single();

          // If found, set it as selected
      if (foundCat) {
        setCategories((prev) =>
          prev.some((c) => c.id === foundCat.id) ? prev : [...prev, foundCat]
        );
        setSelectedCategoryId(foundCat.id);
        return { id: foundCat.id, name: foundCat.name };
      }
      throw insertErr;
    }

    // If insertion is successful, add it to the categories and select it
    if (insertedCat) {
      setCategories((prev) =>
        prev.some((c) => c.id === insertedCat.id)
          ? prev
          : [...prev, insertedCat]
      );
      setSelectedCategoryId(insertedCat.id);
      return { id: insertedCat.id, name: insertedCat.name };
    }

    throw new Error("Failed to create category.");
  };

  // Function to save changes to the topic
  const save = async () => {
    const newName = name.trim();
    if (!newName) {
      setError("Please enter a topic name.");
      return;
    }
    // Set saving state
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { id: categoryId, name: finalCategoryName } =
        await ensureCategory();

      // Update the topic with new name and category
      const { error: upErr } = await supabase
        .from("topics")
        .update({ name: newName, category_id: categoryId })
        .eq("id", topic.id);

      if (upErr) throw upErr;

      // Show parent component the topic is updated successfully
      onUpdateTopic({ ...topic, name: newName, category: finalCategoryName });
      setSuccess("Changes saved.");
      setChanged(false);
    } catch (e: any) {
      // Handle errors - show error message
      setError(e?.message ?? "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  // Function to archive the topic
  const archive = async () => {

    // Set archiving state
    setArchiving(true);
    setError(null);
    setSuccess(null);
    try {
      // Update the topic status to archived
      const { error: upErr } = await supabase
        .from("topics")
        .update({ status: "archived" })
        .eq("id", topic.id);

      if (upErr) throw upErr;

      // Show parent component the topic is archived successfully - will redirect to archive page
      onUpdateTopic({ ...topic, isArchived: true });

      // redirect to Archive page
      router.replace("/archive");
    } catch (e: any) {
      setError(e?.message ?? "Failed to archive topic.");
    } finally {
      setArchiving(false);
    }
  };

  // Function to delete the topic permanently
  const del = async () => {
    setDeleting(true);
    setError(null);
    setSuccess(null);
    try {
      // Delete the topic
      const { error: delErr } = await supabase
        .from("topics")
        .delete()
        .eq("id", topic.id);
      if (delErr) throw delErr;

      // Redirect to dashboard after successful delete
      router.replace("/dashboard");
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete topic.");
    } finally {
      setDeleting(false);
    }
  };

  // --------------------- Render the Settings UI ---------------------
  return (
    <div className="py-4 mt-2 space-y-10">

      {/* Topic Settings Header */}
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Topic Settings</h1>
        <p className="text-base text-muted-foreground mt-2">
          Manage your topic configuration and preferences
        </p>
      </div>

      {/* Error and Success Messages */}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-green-600">{success}</p> : null}

      {/* Basic Information Section */}
      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium">Basic Information</h2>
          <p className="text-sm text-muted-foreground">
            Update the basic details of your topic
          </p>
        </div>

        {/* Topic Name */}
        <div className="space-y-4">
          <div>
            <Label className="mb-2 block">Topic Name</Label>
            <Input
              className="shadow-none"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                markChanged();
              }}
              disabled={saving}
            />
          </div>

          {/* Category Selection with Popover and Command */}
          <div className="space-y-2">
            <Label htmlFor="category-combobox">Category</Label>
            <Popover open={catPopoverOpen} onOpenChange={setCatPopoverOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="category-combobox"
                  variant="outline"
                  role="combobox"
                  aria-expanded={catPopoverOpen}
                  className="w-full justify-between"
                  disabled={loadingCats || saving}
                >
                  {categoryInput
                    ? categoryInput
                    : loadingCats
                    ? "Loading categories…"
                    : "Search or create a category"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>

              {/* Popover Content */}
              <PopoverContent
                align="start"
                side="bottom"
                sideOffset={6}
                className="w-[var(--radix-popover-trigger-width)] p-0 z-50"
              >
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type to search…"
                    value={categoryInput}
                    onValueChange={(v) => {
                      setCategoryInput(v);
                      setSelectedCategoryId(null);
                      markChanged();
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>No categories found.</CommandEmpty>

                    {filtered.length > 0 && (
                      <CommandGroup heading="Categories">
                        {filtered.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.name}
                            onSelect={() => {
                              setSelectedCategoryId(c.id);
                              setCategoryInput(c.name);
                              setCatPopoverOpen(false);
                              markChanged();
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCategoryId === c.id
                                  ? "opacity-100"
                                  : "opacity-0"
                              )}
                            />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                    {/* Create New Category */}
                    {showCreateNew && (
                      <>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${categoryInput}`}
                            onSelect={() => {
                              setSelectedCategoryId(null);
                              setCatPopoverOpen(false);
                              markChanged();
                            }}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Create “{categoryInput.trim()}”
                          </CommandItem>
                        </CommandGroup>
                      </>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Save Changes Button */}
          {changed && (
            <div className="flex gap-2 pt-4">
              <Button className="gap-2" onClick={save} disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setName(topic.name);
                  setCategoryInput(
                    topic.category && topic.category.toLowerCase() !== "general"
                      ? topic.category
                      : ""
                  );
                  // Reset selected category ID based on topic's current category
                  setSelectedCategoryId(
                    categories.find(
                      (c) =>
                        c.name.toLowerCase() ===
                        (topic.category ?? "").toLowerCase()
                    )?.id ?? null
                  );
                  setChanged(false);
                  setError(null);
                  setSuccess(null);
                }}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Archive and Delete Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between p-4 border rounded-lg">

          {/* Archive Topic */}
          <div>
            <h4 className="font-medium">Archive Topic</h4>
            <p className="text-sm text-muted-foreground">
              Move this topic to the archive. You can restore it later.
            </p>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="gap-2" disabled={archiving}>
                {archiving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArchiveIcon className="h-4 w-4" />
                )}
                {archiving ? "Archiving…" : "Archive"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Archive Topic</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to archive “{topic.name}”?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                {/* Archive topic - call archive function */}
                <AlertDialogAction onClick={archive}>
                  Archive Topic
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        {/* Delete Topic */}
        <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg">
          <div>
            <h4 className="font-medium">Delete Topic</h4>
            <p className="text-sm text-muted-foreground">
              Permanently delete this topic and all its data. This cannot be
              undone.
            </p>
          </div>

          {/* Delete Topic Confirmation */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="destructive"
                className="gap-2"
                disabled={deleting}
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            </AlertDialogTrigger>

            {/* Delete Topic modal content */}
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                  Delete Topic
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all files, quizzes, summaries, and chat
                  memory for “{topic.name}”.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>

                {/* Delete topic */}
                <AlertDialogAction
                  onClick={del}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  Delete Forever
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </section>
    </div>
  );
}
