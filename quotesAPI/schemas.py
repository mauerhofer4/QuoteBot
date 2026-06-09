from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


class QuoteCreate(BaseModel):
    quotetext: str = Field(min_length=1, max_length=4000)
    context: str | None = Field(default=None, max_length=4000)
    author: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    datetime_said: datetime | None = None


class QuoteUpdate(BaseModel):
    quotetext: str | None = Field(default=None, min_length=1, max_length=4000)
    context: str | None = Field(default=None, max_length=4000)
    author: str | None = Field(default=None, min_length=1, max_length=120)
    name: str | None = Field(default=None, min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    datetime_said: datetime | None = None


class QuoteRead(BaseModel):
    id: int
    quotetext: str
    context: str | None
    author: str
    name: str
    nickname: str | None
    datetime_added: datetime
    datetime_said: datetime | None

    model_config = ConfigDict(from_attributes=True)

    @computed_field(return_type=str)
    @property
    def text(self) -> str:
        return self.quotetext

    @computed_field(return_type=datetime)
    @property
    def created_at(self) -> datetime:
        return self.datetime_added