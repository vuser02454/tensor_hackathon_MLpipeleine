from typing import Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class GeoCheckRequest(BaseModel):
    lat: float
    lng: float
    ip: str


def _normalize_city(city: Optional[str]) -> str:
    if not city:
        return ""
    return city.strip().lower()


def _pick_city(address: dict) -> str:
    for key in ("city", "town", "village", "municipality", "county", "state_district"):
        value = address.get(key)
        if value:
            return str(value)
    return ""


@router.post("/api/geo-check")
async def geo_check(payload: GeoCheckRequest):
    ip_url = f"https://ipapi.co/{payload.ip}/json/"
    reverse_url = (
        "https://nominatim.openstreetmap.org/reverse"
        f"?lat={payload.lat}&lon={payload.lng}&format=json"
    )

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            ip_resp = await client.get(ip_url)
            ip_resp.raise_for_status()
            ip_data = ip_resp.json()

            reverse_resp = await client.get(
                reverse_url, headers={"User-Agent": "loan-onboarding-app/1.0"}
            )
            reverse_resp.raise_for_status()
            reverse_data = reverse_resp.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail=f"Geo lookup failed: {exc}") from exc

    ip_city = str(ip_data.get("city") or "").strip()
    browser_city = _pick_city(reverse_data.get("address") or {}).strip()

    fraud_flag = _normalize_city(browser_city) != _normalize_city(ip_city)
    message = (
        "Location mismatch detected between browser geolocation and IP geolocation."
        if fraud_flag
        else "Browser geolocation matches IP location."
    )

    return {
        "browser_city": browser_city,
        "ip_city": ip_city,
        "fraud_flag": fraud_flag,
        "message": message,
    }
