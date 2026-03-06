import { useState, useEffect, useRef } from "react";
import {
  useVoiceSession,
  type AgentState,
  type SessionSummary,
} from "./hooks/useVoiceSession";
import { useConfigOptions } from "./hooks/useConfigOptions";
import { Button } from "./components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,
} from "./components/ui/select";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Mic, Square, RotateCcw } from "lucide-react";

const AGENT_STATE_CONFIG: Record<
  AgentState,
  { color: string; label: string; pulseSpeed: string }
> = {
  LISTENING: {
    color: "text-emerald-400",
    label: "Listening",
    pulseSpeed: "animate-pulse",
  },
  THINKING: {
    color: "text-yellow-400",
    label: "Thinking...",
    pulseSpeed: "animate-pulse",
  },
  SPEAKING: {
    color: "text-blue-400",
    label: "Speaking",
    pulseSpeed: "animate-pulse",
  },
};

const FEMININE_VOICES = [
  { value: "thalia", label: "Thalia - Clear, Confident" },
  { value: "andromeda", label: "Andromeda - Casual, Expressive" },
  { value: "helena", label: "Helena - Caring, Friendly" },
  { value: "asteria", label: "Asteria - Confident, Knowledgeable" },
  { value: "athena", label: "Athena - Calm, Professional" },
  { value: "aurora", label: "Aurora - Cheerful, Energetic" },
  { value: "harmonia", label: "Harmonia - Empathetic, Calm" },
  { value: "hera", label: "Hera - Smooth, Professional" },
  { value: "luna", label: "Luna - Friendly, Natural" },
  { value: "pandora", label: "Pandora - Smooth, British" },
  { value: "vesta", label: "Vesta - Patient, Empathetic" },
];

const MASCULINE_VOICES = [
  { value: "apollo", label: "Apollo - Confident, Casual" },
  { value: "arcas", label: "Arcas - Natural, Smooth" },
  { value: "aries", label: "Aries - Warm, Energetic" },
  { value: "atlas", label: "Atlas - Enthusiastic, Friendly" },
  { value: "draco", label: "Draco - Warm, British" },
  { value: "hermes", label: "Hermes - Expressive, Professional" },
  { value: "jupiter", label: "Jupiter - Knowledgeable, Deep" },
  { value: "orion", label: "Orion - Calm, Polite" },
  { value: "orpheus", label: "Orpheus - Professional, Confident" },
  { value: "zeus", label: "Zeus - Deep, Trustworthy" },
];

type AppState = "setup" | "interview" | "results";

