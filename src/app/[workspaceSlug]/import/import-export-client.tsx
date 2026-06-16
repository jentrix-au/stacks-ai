"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, FileUp, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { parseCsv } from "@/lib/csv";
import {
  importContactsApply,
  importContactsPreview,
  importTasksApply,
  importTasksPreview,
  importTrelloBoard,
} from "@/server/actions/imports";

interface BoardOption {
  id: string;
  name: string;
  slug: string;
  columns: { id: string; name: string }[];
}

const selectCls =
  "border-input bg-transparent h-8 rounded-md border px-2 text-sm";

const NONE = "__none__";

function MappingSelect({
  label,
  headers,
  value,
  onChange,
}: {
  label: string;
  headers: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="text-muted-foreground w-24 shrink-0 text-xs">
        {label}
      </span>
      <select
        aria-label={`${label} column`}
        className={selectCls + " flex-1"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value={NONE}>—</option>
        {headers.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
    </label>
  );
}

function pick(
  row: Record<string, string>,
  column: string,
): string | undefined {
  if (column === NONE) return undefined;
  const v = row[column]?.trim();
  return v ? v : undefined;
}

/** Parse a CSV file into header-keyed records. */
async function readCsvFile(
  file: File,
): Promise<{ headers: string[]; records: Record<string, string>[] }> {
  const text = await file.text();
  const rows = parseCsv(text).filter((r) => r.some((c) => c.trim() !== ""));
  if (rows.length < 2) throw new Error("CSV needs a header row and data rows");
  const [headers, ...data] = rows;
  return {
    headers,
    records: data.map((r) =>
      Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])),
    ),
  };
}

