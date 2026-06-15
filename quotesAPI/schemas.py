from datetime import datetime
import uuid

from pydantic import BaseModel, ConfigDict, Field, computed_field


class QuoteLineCreate(BaseModel):
    speaker: str = Field(min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    text: str = Field(min_length=1, max_length=4000)


class QuoteLineUpdate(BaseModel):
    speaker: str | None = Field(default=None, min_length=1, max_length=120)
    nickname: str | None = Field(default=None, max_length=120)
    text: str | None = Field(default=None, min_length=1, max_length=4000)


class QuoteLineRead(BaseModel):
    id: uuid.UUID
    quote_id: uuid.UUID
    line_number: int
    speaker: str
    nickname: str | None
    text: str

    model_config = ConfigDict(from_attributes=True)


class QuoteCreate(BaseModel):
    guild_id: int
    context: str | None = Field(default=None, max_length=4000)
    author: str = Field(min_length=1, max_length=120)
    datetime_said: datetime | None = None
    lines: list[QuoteLineCreate] = Field(min_length=1)


class QuoteUpdate(BaseModel):
    guild_id: int | None = Field(default=None)
    context: str | None = Field(default=None, max_length=4000)
    author: str | None = Field(default=None, min_length=1, max_length=120)
    datetime_said: datetime | None = None
    lines: list[QuoteLineCreate] | None = Field(default=None, min_length=1)


class QuoteRead(BaseModel):
    id: uuid.UUID
    context: str | None
    author: str
    guild_id: int
    datetime_added: datetime
    datetime_said: datetime | None
    lines: list[QuoteLineRead]

    model_config = ConfigDict(from_attributes=True)

    @computed_field(return_type=str)
    @property
    def quotetext(self) -> str:
        formatted_lines = []
        for line in self.lines:
            speaker_label = line.speaker if line.nickname is None else f"{line.speaker} ({line.nickname})"
            formatted_lines.append(f'"{line.text}" ~{speaker_label}')
        return "\n".join(formatted_lines)

    @computed_field(return_type=str)
    @property
    def text(self) -> str:
        return self.quotetext

    @computed_field(return_type=datetime)
    @property
    def created_at(self) -> datetime:
        return self.datetime_added