// Text-to-Speech function to call backend API and play audio
// Uses af_heart voice by default
export async function speak(apiBase: string, text: string, voice = "af_heart") {

  // POST request to TTS API with text and voice parameters
  const res = await fetch(`${apiBase}/api/media/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice }),
  });

  // Handle error
  if (!res.ok) throw new Error(`TTS HTTP ${res.status}`);

  // Get audio data as a blob
  const blob = await res.blob();
  const url = URL.createObjectURL(blob); // create temp URL for the blob

  // Create audio element
  const audio = new Audio(url);

  // Play the audio
  audio.play();

  // Clean URL after playback finishes
  audio.onended = () => URL.revokeObjectURL(url);
}
