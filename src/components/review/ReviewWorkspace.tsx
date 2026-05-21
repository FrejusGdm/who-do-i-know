"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Archive, Save, Search, UserCheck, UserRound, X } from "lucide-react";

export type ReviewPerson = {
  id: string;
  name: string;
  primaryEmail: string;
  phone: string | null;
  instagramUrl: string | null;
  linkedInUrl: string | null;
  websiteUrl: string | null;
  organization: string | null;
  role: string | null;
  relationshipType: string;
  reviewStatus: string;
  manualNotes: string | null;
  lastContactedAt: string | null;
  importanceScore: number;
  summary: string | null;
  mentorSignalScore: number | null;
};

type Draft = Pick<
  ReviewPerson,
  | "name"
  | "primaryEmail"
  | "phone"
  | "instagramUrl"
  | "linkedInUrl"
  | "websiteUrl"
  | "organization"
  | "role"
  | "relationshipType"
  | "reviewStatus"
  | "manualNotes"
>;

const relationshipTypes = [
  "mentor",
  "friend",
  "advisor",
  "classmate",
  "professor",
  "teaching_assistant",
  "student",
  "colleague",
  "professional",
  "recruiter",
  "weak_tie",
  "family",
  "other",
  "unknown",
];

const reviewStatuses = ["new", "needs_review", "confirmed", "not_mentor", "archived"];

