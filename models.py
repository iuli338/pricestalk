"""SQLAlchemy models. SQLite for now; portable to Postgres via DATABASE_URL."""
from datetime import datetime, timezone

from flask_login import UserMixin
from sqlalchemy import String, Float, Boolean, DateTime, ForeignKey, create_engine
from sqlalchemy.orm import (
    DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker,
)


def _now():
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class User(Base, UserMixin):
    __tablename__ = "users"

    id:            Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email:         Mapped[str] = mapped_column(String, unique=True, nullable=False, index=True)
    nickname:      Mapped[str] = mapped_column(String, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    created_at:    Mapped[datetime] = mapped_column(DateTime, default=_now)

    products: Mapped[list["Product"]] = relationship(
        back_populates="user", cascade="all, delete-orphan",
    )

    def get_id(self):           # Flask-Login expects a string id
        return str(self.id)


class Product(Base):
    __tablename__ = "products"

    id:         Mapped[str] = mapped_column(String(8), primary_key=True)
    user_id:    Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    query:      Mapped[str] = mapped_column(String, nullable=False)
    title:      Mapped[str | None] = mapped_column(String, nullable=True)
    cover_image: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    user: Mapped["User"] = relationship(back_populates="products")
    listings: Mapped[list["Listing"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="Listing.id",
    )

    def to_dict(self):
        return {
            "id": self.id,
            "query": self.query,
            "title": self.title,
            "cover_image": self.cover_image,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "listings": [l.to_dict() for l in self.listings],
        }


class Listing(Base):
    __tablename__ = "listings"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    product_id: Mapped[str] = mapped_column(ForeignKey("products.id", ondelete="CASCADE"))
    url:        Mapped[str | None] = mapped_column(String, nullable=True)
    title:      Mapped[str | None] = mapped_column(String, nullable=True)
    price:      Mapped[float | None] = mapped_column(Float, nullable=True)
    currency:   Mapped[str] = mapped_column(String(8), default="RON")
    site:       Mapped[str | None] = mapped_column(String, nullable=True)
    image:      Mapped[str | None] = mapped_column(String, nullable=True)
    available:  Mapped[bool] = mapped_column(Boolean, default=True)
    last_checked: Mapped[datetime | None] = mapped_column(DateTime, default=_now)

    product: Mapped["Product"] = relationship(back_populates="listings")

    def to_dict(self):
        return {
            "url": self.url,
            "title": self.title,
            "price": self.price,
            "currency": self.currency,
            "site": self.site,
            "image": self.image,
            "available": self.available,
            "last_checked": self.last_checked.isoformat() if self.last_checked else None,
        }


# --- engine / session factory, configured by init_db() ---
_engine = None
SessionLocal = sessionmaker()


def init_db(database_url):
    """Create the engine + tables. Call once at startup."""
    global _engine
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    _engine = create_engine(database_url, future=True, connect_args=connect_args)
    if database_url.startswith("sqlite"):
        # WAL mode: concurrent reads + better write throughput
        from sqlalchemy import event
        @event.listens_for(_engine, "connect")
        def _wal(dbapi_conn, _):
            cur = dbapi_conn.cursor()
            cur.execute("PRAGMA journal_mode=WAL")
            cur.execute("PRAGMA foreign_keys=ON")
            cur.close()
    SessionLocal.configure(bind=_engine)
    Base.metadata.create_all(_engine)
    return _engine
