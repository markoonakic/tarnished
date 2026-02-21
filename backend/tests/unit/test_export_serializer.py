"""Unit tests for the export serializer module."""

# pyright: reportOptionalSubscript=warning, reportOperatorIssue=warning
# Test fixtures use optional dicts that trigger false positives

from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import JSON, DateTime, ForeignKey, String, create_engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship

from app.services.export_serializer import serialize_model_instance, serialize_value


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    email: Mapped[str] = mapped_column(String(255))


class Post(Base):
    __tablename__ = "posts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    content: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(UTC)
    )
    tags: Mapped[list] = mapped_column(JSON, default=list)

    user = relationship("User")


class TestSerializeValue:
    """Tests for the serialize_value function."""

    def test_serialize_none(self):
        """None values should be serialized as None."""
        assert serialize_value(None) is None

    def test_serialize_string(self):
        """Strings should be returned as-is."""
        assert serialize_value("hello") == "hello"

    def test_serialize_int(self):
        """Integers should be returned as-is."""
        assert serialize_value(42) == 42

    def test_serialize_float(self):
        """Floats should be returned as-is."""
        assert serialize_value(3.14) == 3.14

    def test_serialize_bool(self):
        """Booleans should be returned as-is."""
        assert serialize_value(True) is True
        assert serialize_value(False) is False

    def test_serialize_datetime(self):
        """DateTime should be serialized as ISO string."""
        dt = datetime(2026, 2, 16, 12, 30, 45)
        assert serialize_value(dt) == "2026-02-16T12:30:45"

    def test_serialize_date(self):
        """Date should be serialized as ISO string (date only)."""
        from datetime import date

        d = date(2026, 2, 16)
        assert serialize_value(d) == "2026-02-16"

    def test_serialize_uuid(self):
        """UUID should be serialized as string."""
        uuid = uuid4()
        assert serialize_value(uuid) == str(uuid)

    def test_serialize_decimal(self):
        """Decimal should be serialized as float."""
        dec = Decimal("123.45")
        assert serialize_value(dec) == 123.45
        assert isinstance(serialize_value(dec), float)

    def test_serialize_list(self):
        """Lists should be returned as-is."""
        lst = [1, 2, 3]
        assert serialize_value(lst) == lst

    def test_serialize_dict(self):
        """Dicts should be returned as-is."""
        d = {"key": "value"}
        assert serialize_value(d) == d

    def test_serialize_unknown_type(self):
        """Unknown types should fall back to str()."""

        class CustomClass:
            def __str__(self):
                return "custom_value"

        obj = CustomClass()
        assert serialize_value(obj) == "custom_value"


class TestSerializeModelInstance:
    """Tests for the serialize_model_instance function."""

    @pytest.fixture
    def engine(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        return engine

    @pytest.fixture
    def session(self, engine):
        return Session(engine)

    def test_serialize_simple_fields(self, session):
        """Should serialize all column fields."""
        user = User(id="user-1", email="test@example.com")
        session.add(user)
        session.commit()

        result = serialize_model_instance(user)

        assert result["id"] == "user-1"
        assert result["email"] == "test@example.com"

    def test_serialize_datetime_as_iso_string(self, session):
        """DateTime fields should be serialized as ISO strings."""
        post = Post(
            id="post-1",
            title="Test",
            content="Content",
            user_id="user-1",
            created_at=datetime(2026, 2, 16, 12, 0, 0),
            tags=["tag1", "tag2"],
        )
        session.add(post)
        session.commit()

        result = serialize_model_instance(post)

        assert result["created_at"] == "2026-02-16T12:00:00"

    def test_serialize_json_field(self, session):
        """JSON fields should be serialized as-is."""
        post = Post(
            id="post-1",
            title="Test",
            content=None,
            user_id="user-1",
            tags=["python", "sqlalchemy"],
        )
        session.add(post)
        session.commit()

        result = serialize_model_instance(post)

        assert result["tags"] == ["python", "sqlalchemy"]

    def test_serialize_none_as_null(self, session):
        """None values should be serialized as null."""
        post = Post(id="post-1", title="Test", content=None, user_id="user-1", tags=[])
        session.add(post)
        session.commit()

        result = serialize_model_instance(post)

        assert result["content"] is None

    def test_exclude_relationships_by_default(self, session):
        """Relationships should not be included by default."""
        user = User(id="user-1", email="test@example.com")
        post = Post(id="post-1", title="Test", user_id="user-1", user=user, tags=[])
        session.add_all([user, post])
        session.commit()

        result = serialize_model_instance(post, include_relationships=False)

        assert "user" not in result
        assert "user_id" in result  # FK column should still be there

    def test_include_single_relationship(self, session):
        """Single relationships should be serialized when enabled."""
        user = User(id="user-1", email="test@example.com")
        post = Post(id="post-1", title="Test", user_id="user-1", user=user, tags=[])
        session.add_all([user, post])
        session.commit()

        result = serialize_model_instance(post, include_relationships=True)

        assert "__rel__user" in result
        assert result["__rel__user"]["id"] == "user-1"
        assert result["__rel__user"]["email"] == "test@example.com"

    def test_custom_relationship_prefix(self, session):
        """Custom relationship prefix should be respected."""
        user = User(id="user-1", email="test@example.com")
        post = Post(id="post-1", title="Test", user_id="user-1", user=user, tags=[])
        session.add_all([user, post])
        session.commit()

        result = serialize_model_instance(
            post, include_relationships=True, relationship_prefix="related_"
        )

        assert "related_user" in result
        assert result["related_user"]["id"] == "user-1"


class Author(Base):
    """Model with many-to-many relationship for testing collection serialization."""

    __tablename__ = "authors"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    name: Mapped[str] = mapped_column(String(255))


class Book(Base):
    """Model with collection relationship."""

    __tablename__ = "books"
    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    author_id: Mapped[str] = mapped_column(String(36), ForeignKey("authors.id"))
    author = relationship("Author", back_populates="books")


# Add books relationship to Author
Author.books = relationship("Book", back_populates="author")


class TestSerializeCollectionRelationships:
    """Tests for serializing collection relationships (uselist=True)."""

    @pytest.fixture
    def engine(self):
        engine = create_engine("sqlite:///:memory:")
        Base.metadata.create_all(engine)
        return engine

    @pytest.fixture
    def session(self, engine):
        return Session(engine)

    def test_serialize_collection_relationship(self, session):
        """Collection relationships should be serialized as lists."""
        author = Author(id="author-1", name="Jane Doe")
        book1 = Book(id="book-1", title="Book One", author_id="author-1", author=author)
        book2 = Book(id="book-2", title="Book Two", author_id="author-1", author=author)
        session.add_all([author, book1, book2])
        session.commit()

        result = serialize_model_instance(author, include_relationships=True)

        assert "__rel__books" in result
        assert isinstance(result["__rel__books"], list)
        assert len(result["__rel__books"]) == 2

        # Check that each book is serialized correctly
        book_titles = {b["title"] for b in result["__rel__books"]}
        assert "Book One" in book_titles
        assert "Book Two" in book_titles

    def test_serialize_empty_collection(self, session):
        """Empty collection relationships should be serialized as empty list."""
        author = Author(id="author-1", name="Jane Doe")
        session.add(author)
        session.commit()

        result = serialize_model_instance(author, include_relationships=True)

        assert "__rel__books" in result
        assert result["__rel__books"] == []
