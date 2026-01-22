from pydantic import BaseModel


class StatusCreate(BaseModel):
    name: str
    color: str = "#83a598"


class StatusUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class StatusFullResponse(BaseModel):
    id: str
    name: str
    color: str
    is_default: bool
    order: int

    class Config:
        from_attributes = True


class RoundTypeCreate(BaseModel):
    name: str


class RoundTypeFullResponse(BaseModel):
    id: str
    name: str
    is_default: bool

    class Config:
        from_attributes = True
