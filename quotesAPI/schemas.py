from datetime import datetime

from pydantic import AliasChoices, BaseModel, Field


class QuoteCreate(BaseModel):
    text: str = Field(min_length=1, max_length=4000, validation_alias=AliasChoices("text", "quotetext"))
    author: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    context: str | None = Field(default=None, max_length=1000)
    creator_id: str | None = Field(default=None, max_length=50)


class QuoteUpdate(BaseModel):
    text: str | None = Field(default=None, min_length=1, max_length=4000)
    author: str | None = Field(default=None, max_length=120)
    name: str | None = Field(default=None, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    context: str | None = Field(default=None, max_length=1000)


class QuoteRead(BaseModel):
    id: int
    text: str
    author: str | None
    name: str | None
    nickname: str | None
    context: str | None
    creator_id: str | None
    created_at: datetime

    model_config = {"from_attributes": True}