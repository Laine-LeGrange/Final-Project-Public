# Import the required libraries and modules
from fastapi import APIRouter, UploadFile, File, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from faster_whisper import WhisperModel
from kokoro import KPipeline # Chosen TTS model
import soundfile as sf
import traceback
import io
import tempfile
import subprocess
import os
import re, html
import numpy as np

# Create router
router = APIRouter(prefix="/api/media", tags=["media"])

# Init Kokoro
kokoro = KPipeline(lang_code="a")

# The ASR endpoint here is kept in the codebase as it can be used 
# in the future where live transcription is not required
# The ASR endpoint used in the working app is the websocket endpoint in services/asr_websocket.py

# Load model
model = WhisperModel("base", compute_type="int8")

# -------------- Markdown cleaner --------------
def clean_markdown_for_tts(text: str) -> str:
    """Cleans the markdown text input that comes from the stored text in the database
    This prevents TTS model from reading markdown charactercs and stopping early"""

    # if there is no text sent through
    if not text:
        return ""
    
    # Remove code blocks characters (and language specifiers)
    text = re.sub(r"```[\w]*\n?[\s\S]*?```", "", text)
    
    # Remove any inline code
    text = re.sub(r"`([^`]+)`", r"\1", text)
    
    # Not necessary, but safe for future implementations which use multimodal modals
    # Remove images - use alt text if provided or "image"
    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", lambda m: m.group(1) if m.group(1) else "image", text)
    
    # Remove links - but keep the link text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    
    # Remove md headings chars (# ## ### etc....)
    text = re.sub(r"^\s{0,3}#{1,6}\s+", "", text, flags=re.MULTILINE)
    
    # Remove bold and italic markdown
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"\1", text)# bold+italic
    text = re.sub(r"\*\*(.+?)\*\*", r"\1", text) # bold
    text = re.sub(r"\*(.+?)\*", r"\1", text) # italic
    text = re.sub(r"___(.+?)___", r"\1", text)# bold+italic
    text = re.sub(r"__(.+?)__", r"\1", text) # bold
    text = re.sub(r"_(.+?)_", r"\1", text) # italic
    
    # Remove strikethroughs
    text = re.sub(r"~~(.+?)~~", r"\1", text)
    
    # Remove unordered list markers
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    
    # Remove ordered list markers
    text = re.sub(r"^\s*\d+\.\s+", "", text, flags=re.MULTILINE)
    
    # Remove blockquotes
    text = re.sub(r"^\s*>\s*", "", text, flags=re.MULTILINE)
    
    # Remove horizontal rules
    text = re.sub(r"^\s*[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)
    
    # Remove tables chars 
    # - will require future work to better handle table data
    text = re.sub(r"^\s*\|.*\|\s*$", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[:\-\|]*\s*$", "", text, flags=re.MULTILINE)
    
    # Remove math expressions
    # - will require future work to better handle expressions which could appear in summaries
    text = re.sub(r"\$\$([\s\S]*?)\$\$", r"math expression", text)
    text = re.sub(r"\$([^$\n]+)\$", r"math expression", text)
    
    # Remove any HTML tags
    text = re.sub(r"<[^>]+>", "", text)
    
    # Decode HTML entities
    text = html.unescape(text)
    
    # Clean up whitespace in the text
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+\n", "\n", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]{2,}", " ", text)
    text = re.sub(r"^\s+|\s+$", "", text, flags=re.MULTILINE)
    
    # return the cleaned text
    return text.strip()

def convert_to_wav16(audio_bytes: bytes) -> str:
    """Convert webm/opus to 16kHz mono wav using ffmpeg, and returns the path."""
    with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as fin:

        # write the temp file
        fin.write(audio_bytes)
        fin.flush()
        file_out_path = fin.name + ".wav"

        # Define ffmpeg conversion command
        cmd = [
            "ffmpeg", "-y", "-i", fin.name,
            "-ar", "16000", "-ac", "1", file_out_path
        ]

        # run command
        subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        # return output file path
        return file_out_path


# ---------------- OLD ASR Endpoint (kept for future use) ----------------

@router.post("/asr")
async def transcribe(file: UploadFile = File(...)):
    """transcibe audio"""
    try:
        audio_bytes = await file.read()
        wav_path = convert_to_wav16(audio_bytes)

        segments, info = model.transcribe(wav_path, beam_size=5)
        text = " ".join([seg.text.strip() for seg in segments if seg.text.strip()])

        # cleanup the audio file
        os.remove(wav_path)

        # return the transcribed text
        return {"text": text}
    
    # handle exceptions
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(500, f"ASR failed: {e}")


# -------------------------- TTS (Kokoro) --------------------------

# Define TTS requirements
class TtsReq(BaseModel):
    text: str
    voice: str = "af_heart" # TTS output voice style, other options: | af_nicole | af_heart | af_bella | 
    # Users preferred af_heart over other options

# TTS Endpoint
@router.post("/tts")
def tts(req: TtsReq):
    """Converts text into speech and outputs audio to frontend"""
    try:
        # Clean markdown before synthesis
        clean_text = clean_markdown_for_tts(req.text)
        
        # Used for debugging: compared cleaned text and uncleaned text
        print(f"Original text: {req.text[:100]}...")
        print(f"Cleaned text: {clean_text[:100]}...")
        
        # Validate that there is text for TTS
        if not clean_text.strip():
            raise HTTPException(400, "No text to synthesize after cleaning")
        
        # Generate audio from Kokoro - collect ALL chunks
        gen = kokoro(clean_text, voice=req.voice)
        audio_chunks = []
        
        # Collect all the audio chunks from the generator
        for graphemes, phonemes, audio_chunk in gen:
            if audio_chunk is not None and len(audio_chunk) > 0:
                # add audio chunk to collection of chunks
                audio_chunks.append(audio_chunk)
        
        # If there is no audio chuncks, raise error
        if not audio_chunks:
            raise HTTPException(500, "No audio generated")
        
        # Concatenate all audio chunks
        if len(audio_chunks) == 1:
            final_audio = audio_chunks[0]
        else:
            final_audio = np.concatenate(audio_chunks, axis=0)
        
        # Write to WAV buffer
        wav_buf = io.BytesIO()
        sf.write(wav_buf, final_audio, 24000, format="WAV")
        
        # Return generated audio
        return Response(content=wav_buf.getvalue(), media_type="audio/wav")
        
    # Handle exceptions
    except Exception as e:
        # trace error if occur
        traceback.print_exc()
        raise HTTPException(500, f"TTS failed: {e}")