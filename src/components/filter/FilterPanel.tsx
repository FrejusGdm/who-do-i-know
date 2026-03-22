"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { X, Loader2, Lock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import type { FilterConfig, LLMProviderMode, BYOKProvider } from "@/types";

const DEFAULT_BLOCKED_DOMAINS = [
  "canvas.instructure.com",
  "mailchimp.com",
  "sendgrid.net",
  "linkedin.com",
  "facebookmail.com",
];

const BYOK_PROVIDERS: { id: BYOKProvider; name: string; desc: string; placeholder: string }[] = [
  { id: "openai", name: "OpenAI", desc: "GPT-4o Mini", placeholder: "sk-..." },
  { id: "gemini", name: "Google Gemini", desc: "Gemini 2.0 Flash", placeholder: "AIza..." },
  { id: "openrouter", name: "OpenRouter", desc: "Claude, GPT, Llama & more", placeholder: "sk-or-v1-..." },
];

interface FilterPanelProps {
  onSubmit: (
    config: FilterConfig,
    providerMode: LLMProviderMode,
    byokApiKey?: string,
    ollamaModel?: string,
    byokProvider?: BYOKProvider
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
  const [providerMode, setProviderMode] = useState<LLMProviderMode>("local");
  const [byokApiKey, setByokApiKey] = useState("");
  const [byokProvider, setByokProvider] = useState<BYOKProvider>("openai");
  const [ollamaStatus, setOllamaStatus] = useState<
    "checking" | "connected" | "disconnected"
  >("disconnected");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState("");
  const [estimatedContacts, setEstimatedContacts] = useState<number | null>(
    null
  );
  const [teaseState, setTeaseState] = useState<"idle" | "scanning" | "teased">("idle");
  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const debounceRef = useRef<NodeJS.Timeout>(undefined);

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
    onSubmit(
      getFilterConfig(),
      providerMode,
      byokApiKey || undefined,
      selectedOllamaModel || undefined,
      providerMode === "byok" ? byokProvider : undefined
    );
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
            We&apos;ve identified your real network. Unlock the full CSV to see everyone.
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
            {isSubmitting ? "Processing..." : "Unlock Full CSV"}
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
      <div className="flex flex-col items-center mb-12 text-center">
        <h1 className="font-serif text-5xl md:text-6xl tracking-tight text-[--brand-ink] mb-4">
          {currentStep === 1 ? "Configure Your Scan" : "Processing Mode"}
        </h1>
        <p className="text-lg text-[--brand-muted] font-light">
          {currentStep === 1 ? "Shape what gets scanned before you start." : "How should we process this?"}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {currentStep === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="space-y-6"
          >
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

      <div className="pt-8 text-center">
        {estimatedContacts !== null && (
          <p className="text-sm font-medium text-[--brand-muted] mb-4 bg-white/50 backdrop-blur-sm border border-black/5 rounded-full py-2 px-4 inline-block">
            ~{estimatedContacts} threads estimated <span className="font-normal opacity-70">(actual contacts may vary)</span>
          </p>
        )}
        <Button
          size="lg"
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setCurrentStep(2);
          }}
          className="w-full bg-[--brand-ink] text-[--brand-cream] hover:bg-black/80 text-lg py-7 rounded-full font-medium transition-all duration-300 shadow-xl"
        >
          Next: Choose Processing Mode
        </Button>
      </div>
      </motion.div>
      )}

      {currentStep === 2 && (
      <motion.div
        key="step2"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="space-y-6"
      >
      {/* LLM Provider */}
      <section className="p-8 bg-white/50 backdrop-blur-sm rounded-3xl border border-black/5">
        <h2 className="font-serif text-2xl text-[--brand-ink] mb-6">Processing Mode</h2>
        <div className="flex flex-col md:flex-row gap-6">
          {/* Left Pane: Options */}
          <div className="w-full md:w-1/3 flex flex-col gap-2">
            {(
              [
                {
                  mode: "cloud" as const,
                  label: "Cloud (Coming Soon)",
                  desc: "Temporarily unavailable",
                  disabled: true as boolean,
                },
                {
                  mode: "local" as const,
                  label: "Local (Ollama)",
                  desc: "Privacy-first",
                  disabled: false as boolean,
                },
                {
                  mode: "byok" as const,
                  label: "Bring Your Own Key",
                  desc: "Custom OpenRouter",
                  disabled: false as boolean,
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.mode}
                onClick={() => !opt.disabled && setProviderMode(opt.mode)}
                disabled={opt.disabled}
                className={`text-left p-4 rounded-2xl border transition-all ${
                  providerMode === opt.mode
                    ? "border-[--brand-ink] bg-white shadow-sm ring-1 ring-[--brand-ink]/5"
                    : opt.disabled
                    ? "border-transparent opacity-50 cursor-not-allowed text-[--brand-muted]"
                    : "border-transparent hover:border-black/5 hover:bg-white/40 text-[--brand-muted]"
                }`}
              >
                <p className={`font-medium ${providerMode === opt.mode ? "text-[--brand-ink]" : ""}`}>{opt.label}</p>
                <p className="text-xs opacity-80 mt-1">{opt.desc}</p>
              </button>
            ))}
          </div>

          {/* Right Pane: Details & Inputs */}
          <div className="w-full md:w-2/3 p-6 bg-white rounded-2xl border border-black/5 shadow-sm min-h-[200px]">
            <AnimatePresence mode="wait">
              {providerMode === "cloud" && (
                <motion.div
                  key="cloud"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full flex flex-col justify-center"
                >
                  <div className="w-12 h-12 rounded-full bg-[--brand-ink]/5 flex items-center justify-center mb-4">
                    <svg className="w-6 h-6 text-[--brand-ink]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                  </div>
                  <h3 className="font-serif text-xl text-[--brand-ink] mb-2">Fastest & Easiest</h3>
                  <p className="text-sm text-[--brand-muted] leading-relaxed">
                    We use OpenRouter&apos;s enterprise-grade API to process your network instantly. No setup required. Your data is never trained on and is deleted immediately after processing.
                  </p>
                </motion.div>
              )}

              {providerMode === "local" && (
                <motion.div
                  key="local"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full flex flex-col justify-center"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-[--brand-ink]/5 flex items-center justify-center">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src="https://ollama.com/public/icon-64x64.png" alt="Ollama" className="w-6 h-6 grayscale opacity-80" />
                    </div>
                    <div>
                      <h3 className="font-serif text-xl text-[--brand-ink]">100% On-Device</h3>
                      <p className="text-xs text-[--brand-muted]">Maximum privacy</p>
                    </div>
                  </div>

                  {ollamaStatus === "checking" && (
                    <div className="flex items-center gap-2 text-sm text-[--brand-muted]">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking connection to localhost:11434...
                    </div>
                  )}
                  {ollamaStatus === "connected" && (
                    <div className="space-y-3">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 text-xs font-medium">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Connected
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-[--brand-muted] mb-1.5">Select Model</label>
                        <select
                          value={selectedOllamaModel}
                          onChange={(e) => setSelectedOllamaModel(e.target.value)}
                          className="w-full px-4 py-2.5 bg-white border border-black/5 rounded-xl text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20"
                        >
                          {ollamaModels.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                  {ollamaStatus === "disconnected" && (
                    <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-4">
                      <p className="text-sm font-medium text-red-800 mb-2">
                        Could not connect to Ollama
                      </p>
                      <p className="text-xs text-red-600/80 mb-4 leading-relaxed">
                        Please ensure Ollama is running locally. You can download it from{" "}
                        <a href="https://ollama.com" target="_blank" rel="noopener noreferrer" className="underline font-medium hover:text-red-800">ollama.com</a>.
                        After installing, run <code className="bg-red-500/10 px-1 py-0.5 rounded">ollama pull llama3.1:8b</code>.
                      </p>
                      <Button variant="outline" size="sm" className="rounded-full bg-white text-red-700 border-red-200 hover:bg-red-50" onClick={checkOllama}>
                        Try Again
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}

              {providerMode === "byok" && (
                <motion.div
                  key="byok"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.2 }}
                  className="h-full flex flex-col justify-center"
                >
                  <h3 className="font-serif text-xl text-[--brand-ink] mb-1">Bring Your Own Key</h3>
                  <p className="text-sm text-[--brand-muted] mb-4">
                    Use your own API key. We never store it.
                  </p>

                  <div className="flex gap-2 mb-4">
                    {BYOK_PROVIDERS.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => { setByokProvider(p.id); setByokApiKey(""); }}
                        className={`flex-1 text-left p-3 rounded-xl border transition-all ${
                          byokProvider === p.id
                            ? "border-[--brand-ink] bg-[--brand-ink]/5 ring-1 ring-[--brand-ink]/10"
                            : "border-black/5 hover:border-black/10 hover:bg-black/[0.02]"
                        }`}
                      >
                        <p className={`text-sm font-medium ${byokProvider === p.id ? "text-[--brand-ink]" : "text-[--brand-muted]"}`}>
                          {p.name}
                        </p>
                        <p className="text-xs text-[--brand-muted]/70 mt-0.5">{p.desc}</p>
                      </button>
                    ))}
                  </div>

                  <input
                    type="password"
                    value={byokApiKey}
                    onChange={(e) => setByokApiKey(e.target.value)}
                    placeholder={BYOK_PROVIDERS.find((p) => p.id === byokProvider)?.placeholder}
                    className="w-full px-5 py-3 bg-white border border-black/10 rounded-full text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-[--brand-ink]/20 transition-all"
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      {/* Estimate & Submit */}
      <div className="pt-8 text-center space-y-4">
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
          {isSubmitting ? "Processing..." : "Scan Inbox & Continue"}
        </Button>
        <button 
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
            setCurrentStep(1);
          }}
          className="text-sm text-[--brand-muted] hover:text-[--brand-ink] transition-colors"
        >
          Back to Filters
        </button>
      </div>
      </motion.div>
      )}
      </AnimatePresence>
    </>
  );
}