function toDraft(person: ReviewPerson): Draft {
  return {
    name: person.name,
    primaryEmail: person.primaryEmail,
    phone: person.phone,
    instagramUrl: person.instagramUrl,
    linkedInUrl: person.linkedInUrl,
    websiteUrl: person.websiteUrl,
    organization: person.organization,
    role: person.role,
    relationshipType: person.relationshipType,
    reviewStatus: person.reviewStatus,
    manualNotes: person.manualNotes,
  };
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

function formatDate(value: string | null) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function ReviewWorkspace({ initialPeople }: { initialPeople: ReviewPerson[] }) {
  const [people, setPeople] = useState(initialPeople);
  const [selectedId, setSelectedId] = useState(initialPeople[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [draft, setDraft] = useState<Draft | null>(initialPeople[0] ? toDraft(initialPeople[0]) : null);
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredPeople = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return people.filter((person) => {
      if (statusFilter === "active" && person.reviewStatus === "archived") return false;
      if (statusFilter !== "active" && person.reviewStatus !== statusFilter) return false;
      if (!normalizedQuery) return true;
      return [
        person.name,
        person.primaryEmail,
        person.organization,
        person.role,
        person.relationshipType,
        person.reviewStatus,
        person.summary,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [people, query, statusFilter]);

  const selectedIndex = Math.max(0, filteredPeople.findIndex((person) => person.id === selectedId));
  const selected = filteredPeople[selectedIndex] ?? filteredPeople[0] ?? null;

  useEffect(() => {
    if (!selected) {
      setSelectedId("");
      setDraft(null);
      return;
    }
    if (selected.id !== selectedId) {
      setSelectedId(selected.id);
      setDraft(toDraft(selected));
    }
  }, [selected, selectedId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tagName = document.activeElement?.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") return;
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        selectOffset(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        selectOffset(1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const selectPerson = (person: ReviewPerson) => {
    setSelectedId(person.id);
    setDraft(toDraft(person));
    setMessage("");
  };

  const selectOffset = (offset: number) => {
    if (filteredPeople.length === 0) return;
    const currentIndex = filteredPeople.findIndex((person) => person.id === selectedId);
    const safeIndex = currentIndex === -1 ? 0 : currentIndex;
    const nextIndex = Math.min(filteredPeople.length - 1, Math.max(0, safeIndex + offset));
    selectPerson(filteredPeople[nextIndex]);
  };

  const updateDraft = (field: keyof Draft, value: string) => {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  };

  const save = (action?: "mentor" | "friend" | "not_mentor" | "archive") => {
    if (!selected || !draft) return;
    setMessage("");
    startTransition(async () => {
      const payload = action
        ? { ...draft, action, archivedReason: action === "archive" ? "Archived from review sheet" : undefined }
        : draft;
      const response = await fetch(`/api/people/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Could not save this person.");
        return;
      }
      setPeople((current) => current.map((person) => (person.id === selected.id ? { ...person, ...data.person } : person)));
      setDraft(toDraft({ ...selected, ...data.person }));
      setMessage(action ? `Marked as ${action.replace("_", " ")}.` : "Saved.");
    });
  };

  return (
    <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_440px]">
      <section className="min-w-0">
        <div className="flex flex-col gap-3 border-b border-neutral-200 pb-4 lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search people, topics, organizations"
              className="h-11 w-full border border-neutral-300 pl-10 pr-3 text-sm outline-none focus:border-neutral-950"
            />
          </label>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-11 border border-neutral-300 bg-white px-3 text-sm capitalize outline-none focus:border-neutral-950"
          >
            <option value="active">active</option>
            {reviewStatuses.map((status) => (
              <option key={status} value={status}>
                {formatStatus(status)}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => selectOffset(-1)}
              className="inline-flex h-11 w-11 items-center justify-center border border-neutral-300 hover:border-neutral-950"
              aria-label="Previous person"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => selectOffset(1)}
              className="inline-flex h-11 w-11 items-center justify-center border border-neutral-300 hover:border-neutral-950"
              aria-label="Next person"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-hidden border border-neutral-200">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-neutral-50 text-left text-neutral-500">
              <tr>
                <th className="px-3 py-3 font-medium">Person</th>
                <th className="px-3 py-3 font-medium">Relationship</th>
                <th className="px-3 py-3 font-medium">Review</th>
                <th className="px-3 py-3 font-medium">Signal</th>
                <th className="px-3 py-3 font-medium">Last contact</th>
                <th className="px-3 py-3 font-medium">Summary</th>
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map((person) => {
                const active = person.id === selected?.id;
                return (
                  <tr
                    key={person.id}
                    onClick={() => selectPerson(person)}
                    className={active ? "cursor-pointer border-t border-neutral-200 bg-neutral-950 text-white" : "cursor-pointer border-t border-neutral-200 hover:bg-neutral-50"}
                  >
                    <td className="px-3 py-3">
                      <p className="font-semibold">{person.name}</p>
                      <p className={active ? "text-neutral-300" : "text-neutral-500"}>{person.primaryEmail}</p>
                    </td>
                    <td className="px-3 py-3 capitalize">{formatStatus(person.relationshipType)}</td>
                    <td className="px-3 py-3 capitalize">{formatStatus(person.reviewStatus)}</td>
                    <td className="px-3 py-3">{person.mentorSignalScore ?? person.importanceScore}</td>
                    <td className="px-3 py-3">{formatDate(person.lastContactedAt)}</td>
                    <td className="max-w-sm px-3 py-3">
                      <p className="line-clamp-2">{person.summary ?? "No summary yet."}</p>
                    </td>
                  </tr>
                );
              })}
              {filteredPeople.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-neutral-500">
                    No people match this review filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <aside className="border border-neutral-200 p-5">
        {selected && draft ? (
          <>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-neutral-500">
                  {filteredPeople.length ? `${selectedIndex + 1} / ${filteredPeople.length}` : "0 / 0"}
                </p>
                <h2 className="mt-2 text-3xl font-semibold tracking-tight">{selected.name}</h2>
                <p className="mt-2 text-sm text-neutral-500">{selected.summary ?? "No summary yet."}</p>
              </div>
              <Link href={`/people/${selected.id}`} className="text-sm font-medium text-neutral-500 hover:text-neutral-950">
                Profile
              </Link>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => save("mentor")} disabled={isPending} className="inline-flex h-10 items-center justify-center gap-2 bg-neutral-950 px-3 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50">
                <UserCheck className="h-4 w-4" />
                Mentor
              </button>
              <button type="button" onClick={() => save("friend")} disabled={isPending} className="inline-flex h-10 items-center justify-center gap-2 border border-neutral-300 px-3 text-sm font-medium hover:border-neutral-950 disabled:opacity-50">
                <UserRound className="h-4 w-4" />
                Friend
              </button>
              <button type="button" onClick={() => save("not_mentor")} disabled={isPending} className="inline-flex h-10 items-center justify-center gap-2 border border-neutral-300 px-3 text-sm font-medium hover:border-neutral-950 disabled:opacity-50">
                <X className="h-4 w-4" />
                Not a mentor
              </button>
              <button type="button" onClick={() => save("archive")} disabled={isPending} className="inline-flex h-10 items-center justify-center gap-2 border border-neutral-200 px-3 text-sm font-medium text-neutral-500 hover:border-neutral-500 hover:text-neutral-950 disabled:opacity-50">
                <Archive className="h-4 w-4" />
                Archive
              </button>
            </div>

            <div className="mt-6 space-y-4">
              <Field label="Name" value={draft.name} onChange={(value) => updateDraft("name", value)} />
              <Field label="Primary email" value={draft.primaryEmail} onChange={(value) => updateDraft("primaryEmail", value)} />
              <Field label="Phone" value={draft.phone ?? ""} onChange={(value) => updateDraft("phone", value)} />
              <Field label="Instagram" value={draft.instagramUrl ?? ""} onChange={(value) => updateDraft("instagramUrl", value)} />
              <Field label="LinkedIn" value={draft.linkedInUrl ?? ""} onChange={(value) => updateDraft("linkedInUrl", value)} />
              <Field label="Website" value={draft.websiteUrl ?? ""} onChange={(value) => updateDraft("websiteUrl", value)} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Organization" value={draft.organization ?? ""} onChange={(value) => updateDraft("organization", value)} />
                <Field label="Role" value={draft.role ?? ""} onChange={(value) => updateDraft("role", value)} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Relationship" value={draft.relationshipType} options={relationshipTypes} onChange={(value) => updateDraft("relationshipType", value)} />
                <SelectField label="Review status" value={draft.reviewStatus} options={reviewStatuses} onChange={(value) => updateDraft("reviewStatus", value)} />
              </div>
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Private notes</span>
                <textarea
                  value={draft.manualNotes ?? ""}
                  onChange={(event) => updateDraft("manualNotes", event.target.value)}
                  rows={6}
                  className="mt-2 w-full resize-none border border-neutral-300 px-3 py-2 text-sm leading-6 outline-none focus:border-neutral-950"
                />
              </label>
            </div>

            <button
              type="button"
              onClick={() => save()}
              disabled={isPending}
              className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 bg-neutral-950 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save
            </button>
            {message && <p className="mt-3 text-sm text-neutral-500">{message}</p>}
          </>
        ) : (
          <p className="text-sm text-neutral-500">No person selected.</p>
        )}
      </aside>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full border border-neutral-300 px-3 text-sm outline-none focus:border-neutral-950"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 h-10 w-full border border-neutral-300 bg-white px-3 text-sm capitalize outline-none focus:border-neutral-950"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {formatStatus(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
