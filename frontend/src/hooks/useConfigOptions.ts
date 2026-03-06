import { useState, useEffect } from "react";

export function useConfigOptions() {
  const [candidates, setCandidates] = useState<string[]>([]);
  const [interviewers, setInterviewers] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("api/candidates").then((r) => r.json()),
      fetch("api/interviewers").then((r) => r.json()),
      fetch("api/positions").then((r) => r.json()),
    ]).then(([c, i, p]) => {
      setCandidates(c);
      setInterviewers(i);
      setPositions(p);
    }).catch(console.error);
  }, []);

  return { candidates, interviewers, positions };
}
