# Import standard libraries
from __future__ import annotations
from typing import Optional, Tuple, List, TYPE_CHECKING
from pathlib import Path
from tempfile import NamedTemporaryFile
from pydub import AudioSegment
import io

# Import whisper libraries
if TYPE_CHECKING:
    from faster_whisper import WhisperModel

# Cache for loaded Whisper models
_WHISPER_CACHED: dict[Tuple[str, str, str], "WhisperModel"] = {}

# Determine audio format from file extension
def get_audio_format(file_name: str | None) -> str:
    """Return audio format string for pydub from file extension; default to mp3."""

    # Default to mp3 if filename is missing or unrecognized
    if not file_name:
        return "mp3"
    ext = Path(file_name).suffix.lower()
    return {
        ".mp3": "mp3",
        ".mp4": "mp4",
        ".mpeg": "mp3",
        ".mpga": "mp3",
        ".m4a": "m4a",
        ".wav": "wav",
        ".webm": "webm",
    }.get(ext, "mp3")


# Get duration of audio in seconds
def get_duration_sec(data: bytes, file_name: str | None) -> Optional[float]:
    """Return duration in seconds using pydub+ffmpeg; None if unavailable."""
    try:
        # Use pydub to read the audio and get duration
        fmt = get_audio_format(file_name)
        seg = AudioSegment.from_file(io.BytesIO(data), format=fmt)

        # Return duration in seconds
        return len(seg) / 1000.0
    except Exception:
        return None
    

# Build or get cached Whisper model
def load_whisper_model(
    model_name: str,
    device: str = "auto",
    compute_type: str = "int8",
):
    """Load and cache a Whisper model for ASR."""
    try:
        # Import faster-whisper here to avoid hard dependency if ASR not used
        from faster_whisper import WhisperModel
    except Exception as e:
        raise RuntimeError(
            "Model import for ASR failed."
        ) from e

    # Cache model to avoid reloading
    key = (model_name, device, compute_type)

    # Load and cache the model if not already cached
    if key not in _WHISPER_CACHED:
        _WHISPER_CACHED[key] = WhisperModel(
            model_size_or_path=model_name,
            device=device,
            compute_type=compute_type,
        )
    
    # Return the cached model
    return _WHISPER_CACHED[key]

# Re-encode audio to 16kHz mono WAV PCM16
def encode_to_wav(data: bytes, file_name: str | None) -> bytes:
    """Try re-encode to 16kHz mono WAV PCM16 for problem inputs.
    Safe for normalizing for other ASR models too."""

    # Get audio format from file extension
    fmt = get_audio_format(file_name)

    # Use pydub to read and re-encode the audio
    seg = AudioSegment.from_file(io.BytesIO(data), format=fmt)
    seg = seg.set_frame_rate(16000).set_channels(1).set_sample_width(2)
    buf = io.BytesIO()

    # Export as WAV 
    seg.export(buf, format="wav")

    # Return the WAV
    return buf.getvalue()

# -------------- Main audio_to_text function ------------- #
# Production function to transcribe audio to text with better error handling
def audio_to_text(
    *,
    data: bytes,
    file_name: str | None = None,
    model: str = "tiny.en",
    language: Optional[str] = None,
    device: str = "auto",
    compute_type: str = "int8",
    vad: bool = True,
    beam_size: int = 5,
    no_speech_threshold: float = 0.6,
    reencode_fallback: bool = True,
) -> str:
    """
    Transcribe audio to plain text using local faster-whisper.
    Returns a single string; returns a clear error text instead if needed.
    Retries and handles odd formats, always returns a string.
    """
    try:
        text = transcribe_once(
            data=data,
            file_name=file_name,
            model_name=model,
            language=language,
            device=device,
            compute_type=compute_type,
            vad_filter=vad,
            beam_size=beam_size,
            no_speech_threshold=no_speech_threshold,
            condition_on_previous_text=True,
        )
        # return text if non-empty
        if text:
            return text

        # Retry once with re-encoding if no text and allowed
        if reencode_fallback:
            try:
                wav_bytes = encode_to_wav(data, file_name)
                text2 = transcribe_once(
                    data=wav_bytes,
                    file_name="audio.wav",
                    model_name=model,
                    language=language or "en",
                    device=device,
                    compute_type=compute_type,
                    vad_filter=vad,
                    beam_size=beam_size,
                    no_speech_threshold=max(0.5, no_speech_threshold - 0.05),
                    condition_on_previous_text=True,
                )
                # return text on second attempt if non-empty
                if text2:
                    return text2
                
            # Ignore error and continue to final message
            except Exception:
                pass

        # If still no text, return a default message with duration
        dur = get_duration_sec(data, file_name)

        # Append duration if available
        dur_msg = f" duration={dur:.1f}s" if dur is not None else ""
        return f"[ASR produced no text]{dur_msg}"
    
    # Handle any exceptions thrown during ASR
    except Exception as e:
        return f"[ASR error: {type(e).__name__}: {e}]"


# Single transcription attempt function
def transcribe_once(
    data: bytes,
    file_name: str | None,
    *,
    model_name: str,
    language: Optional[str],
    device: str,
    compute_type: str,
    vad_filter: bool,
    beam_size: int,
    no_speech_threshold: float,
    condition_on_previous_text: bool,
) -> str:
    
    """ Single attempt to transcribe audio to text. """

    # Load the Whisper model
    whisper_model = load_whisper_model(model_name, device=device, compute_type=compute_type)

    # Read the audio
    suffix = Path(file_name or "audio.mp3").suffix or ".mp3"

    # Write to a temp file for faster-whisper
    with NamedTemporaryFile(delete=True, suffix=suffix) as tmp:
        tmp.write(data)
        tmp.flush()
        audio_path = tmp.name

        # Call the transcription
        segments, info = whisper_model.transcribe(
            audio=audio_path,
            language=language,
            task="transcribe",
            vad_filter=vad_filter,
            vad_parameters={"min_silence_duration_ms": 500},
            beam_size=beam_size,
            no_speech_threshold=no_speech_threshold,
            condition_on_previous_text=condition_on_previous_text,
        )

        # Collect and return the text
        parts: List[str] = []
        for seg in segments:
            txt = getattr(seg, "text", "") or ""
            if txt:
                parts.append(txt.strip())

        # Join and return the final text
        return " ".join(parts).strip()