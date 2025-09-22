# Import necessary modules and functions
from __future__ import annotations
import os, time, httpx, json
from jose import jwt
from jose.utils import base64url_decode

# Load environment variables
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")

# Set up in-memory cache for JWKS
JWKS_CACHE: dict[str, dict] = {}

# Cache TTL in seconds
JWKS_TTL = 3600

# Function to extract 'kid' from JWT token
def get_kid_from_token(token: str) -> str | None:
    """Get the kid from the token"""
    header_b64 = token.split(".")[0]
    header = json.loads(base64url_decode(header_b64.encode()).decode())
    return header.get("kid")

# Function to extract 'iss' from JWT token
def get_iss_from_token(token: str) -> str | None:
    """Get the issuer from the token"""
    payload_b64 = token.split(".")[1]
    payload = json.loads(base64url_decode(payload_b64.encode()).decode())
    return (payload.get("iss") or "").rstrip("/") or None

# Normalize issuer URL
def normalize_auth_issuer(iss: str) -> str:
    """Return https://<project>.supabase.co without the slash or with /auth/v1."""
    iss = (iss or "").rstrip("/")
    if iss.endswith("/auth/v1"):
        iss = iss[: -len("/auth/v1")]
    return iss

# Fetch JWKS for a given issuer
async def get_jwks_for_issuer(issuer_raw: str) -> dict:
    """Get the json web token for the issuer"""
    base = normalize_auth_issuer(issuer_raw)
    public_url = f"{base}/.well-known/jwks.json"
    certs_url  = f"{base}/auth/v1/certs"

    # Try fetching JWKS from the issuer
    async with httpx.AsyncClient(timeout=10) as client:
        # Try standard JWKS
        r = await client.get(public_url)
        if r.status_code == 200:
            data = r.json()
            return data if "keys" in data else {"keys": data.get("keys", [])}

        # Supabase certs - needs anon key headers
        headers = {}
        if SUPABASE_ANON_KEY:
            headers = {
                "apikey": SUPABASE_ANON_KEY,
                "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
            }

        # Try Supabase certs endpoint
        r = await client.get(certs_url, headers=headers)
        r.raise_for_status()
        data = r.json()

        # Return the JWKS data
        return data if "keys" in data else {"keys": data.get("keys", [])}

# Get JWKS with caching
async def get_json_key(issuer_raw: str) -> dict:
    """Get JWKS for issuer, using the in-memory cache."""
    now = time.time()
    cache_key = normalize_auth_issuer(issuer_raw)
    cached = JWKS_CACHE.get(cache_key)
    if cached and now - cached["t"] < JWKS_TTL:
        return cached["jwks"]
    jwks = await get_jwks_for_issuer(issuer_raw)
    if not jwks.get("keys"):
        raise ValueError("JWKS response has no keys")
    JWKS_CACHE[cache_key] = {"t": now, "jwks": jwks}
    return jwks

# Verify Supabase JWT token
async def verify_supabase_jwt(token: str) -> dict:
    """Check for a Supabase JWT and return claims."""
    try:
        # Extract issuer from token
        iss_claim = get_iss_from_token(token)
        if not iss_claim:
            raise ValueError("Token missing issuer (iss)")

        # Fetch JWKS and find the correct key
        jwks = await get_json_key(iss_claim)
        kid = get_kid_from_token(token)

        # Ensure 'kid' is present
        if not kid:
            raise ValueError("JWT header does not have kid")
        key = next((k for k in jwks["keys"] if k.get("kid") == kid), None)
        if not key:
            raise ValueError("No matching JWK for kid")

        # Decode and verify the JWT
        claims = jwt.decode(
            token,
            key,
            algorithms=[key.get("alg", "RS256")],
            options={"verify_aud": False},
        )

        # Normalize issuer on both sides to avoid false mismatches
        if normalize_auth_issuer(claims.get("iss") or "") != normalize_auth_issuer(iss_claim):
            raise ValueError("Token issuer mismatch")
        return claims

    # Handle exceptions
    except httpx.HTTPStatusError as e:
        raise ValueError(f"JWKS fetch failed: {e.response.status_code} {e.request.url}")
    except httpx.HTTPError as e:
        raise ValueError(f"JWKS fetch error: {e}")
    except Exception as e:
        raise ValueError(f"JWT verification failed: {e}")
