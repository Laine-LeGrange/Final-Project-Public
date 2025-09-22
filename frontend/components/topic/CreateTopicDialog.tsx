// mark as component
"use client";

// Import necessary modules and components
import * as React from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/app/lib/supabase-browser";
import { cn } from "@/lib/utils";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

import { Loader2, Plus, Check, ChevronsUpDown } from "lucide-react";

// Define types for category and component props
type Category = { id: string; name: string };

type CreateTopicDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (payload: {
    topicId: string;
    topicName: string;
    categoryId: string | null;
    categoryName: string;
  }) => void;
};

// CreateTopicDialog component
export function CreateTopicDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateTopicDialogProps) {

  // Initialize router and supabase client
  const router = useRouter();
  const supabase = React.useMemo(() => supabaseBrowser(), []);

  // Define state variables
  const [loading, setLoading] = React.useState(false);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [topicName, setTopicName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  // State for category popover and selection
  const [catPopoverOpen, setCatPopoverOpen] = React.useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string | null>(null);
  const [categoryInput, setCategoryInput] = React.useState("");

  // Fetch categories when dialog opens
  React.useEffect(() => {
    if (!open) return;
    (async () => {
      setError(null);
      // Get current authenticated user
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

      if (error) setError(error.message);
      else setCategories(data || []);
    })();
  }, [open, supabase]);

  // Update category input when a category is selected
  React.useEffect(() => {
    if (!selectedCategoryId) return;
    const found = categories.find((c) => c.id === selectedCategoryId);
    if (found) setCategoryInput(found.name);
  }, [selectedCategoryId, categories]);

  // Reset form state
  const reset = () => {
    setTopicName("");
    setSelectedCategoryId(null);
    setCategoryInput("");
    setError(null);
    setCatPopoverOpen(false);
  };

  // Ensure category exists or create a new one
  const ensureCategory = async (): Promise<{ id: string | null; name: string }> => {
    const typed = categoryInput.trim();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("You must be signed in.");

    // If a category is selected from the list, use it
    if (selectedCategoryId) {
      const found = categories.find((c) => c.id === selectedCategoryId);
      return { id: selectedCategoryId, name: (found?.name ?? typed) || "Uncategorized" };
    }

    // If user typed a new category name, create it
    if (typed) {
      const existingByName = categories.find(
        (c) => c.name.toLowerCase() === typed.toLowerCase()
      );
      // If a category with the same name exists, use it
      if (existingByName) {
        setSelectedCategoryId(existingByName.id);
        return { id: existingByName.id, name: existingByName.name };
      }

      // Create a new category and insert into the database
      const { data: insertedCat, error: insertErr } = await supabase
        .from("categories")
        .insert({ name: typed, user_id: user.id })
        .select("id,name")
        .single();

      // Handle insertion error
      if (insertErr) {
        const { data: foundCat } = await supabase
          .from("categories")
          .select("id,name")
          .eq("name", typed)
          .eq("user_id", user.id)
          .single();

        // If a category with the same name exists, use it
        if (foundCat) return { id: foundCat.id, name: foundCat.name };
        throw insertErr;
      }

      // Return the newly created category
      return { id: insertedCat?.id ?? null, name: insertedCat?.name ?? typed };
    }

    // Default to "General" category if none specified
    return { id: null, name: "General" };
  };

  // Handle topic creation
  const handleCreate = async () => {
    if (!topicName.trim()) return setError("Please enter a topic name.");
    setLoading(true);
    setError(null);

    try {
      // Get current authenticated user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be signed in.");

      // Ensure category exists or create a new one
      const { id: categoryId, name: categoryName } = await ensureCategory();

      // Insert new topic into the database
      const { data: topic, error: topicErr } = await supabase
        .from("topics")
        .insert({
          user_id: user.id,
          name: topicName.trim(),
          category_id: categoryId,
          status: "active",
        })
        .select("id,name,category_id")
        .single();
      if (topicErr || !topic) throw topicErr;

      // Initialize topic summaries with "pending" status
      await supabase.from("topic_summaries").insert([
        { topic_id: topic.id, type: "short",        status: "pending" },
        { topic_id: topic.id, type: "long",         status: "pending" },
        { topic_id: topic.id, type: "key_concepts", status: "pending" },
      ]);

      // Notify parent component of the new topic
      onCreated({
        topicId: topic.id,
        topicName: topic.name,
        categoryId: topic.category_id,
        categoryName,
      });

      // Redirect to the topic's upload page
      router.push(`/topics/${encodeURIComponent(topic.id)}/upload`);

      reset();
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message ?? "Failed to create topic.");
    } finally {
      setLoading(false);
    }
  };

  // Filter categories based on user input
  const filtered = React.useMemo(() => {
    const q = categoryInput.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, categoryInput]);

  // Determine if "create new category" option should be shown
  const showCreateNew =
    categoryInput.trim().length > 0 &&
    !categories.some((c) => c.name.toLowerCase() === categoryInput.trim().toLowerCase());

    // Render the dialog component
  return (
    <Dialog
      open={open}
      onOpenChange={(val) => {
        onOpenChange(val);
        if (!val) reset();
      }}
    >
      {/* Dialog content */}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new Topic</DialogTitle>
          <DialogDescription>
            You’ll go to file upload after creating the topic.
          </DialogDescription>
        </DialogHeader>

        {/* Form fields */}
        <div className="space-y-4">
          <div>
            <Label className="mb-2" htmlFor="topic-name">Topic name</Label>
            <Input
              id="topic-name"
              placeholder="e.g. Academic Papers for Literature Review"
              value={topicName}
              onChange={(e) => setTopicName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Category selection */}
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
                >
                  {categoryInput ? categoryInput : "Search or create a category"}
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>

              {/* Popover content */}
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
                    }}
                  />
                  <CommandList>
                    <CommandEmpty>No categories found.</CommandEmpty>

                    {/* Category creation and selection */}
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
                            }}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                selectedCategoryId === c.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            {c.name}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}

                    {showCreateNew && (
                      <>
                        <CommandSeparator />
                        <CommandGroup>
                          <CommandItem
                            value={`__create__${categoryInput}`}
                            onSelect={() => {
                              setSelectedCategoryId(null); // create new on submit
                              setCatPopoverOpen(false);
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

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        {/* Dialog footer with action buttons */}
        <DialogFooter className="mt-8">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create &amp; go to Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
