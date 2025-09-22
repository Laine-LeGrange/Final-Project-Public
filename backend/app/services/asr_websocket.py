# Import the required libraries
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from faster_whisper import WhisperModel # using faster whisper for fast live transcription
import asyncio
import subprocess
import tempfile
import os
from typing import Optional

# Create API router
router = APIRouter()

# Load the model once
# other options: tiny/base/small + int8/int8_float32/float16
model = WhisperModel("base", compute_type="int8")

# Convert audio format
async def convert_to_wav(src_webm: str, dst_wav: str) -> bool:
    """Converts webm/opus from adio recorder to 16k mono wav.
    Returns true if successful"""
    try:
        # FFMpeg command to convert audio file
        cmd = [
            "ffmpeg", "-nostdin", "-y",
            "-i", src_webm,
            "-ar", "16000", "-ac", "1",
            dst_wav
        ]
        # run the conversion command
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    # in the case of bad conversion, return false
    except Exception:
        return False

# Transcribe the audio 'live' by passing segments at a time while recording is active
async def near_live_transcribe(
    ws: WebSocket,
    webm_path: str,
    stop_event: asyncio.Event,
    interval_s: float = 0.7,
):
    """
    Every `interval_s`, convert the current webm to wav, run whisper,
    and send a 'partial' frame if the text changed.
    """
    last_text: str = ""
    tmp_wav: Optional[str] = None

    try:
        # re-use the same wav path to avoid file proliferation
        tmp_wav = webm_path + ".live.wav"

        # While loop for live transcription
        while not stop_event.is_set():
            await asyncio.sleep(interval_s)

            # If file is too small, ignore and skip
            try:
                if os.path.getsize(webm_path) < 1000:
                    continue
            except FileNotFoundError:
                continue

            # convert to wav file
            ok = await convert_to_wav(webm_path, tmp_wav)
            if not ok:
                continue

            # Low-latency setup with small beam and no VAD - this makes it faster for live transcription
            segments, _info = model.transcribe(
                tmp_wav,
                beam_size=1,
                vad_filter=False,
                condition_on_previous_text=True,
                language="en",
            )
            # Join detected segments
            text = "".join(seg.text for seg in segments).strip()
            if text and text != last_text:
                last_text = text
                try:
                    # Send partials text to frontend for display
                    await ws.send_json({"type": "partial", "text": last_text})
                except Exception:
                    break

        # final pass when told to stop recording by user
        if os.path.exists(webm_path):
            final_wav = webm_path + ".final.wav"
            if await convert_to_wav(webm_path, final_wav):

                # Use better setup for final transcription - tends to fix small mistakes
                segments, _info = model.transcribe(
                    final_wav,
                    beam_size=5,
                    vad_filter=True,
                    condition_on_previous_text=True,
                    language="en",
                )
                # Join the final segments of text together
                final_text = "".join(seg.text for seg in segments).strip()

                # Send the text to the frontend to update transcribed text in the textbox
                await ws.send_json({"type": "final", "text": final_text or last_text})
                try:
                    # remove the wav file, as we do not need it anymore
                    os.remove(final_wav)
                except Exception:
                    pass

    # also, remove the temp wav file used for 'live' transcription
    finally:
        if tmp_wav:
            try:
                os.remove(tmp_wav)
            except Exception:
                pass

# Websocket endpoint for the live ASR
@router.websocket("/api/ws/asr")
async def websocket_asr(ws: WebSocket):
    """Websocket endpoint for chat ASR
    Accepts a websocket connection, saves incoming audio to temp file, runs transcription and stops
    and cleans up when end marker is received, or socket disconnects"""

    # Accept connection to start exchange
    await ws.accept()
    stop_event = asyncio.Event() # setup events

    # Rolling webm file which is added to as chunks arrive
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as f:
        webm_path = f.name

    # Task that periodically sends partials
    periodic_asr_task = asyncio.create_task(near_live_transcribe(ws, webm_path, stop_event))

    try:
        # Append incoming audio chunks
        with open(webm_path, "ab") as fout:
            while True:
                msg = await ws.receive()
                if "bytes" in msg:
                    data: bytes = msg["bytes"]
                    # "__END__" marker
                    if data == b"__END__":
                        # stop transcription
                        stop_event.set()
                        break
                    fout.write(data)
                elif "text" in msg:
                    # In case client accidentally sends text; ignore unless it's the marker
                    if msg["text"] == "__END__":
                        stop_event.set()
                        break
                else:
                    # Unknown frame type
                    await asyncio.sleep(0)

        # wait for the periodic asr worker to send the final frame
        await periodic_asr_task

    # Disconnect the websocket, signal transcription stop
    except WebSocketDisconnect:
        stop_event.set()
        try:
            # wait for asr transcription to finish
            await periodic_asr_task
        except Exception:
            pass
    finally:
        try:
            # lastly, remove the audio file path
            os.remove(webm_path)
        except Exception:
            pass
        # close websocket
        await ws.close()