export function ImportExportClient({
  workspaceId,
  workspaceSlug,
  boards,
}: {
  workspaceId: string;
  workspaceSlug: string;
  boards: BoardOption[];
}) {
  const router = useRouter();

  return (
    <div className="mt-8 space-y-4">
      <ExportSection workspaceId={workspaceId} boards={boards} />
      <ContactsImport workspaceId={workspaceId} workspaceSlug={workspaceSlug} />
      <TasksImport boards={boards} />
      <TrelloImport
        workspaceId={workspaceId}
        onImported={(slug) => router.push(`/${workspaceSlug}/board/${slug}`)}
      />
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border bg-card rounded-xl border p-4">
      <h2 className="flex items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-4" />
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function ExportSection({
  workspaceId,
  boards,
}: {
  workspaceId: string;
  boards: BoardOption[];
}) {
  const [boardId, setBoardId] = useState("");
  const qs = (format: string) =>
    `/api/export?workspaceId=${workspaceId}${boardId ? `&boardId=${boardId}` : ""}&format=${format}`;
  return (
    <Section title="Export" icon={Download}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Export scope"
          className={selectCls}
          value={boardId}
          onChange={(e) => setBoardId(e.target.value)}
        >
          <option value="">Whole workspace</option>
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <a
          href={qs("csv")}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          CSV
        </a>
        <a
          href={qs("json")}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          JSON
        </a>
      </div>
    </Section>
  );
}

function ContactsImport({
  workspaceId,
  workspaceSlug,
}: {
  workspaceId: string;
  workspaceSlug: string;
}) {
  const router = useRouter();
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState({
    name: NONE,
    email: NONE,
    phone: NONE,
    company: NONE,
    externalId: NONE,
  });
  const [preview, setPreview] = useState<{
    create: number;
    update: number;
    skipped: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    try {
      const parsed = await readCsvFile(file);
      setHeaders(parsed.headers);
      setRecords(parsed.records);
      setPreview(null);
      // Auto-map exact header matches.
      const auto = { ...map };
      for (const key of Object.keys(auto) as (keyof typeof auto)[]) {
        const hit = parsed.headers.find(
          (h) => h.toLowerCase() === key.toLowerCase(),
        );
        if (hit) auto[key] = hit;
      }
      setMap(auto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  }

  function buildRows() {
    const rows = [];
    let skipped = 0;
    for (const record of records) {
      const name = pick(record, map.name);
      if (!name) {
        skipped += 1;
        continue;
      }
      const email = pick(record, map.email);
      rows.push({
        name,
        email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null,
        phone: pick(record, map.phone) ?? null,
        company: pick(record, map.company) ?? null,
        externalId: pick(record, map.externalId) ?? null,
      });
    }
    return { rows, skipped };
  }

  async function dryRun() {
    const { rows, skipped } = buildRows();
    if (rows.length === 0) {
      toast.error("No importable rows — map the Name column");
      return;
    }
    setBusy(true);
    try {
      const plan = await importContactsPreview({ workspaceId, rows });
      setPreview({ create: plan.create, update: plan.update, skipped });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dry run failed");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    const { rows } = buildRows();
    setBusy(true);
    try {
      const result = await importContactsApply({ workspaceId, rows });
      toast.success(
        `Imported ${result.created} new, updated ${result.updated}.`,
      );
      setPreview(null);
      setRecords([]);
      setHeaders([]);
      router.push(`/${workspaceSlug}/contacts`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import people (CSV)" icon={Upload}>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Contacts CSV file"
        className="text-sm"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {headers.length > 0 && (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <MappingSelect
              label="Name *"
              headers={headers}
              value={map.name}
              onChange={(v) => setMap((m) => ({ ...m, name: v }))}
            />
            <MappingSelect
              label="Email"
              headers={headers}
              value={map.email}
              onChange={(v) => setMap((m) => ({ ...m, email: v }))}
            />
            <MappingSelect
              label="Phone"
              headers={headers}
              value={map.phone}
              onChange={(v) => setMap((m) => ({ ...m, phone: v }))}
            />
            <MappingSelect
              label="Company"
              headers={headers}
              value={map.company}
              onChange={(v) => setMap((m) => ({ ...m, company: v }))}
            />
            <MappingSelect
              label="External id"
              headers={headers}
              value={map.externalId}
              onChange={(v) => setMap((m) => ({ ...m, externalId: v }))}
            />
          </div>
          <p className="text-muted-foreground text-xs">
            {records.length} data row{records.length === 1 ? "" : "s"} ·
            idempotent by external id, then email — matches update instead of
            duplicating.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={dryRun} disabled={busy}>
              Dry run
            </Button>
            {preview && (
              <>
                <span data-testid="contacts-dry-run" className="text-sm">
                  {preview.create} to create · {preview.update} to update
                  {preview.skipped > 0 && ` · ${preview.skipped} skipped`}
                </span>
                <Button size="sm" onClick={apply} disabled={busy}>
                  Import
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

function TasksImport({ boards }: { boards: BoardOption[] }) {
  const [headers, setHeaders] = useState<string[]>([]);
  const [records, setRecords] = useState<Record<string, string>[]>([]);
  const [boardId, setBoardId] = useState(boards[0]?.id ?? "");
  const board = boards.find((b) => b.id === boardId);
  const [columnId, setColumnId] = useState(board?.columns[0]?.id ?? "");
  const [map, setMap] = useState({ title: NONE, description: NONE });
  const [skipExisting, setSkipExisting] = useState(true);
  const [preview, setPreview] = useState<{
    create: number;
    skippedExisting: number;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    try {
      const parsed = await readCsvFile(file);
      setHeaders(parsed.headers);
      setRecords(parsed.records);
      setPreview(null);
      const auto = { ...map };
      for (const key of Object.keys(auto) as (keyof typeof auto)[]) {
        const hit = parsed.headers.find(
          (h) => h.toLowerCase() === key.toLowerCase(),
        );
        if (hit) auto[key] = hit;
      }
      setMap(auto);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file");
    }
  }

  function buildRows() {
    return records
      .map((r) => ({
        title: pick(r, map.title) ?? "",
        description: pick(r, map.description) ?? null,
      }))
      .filter((r) => r.title.length > 0)
      .map((r) => ({ ...r, title: r.title.slice(0, 200) }));
  }

  async function dryRun() {
    const rows = buildRows();
    if (!columnId || rows.length === 0) {
      toast.error("Pick a column and map the Title column");
      return;
    }
    setBusy(true);
    try {
      const plan = await importTasksPreview({
        columnId,
        rows,
        skipExistingTitles: skipExisting,
      });
      setPreview(plan);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Dry run failed");
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      const result = await importTasksApply({
        columnId,
        rows: buildRows(),
        skipExistingTitles: skipExisting,
      });
      toast.success(
        `Created ${result.created} task${result.created === 1 ? "" : "s"}.`,
      );
      setPreview(null);
      setRecords([]);
      setHeaders([]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import tasks (CSV)" icon={Upload}>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Target board"
          className={selectCls}
          value={boardId}
          onChange={(e) => {
            setBoardId(e.target.value);
            const next = boards.find((b) => b.id === e.target.value);
            setColumnId(next?.columns[0]?.id ?? "");
          }}
        >
          {boards.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Target column"
          className={selectCls}
          value={columnId}
          onChange={(e) => setColumnId(e.target.value)}
        >
          {(board?.columns ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <input
        type="file"
        accept=".csv,text/csv"
        aria-label="Tasks CSV file"
        className="text-sm"
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
      {headers.length > 0 && (
        <>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <MappingSelect
              label="Title *"
              headers={headers}
              value={map.title}
              onChange={(v) => setMap((m) => ({ ...m, title: v }))}
            />
            <MappingSelect
              label="Description"
              headers={headers}
              value={map.description}
              onChange={(v) => setMap((m) => ({ ...m, description: v }))}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="skip-existing"
              checked={skipExisting}
              onCheckedChange={(v) => setSkipExisting(v === true)}
            />
            <Label
              htmlFor="skip-existing"
              className="text-muted-foreground text-xs font-normal"
            >
              Skip rows whose title already exists on the board (idempotent
              re-runs)
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={dryRun} disabled={busy}>
              Dry run
            </Button>
            {preview && (
              <>
                <span data-testid="tasks-dry-run" className="text-sm">
                  {preview.create} to create
                  {preview.skippedExisting > 0 &&
                    ` · ${preview.skippedExisting} already exist`}
                </span>
                <Button size="sm" onClick={apply} disabled={busy}>
                  Import
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

interface TrelloExport {
  name?: string;
  lists?: { id: string; name: string; closed?: boolean }[];
  cards?: {
    idList: string;
    name: string;
    desc?: string;
    due?: string | null;
    closed?: boolean;
  }[];
}

/** Map a Trello board export (JSON) onto our import shape. */
export function mapTrelloExport(raw: TrelloExport): {
  name: string;
  lists: {
    name: string;
    cards: { name: string; desc?: string; due?: string | null }[];
  }[];
} | null {
  if (!raw.lists?.length) return null;
  const lists = raw.lists
    .filter((l) => !l.closed)
    .map((l) => ({
      name: l.name,
      cards: (raw.cards ?? [])
        .filter((c) => c.idList === l.id && !c.closed)
        .map((c) => ({
          name: c.name,
          desc: c.desc || undefined,
          due: c.due ?? null,
        })),
    }));
  if (lists.length === 0) return null;
  return { name: raw.name?.trim() || "Imported board", lists };
}

function TrelloImport({
  workspaceId,
  onImported,
}: {
  workspaceId: string;
  onImported: (boardSlug: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text()) as TrelloExport;
      const mapped = mapTrelloExport(raw);
      if (!mapped) {
        toast.error("That doesn't look like a Trello board export");
        return;
      }
      const result = await importTrelloBoard({ workspaceId, ...mapped });
      toast.success(
        `Imported ${result.cards} cards into ${result.columns} columns.`,
      );
      onImported(result.boardSlug);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Trello import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="Import a Trello board (JSON)" icon={FileUp}>
      <p className="text-muted-foreground text-xs">
        Trello → board menu → Print and export → Export as JSON. Lists become
        columns, cards become tasks.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        aria-label="Trello JSON file"
        className="text-sm"
        disabled={busy}
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
      />
    </Section>
  );
}
