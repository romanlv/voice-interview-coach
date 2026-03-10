export const elements: Record<string, HTMLElement | null> = {
  pageTitle: null,
  pageDescription: null,
  headerTitle: null,
  repoLink: null,
  modelSelect: null,
  languageInput: null,
  connectOverlay: null,
  connectBtn: null,
  disconnectContainer: null,
  disconnectBtn: null,
  transcriptContainer: null,
  emptyState: null,
  connectionStatus: null,
  micStatus: null,
  currentModel: null,
  currentLanguage: null,
  messageCount: null,
  finalCount: null,
  ttsVoiceSelect: null,
  agentState: null,
};

export function initElements() {
  elements.pageTitle = document.getElementById("pageTitle");
  elements.pageDescription = document.getElementById("pageDescription");
  elements.headerTitle = document.getElementById("headerTitle");
  elements.repoLink = document.getElementById("repoLink");
  elements.modelSelect = document.getElementById("model-select");
  elements.languageInput = document.getElementById("language-input");
  elements.connectOverlay = document.getElementById("connect-overlay");
  elements.connectBtn = document.getElementById("connect-btn");
  elements.disconnectContainer = document.getElementById("disconnect-container");
  elements.disconnectBtn = document.getElementById("disconnect-btn");
  elements.transcriptContainer = document.getElementById("transcript-container");
  elements.emptyState = document.getElementById("empty-state");
  elements.connectionStatus = document.getElementById("connection-status");
  elements.micStatus = document.getElementById("mic-status");
  elements.currentModel = document.getElementById("current-model");
  elements.currentLanguage = document.getElementById("current-language");
  elements.messageCount = document.getElementById("message-count");
  elements.finalCount = document.getElementById("final-count");
  elements.ttsVoiceSelect = document.getElementById("tts-voice-select");
  elements.agentState = document.getElementById("agent-state");
}

export async function loadMetadata() {
  try {
    const response = await fetch("api/metadata");
    if (!response.ok) return;
    const metadata = await response.json();
    if (metadata.title && elements.pageTitle) elements.pageTitle.textContent = metadata.title;
    if (metadata.description && elements.pageDescription)
      elements.pageDescription.setAttribute("content", metadata.description);
    if (metadata.title && elements.headerTitle) elements.headerTitle.textContent = metadata.title;
    if (metadata.repository && elements.repoLink)
      (elements.repoLink as HTMLAnchorElement).href = metadata.repository;
  } catch (error) {
    console.warn("Error loading metadata:", error);
  }
}
