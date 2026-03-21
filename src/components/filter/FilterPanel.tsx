"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, Loader2, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
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
  const [teaseState, setTeaseState] = useState<"idle" | "scanning" | "teased">("idle");
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

  const handleInitialSubmit = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTeaseState("scanning");
    // Simulate a deep scan to build anticipation
    setTimeout(() => {
      setTeaseState("teased");
    }, 2800);
  };

  const handleFinalSubmit = () => {
    onSubmit(getFilterConfig(), providerMode, byokApiKey || undefined);
  };

  if (teaseState === "scanning") {
    return (
      <div className="py-24 text-center space-y-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex justify-center"
        >
          <div className="w-24 h-24 rounded-full bg-[--brand-ink]/5 flex items-center justify-center relative">
            <div className="absolute inset-0 rounded-full border-4 border-black/5 border-t-[--brand-ink] animate-spin" />
            <Loader2 className="w-8 h-8 text-[--brand-ink] animate-spin" />
          </div>
        </motion.div>
        <h2 className="font-serif text-4xl text-[--brand-ink]">Deep Scanning Inbox...</h2>
        <div className="space-y-2 text-[--brand-muted]">
          <p className="animate-pulse">Analyzing communication history...</p>
          <p className="animate-pulse delay-150">Filtering newsletters & spam...</p>
          <p className="animate-pulse delay-300">Mapping relationships...</p>
        </div>
      </div>
    );
  }

  if (teaseState === "teased") {
    const fakeData = Array(5).fill(0);
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-8"
      >
        <div className="text-center space-y-4">
          <h2 className="font-serif text-5xl md:text-6xl text-[--brand-ink]">
            {estimatedContacts ? `~${estimatedContacts}` : "Hundreds of"} People Found.
          </h2>
          <p className="text-xl text-[--brand-muted] font-light">
            We've identified your real network. Unlock the full CSV to see everyone.
          </p>
        </div>

        <div className="overflow-x-auto rounded-3xl border border-black/5 bg-white/50 backdrop-blur-sm p-2 shadow-sm relative">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/80 to-white/95 z-10 pointer-events-none flex flex-col items-center justify-end pb-12">
            <Lock className="w-8 h-8 text-[--brand-ink] mb-4" />
            <p className="text-[--brand-ink] font-medium text-lg">Results Locked</p>
          </div>
          <div className="overflow-hidden rounded-2xl select-none filter blur-[3px] opacity-60">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-black/5 text-[--brand-ink]">
                  <th className="text-left p-4 font-medium">Name</th>
                  <th className="text-left p-4 font-medium">Email</th>
                  <th className="text-left p-4 font-medium">Type</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {fakeData.map((_, i) => (
                  <tr key={i} className="border-b border-black/5">
                    <td className="p-4 font-medium">██████ ████</td>
                    <td className="p-4">██████@████.com</td>
                    <td className="p-4">
                      <span className="px-3 py-1 rounded-full bg-black/5 text-[--brand-ink] text-xs font-medium">
                        ██████
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="pt-8 text-center max-w-md mx-auto space-y-4">
          <Button
            size="lg"
            onClick={handleFinalSubmit}
            disabled={isSubmitting}
            className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 text-lg py-7 rounded-full font-medium transition-all duration-300 shadow-xl"
          >
            {isSubmitting ? "Creating checkout..." : "Pay $9 to Unlock Full CSV"}
          </Button>
          <button 
            onClick={() => setTeaseState("idle")}
            className="text-sm text-[--brand-muted] hover:text-[--brand-ink] transition-colors"
          >
            Wait, let me adjust my filters
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <>
      <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">
        Configure Your Scan
      </h1>
      <p className="text-lg text-[--brand-muted] mb-12 font-light">
        Shape what gets scanned before you pay.
      </p>
      <div className="space-y-6">
      {/* Date Range */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-2">Date Range</h2>
        <p className="text-sm text-[--brand-muted] mb-6">
          Only include emails after this date
        </p>
        <input
          type="date"
          value={afterDate}
          onChange={(e) => setAfterDate(e.target.value)}
          className="w-full px-5 py-3 bg-white border border-black/5 rounded-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20 transition-all"
        />
      </section>

      {/* Domain Blocklist */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-2">Domain Blocklist</h2>
        <p className="text-sm text-[--brand-muted] mb-6">
          Exclude emails from these domains
        </p>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={domainInput}
            onChange={(e) => setDomainInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addDomain()}
            placeholder="e.g. mailchimp.com"
            className="flex-1 px-5 py-3 bg-white border border-black/5 rounded-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20 transition-all"
          />
          <Button variant="outline" className="rounded-full px-6 bg-white border-black/5" onClick={addDomain}>
            Add
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {blockedDomains.map((d) => (
            <span
              key={d}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-black/5 rounded-full text-xs text-[--brand-muted] shadow-sm"
            >
              {d}
              <button
                onClick={() =>
                  setBlockedDomains(blockedDomains.filter((x) => x !== d))
                }
                className="hover:text-[--brand-ink] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          ))}
        </div>
      </section>

      {/* Category Toggles */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-6">Gmail Categories to Skip</h2>
        <div className="space-y-4">
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
              <span className="text-sm font-medium text-[--brand-ink]">{toggle.label}</span>
              <Switch
                checked={toggle.value}
                onCheckedChange={toggle.set}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Min Interactions */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-2">Minimum Interactions</h2>
        <p className="text-sm text-[--brand-muted] mb-8">
          Only include people you&apos;ve exchanged at least{" "}
          <strong className="text-[--brand-ink] font-medium">{minInteractions}</strong> emails with
        </p>
        <Slider
          value={[minInteractions]}
          onValueChange={([v]) => setMinInteractions(v)}
          min={1}
          max={5}
          step={1}
          className="mb-4"
        />
        <div className="flex justify-between text-xs text-[--brand-muted] font-medium">
          <span>1 (everyone)</span>
          <span>5 (close contacts only)</span>
        </div>
      </section>

      {/* LLM Provider */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-6">Processing Mode</h2>
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
              className={`flex items-start gap-4 p-5 rounded-2xl border cursor-pointer transition-all ${
                providerMode === opt.mode
                  ? "border-[--brand-ink] bg-white shadow-sm"
                  : "border-black/5 hover:border-black/10 hover:bg-white/40"
              }`}
            >
              <input
                type="radio"
                name="provider"
                value={opt.mode}
                checked={providerMode === opt.mode}
                onChange={() => setProviderMode(opt.mode)}
                className="mt-1 border-black/10 text-[--brand-ink] focus:ring-[--brand-ink]"
              />
              <div>
                <p className="font-medium text-[--brand-ink]">{opt.label}</p>
                <p className="text-sm text-[--brand-muted] mt-1">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {providerMode === "local" && (
          <div className="mt-4 p-5 bg-white rounded-2xl border border-black/5 shadow-sm">
            {ollamaStatus === "checking" && (
              <p className="text-sm text-[--brand-muted]">
                Checking Ollama connection...
              </p>
            )}
            {ollamaStatus === "connected" && (
              <div>
                <p className="text-sm font-medium text-[--brand-ink] mb-3">
                  Ollama connected
                </p>
                <select
                  value={selectedOllamaModel}
                  onChange={(e) => setSelectedOllamaModel(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-black/5 rounded-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20"
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
                <p className="text-sm font-medium text-[--brand-ink] mb-2">
                  Ollama not detected at localhost:11434
                </p>
                <p className="text-sm text-[--brand-muted] mb-4 leading-relaxed">
                  Install Ollama from{" "}
                  <a
                    href="https://ollama.com"
                    target="_blank"
                    className="text-[--brand-ink] hover:underline"
                  >
                    ollama.com
                  </a>
                  , then run: <code className="bg-black/5 px-1.5 py-0.5 rounded text-xs">ollama pull llama3.1:8b</code>
                </p>
                <Button variant="outline" className="rounded-full bg-white border-black/5" onClick={checkOllama}>
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
              className="w-full px-5 py-3 bg-white border border-black/5 rounded-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20 transition-all"
            />
          </div>
        )}
      </section>

      {/* Estimate & Submit */}
      <div className="pt-8 text-center">
        {estimatedContacts !== null && (
          <p className="text-sm font-medium text-[--brand-muted] mb-4 bg-white/50 backdrop-blur-sm border border-black/5 rounded-full py-2 px-4 inline-block">
            ~{estimatedContacts} threads estimated <span className="font-normal opacity-70">(actual contacts may vary)</span>
          </p>
        )}
        <Button
          size="lg"
          onClick={handleInitialSubmit}
          disabled={
            isSubmitting ||
            (providerMode === "local" && ollamaStatus !== "connected") ||
            (providerMode === "byok" && !byokApiKey)
          }
          className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 text-lg py-7 rounded-full font-medium transition-all duration-300 shadow-xl"
        >
          {isSubmitting ? "Creating checkout..." : "Scan Inbox & Continue"}
        </Button>
      </div>
    </div>
  );
}
