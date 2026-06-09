import random
from datetime import datetime, timezone
from collections.abc import AsyncGenerator

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine
from models import Base, Quote
from schemas import QuoteCreate, QuoteRead, QuoteUpdate


app = FastAPI(title="QuoteBot API")


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with async_session() as session:
        yield session


@app.on_event("startup")
async def startup() -> None:
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/quotes", response_model=list[QuoteRead])
async def list_quotes(session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).order_by(Quote.id.desc()))
    return list(result.scalars().all())


@app.get("/quotes/random", response_model=QuoteRead)
async def get_random_quote(session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(select(Quote).order_by(Quote.id.desc()))
    quotes = list(result.scalars().all())
    if not quotes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found")
    return random.choice(quotes)


@app.get("/quotes/latest", response_model=QuoteRead)
async def get_latest_quote(session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(select(Quote).order_by(Quote.datetime_added.desc(), Quote.id.desc()).limit(1))
    quote = result.scalar_one_or_none()
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found")
    return quote


@app.get("/quotes/search", response_model=list[QuoteRead])
async def search_quotes(query: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    search = f"%{query.strip()}%"
    result = await session.execute(
        select(Quote)
        .where(
            or_(
                Quote.quotetext.ilike(search),
                Quote.context.ilike(search),
                Quote.author.ilike(search),
                Quote.name.ilike(search),
                Quote.nickname.ilike(search),
            )
        )
        .order_by(Quote.id.desc())
    )
    return list(result.scalars().all())


@app.get("/quotes/by-author/{author}", response_model=list[QuoteRead])
async def get_quotes_by_author(author: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).where(Quote.author.ilike(author)).order_by(Quote.id.desc()))
    return list(result.scalars().all())


@app.get("/quotes/by-name/{name}", response_model=list[QuoteRead])
async def get_quotes_by_name(name: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).where(Quote.name.ilike(name)).order_by(Quote.id.desc()))
    return list(result.scalars().all())


@app.get("/quotes/by-nickname/{nickname}", response_model=list[QuoteRead])
async def get_quotes_by_nickname(nickname: str, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).where(Quote.nickname.ilike(nickname)).order_by(Quote.id.desc()))
    return list(result.scalars().all())


@app.get("/quotes/{quote_id}", response_model=QuoteRead)
async def get_quote(quote_id: int, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@app.post("/quotes", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
async def create_quote(payload: QuoteCreate, session: AsyncSession = Depends(get_session)) -> Quote:
    now = datetime.now(timezone.utc)
    quote = Quote(
        quotetext=payload.quotetext,
        context=payload.context,
        author=payload.author,
        name=payload.name,
        nickname=payload.nickname,
        datetime_added=now,
        datetime_said=payload.datetime_said or now,
    )
    session.add(quote)
    await session.commit()
    await session.refresh(quote)
    return quote


@app.patch("/quotes/{quote_id}", response_model=QuoteRead)
async def update_quote(quote_id: int, payload: QuoteUpdate, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")

    updates = payload.model_dump(exclude_unset=True)
    for field_name, field_value in updates.items():
        setattr(quote, field_name, field_value)

    if quote.datetime_said is None:
        quote.datetime_said = quote.datetime_added

    await session.commit()
    await session.refresh(quote)
    return quote


@app.delete("/quotes/{quote_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_quote(quote_id: int, session: AsyncSession = Depends(get_session)) -> None:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    await session.delete(quote)
    await session.commit()