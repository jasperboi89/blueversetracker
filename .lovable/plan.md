## Problem

In Contact Dispatch → **Add Reason**, hovering **Global Template** or **Account Template** doesn't open the submenu. The screenshot shows the parent menu with a vertical scrollbar; submenus are being clipped by the parent's overflow.

## Root cause

`src/components/ui/dropdown-menu.tsx` wraps `DropdownMenuContent` in `DropdownMenuPrimitive.Portal`, but `DropdownMenuSubContent` is **not** portaled. That means submenus render as children of the parent Content element, which has `overflow-y-auto overflow-x-hidden` and a capped `max-h-[--radix-dropdown-menu-content-available-height]`. Sub-menus open sideways and get hidden by `overflow-x-hidden`.

## Fix

Wrap `DropdownMenuSubContent` in `DropdownMenuPrimitive.Portal` (matching the shadcn default and matching how `DropdownMenuContent` is already set up).

```tsx
const DropdownMenuSubContent = React.forwardRef<...>((props, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.SubContent ref={ref} className={cn(...)} {...props} />
  </DropdownMenuPrimitive.Portal>
));
```

One-file change, no behavior change elsewhere — every existing use of `DropdownMenuSubContent` (Contact Dispatch Add Reason menu, plus any others) starts rendering the submenu into a portal above the parent so it can't be clipped.

## Verification

After the fix, opening Contact Dispatch → session → **+ Add Reason** and hovering **Global Template** / **Account Template** should reveal the submenu to the side of the parent menu.
