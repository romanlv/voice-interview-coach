import { useState, useEffect, useRef } from "react";
import { useVoiceSession, type AgentState, type SessionSummary } from "./hooks/useVoiceSession";
import { useAudioAnalysis } from "./hooks/useAudioAnalysis";
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
import { Label } from "./components/ui/label";
import { Mic, Square, RotateCcw, Settings, MessageSquareText, X } from "lucide-react";
import Orb from "./components/Orb";
import LoadingScreen from "./components/LoadingScreen";

const CONNECTING_MESSAGES = [
  "Reviewing your resume...",
  "Brewing coffee for your interviewer...",
  "Practicing firm handshakes...",
  "Googling 'what is your biggest weakness'...",
  "Ironing the interviewer's suit...",
  "Preparing thoughtful follow-up questions...",
  "Calibrating the awkward silence detector...",
  "Loading decades of interview wisdom...",
  "Warming up the microphone...",
  "Clearing the interview room...",
  "Hiding the 'we'll call you back' script...",
  "Polishing the whiteboard markers...",
  "Rehearsing nodding techniques...",
  "Stacking the motivational books...",
  "Tuning the small-talk generator...",
  "Inflating the interviewer's ego...",
  "Alphabetizing behavioral questions...",
  "Double-checking the dress code...",
  "Sharpening pencils... digitally...",
  "Queuing up the elevator music...",
];

const ENDING_MESSAGES = [
  "Consulting the hiring committee...",
  "Crunching your performance data...",
  "Writing your recommendation letter...",
  "Tallying up the scores...",
  "Reviewing your body language... just kidding",
  "Comparing notes with the panel...",
  "Generating constructive feedback...",
  "Calculating your interview mojo...",
  "Counting how many times you said 'um'...",
  "Checking if you remembered to smile...",
  "Debating internally... it's heated...",
  "Running your answers through the vibe check...",
  "Measuring your confidence in decibels...",
  "Drafting a very diplomatic email...",
  "Asking the magic 8-ball for a second opinion...",
  "Cross-referencing with LinkedIn... just kidding",
];

