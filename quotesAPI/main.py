import random
from datetime import datetime, timezone
from collections.abc import AsyncGenerator
import uuid

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from database import async_session, engine
from models import Base, Quote, QuoteLine
from schemas import QuoteCreate, QuoteLineCreate, QuoteLineRead, QuoteLineUpdate, QuoteRead, QuoteUpdate


app = FastAPI(title="QuoteBot API", version="0.2")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


def quote_select():
    return select(Quote).options(selectinload(Quote.lines))


async def load_quote(session: AsyncSession, quote_id: uuid.UUID) -> Quote | None:
    result = await session.execute(quote_select().where(Quote.id == quote_id))
    return result.scalar_one_or_none()
    

async def load_line(session: AsyncSession, quote_id: uuid.UUID, line_id: uuid.UUID) -> QuoteLine | None:
    result = await session.execute(
        select(QuoteLine).where(QuoteLine.quote_id == quote_id, QuoteLine.id == line_id)
    )
    return result.scalar_one_or_none()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/quotes", response_model=list[QuoteRead])
async def list_quotes(session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(quote_select().order_by(Quote.id.desc()))
    return list(result.scalars().all())


@app.get("/quotes/random", response_model=QuoteRead)
async def get_random_quote(session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(quote_select().order_by(Quote.id.desc()))
    quotes = list(result.scalars().all())
    if not quotes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found")
    return random.choice(quotes)


@app.get("/quotes/guild/{guild_id}/random", response_model=QuoteRead)
async def get_random_quote_by_guild(guild_id: str, session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id).order_by(Quote.id.desc())
    )
    quotes = list(result.scalars().all())
    if not quotes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found for the specified guild")
    return random.choice(quotes)


@app.get("/quotes/latest", response_model=QuoteRead)
async def get_latest_quote(session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(
        quote_select().order_by(Quote.datetime_added.desc(), Quote.id.desc()).limit(1)
    )
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found")
    return quote


@app.get("/quotes/guild/{guild_id}/latest", response_model=QuoteRead)
async def get_latest_quote_by_guild(guild_id: str, session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id).order_by(Quote.datetime_added.desc(), Quote.id.desc()).limit(1)
    )
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found for the specified guild")
    return quote


@app.get("/quotes/search", response_model=list[QuoteRead])
async def search_quotes(query: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    search = f"%{query.strip()}%"
    result = await session.execute(
        quote_select()
        .join(Quote.lines)
        .where(
            or_(
                Quote.context.ilike(search),
                Quote.author.ilike(search),
                QuoteLine.speaker.ilike(search),
                QuoteLine.text.ilike(search),
            )
        )
        .distinct()
        .order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/guild/{guild_id}/search", response_model=list[QuoteRead])
async def search_quotes_by_guild(guild_id: str, query: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    search = f"%{query.strip()}%"
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id)
        .join(Quote.lines)
        .where(
            or_(
                Quote.context.ilike(search),
                Quote.author.ilike(search),
                QuoteLine.speaker.ilike(search),
                QuoteLine.text.ilike(search),
            )
        )
        .distinct()
        .order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/by-author/{author}", response_model=list[QuoteRead])
async def get_quotes_by_author(author: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().where(Quote.author.ilike(f"%{author}%")).order_by(Quote.id.desc())
    )
    return list(result.scalars().all())

@app.get("/quotes/guild/{guild_id}/by-author/{author}", response_model=list[QuoteRead])
async def get_quotes_by_author_in_guild(guild_id: str, author: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id).where(Quote.author.ilike(f"%{author}%")).order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/by-speaker/{speaker}", response_model=list[QuoteRead])
async def get_quotes_by_speaker(speaker: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().join(Quote.lines).where(QuoteLine.speaker.ilike(f"%{speaker}%")).distinct().order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/guild/{guild_id}/by-speaker/{speaker}", response_model=list[QuoteRead])
async def get_quotes_by_speaker_in_guild(guild_id: str, speaker: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id).join(Quote.lines).where(QuoteLine.speaker.ilike(f"%{speaker}%")).distinct().order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/by-nickname/{nickname}", response_model=list[QuoteRead])
async def get_quotes_by_nickname(nickname: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().join(Quote.lines).where(QuoteLine.nickname.ilike(f"%{nickname}%")).distinct().order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/guild/{guild_id}/by-nickname/{nickname}", response_model=list[QuoteRead])
async def get_quotes_by_nickname_in_guild(guild_id: str, nickname: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(
        quote_select().where(Quote.guild_id == guild_id).join(Quote.lines).where(QuoteLine.nickname.ilike(f"%{nickname}%")).distinct().order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/{quote_id}/lines", response_model=list[QuoteLineRead])
async def get_quote_lines(quote_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> list[QuoteLine]:
    quote = await load_quote(session, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return list(quote.lines)


@app.get("/quotes/{quote_id}", response_model=QuoteRead)
async def get_quote(quote_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await load_quote(session, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@app.post("/quotes", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
async def create_quote(payload: QuoteCreate, session: AsyncSession = Depends(get_session)) -> Quote:
    now = datetime.now(timezone.utc)
    quote = Quote(
        context=payload.context,
        author=payload.author,
        guild_id=payload.guild_id,
        datetime_added=now,
        datetime_said=payload.datetime_said or now,
    )
    quote.lines = [
        QuoteLine(line_number=index + 1, speaker=line.speaker, nickname=line.nickname, text=line.text)
        for index, line in enumerate(payload.lines)
    ]
    session.add(quote)
    await session.commit()
    await session.refresh(quote)
    fresh_quote = await load_quote(session, quote.id)
    if fresh_quote is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load created quote")
    return fresh_quote


@app.patch("/quotes/{quote_id}", response_model=QuoteRead)
async def update_quote(quote_id: uuid.UUID, payload: QuoteUpdate, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await load_quote(session, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    updates = payload.model_dump(exclude_unset=True)
    for field_name, field_value in updates.items():
        setattr(quote, field_name, field_value)

    if payload.lines is not None:
        quote.lines = [
            QuoteLine(line_number=index + 1, speaker=line.speaker, nickname=line.nickname, text=line.text)
            for index, line in enumerate(payload.lines)
        ]

    if quote.datetime_said is None:
        quote.datetime_said = quote.datetime_added

    await session.commit()
    await session.refresh(quote)
    fresh_quote = await load_quote(session, quote.id)
    if fresh_quote is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load updated quote")
    return fresh_quote


@app.post("/quotes/{quote_id}/lines", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
async def append_quote_lines(
    quote_id: uuid.UUID,
    payload: list[QuoteLineCreate],
    session: AsyncSession = Depends(get_session),
) -> Quote:
    quote = await load_quote(session, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    next_line_number = (quote.lines[-1].line_number if quote.lines else 0) + 1
    for offset, line in enumerate(payload):
        quote.lines.append(
            QuoteLine(
                line_number=next_line_number + offset,
                speaker=line.speaker,
                nickname=line.nickname,
                text=line.text,
            )
        )

    await session.commit()
    await session.refresh(quote)
    fresh_quote = await load_quote(session, quote.id)
    if fresh_quote is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to load updated quote")
    return fresh_quote


@app.patch("/quotes/{quote_id}/lines/{line_id}", response_model=QuoteLineRead)
async def update_quote_line(
    quote_id: uuid.UUID,
    line_id: uuid.UUID,
    payload: QuoteLineUpdate,
    session: AsyncSession = Depends(get_session),
) -> QuoteLine:
    line = await load_line(session, quote_id, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote line not found")

    updates = payload.model_dump(exclude_unset=True)
    for field_name, field_value in updates.items():
        setattr(line, field_name, field_value)

    await session.commit()
    await session.refresh(line)
    return line


@app.delete("/quotes/{quote_id}/lines/{line_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote_line(
    quote_id: uuid.UUID,
    line_id: uuid.UUID,
    session: AsyncSession = Depends(get_session),
) -> None:
    line = await load_line(session, quote_id, line_id)
    if line is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote line not found")
    await session.delete(line)
    await session.commit()


@app.delete("/quotes/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(quote_id: uuid.UUID, session: AsyncSession = Depends(get_session)) -> None:
    quote = await load_quote(session, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    await session.delete(quote)
    await session.commit()