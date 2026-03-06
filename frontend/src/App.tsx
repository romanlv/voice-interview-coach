import { useState, useEffect, useRef } from "react";
import { useVoiceSession, type AgentState } from "./hooks/useVoiceSession";
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
import { Mic, PlugZap, Unplug } from "lucide-react";

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
  } = useVoiceSession();

  const [model, setModel] = useState("nova-3");
  const [language, setLanguage] = useState("en");
  const [ttsVoice, setTtsVoice] = useState("thalia");
  const [title, setTitle] = useState("Live Transcription");
  const [repoUrl, setRepoUrl] = useState(
    "https://github.com/deepgram-starters/node-live-transcription"
  );

  const transcriptEndRef = useRef<HTMLDivElement>(null);

  const isConnected = connectionState === "connected";
  const isConnecting = connectionState === "connecting";
  const isDisconnected = connectionState === "disconnected";

  // Load metadata
  useEffect(() => {
    fetch("api/metadata")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.title) setTitle(data.title);
        if (data?.repository) setRepoUrl(data.repository);
        if (data?.description) {
          document
            .querySelector('meta[name="description"]')
            ?.setAttribute("content", data.description);
        }
      })
      .catch(() => {});
  }, []);

  // Auto-scroll transcripts
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcripts]);

  async function handleConnect() {
    try {
      await connect({ model, language, ttsVoice });
    } catch {
      alert("Failed to connect. Check console for details.");
    }
  }

  const agentConfig = AGENT_STATE_CONFIG[agentState];

  return (
    <div className="flex min-h-screen flex-col bg-[#1a1a1f] text-[#fbfbff]">
      {/* Header */}
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 bg-[#050506] px-6">
        <span className="text-lg font-semibold">{title}</span>
      </header>

      {/* Three-column layout */}
      <div className="flex flex-1 flex-col lg:flex-row overflow-hidden">
        {/* Left Sidebar: Configuration */}
        <aside className="shrink-0 border-b border-white/10 bg-[#050506] p-6 lg:w-72 lg:border-b-0 lg:border-r lg:overflow-y-auto">
          <h3 className="mb-4 text-sm font-medium text-[#949498]">
            Configuration
          </h3>

          <div className="space-y-5">
            {/* Model */}
            <div className="space-y-2">
              <Label className="text-[#949498]">Model</Label>
              <Select
                value={model}
                onValueChange={setModel}
                disabled={!isDisconnected}
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
                disabled={!isDisconnected}
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
                disabled={!isDisconnected}
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
          {/* Connect Overlay */}
          {!isConnected && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0b0b0c]">
              <div className="max-w-sm p-8 text-center">
                <div className="mb-6 text-emerald-400">
                  <Mic className="mx-auto h-16 w-16" />
                </div>
                <h2 className="mb-2 text-2xl font-semibold">{title} Ready</h2>
                <p className="mb-8 text-[#949498]">
                  Configure settings and click Connect to start
                </p>
                <Button
                  size="lg"
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white"
                >
                  <PlugZap className="mr-2 h-4 w-4" />
                  {isConnecting ? "Connecting..." : "Connect"}
                </Button>
              </div>
            </div>
          )}

          {/* Disconnect Button */}
          {isConnected && (
            <div className="absolute right-4 top-4 z-20">
              <Button
                variant="secondary"
                size="sm"
                onClick={disconnect}
                className="bg-[#4e4e52]/50 hover:bg-[#4e4e52] text-[#edede2]"
              >
                <Unplug className="mr-2 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          )}

          {/* Transcript Container */}
          {isConnected && (
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

            <StatusItem label="Model">
              {activeConfig?.model ?? "-"}
            </StatusItem>

            <StatusItem label="Language">
              {activeConfig?.language ?? "-"}
            </StatusItem>

            <StatusItem label="Messages Received">
              {stats.messages}
            </StatusItem>

            <StatusItem label="Final Transcripts">{stats.finals}</StatusItem>

            <StatusItem label="Agent State">
              <span className={`${agentConfig.color} ${isConnected ? agentConfig.pulseSpeed : ""}`}>
                {isConnected ? agentConfig.label : "-"}
              </span>
            </StatusItem>
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
