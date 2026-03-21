"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import type { FilterConfig, LLMProviderMode } from "@/types";

const DEFAULT_BLOCKED_DOMAINS = [
  "canvas.instructure.com",
  "mailchimp.com",
  "sendgrid.net",
  "linkedin.com",
  "facebookmail.com",
];

interface FilterPanelProps {
  onSubmit: (
    config: FilterConfig,
    providerMode: LLMProviderMode,
    byokApiKey?: string
  ) => void;
  isSubmitting: boolean;
}

export function FilterPanel({ onSubmit, isSubmitting }: FilterPanelProps) {
  const fourYearsAgo = new Date();
  fourYearsAgo.setFullYear(fourYearsAgo.getFullYear() - 4);

  const [afterDate, setAfterDate] = useState(
    fourYearsAgo.toISOString().split("T")[0]
  );
  const [blockedDomains, setBlockedDomains] = useState<string[]>(
    DEFAULT_BLOCKED_DOMAINS
  );
  const [domainInput, setDomainInput] = useState("");
  const [skipPromotions, setSkipPromotions] = useState(true);
  const [skipUpdates, setSkipUpdates] = useState(true);
  const [skipSocial, setSkipSocial] = useState(true);
  const [skipForums, setSkipForums] = useState(true);
  const [minInteractions, setMinInteractions] = useState(2);
  const [maxThreads] = useState(500);
  const [providerMode, setProviderMode] = useState<LLMProviderMode>("cloud");
  const [byokApiKey, setByokApiKey] = useState("");
  const [ollamaStatus, setOllamaStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("disconnected");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [estimatedContacts, setEstimatedContacts] = useState<number | null>(
    null
  );
  const debounceRef = useRef<NodeJS.Timeout>();

  const getFilterConfig = useCallback((): FilterConfig => ({
    afterDate,
    blockedDomains,
    skipPromotions,
    skipUpdates,
    skipSocial,
    skipForums,
    minInteractions,
    maxThreads,
  }), [afterDate, blockedDomains, skipPromotions, skipUpdates, skipSocial, skipForums, minInteractions, maxThreads]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch("/api/prescan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(getFilterConfig()),
        });
        if (res.ok) {
          const data = await res.json();
          setEstimatedContacts(data.estimatedContacts);
        }
      } catch {
        // Pre-scan is best-effort
      }
    }, 500);
  }, [getFilterConfig]);

  const checkOllama = async () => {
    setOllamaStatus("checking");
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("http://localhost:11434/api/tags", {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = await res.json();
        const models = (data.models ?? []).map(
          (m: { name: string }) => m.name
        );
        setOllamaModels(models);
        setSelectedOllamaModel(models[0] ?? "");
        setOllamaStatus("connected");
      } else {
        setOllamaStatus("disconnected");
      }
    } catch {
      setOllamaStatus("disconnected");
    }
  };

  useEffect(() => {
    if (providerMode === "local") {
      checkOllama();
    }
  }, [providerMode]);

  const addDomain = () => {
    const d = domainInput.trim().replace(/^@/, "");
    if (d && !blockedDomains.includes(d)) {
      setBlockedDomains([...blockedDomains, d]);
    }
    setDomainInput("");
  };

  const handleSubmit = () => {
    onSubmit(getFilterConfig(), providerMode, byokApiKey || undefined);
  };

  return (
    <div className="space-y-8">
      {/* Date Range */}
      <section className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
        <h2 className="font-semibold mb-3">Date Range</h2>
        <p className="text-sm text-[--brand-muted] mb-3">
          Only include emails after this date
        </p>
        <input
          type="date"
          value={afterDate}
          onChange={(e) => setAfterDate(e.target.value)}
          className="w-full px-3 py-2 border border-[--brand-muted]/20 rounded-md text-sm"
        />
      </section>

      {/* Domain Blocklist */}
      <section className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
        <h2 className="font-semibold mb-3">Domain Blocklist</h2>
        <p className="text-sm text-[--brand-muted] mb-3">
          Exclude emails from these domains
        </p>
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            placeholder="e.g. mailchimp.com"
            className="flex-1 px-3 py-2 border border-[--brand-muted]/20 rounded-md text-sm"
          />
          <Button variant="outline" size="sm" onClick={addDomain}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockedDomains.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-[--brand-muted]/10 rounded-full text-xs"
            >
              {d}
              <button
                onClick={() =>
                  setBlockedDomains(blockedDomains.filter((x) => x !== d))
                }
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Category Toggles */}
      <section className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
        <h2 className="font-semibold mb-3">Gmail Categories to Skip</h2>
        <div className="space-y-3">
          {[
            { label: "Promotions", value: skipPromotions, set: setSkipPromotions },
            { label: "Updates", value: skipUpdates, set: setSkipUpdates },
            { label: "Social", value: skipSocial, set: setSkipSocial },
            { label: "Forums", value: skipForums, set: setSkipForums },
          ].map((toggle) => (
            <div
              key={toggle.label}
              className="flex items-center justify-between"
            >
              <span className="text-sm">{toggle.label}</span>
              <Switch
                checked={toggle.value}
                onCheckedChange={toggle.set}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Min Interactions */}
      <section className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
        <h2 className="font-semibold mb-3">Minimum Interactions</h2>
        <p className="text-sm text-[--brand-muted] mb-4">
          Only include people you&apos;ve exchanged at least{" "}
          <strong>{minInteractions}</strong> emails with
        </p>
        <Slider
          value={[minInteractions]}
          onValueChange={([v]) => setMinInteractions(v)}
          min={1}
          max={5}
          step={1}
        />
        <div className="flex justify-between text-xs text-[--brand-muted] mt-1">
          <span>1 (everyone)</span>
          <span>5 (close contacts only)</span>
        </div>
      </section>

      {/* LLM Provider */}
      <section className="p-6 bg-white rounded-lg border border-[--brand-muted]/20">
        <h2 className="font-semibold mb-3">Processing Mode</h2>
        <div className="space-y-3">
          {(
            [
              {
                mode: "cloud" as const,
                label: "Cloud (OpenRouter)",
                desc: "Recommended — fastest, no setup",
              },
              {
                mode: "local" as const,
                label: "Local (Ollama)",
                desc: "Privacy-first — data never leaves your device",
              },
              {
                mode: "byok" as const,
                label: "Bring Your Own Key",
                desc: "Use your own OpenRouter-compatible API key",
              },
            ] as const
          ).map((opt) => (
            <label
              key={opt.mode}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                providerMode === opt.mode
                  ? "border-[--brand-ink] bg-[--brand-ink]/5"
                  : "border-[--brand-muted]/20 hover:border-[--brand-muted]/40"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={opt.mode}
                checked={providerMode === opt.mode}
                onChange={() => setProviderMode(opt.mode)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-sm">{opt.label}</p>
                <p className="text-xs text-[--brand-muted]">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {providerMode === "local" && (
          <div className="mt-4 p-3 bg-[--brand-muted]/5 rounded-lg">
            {ollamaStatus === "checking" && (
              <p className="text-sm text-[--brand-muted]">
                Checking Ollama connection...
              </p>
            )}
            {ollamaStatus === "connected" && (
              <div>
                <p className="text-sm text-[--brand-ink] mb-2">
                  Ollama connected
                </p>
                <select
                  value={selectedOllamaModel}
                  onChange={(e) => setSelectedOllamaModel(e.target.value)}
                  className="w-full px-3 py-2 border border-[--brand-muted]/20 rounded-md text-sm"
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {ollamaStatus === "disconnected" && (
              <div>
                <p className="text-sm text-[--brand-muted] mb-2">
                  Ollama not detected at localhost:11434
                </p>
                <p className="text-xs text-[--brand-muted] mb-2">
                  Install Ollama from{" "}
                  <a
                    href="https://ollama.com"
                    target="_blank"
                    className="underline"
                  >
                    ollama.com
                  </a>
                  , then run: <code>ollama pull llama3.1:8b</code>
                </p>
                <Button variant="outline" size="sm" onClick={checkOllama}>
                  Try Again
                </Button>
              </div>
            )}
          </div>
        )}

        {providerMode === "byok" && (
          <div className="mt-4">
            <input
              type="password"
              value={byokApiKey}
              onChange={(e) => setByokApiKey(e.target.value)}
              placeholder="Your OpenRouter API key"
              className="w-full px-3 py-2 border border-[--brand-muted]/20 rounded-md text-sm"
            />
          </div>
        )}
      </section>

      {/* Estimate & Submit */}
      <div className="text-center">
        {estimatedContacts !== null && (
          <p className="text-sm text-[--brand-muted] mb-4">
            ~{estimatedContacts} threads estimated (actual contacts may vary)
          </p>
        )}
        <Button
          size="lg"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            (providerMode === "local" && ollamaStatus !== "connected") ||
            (providerMode === "byok" && !byokApiKey)
          }
          className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-[--brand-gold] hover:text-[--brand-cream] text-lg py-6 font-semibold transition-all duration-300"
        >
          {isSubmitting ? "Creating checkout..." : "Continue to Payment — $9"}
        </Button>
      </div>
    </div>
  );
}
