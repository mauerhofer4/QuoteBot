import random

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy import select, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database import async_session, engine
from models import Base, Quote
from schemas import QuoteCreate, QuoteRead, QuoteUpdate


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
async def list_quotes(skip: int = 0, limit: int = 10, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).order_by(desc(Quote.created_at)).offset(skip).limit(limit))
    return list(result.scalars().all())


@app.get("/quotes/latest", response_model=list[QuoteRead])
async def get_latest_quotes(limit: int = 5, session: AsyncSession = Depends(get_session)) -> list[Quote]:
    result = await session.execute(select(Quote).order_by(desc(Quote.created_at)).limit(limit))
    return list(result.scalars().all())


@app.get("/quotes/random", response_model=QuoteRead)
async def get_random_quote(session: AsyncSession = Depends(get_session)) -> Quote:
    result = await session.execute(select(Quote))
    quotes = list(result.scalars().all())
    if not quotes:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No quotes found")
    return random.choice(quotes)


@app.get("/quotes/search", response_model=list[QuoteRead])
async def search_quotes(query: str, search_type: str = "text", session: AsyncSession = Depends(get_session)) -> list[Quote]:
    """
    Search quotes by text, author, name, or nickname.
    search_type can be: 'text', 'author', 'name', 'nickname'
    """
    if not query:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")
    
    search_query = f"%{query}%"
    
    if search_type == "text":
        result = await session.execute(select(Quote).where(Quote.text.ilike(search_query)).order_by(desc(Quote.created_at)))
    elif search_type == "author":
        result = await session.execute(select(Quote).where(Quote.author.ilike(search_query)).order_by(desc(Quote.created_at)))
    elif search_type == "name":
        result = await session.execute(select(Quote).where(Quote.name.ilike(search_query)).order_by(desc(Quote.created_at)))
    elif search_type == "nickname":
        result = await session.execute(select(Quote).where(Quote.nickname.ilike(search_query)).order_by(desc(Quote.created_at)))
    else:
        result = await session.execute(select(Quote).where(or_(Quote.text.ilike(search_query), Quote.author.ilike(search_query), Quote.name.ilike(search_query), Quote.nickname.ilike(search_query))).order_by(desc(Quote.created_at)))
    
    return list(result.scalars().all())


@app.get("/quotes/{quote_id}", response_model=QuoteRead)
async def get_quote(quote_id: int, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    return quote


@app.post("/quotes", response_model=QuoteRead, status_code=status.HTTP_201_CREATED)
async def create_quote(payload: QuoteCreate, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = Quote(
        text=payload.text,
        author=payload.author,
        name=payload.name,
        nickname=payload.nickname,
        context=payload.context,
        creator_id=payload.creator_id,
    )
    session.add(quote)
    await session.commit()
    await session.refresh(quote)
    return quote


@app.put("/quotes/{quote_id}", response_model=QuoteRead)
async def update_quote(quote_id: int, payload: QuoteUpdate, session: AsyncSession = Depends(get_session)) -> Quote:
    quote = await session.get(Quote, quote_id)
    if quote is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quote not found")
    
    # Update only provided fields
    if payload.text is not None:
        quote.text = payload.text
    if payload.author is not None:
        quote.author = payload.author
    if payload.name is not None:
        quote.name = payload.name
    if payload.nickname is not None:
        quote.nickname = payload.nickname
    if payload.context is not None:
        quote.context = payload.context
    
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