import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
import FontFamily from "@tiptap/extension-font-family";
import Placeholder from "@tiptap/extension-placeholder";
import { Mark, mergeAttributes } from "@tiptap/core";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Highlighter,
  Palette,
  Eraser,
  Type,
  BookmarkPlus,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Toggle } from "@/components/ui/toggle";
import { Input } from "@/components/ui/input";
import { MoreHorizontal } from "lucide-react";
import {
  useSnippets,
  snippetsActions,
  type SnippetScope,
} from "@/lib/settings/snippets-store";

// ── Custom FontSize mark (Tiptap has no built-in) ────────────────────────────
const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (el) => (el as HTMLElement).style.fontSize || null,
        renderHTML: (attrs) => {
          if (!attrs.fontSize) return {};
          return { style: `font-size: ${attrs.fontSize}` };
        },
      },
    };
  },
  addCommands() {
    return {
      ...this.parent?.(),
      setFontSize:
        (size: string) =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize: size }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize: null }).removeEmptyTextStyle().run(),
    };
  },
}) as unknown as Mark;

const FONT_FAMILIES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "Sans (Inter)", value: "Inter Var, Inter, system-ui, sans-serif" },
  { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
  { label: "Mono", value: "'JetBrains Mono Var', ui-monospace, monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Courier New", value: "'Courier New', monospace" },
];

const FONT_SIZES: { label: string; value: string }[] = [
  { label: "Default", value: "" },
  { label: "12", value: "12px" },
  { label: "14", value: "14px" },
  { label: "16", value: "16px" },
  { label: "18", value: "18px" },
  { label: "20", value: "20px" },
  { label: "24", value: "24px" },
  { label: "32", value: "32px" },
];

const COLOR_SWATCHES = [
  "#000000",
  "#525252",
  "#a3a3a3",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#0ea5e9",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#ffffff",
];

const HIGHLIGHT_SWATCHES = [
  "#fef08a",
  "#fed7aa",
  "#fecaca",
  "#bbf7d0",
  "#bae6fd",
  "#e9d5ff",
  "#fbcfe8",
  "#e5e7eb",
];

function ColorSwatchPicker({
  swatches,
  onPick,
  onClear,
  title,
}: {
  swatches: string[];
  onPick: (c: string) => void;
  onClear: () => void;
  title: string;
}) {
  const [custom, setCustom] = React.useState("#000000");
  return (
    <div className="w-52 space-y-2 p-1">
      <div className="text-xs font-medium text-muted-foreground">{title}</div>
      <div className="grid grid-cols-6 gap-1">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="h-6 w-6 rounded border border-border hover:ring-2 hover:ring-ring"
            style={{ background: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="h-7 w-10 cursor-pointer rounded border border-input bg-transparent"
        />
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => onPick(custom)}>
          Apply
        </Button>
        <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onClear}>
          Clear
        </Button>
      </div>
    </div>
  );
}

