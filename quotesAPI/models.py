from datetime import datetime
import uuid

from sqlalchemy import UUID, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Quote(Base):
    __tablename__ = "quotes"

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, index=True)
    guild_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    datetime_added: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    datetime_said: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    lines: Mapped[list["QuoteLine"]] = relationship(
        back_populates="quote",
        cascade="all, delete-orphan",
        order_by="QuoteLine.line_number",
    )


class QuoteLine(Base):
    __tablename__ = "quote_lines"
    __table_args__ = (UniqueConstraint("quote_id", "line_number", name="uq_quote_line_number"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID, primary_key=True, index=True)
    quote_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False, index=True)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    speaker: Mapped[str] = mapped_column(String(120), nullable=False)
    nickname: Mapped[str | None] = mapped_column(String(120), nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    quote: Mapped[Quote] = relationship(back_populates="lines")