export default function App() {
  const {
    connectionState,
    agentState,
    micActive,
    transcripts,
    stats,
    activeConfig,
    connect,
    disconnect,
    endSession,
  } = useVoiceSession();

  const { candidates, interviewers, positions } = useConfigOptions();

  // Setup form state
  const [candidate, setCandidate] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [position, setPosition] = useState("");
  const [mode, setMode] = useState<"interview" | "practice">("interview");
  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState("en");
  const [ttsVoice, setTtsVoice] = useState("thalia");

  // App state
  const [appState, setAppState] = useState<AppState>("setup");
  const [summary, setSummary] = useState<SessionSummary | null>(null);
  const [isEnding, setIsEnding] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const canStart = candidate && interviewer;

  // Auto-select first candidate/interviewer when loaded
  useEffect(() => {
    if (candidates.length > 0 && !candidate) setCandidate(candidates[0]);
  }, [candidates]);
  useEffect(() => {
    if (interviewers.length > 0 && !interviewer) setInterviewer(interviewers[0]);
  }, [interviewers]);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  async function handleStart() {
    try {
      await connect({
        model,
        language,
        ttsVoice,
        candidate,
        interviewer,
        position,
        mode,
      });
      setAppState("interview");
    } catch {
      alert("Failed to connect. Check console for details.");
    }
  }

  async function handleEndInterview() {
    setIsEnding(true);
    try {
      const result = await endSession();
      setSummary(result);
      setAppState("results");
    } catch (err) {
      console.error("Failed to end session:", err);
      setSummary(null);
      setAppState("results");
    } finally {
      setIsEnding(false);
    }
  }

  function handleNewSession() {
    setSummary(null);
    setAppState("setup");
  }

  const agentConfig = AGENT_STATE_CONFIG[agentState];

  return (
    <div className="flex min-h-screen flex-col bg-[#1a1a1f] text-[#fbfbff]">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#050506] px-6">
        <span className="text-lg font-semibold">AI Interview Coach</span>
        {appState === "interview" && (
          <span className={`text-sm ${agentConfig.color} ${agentConfig.pulseSpeed}`}>
            {agentConfig.label}
          </span>
        )}
      </header>

      {/* Three-column layout */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: Configuration */}
        <aside className="shrink-0 border-b border-white/10 bg-[#050506] p-6 lg:w-72 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <h3 className="mb-4 text-sm font-medium text-[#949498]">
            Settings
          </h3>

          <div className="space-y-5">
            {/* Model */}
            <div className="space-y-2">
              <Label className="text-[#949498]">STT Model</Label>
              <Select
                value={model}
                onValueChange={setModel}
                disabled={appState !== "setup"}
              >
                <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0b0c] border-[#4e4e52]">
                  {["nova-3", "nova-2", "nova", "enhanced", "base"].map(
                    (m) => (
                      <SelectItem key={m} value={m} className="text-[#edede2]">
                        {m}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="text-[#949498]">Language</Label>
              <Input
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={appState !== "setup"}
                placeholder="en"
                className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2] placeholder:text-[#949498]"
              />
            </div>

            {/* TTS Voice */}
            <div className="space-y-2">
              <Label className="text-[#949498]">AI Voice</Label>
              <Select
                value={ttsVoice}
                onValueChange={setTtsVoice}
                disabled={appState !== "setup"}
              >
                <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0b0b0c] border-[#4e4e52] max-h-64">
                  <SelectGroup>
                    <SelectLabel className="text-[#949498]">
                      Feminine
                    </SelectLabel>
                    {FEMININE_VOICES.map((v) => (
                      <SelectItem
                        key={v.value}
                        value={v.value}
                        className="text-[#edede2]"
                      >
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectGroup>
                    <SelectLabel className="text-[#949498]">
                      Masculine
                    </SelectLabel>
                    {MASCULINE_VOICES.map((v) => (
                      <SelectItem
                        key={v.value}
                        value={v.value}
                        className="text-[#edede2]"
                      >
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="relative flex flex-1 flex-col bg-[#0b0b0c] min-h-[60vh] lg:min-h-0">
          {/* SETUP STATE */}
          {appState === "setup" && (
            <div className="flex flex-1 items-center justify-center">
              <div className="w-full max-w-md space-y-6 p-8">
                <div className="text-center">
                  <div className="mb-4 text-emerald-400">
                    <Mic className="mx-auto h-16 w-16" />
                  </div>
                  <h2 className="mb-2 text-2xl font-semibold">
                    Interview Setup
                  </h2>
                  <p className="text-[#949498]">
                    Configure your session and start practicing
                  </p>
                </div>

                {/* Candidate */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">Candidate *</Label>
                  <Select value={candidate} onValueChange={setCandidate}>
                    <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                      <SelectValue placeholder="Select candidate..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b0b0c] border-[#4e4e52]">
                      {candidates.map((c) => (
                        <SelectItem key={c} value={c} className="text-[#edede2]">
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Interviewer */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">Interviewer *</Label>
                  <Select value={interviewer} onValueChange={setInterviewer}>
                    <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                      <SelectValue placeholder="Select interviewer..." />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b0b0c] border-[#4e4e52]">
                      {interviewers.map((i) => (
                        <SelectItem key={i} value={i} className="text-[#edede2] capitalize">
                          {i}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Position */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">Position (optional)</Label>
                  <Select value={position || "none"} onValueChange={(v) => setPosition(v === "none" ? "" : v)}>
                    <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b0b0c] border-[#4e4e52]">
                      <SelectItem value="none" className="text-[#949498]">
                        None
                      </SelectItem>
                      {positions.map((p) => (
                        <SelectItem key={p} value={p} className="text-[#edede2]">
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Mode */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">Mode</Label>
                  <Select value={mode} onValueChange={(v) => setMode(v as "interview" | "practice")}>
                    <SelectTrigger className="bg-[#0b0b0c] border-[#4e4e52] text-[#edede2]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-[#0b0b0c] border-[#4e4e52]">
                      <SelectItem value="interview" className="text-[#edede2]">
                        Interview - Realistic simulation
                      </SelectItem>
                      <SelectItem value="practice" className="text-[#edede2]">
                        Practice - With coaching feedback
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Start Button */}
                <Button
                  size="lg"
                  onClick={handleStart}
                  disabled={!canStart || isConnecting}
                  className="w-full rounded-full bg-emerald-500 py-6 text-lg font-semibold hover:bg-emerald-600 text-white disabled:opacity-40"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  {isConnecting ? "Connecting..." : "Start Interview"}
                </Button>
              </div>
            </div>
          )}

          {/* INTERVIEW STATE */}
          {appState === "interview" && (
            <>
              {/* End Interview Button */}
              <div className="absolute right-4 top-4 z-20">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleEndInterview}
                  disabled={isEnding}
                  className="bg-red-500/20 hover:bg-red-500/40 text-red-400 border border-red-500/30"
                >
                  <Square className="mr-2 h-4 w-4" />
                  {isEnding ? "Ending..." : "End Interview"}
                </Button>
              </div>

              {/* Transcript Container */}
              <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-6">
                {transcripts.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center text-[#949498]">
                    <Mic className="mb-4 h-12 w-12 opacity-50" />
                    <p>Waiting for audio...</p>
                  </div>
                ) : (
                  transcripts.map((item) => (
                    <div
                      key={item.id}
                      className={`rounded border-l-[3px] p-4 animate-in fade-in slide-in-from-top-2 duration-300 ${
                        item.isAgent
                          ? "border-l-blue-400 bg-blue-400/5"
                          : item.isFinal
                            ? "border-l-emerald-400 bg-[#050506]"
                            : "border-l-[#949498] bg-[#050506] opacity-60"
                      }`}
                    >
                      <div className="mb-2 text-xs text-[#949498]">
                        {item.timestamp}
                      </div>
                      <div className="leading-relaxed">{item.text}</div>
                    </div>
                  ))
                )}
                <div ref={transcriptEndRef} />
              </div>
            </>
          )}

          {/* RESULTS STATE */}
          {appState === "results" && (
            <div className="flex flex-1 items-center justify-center overflow-y-auto">
              <div className="w-full max-w-lg space-y-6 p-8">
                <h2 className="text-center text-2xl font-semibold">
                  Session Results
                </h2>

                {summary ? (
                  <>
                    {/* Score */}
                    <div className="text-center">
                      <div className="text-5xl font-bold text-emerald-400">
                        {summary.score}
                        <span className="text-2xl text-[#949498]">/10</span>
                      </div>
                      <p className="mt-2 text-[#949498]">{summary.summary}</p>
                    </div>

                    {/* Strengths */}
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                      <h3 className="mb-2 text-sm font-medium text-emerald-400">
                        Strengths
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {summary.strengths.map((s, i) => (
                          <li key={i} className="text-[#edede2]">
                            + {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Needs Work */}
                    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-4">
                      <h3 className="mb-2 text-sm font-medium text-amber-400">
                        Needs Work
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {summary.needsWork.map((s, i) => (
                          <li key={i} className="text-[#edede2]">
                            - {s}
                          </li>
                        ))}
                      </ul>
                    </div>

                    {/* Next Steps */}
                    <div className="rounded-lg border border-blue-500/20 bg-blue-500/5 p-4">
                      <h3 className="mb-2 text-sm font-medium text-blue-400">
                        Next Steps
                      </h3>
                      <ul className="space-y-1 text-sm">
                        {summary.nextSteps.map((s, i) => (
                          <li key={i} className="text-[#edede2]">
                            {i + 1}. {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </>
                ) : (
                  <p className="text-center text-[#949498]">
                    Session ended. No summary available.
                  </p>
                )}

                <Button
                  size="lg"
                  onClick={handleNewSession}
                  className="w-full rounded-full bg-[#4e4e52]/50 py-6 text-lg hover:bg-[#4e4e52] text-[#edede2]"
                >
                  <RotateCcw className="mr-2 h-5 w-5" />
                  Start New Session
                </Button>
              </div>
            </div>
          )}
        </main>

        {/* Right Sidebar: Status */}
        <aside className="shrink-0 border-t border-white/10 bg-[#050506] p-6 lg:w-56 lg:border-t-0 lg:border-l lg:overflow-y-auto">
          <h3 className="mb-4 text-sm font-medium text-[#949498]">Status</h3>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <StatusItem label="Connection">
              <span
                className={`inline-flex items-center gap-1.5 text-sm ${
                  isConnected ? "text-emerald-400" : "text-[#949498]"
                }`}
              >
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    isConnected
                      ? "bg-emerald-400 animate-pulse"
                      : "bg-[#949498]"
                  }`}
                />
                {isConnected
                  ? "Connected"
                  : isConnecting
                    ? "Connecting..."
                    : "Disconnected"}
              </span>
            </StatusItem>

            <StatusItem label="Microphone">
              <span
                className={micActive ? "text-emerald-400" : "text-[#fbfbff]"}
              >
                {micActive ? "Active" : "Inactive"}
              </span>
            </StatusItem>

            <StatusItem label="Agent State">
              <span className={`${agentConfig.color} ${isConnected ? agentConfig.pulseSpeed : ""}`}>
                {isConnected ? agentConfig.label : "-"}
              </span>
            </StatusItem>

            {activeConfig && (
              <>
                <StatusItem label="Interviewer">
                  <span className="capitalize">{activeConfig.interviewer}</span>
                </StatusItem>
                <StatusItem label="Mode">
                  <span className="capitalize">{activeConfig.mode}</span>
                </StatusItem>
              </>
            )}

            <StatusItem label="Messages">
              {stats.messages}
            </StatusItem>

            <StatusItem label="Final Transcripts">{stats.finals}</StatusItem>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatusItem({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[0.7rem] font-medium text-[#949498]">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
