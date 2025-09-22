# Import libraries
import os
from fastapi import HTTPException, Request, status
import httpx

#  Setup authentication bypass for development
AUTH_BYPASS = os.getenv("AUTH_BYPASS", "false").lower() in {"1","true","yes"}

# Get supabase URL and key for auth header
SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

# Get the current user 
async def current_user(request: Request):
    """Get the current user
        AUTH BYPASSS will allow database operations for development
    """
    if AUTH_BYPASS:
        return {
            "id": "00000000-0000-0000-0000-000000000000",
            "email": "dev@example.com",
            "role": "authenticated",
            "claims": {},
        }

    # Get the headers for authentication
    auth = request.headers.get("authorization", "")

    # Validate whether bearer token is present
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")
    
    # Clean token
    token = auth.split(" ", 1)[1].strip()

    # Get authenticated users details from supabase
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(
            f"{SUPABASE_URL}/auth/v1/user",
            headers={
                "Authorization": f"Bearer {token}",
                "apikey": SUPABASE_ANON_KEY,
            },
        )

    # Raise errors
    if resp.status_code != 200:
        # IF authentication fails
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = resp.json()
    uid = user.get("id")
    if not uid:
        # If not valid user is found
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No user found for token")

    # Otherwise, return authenticated user data
    return {
        "id": uid,
        "email": user.get("email"),
        "role": "authenticated",
        "claims": user,
    }