const AGENT_STATE_CONFIG: Record<AgentState, { color: string; label: string; dotColor: string }> = {
  LISTENING: {
    color: "text-emerald-400",
    label: "Listening",
    dotColor: "bg-emerald-400",
  },
  THINKING: {
    color: "text-yellow-400",
    label: "Thinking...",
    dotColor: "bg-yellow-400",
  },
  SPEAKING: {
    color: "text-blue-400",
    label: "Speaking",
    dotColor: "bg-blue-400",
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

type AppState = "setup" | "connecting" | "interview" | "ending" | "results";

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function App() {
  const {
    connectionState,
    agentState,
    micActive,
    transcripts,
    activeConfig,
    agentAnalyser,
    userAnalyser,
    connect,
    disconnect: _disconnect,
    endSession,
  } = useVoiceSession();

  const { agentVolume, userVolume } = useAudioAnalysis(agentAnalyser, userAnalyser);

  const { candidates, interviewers, positions } = useConfigOptions();

  // Setup form state
  const [candidate, setCandidate] = useState("");
  const [interviewer, setInterviewer] = useState("");
  const [position, setPosition] = useState("");
  const [positionDescription, setPositionDescription] = useState("");
  const [positonMode, setPositionMode] = useState<"text" | "select">("text");
  const [mode, setMode] = useState<"interview" | "practice">("interview");
  const [ttsVoice, _setTtsVoice] = useState(
    () => localStorage.getItem("ttsVoice") ?? "thalia",
  );
  const setTtsVoice = (v: string) => {
    localStorage.setItem("ttsVoice", v);
    _setTtsVoice(v);
  };

  // App state
  const [appState, setAppState] = useState<AppState>("setup");
  const [summary, setSummary] = useState<SessionSummary | null>(null);

  // Interview UI state
  const [showStatus, setShowStatus] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  // Orb sizing
  const orbContainerRef = useRef<HTMLDivElement>(null);
  const [orbSize, setOrbSize] = useState({ width: 400, height: 400 });

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const canStart = candidate && interviewer;

  // Auto-select first candidate/interviewer when loaded
  useEffect(() => {
    if (candidates.length > 0 && !candidate) setCandidate(candidates[0]);
  }, [candidates, candidate]);
  useEffect(() => {
    if (interviewers.length > 0 && !interviewer) setInterviewer(interviewers[0]);
  }, [interviewers, interviewer]);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  // Orb container resize
  useEffect(() => {
    if (!orbContainerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const size = Math.min(width, height, 600);
        setOrbSize({ width: size, height: size });
      }
    });
    ro.observe(orbContainerRef.current);
    return () => ro.disconnect();
  }, [appState]);

  async function handleStart() {
    setAppState("connecting");
    try {
      await Promise.all([
        connect({ ttsVoice, candidate, interviewer, position, positionDescription, mode }),
        delay(1500),
      ]);
      setAppState("interview");
    } catch {
      setAppState("setup");
      alert("Failed to connect. Check console for details.");
    }
  }

  async function handleEndInterview() {
    setAppState("ending");
    setShowStatus(false);
    setShowTranscript(false);
    try {
      const result = await endSession();
      setSummary(result);
    } catch (err) {
      console.error("Failed to end session:", err);
      setSummary(null);
    }
    setAppState("results");
  }

  function handleNewSession() {
    setSummary(null);
    setAppState("setup");
  }

  const agentConfig = AGENT_STATE_CONFIG[agentState];

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0c] text-[#fbfbff]">
      {/* ============ SETUP SCREEN ============ */}
      {appState === "setup" && (
        <div className="flex flex-1 items-center justify-center p-6">
          <div className="w-full max-w-lg space-y-8">
            <div className="text-center">
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <Mic className="h-10 w-10 text-emerald-400" />
              </div>
              <h1 className="mb-2 text-3xl font-bold tracking-tight">AI Interview Coach</h1>
              <p className="text-[#949498]">Configure your session and start practicing</p>
            </div>

            <div className="space-y-5 rounded-2xl border border-white/[0.06] bg-[#111113] p-6">
              {/* Candidate */}
              <div className="space-y-2">
                <Label className="text-[#949498]">Candidate *</Label>
                <Select value={candidate} onValueChange={setCandidate}>
                  <SelectTrigger className="border-[#4e4e52] bg-[#0b0b0c] text-[#edede2]">
                    <SelectValue placeholder="Select candidate..." />
                  </SelectTrigger>
                  <SelectContent className="border-[#4e4e52] bg-[#0b0b0c]">
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
                  <SelectTrigger className="border-[#4e4e52] bg-[#0b0b0c] text-[#edede2]">
                    <SelectValue placeholder="Select interviewer..." />
                  </SelectTrigger>
                  <SelectContent className="border-[#4e4e52] bg-[#0b0b0c]">
                    {interviewers.map((i) => (
                      <SelectItem key={i} value={i} className="capitalize text-[#edede2]">
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Position */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[#949498]">Position (optional)</Label>
                  <button
                    type="button"
                    onClick={() => {
                      setPositionMode(positonMode === "text" ? "select" : "text");
                      setPosition("");
                      setPositionDescription("");
                    }}
                    className="text-xs text-[#949498] hover:text-emerald-400 transition-colors"
                  >
                    {positonMode === "text" ? "pick from saved" : "paste description"}
                  </button>
                </div>
                {positonMode === "select" ? (
                  <Select
                    value={position || "none"}
                    onValueChange={(v) => setPosition(v === "none" ? "" : v)}
                  >
                    <SelectTrigger className="border-[#4e4e52] bg-[#0b0b0c] text-[#edede2]">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent className="border-[#4e4e52] bg-[#0b0b0c]">
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
                ) : (
                  <textarea
                    value={positionDescription}
                    onChange={(e) => setPositionDescription(e.target.value)}
                    placeholder="Paste a job description here..."
                    rows={4}
                    className="w-full rounded-md border border-[#4e4e52] bg-[#0b0b0c] px-3 py-2 text-sm text-[#edede2] placeholder:text-[#949498]/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y"
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Mode */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">Mode</Label>
                  <Select
                    value={mode}
                    onValueChange={(v) => setMode(v as "interview" | "practice")}
                  >
                    <SelectTrigger className="border-[#4e4e52] bg-[#0b0b0c] text-[#edede2]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-[#4e4e52] bg-[#0b0b0c]">
                      <SelectItem value="interview" className="text-[#edede2]">
                        Interview
                      </SelectItem>
                      <SelectItem value="practice" className="text-[#edede2]">
                        Practice
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Voice */}
                <div className="space-y-2">
                  <Label className="text-[#949498]">AI Voice</Label>
                  <Select value={ttsVoice} onValueChange={setTtsVoice}>
                    <SelectTrigger className="border-[#4e4e52] bg-[#0b0b0c] text-[#edede2]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-64 border-[#4e4e52] bg-[#0b0b0c]">
                      <SelectGroup>
                        <SelectLabel className="text-[#949498]">Feminine</SelectLabel>
                        {FEMININE_VOICES.map((v) => (
                          <SelectItem key={v.value} value={v.value} className="text-[#edede2]">
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel className="text-[#949498]">Masculine</SelectLabel>
                        {MASCULINE_VOICES.map((v) => (
                          <SelectItem key={v.value} value={v.value} className="text-[#edede2]">
                            {v.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <Button
              size="lg"
              onClick={handleStart}
              disabled={!canStart}
              className="w-full rounded-full bg-emerald-500 py-6 text-lg font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
            >
              <Mic className="mr-2 h-5 w-5" />
              Start Interview
            </Button>
          </div>
        </div>
      )}

      {/* ============ CONNECTING SCREEN ============ */}
      {appState === "connecting" && <LoadingScreen messages={CONNECTING_MESSAGES} />}

      {/* ============ INTERVIEW SCREEN ============ */}
      {appState === "interview" && (
        <div className="relative flex flex-1 flex-col overflow-hidden">
          {/* End Interview — top right */}
          <div className="absolute right-4 top-4 z-30">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleEndInterview}
              className="border border-red-500/30 bg-red-500/20 text-red-400 hover:bg-red-500/40"
            >
              <Square className="mr-2 h-4 w-4" />
              End Interview
            </Button>
          </div>

          {/* Settings toggle — top left */}
          <button
            onClick={() => setShowStatus((s) => !s)}
            className="absolute left-4 top-4 z-30 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-[#949498] transition hover:bg-white/10 hover:text-white"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Status panel — collapsible top-left */}
          {showStatus && (
            <div className="absolute left-4 top-16 z-30 w-56 rounded-xl border border-white/[0.06] bg-[#111113]/95 p-4 shadow-2xl backdrop-blur-xl">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-medium text-[#949498]">Status</span>
                <button
                  onClick={() => setShowStatus(false)}
                  className="text-[#949498] hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-3">
                <StatusItem label="Connection">
                  <span
                    className={`inline-flex items-center gap-1.5 text-sm ${
                      isConnected ? "text-emerald-400" : "text-[#949498]"
                    }`}
                  >
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        isConnected ? "animate-pulse bg-emerald-400" : "bg-[#949498]"
                      }`}
                    />
                    {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Disconnected"}
                  </span>
                </StatusItem>

                <StatusItem label="Microphone">
                  <span className={micActive ? "text-emerald-400" : "text-[#fbfbff]"}>
                    {micActive ? "Active" : "Inactive"}
                  </span>
                </StatusItem>

                <StatusItem label="Agent State">
                  <span className={`${agentConfig.color} ${isConnected ? "animate-pulse" : ""}`}>
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

                <StatusItem label="Transcripts">{transcripts.length}</StatusItem>
              </div>
            </div>
          )}

          {/* Orb — centered */}
          <div ref={orbContainerRef} className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-6">
              <Orb
                width={orbSize.width}
                height={orbSize.height}
                agentVolume={agentVolume}
                userVolume={userVolume}
                status={agentState}
              />
              {/* Agent state label */}
              <div className="flex items-center gap-2">
                <span
                  className={`inline-block h-2 w-2 animate-pulse rounded-full ${agentConfig.dotColor}`}
                />
                <span className={`text-sm font-medium ${agentConfig.color}`}>
                  {agentConfig.label}
                </span>
              </div>
            </div>
          </div>

          {/* Transcript toggle — bottom right */}
          <button
            onClick={() => setShowTranscript((s) => !s)}
            className="absolute bottom-6 right-6 z-30 flex h-12 w-12 items-center justify-center rounded-full bg-white/[0.06] text-[#949498] transition hover:bg-white/10 hover:text-white"
          >
            <MessageSquareText className="h-5 w-5" />
            {transcripts.length > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                {transcripts.length}
              </span>
            )}
          </button>

          {/* Transcript drawer */}
          <div
            className={`fixed right-0 top-0 z-40 flex h-full w-96 max-w-[85vw] flex-col border-l border-white/[0.06] bg-[#111113]/95 backdrop-blur-xl transition-transform duration-300 ${
              showTranscript ? "translate-x-0" : "translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-3">
              <span className="text-sm font-medium text-[#949498]">Transcript</span>
              <button
                onClick={() => setShowTranscript(false)}
                className="text-[#949498] hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              {transcripts.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-[#949498]">
                  <Mic className="mb-4 h-8 w-8 opacity-50" />
                  <p className="text-sm">Waiting for audio...</p>
                </div>
              ) : (
                transcripts.map((item) => (
                  <div
                    key={item.id}
                    className={`rounded border-l-[3px] p-3 text-sm ${
                      item.isAgent
                        ? "border-l-blue-400 bg-blue-400/5"
                        : item.isFinal
                          ? "border-l-emerald-400 bg-white/[0.02]"
                          : "border-l-[#949498] bg-white/[0.02] opacity-60"
                    }`}
                  >
                    <div className="mb-1.5 text-[10px] text-[#949498]">{item.timestamp}</div>
                    <div className="leading-relaxed">{item.text}</div>
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      )}

      {/* ============ ENDING SCREEN ============ */}
      {appState === "ending" && <LoadingScreen messages={ENDING_MESSAGES} />}

      {/* ============ RESULTS SCREEN ============ */}
      {appState === "results" && (
        <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
          <div className="w-full max-w-lg space-y-6">
            <h2 className="text-center text-2xl font-bold tracking-tight">Session Results</h2>

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
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
                  <h3 className="mb-2 text-sm font-medium text-emerald-400">Strengths</h3>
                  <ul className="space-y-1 text-sm">
                    {summary.strengths.map((s, i) => (
                      <li key={i} className="text-[#edede2]">
                        + {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Needs Work */}
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5">
                  <h3 className="mb-2 text-sm font-medium text-amber-400">Needs Work</h3>
                  <ul className="space-y-1 text-sm">
                    {summary.needsWork.map((s, i) => (
                      <li key={i} className="text-[#edede2]">
                        - {s}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Next Steps */}
                <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-5">
                  <h3 className="mb-2 text-sm font-medium text-blue-400">Next Steps</h3>
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
              <p className="text-center text-[#949498]">Session ended. No summary available.</p>
            )}

            <Button
              size="lg"
              onClick={handleNewSession}
              className="w-full rounded-full bg-[#4e4e52]/50 py-6 text-lg text-[#edede2] hover:bg-[#4e4e52]"
            >
              <RotateCcw className="mr-2 h-5 w-5" />
              Start New Session
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusItem({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[0.7rem] font-medium text-[#949498]">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
