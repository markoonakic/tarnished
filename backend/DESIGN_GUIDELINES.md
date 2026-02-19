# Backend Design Guidelines

**Project:** Tarnished
**Stack:** Python, FastAPI, SQLAlchemy 2.0, Pydantic
**Last Updated:** 2026-01-31

---

## Overview

This file defines backend coding patterns, API conventions, and database standards. **All AI agents and developers must reference this file before making backend changes.**

---

## API Endpoint Patterns

(TODO: Document endpoint patterns, response formats, error handling)

---

## Database Patterns

### Export/Import System (Schema-Resilient)

The export/import system uses model introspection to automatically serialize and deserialize all user data without hardcoding field lists or relationships. This ensures the system remains resilient to schema changes.

#### Core Principle

**Never hardcode fields or relationships.** Always use model introspection via `ExportService` and `ImportService`. When fields are added to models, they are automatically included in exports/imports without code changes.

#### Adding a New Model to Export/Import

1. Add the `@exportable(order=N)` decorator to the model class
2. Ensure the model has either:
   - A `user_id` column (direct user ownership), or
   - A `user` relationship (ownership via relationship), or
   - An `application` relationship (ownership via Application), or
   - A `round` relationship (ownership via Round -> Application)
3. The model is automatically included in exports and imports

#### Export Order

Models must be exported in dependency order (parents before children) to ensure foreign keys can be remapped during import.

| Order | Model | Depends On |
|-------|-------|------------|
| 0 | User | None |
| 1 | UserProfile | User |
| 2 | ApplicationStatus | User |
| 3 | RoundType | User |
| 4 | Application | User, ApplicationStatus, JobLead |
| 5 | ApplicationStatusHistory | Application, ApplicationStatus |
| 6 | Round | Application, RoundType |
| 7 | RoundMedia | Round |
| 8 | JobLead | User |

#### Adding a New Field

1. Add the column to the model using SQLAlchemy's `mapped_column`
2. That's it - the field is automatically included in exports/imports

No changes needed to ExportService, ImportService, or any serialization code.

#### Services

- **ExportService** (`app/services/export_service.py`): Serializes all registered models using introspection. Queries user data via ownership relationships and serializes all columns and relationships.
- **ImportService** (`app/services/import_service.py`): Deserializes export data and remaps foreign keys. Validates export version, creates new records with new IDs, and maintains parent-child ordering.
- **IDMapper** (`app/services/import_id_mapper.py`): Tracks old-to-new ID mappings during import. Used to remap foreign key references when importing records that reference other imported records.
- **ExportRegistry** (`app/services/export_registry.py`): Global registry of exportable models. Use `@exportable(order=N)` to register models.

#### Excluded Models

Some models are intentionally excluded from export/import:

- **AuditLog**: System-level audit data, not user data
- **SystemSettings**: System configuration, not user-owned data

These models do not have the `@exportable` decorator and are not included in user data exports.

#### Example: Adding a New Model

```python
# In app/models/my_model.py
from app.services.export_registry import exportable

@exportable(order=9)  # Order after dependencies
class MyModel(Base):
    __tablename__ = "my_models"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # Any additional fields are automatically included

    user = relationship("User", back_populates="my_models")
```

#### Ownership Detection

The ExportService automatically detects user ownership through:

1. `user_id` column: Direct ownership (e.g., Application, JobLead)
2. `user` relationship: Ownership via relationship (e.g., UserProfile)
3. `application` relationship: Ownership via Application (e.g., Round, ApplicationStatusHistory)
4. `round` relationship: Ownership via Round -> Application (e.g., RoundMedia)

---

## Python Coding Conventions

(TODO: Document naming conventions, type hints, async patterns)

---

## Error Handling

(TODO: Document exception patterns, HTTP status codes, error responses)

---

## Security

(TODO: Document authentication, authorization, input validation)

---

**This file is a placeholder.** Backend patterns will be documented as the project evolves.
