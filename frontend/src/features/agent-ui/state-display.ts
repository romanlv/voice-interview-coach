const STATE_COLORS: Record<string, { color: string; label: string; animation: string }> = {
  LISTENING: { color: "#13ef95", label: "Listening", animation: "pulse 2s ease-in-out infinite" },
  THINKING: { color: "#f0c040", label: "Thinking...", animation: "pulse 1s ease-in-out infinite" },
  SPEAKING: { color: "#4da6ff", label: "Speaking", animation: "pulse 1.5s ease-in-out infinite" },
};

export function updateAgentState(state: string, element: HTMLElement | null) {
  if (!element) return;
  const config = STATE_COLORS[state] || STATE_COLORS.LISTENING;
  element.textContent = config.label;
  element.style.color = config.color;
  element.style.animation = config.animation;
}
