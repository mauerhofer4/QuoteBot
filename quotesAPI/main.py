import random

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine
from models import Base, Quote
from schemas import QuoteCreate, QuoteRead


app = FastAPI(title="QuoteBot API")


async def get_session() -> AsyncSession:
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


@app.get("/quotes/{quote_id}", response_model=QuoteRead)
async def get_quote(quote_id: int, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@app.post("/quotes", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
async def create_quote(payload: QuoteCreate, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = Quote(text=payload.text, author=payload.author)
    session.add(quote)
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