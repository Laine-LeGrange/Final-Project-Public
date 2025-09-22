# Load dotenv and env file
from dotenv import load_dotenv
load_dotenv(dotenv_path="backend/.env")

# Import other required libraries and modules
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware

# Import internal auth and endpoint routers
from app.api.routes import rag_router
from app.deps.auth import current_user
from app.services.audio import router as audio_router
from app.services.asr_websocket import router as asr_ws_router   

# Create FastAPI app instance - the main entry point
app = FastAPI()

# Mount all RAG endpoints under /api
app.include_router(rag_router, prefix="/api")

# include audio endpoints
app.include_router(audio_router)

# add ASR websocket endpoint
app.include_router(asr_ws_router)

# Define the allowed origins
origins = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]

# Add CORS Middleware to FastAPI app
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define protected GET endpoint
@app.get("/api/protected")
async def protected(user = Depends(current_user)):
    return {"ok": True, "user": user}
