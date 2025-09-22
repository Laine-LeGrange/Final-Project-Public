"use client";
// Mark as client component

// Import the necessary hooks from React
import { useRef, useState } from "react";

// Custom hook to manage ASR WebSocket connection and media recording
export function useASRWebSocket(

  // WebSocket URL for ASR service
  wsUrl: string,
  onPartial: (txt: string) => void, // Callback for partial transcription results
  onFinal: (txt: string) => void // Callback for final transcription results
) {
  // References to ws and mr instances
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const [recording, setRecording] = useState(false);

  // Start recording and open ws connection
  async function start() {
    if (recording) return;

    // Ask for microphone access
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // create recorder instance
    const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });

    // create websocket connection
    const ws = new WebSocket(wsUrl);
    ws.binaryType = "arraybuffer";

    // on open, send a start message
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        // Callbacks based on message type
        if (msg.type === "partial") onPartial(msg.text);
        if (msg.type === "final") onFinal(msg.text);
      } catch {}
    };

    wsRef.current = ws;
    mr.ondataavailable = (e) => {
      // send audio data when available
      if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
        ws.send(e.data);
      }
    };
    mr.start(250); // send every 250 millisec
    mediaRef.current = mr;

    // update state
    setRecording(true);
  }

  // Stop recording and close ws connection
  function stop() {
    if (mediaRef.current) {
      // stop the recorder
      mediaRef.current.stop();
      mediaRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRef.current = null;
    }
    // close the websocket connection
    if (wsRef.current) {
      wsRef.current.send(new Blob([new Uint8Array(Buffer.from("__END__"))]));
    }

    // update state
    setRecording(false);
  }

  // Return the start and stop functions and recording state
  return { start, stop, recording };
}
