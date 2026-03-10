import { useState, useEffect, useRef, useMemo } from "react";
import Orb from "./Orb";

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface LoadingScreenProps {
  messages: string[];
  rotateIntervalMs?: number;
}

export default function LoadingScreen({ messages, rotateIntervalMs = 3500 }: LoadingScreenProps) {
  const shuffled = useMemo(() => shuffle(messages), [messages]);
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const [orbSize, setOrbSize] = useState(300);

  // Rotate messages with fade, no repeats until full cycle
  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % shuffled.length);
        setVisible(true);
      }, 400);
    }, rotateIntervalMs);
    return () => clearInterval(interval);
  }, [shuffled.length, rotateIntervalMs]);

  // Resize orb to fit container
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setOrbSize(Math.min(width * 0.6, height * 0.5, 400));
      }
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="flex flex-1 flex-col items-center justify-center gap-8">
      <Orb width={orbSize} height={orbSize} agentVolume={0} userVolume={0} status="THINKING" />
      <p
        className={`text-lg text-[#949498] transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {shuffled[index]}
      </p>
    </div>
  );
}
