import { useState, useEffect, useRef } from "react";

export function useAudioAnalysis(
  agentAnalyser: AnalyserNode | null,
  userAnalyser: AnalyserNode | null,
) {
  const [agentVolume, setAgentVolume] = useState(0);
  const [userVolume, setUserVolume] = useState(0);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const agentData = agentAnalyser
      ? new Uint8Array(agentAnalyser.frequencyBinCount)
      : null;
    const userData = userAnalyser
      ? new Uint8Array(userAnalyser.frequencyBinCount)
      : null;

    function tick() {
      if (agentData && agentAnalyser) {
        agentAnalyser.getByteFrequencyData(agentData);
        let sum = 0;
        for (let i = 0; i < agentData.length; i++) sum += agentData[i];
        setAgentVolume(Math.min(1, sum / agentData.length / 48));
      } else {
        setAgentVolume(0);
      }

      if (userData && userAnalyser) {
        userAnalyser.getByteFrequencyData(userData);
        let sum = 0;
        for (let i = 0; i < userData.length; i++) sum += userData[i];
        setUserVolume(Math.min(1, sum / userData.length / 48));
      } else {
        setUserVolume(0);
      }

      rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [agentAnalyser, userAnalyser]);

  return { agentVolume, userVolume };
}
