from fastapi import APIRouter, Query, Request, status

from app.core.rate_limit import enforce
from app.routers.deps import CurrentUser, SessionDep
from app.schemas.devlog import DEVLOG_PAGE_MAX, CreateDevlogRequest, CreateDevlogResponse, DevlogEntriesResponse, DevlogEntryOut
from app.services import devlog_service

router = APIRouter(prefix="/devlog", tags=["devlog"])

DEVLOG_WRITES_PER_MINUTE = 30


@router.get("/entries", response_model=DevlogEntriesResponse, response_model_exclude_none=True)
async def list_entries(
    user: CurrentUser,
    session: SessionDep,
    limit: int = Query(default=DEVLOG_PAGE_MAX, ge=1, le=DEVLOG_PAGE_MAX),
    cursor: str | None = Query(default=None, max_length=200),
) -> DevlogEntriesResponse:
    entries, next_cursor = await devlog_service.list_entries(session, user.id, limit=limit, cursor=cursor)
    return DevlogEntriesResponse(
        entries=[DevlogEntryOut.model_validate(entry, from_attributes=True) for entry in entries], next_cursor=next_cursor,
    )


@router.post("/entries", response_model=CreateDevlogResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(body: CreateDevlogRequest, request: Request, user: CurrentUser, session: SessionDep) -> CreateDevlogResponse:
    await enforce(request, "devlog-write", str(user.id), limit=DEVLOG_WRITES_PER_MINUTE, window_seconds=60)
    entry = await devlog_service.create_entry(session, user.id, body)
    return CreateDevlogResponse(entry=DevlogEntryOut.model_validate(entry, from_attributes=True))
