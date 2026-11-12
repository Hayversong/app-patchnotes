from fastapi import APIRouter, status

from app.routers.deps import CurrentUser, SessionDep
from app.schemas.devlog import CreateDevlogRequest, CreateDevlogResponse, DevlogEntriesResponse, DevlogEntryOut
from app.services import devlog_service

router = APIRouter(prefix="/devlog", tags=["devlog"])


@router.get("/entries", response_model=DevlogEntriesResponse)
async def list_entries(user: CurrentUser, session: SessionDep) -> DevlogEntriesResponse:
    entries = await devlog_service.list_entries(session, user.id)
    return DevlogEntriesResponse(entries=[DevlogEntryOut.model_validate(entry, from_attributes=True) for entry in entries])


@router.post("/entries", response_model=CreateDevlogResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(body: CreateDevlogRequest, user: CurrentUser, session: SessionDep) -> CreateDevlogResponse:
    entry = await devlog_service.create_entry(session, user.id, body)
    return CreateDevlogResponse(entry=DevlogEntryOut.model_validate(entry, from_attributes=True))
