from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from services.clients import ClientError, add_client, list_client_names

router = APIRouter(prefix="/api")


class NewClient(BaseModel):
    name: str


@router.get("/clients")
def get_clients():
    """Return the client roster (sorted names) for the dropdown."""
    return list_client_names()


@router.post("/clients")
def create_client(body: NewClient):
    """Add a new client to the roster. Idempotent on a case-insensitive name."""
    try:
        return add_client(body.name)
    except ClientError as e:
        raise HTTPException(status_code=400, detail=str(e))
