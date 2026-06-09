from datetime import datetime

from pydantic import BaseModel, Field


class QuoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    author: str | None = Field(default=None, max_length=120)


class QuoteRead(BaseModel):
    id: int
    text: str
    author: str | None
    created_at: datetime

    model_config = {"from_attributes": True}