/** Snippet picker: insert a saved block, or save the current selection. */
function SnippetMenu({ editor, scope }: { editor: Editor; scope: SnippetScope }) {
  const snippets = useSnippets(scope);
  const [open, setOpen] = React.useState(false);
  const [title, setTitle] = React.useState("");

  const insert = (id: string, html: string) => {
    editor.chain().focus().insertContent(html).run();
    snippetsActions.markUsed(id);
    setOpen(false);
  };

  const saveSelection = () => {
    const { from, to } = editor.state.selection;
    const html =
      from === to
        ? editor.getHTML()
        : (() => {
            const slice = editor.state.doc.slice(from, to);
            const div = document.createElement("div");
            div.textContent = slice.content.textBetween(0, slice.content.size, "\n");
            return `<p>${div.innerHTML.replace(/\n/g, "</p><p>")}</p>`;
          })();
    if (!html || html === "<p></p>") return;
    snippetsActions.add({ title: title || "Untitled snippet", html, scope });
    setTitle("");
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" aria-label="Snippets">
          <BookmarkPlus className="mr-1 h-3.5 w-3.5" />
          Snippets
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div className="mb-2 text-xs font-medium text-muted-foreground">Insert a snippet</div>
        <div className="max-h-56 space-y-1 overflow-y-auto">
          {snippets.length === 0 && (
            <div className="px-1 py-2 text-xs text-muted-foreground">
              No snippets yet. Save one below.
            </div>
          )}
          {snippets.map((s) => (
            <div key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => insert(s.id, s.html)}
                className="flex-1 truncate rounded px-2 py-1 text-left text-xs hover:bg-accent"
                title={s.title}
              >
                {s.title}
              </button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                aria-label={`Delete ${s.title}`}
                onClick={() => snippetsActions.remove(s.id)}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Separator className="my-2" />
        <div className="space-y-1.5">
          <div className="text-xs font-medium text-muted-foreground">
            Save selection (or whole box) as snippet
          </div>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Snippet name"
            className="h-7 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 w-full text-xs" onClick={saveSelection}>
            Save snippet
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Colour, font, size, clear-formatting and snippets. Rendered inline on
 *  wide screens and inside an overflow popover on narrow ones. */
function SecondaryControls({
  editor,
  snippetScope,
  stacked,
}: {
  editor: Editor;
  snippetScope?: SnippetScope;
  stacked?: boolean;
}) {
  const currentFontFamily =
    (editor.getAttributes("textStyle").fontFamily as string | undefined) ?? "";
  const currentFontSize =
    (editor.getAttributes("textStyle").fontSize as string | undefined) ?? "";

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" aria-label="Text color">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <ColorSwatchPicker
            swatches={COLOR_SWATCHES}
            title="Text color"
            onPick={(c) => editor.chain().focus().setColor(c).run()}
            onClear={() => editor.chain().focus().unsetColor().run()}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0" aria-label="Highlight">
            <Highlighter className="h-3.5 w-3.5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-auto p-2">
          <ColorSwatchPicker
            swatches={HIGHLIGHT_SWATCHES}
            title="Highlight"
            onPick={(c) => editor.chain().focus().toggleHighlight({ color: c }).run()}
            onClear={() => editor.chain().focus().unsetHighlight().run()}
          />
        </PopoverContent>
      </Popover>

      <Select
        value={currentFontFamily}
        onValueChange={(v) => {
          if (!v || v === "__default") editor.chain().focus().unsetFontFamily().run();
          else editor.chain().focus().setFontFamily(v).run();
        }}
      >
        <SelectTrigger
          aria-label="Font"
          className={cn("h-8 min-w-0 text-xs", stacked ? "w-full" : "w-[120px] shrink")}
        >
          <SelectValue placeholder="Font" />
        </SelectTrigger>
        <SelectContent>
          {FONT_FAMILIES.map((f) => (
            <SelectItem key={f.label} value={f.value || "__default"} className="text-xs">
              <span style={{ fontFamily: f.value || undefined }}>{f.label}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={currentFontSize}
        onValueChange={(v) => {
          const size = v === "__default" ? "" : v;
          if (!size) (editor.chain().focus() as any).unsetFontSize().run();
          else (editor.chain().focus() as any).setFontSize(size).run();
        }}
      >
        <SelectTrigger
          aria-label="Font size"
          className={cn("h-8 min-w-0 text-xs", stacked ? "w-full" : "w-[68px] shrink")}
        >
          <Type className="mr-1 h-3 w-3 shrink-0" />
          <SelectValue placeholder="Size" />
        </SelectTrigger>
        <SelectContent>
          {FONT_SIZES.map((s) => (
            <SelectItem key={s.label} value={s.value || "__default"} className="text-xs">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        variant="ghost"
        size="sm"
        className={cn("h-8 shrink-0 p-0", stacked ? "w-full justify-start px-2 text-xs" : "w-8")}
        aria-label="Clear formatting"
        onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
      >
        <Eraser className="h-3.5 w-3.5" />
        {stacked && <span className="ml-2">Clear formatting</span>}
      </Button>

      {snippetScope && <SnippetMenu editor={editor} scope={snippetScope} />}
    </>
  );
}

function Toolbar({ editor, snippetScope }: { editor: Editor | null; snippetScope?: SnippetScope }) {
  if (!editor) return null;

  return (
    <div className="flex w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden border-b border-input/60 bg-muted/20 px-1.5 py-1 sm:flex-wrap sm:gap-1">
      <Toggle
        size="sm"
        pressed={editor.isActive("bold")}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Bold"
        className="h-8 w-8 shrink-0 p-0"
      >
        <Bold className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("italic")}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Italic"
        className="h-8 w-8 shrink-0 p-0"
      >
        <Italic className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("underline")}
        onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
        aria-label="Underline"
        className="h-8 w-8 shrink-0 p-0"
      >
        <UnderlineIcon className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("strike")}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        aria-label="Strikethrough"
        className="hidden h-8 w-8 shrink-0 p-0 sm:inline-flex"
      >
        <Strikethrough className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

      <Toggle
        size="sm"
        pressed={editor.isActive("bulletList")}
        onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
        aria-label="Bullet list"
        className="h-8 w-8 shrink-0 p-0"
      >
        <List className="h-3.5 w-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive("orderedList")}
        onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
        aria-label="Numbered list"
        className="h-8 w-8 shrink-0 p-0"
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Toggle>

      <Separator orientation="vertical" className="mx-1 hidden h-5 sm:block" />

      {/* Wide screens: everything inline. */}
      <div className="hidden min-w-0 flex-wrap items-center gap-1 sm:flex">
        <SecondaryControls editor={editor} {...(snippetScope ? { snippetScope } : {})} />
      </div>

      {/* Narrow screens: overflow menu keeps every control reachable. */}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-8 w-8 shrink-0 p-0 sm:hidden"
            aria-label="More formatting options"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="flex w-56 flex-col gap-1.5 p-2 sm:hidden">
          <Toggle
            size="sm"
            pressed={editor.isActive("strike")}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
            aria-label="Strikethrough"
            className="h-8 w-full justify-start px-2 text-xs"
          >
            <Strikethrough className="mr-2 h-3.5 w-3.5" /> Strikethrough
          </Toggle>
          <SecondaryControls editor={editor} {...(snippetScope ? { snippetScope } : {})} stacked />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// The FontFamily select uses a synthetic "__default" value because SelectItem
// forbids empty-string values. Translate it here.
// (Handled inline above via `v || "__default"` pattern and `v === "__default"` check.)

export interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  editorClassName?: string;
  minHeight?: number | string;
  autoFocus?: boolean;
  disabled?: boolean;
  onBlur?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  toolbar?: boolean;
  /** Drops the shell chrome so a parent surface (e.g. the Copilot composer)
   *  can own the border, radius and focus treatment. */
  bare?: boolean;
  /** Enables the snippet picker in the toolbar for this kind of box. */
  snippetScope?: SnippetScope;
}

export const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(
  function RichTextEditor(
    {
      value,
      onChange,
      placeholder,
      className,
      editorClassName,
      minHeight = 96,
      autoFocus,
      disabled,
      onBlur,
      onKeyDown,
      toolbar = true,
      bare = false,
      snippetScope,
    },
    ref,
  ) {
    const editor = useEditor({
      immediatelyRender: false,
      editable: !disabled,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3, 4] } }),
        Underline,
        TextStyle,
        FontSize,
        Color,
        FontFamily,
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({ placeholder: placeholder ?? "" }),
      ],
      content: value || "",
      autofocus: autoFocus,
      onUpdate: ({ editor }) => {
        const html = editor.getHTML();
        // Tiptap renders empty content as "<p></p>"; normalize to "".
        onChange(html === "<p></p>" ? "" : html);
      },
      onBlur: () => onBlur?.(),
      editorProps: {
        attributes: {
          class: cn(
            "rich-text-content focus:outline-none px-3 py-2 w-full",
            editorClassName,
          ),
        },
      },
    });

    // Keep external value → editor in sync (only when it actually differs).
    React.useEffect(() => {
      if (!editor) return;
      const current = editor.getHTML();
      const incoming = value || "";
      const normalizedCurrent = current === "<p></p>" ? "" : current;
      if (normalizedCurrent !== incoming) {
        editor.commands.setContent(incoming || "", { emitUpdate: false });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, editor]);

    React.useEffect(() => {
      if (editor) editor.setEditable(!disabled);
    }, [editor, disabled]);

    return (
      <div
        ref={ref}
        onKeyDown={onKeyDown}
        data-slot="rich-text-editor"
        className={cn(
          "rich-text-shell flex w-full min-w-0 flex-col overflow-hidden bg-transparent",
          !bare &&
            "rounded-md border border-input shadow-sm focus-within:ring-1 focus-within:ring-ring",
          disabled && "opacity-50",
          className,
        )}
      >
        {toolbar ? <Toolbar editor={editor} {...(snippetScope ? { snippetScope } : {})} /> : null}
        <EditorContent
          editor={editor}
          className="min-w-0 flex-1"
          style={{ minHeight: typeof minHeight === "number" ? `${minHeight}px` : minHeight }}
        />
      </div>
    );
  },
);