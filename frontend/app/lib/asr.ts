// Function to call ASR API with audio data and return transcribed text
export async function callASR(apiBase: string, blob: Blob): Promise<string> {

  // Prepare form data with the audio blob
  const fd = new FormData();
  fd.append("file", blob, "audio.wav");

  // Call the ASR API endpoint
  const res = await fetch(`${apiBase}/api/media/asr`, { method: "POST", body: fd });
  if (!res.ok) throw new Error(`ASR HTTP ${res.status}`);
  const json = await res.json();

  // Return the transcribed text or an empty string if not available
  return json.text || "";
}
