import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Building2,
  CheckCircle2,
  ClipboardList,
  DownloadCloud,
  FileBarChart,
  Home,
  Loader2,
  LibraryBig,
  LogOut,
  PhoneOutgoing,
  ScrollText,
  Settings,
  Sparkles,
  SwatchBook,
  Ticket as TicketIcon,
} from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { logAuthEventAuthed } from "@/lib/auth/audit.functions";
import { useIsAdmin } from "@/lib/auth/role-context";
import { purgeLocalAppData } from "@/lib/purge-local-data";
import { setTheme, useTheme } from "@/lib/settings/theme-store";
import { accountsStore, useAccounts } from "@/lib/accounts-store";
import { ticketsStore, useTickets, type Ticket } from "@/lib/tickets-store";
import { openCopilot } from "@/components/workspace/CopilotSheet";

const PAGES = [
  { title: "Home", url: "/", icon: Home },
  { title: "Freshdesk Tickets", url: "/freshdesk-tickets", icon: TicketIcon },
  { title: "Freshdesk Intelligence", url: "/freshdesk-intelligence", icon: Sparkles },
  { title: "Knowledge Vault", url: "/knowledge-vault", icon: LibraryBig },
  { title: "Contact Dispatch", url: "/contact-dispatch", icon: PhoneOutgoing },
  { title: "Additional Work", url: "/additional-work", icon: ClipboardList },
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Completed Work", url: "/completed-work", icon: CheckCircle2 },
  { title: "Reports", url: "/reports", icon: FileBarChart },
] as const;

const ADMIN_PAGES = [
  { title: "Audit Log", url: "/audit-log", icon: ScrollText },
  { title: "Settings", url: "/settings", icon: Settings },
] as const;

function matchTickets(tickets: Ticket[], query: string): Ticket[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return tickets
    .filter(
      (t) =>
        t.number.includes(q) ||
        t.details.subject.toLowerCase().includes(q) ||
        t.accountNumber.includes(q) ||
        t.accountName.toLowerCase().includes(q),
    )
    .slice(0, 6);
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pulling, setPulling] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const isAdmin = useIsAdmin();
  const theme = useTheme();
  const { tickets } = useTickets();
  useAccounts(); // re-render on account changes so search results stay fresh

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setPulling(false);
    }
  }, [open]);

  const pages = isAdmin ? [...PAGES, ...ADMIN_PAGES] : [...PAGES];
  const matchedTickets = useMemo(
    () => (query ? matchTickets(tickets, query) : ticketsStore.getRecent().slice(0, 4)),
    [tickets, query],
  );
  const matchedAccounts = useMemo(
    () => (query ? accountsStore.search(query) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, open],
  );

  const digits = query.trim().replace(/^#/, "");
  const pullable = /^\d{3,8}$/.test(digits) && !tickets.some((t) => t.number === digits);

  function close() {
    setOpen(false);
  }

  async function pullTicket() {
    if (pulling) return;
    setPulling(true);
    const res = await ticketsStore.pullFromFreshdesk(digits);
    setPulling(false);
    if (!res.ticket) {
      if (res.notConnected) {
        toast.error("Freshdesk isn't connected. Add credentials in Settings.");
      } else {
        toast.error(res.error ?? `Ticket #${digits} not found in Freshdesk.`);
      }
      return;
    }
    toast.success(`Pulled ticket #${res.ticket.number}.`);
    close();
    navigate({ to: "/freshdesk-tickets/$ticketId/work", params: { ticketId: res.ticket.id } });
  }

  async function signOut() {
    close();
    try {
      await logAuthEventAuthed({ data: { type: "logout" } });
    } catch {
      /* ignore */
    }
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    purgeLocalAppData();
    window.location.replace("/auth");
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Jump to a page, ticket, or account…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>

        {pullable && (
          <CommandGroup heading="Freshdesk">
            <CommandItem
              value={`${digits} pull ticket freshdesk`}
              onSelect={() => void pullTicket()}
            >
              {pulling ? (
                <Loader2 className="animate-spin" />
              ) : (
                <DownloadCloud style={{ color: "var(--cyan-glow)" }} />
              )}
              Pull ticket #{digits} from Freshdesk
            </CommandItem>
          </CommandGroup>
        )}

        {matchedTickets.length > 0 && (
          <CommandGroup heading={query ? "Tickets" : "Recent Tickets"}>
            {matchedTickets.map((t) => (
              <CommandItem
                key={t.id}
                value={`${t.number} ${t.details.subject} ${t.accountNumber} ${t.accountName}`}
                onSelect={() => {
                  close();
                  navigate({
                    to: "/freshdesk-tickets/$ticketId/work",
                    params: { ticketId: t.id },
                  });
                }}
              >
                <TicketIcon />
                <span className="font-mono text-xs text-muted-foreground">#{t.number}</span>
                <span className="truncate">{t.details.subject || "Untitled ticket"}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matchedAccounts.length > 0 && (
          <CommandGroup heading="Accounts">
            {matchedAccounts.map((a) => (
              <CommandItem
                key={a.number}
                value={`${a.number} ${a.name} account`}
                onSelect={() => {
                  close();
                  navigate({ to: "/accounts/$accountNumber", params: { accountNumber: a.number } });
                }}
              >
                <Building2 />
                <span className="font-mono text-xs text-muted-foreground">{a.number}</span>
                <span className="truncate">{a.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Pages">
          {pages.map((p) => (
            <CommandItem
              key={p.url}
              value={`${p.title} page go to`}
              onSelect={() => {
                close();
                navigate({ to: p.url });
              }}
            >
              <p.icon />
              {p.title}
            </CommandItem>
          ))}
        </CommandGroup>

        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="ask intel copilot ai assistant question"
            onSelect={() => {
              close();
              openCopilot();
            }}
          >
            <Sparkles style={{ color: "var(--cyan-glow)" }} />
            Ask Intel Copilot
          </CommandItem>
          <CommandItem
            value="switch theme quantum bloom blueverse"
            onSelect={() => {
              setTheme(theme === "blueverse" ? "quantum-bloom" : "blueverse");
              close();
            }}
          >
            <SwatchBook />
            Switch theme to {theme === "blueverse" ? "Quantum Bloom" : "BlueVerse"}
          </CommandItem>
          <CommandItem value="sign out log out secure" onSelect={() => void signOut()}>
            <LogOut />
            Sign out
            <CommandShortcut>secure</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
