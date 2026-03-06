let audioContext = null;
let mediaStream = null;
let audioProcessor = null;

export function getAudioContext() {
  return audioContext;
}

export async function initAudioContext() {
  if (audioContext) return audioContext;
  audioContext = new (window.AudioContext || window.webkitAudioContext)({
    sampleRate: 16000,
  });
  if (audioContext.state === 'suspended') {
    await audioContext.resume();
  }
  console.log(`Audio context initialized: ${audioContext.sampleRate}Hz`);
  return audioContext;
}

export async function startMicrophone(onAudioChunk) {
  if (mediaStream) return;

  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      channelCount: 1,
      sampleRate: 16000,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });

  if (!audioContext) await initAudioContext();

  const source = audioContext.createMediaStreamSource(mediaStream);
  audioProcessor = audioContext.createScriptProcessor(4096, 1, 1);

  let chunkCount = 0;
  audioProcessor.onaudioprocess = (e) => {
    const inputData = e.inputBuffer.getChannelData(0);
    const pcm16 = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    onAudioChunk(pcm16.buffer);
    chunkCount++;
    if (chunkCount === 1) {
      console.log(`First audio chunk sent (${pcm16.buffer.byteLength} bytes)`);
    }
  };

  source.connect(audioProcessor);
  audioProcessor.connect(audioContext.destination);
  console.log('Microphone active');
}

export function stopMicrophone() {
  if (audioProcessor) {
    audioProcessor.disconnect();
    audioProcessor = null;
  }
  if (mediaStream) {
    mediaStream.getTracks().forEach((t) => t.stop());
    mediaStream = null;
  }
}
