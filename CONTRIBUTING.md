# Contributing

Contributions are welcome! Here's how you can help.

## Reporting Issues

Found a bug? Have a suggestion? Open an issue at:

https://github.com/markoonakic/tarnished/issues

Please include:
- A clear description of the issue
- Steps to reproduce (if applicable)
- Your environment details (browser, OS, deployment method)

## Feature Requests

Have an idea for a new feature? Open an issue with a clear description of what you'd like to see and why it would be useful.

## Development

### Prerequisites

- **Backend**: Python 3.12, uv
- **Frontend**: Node.js 22, Yarn
- **Docker** (for running locally)

### Local Development

```bash
# Backend
cd backend
uv sync
uv run uvicorn app.main:app --reload

# Frontend (in another terminal)
cd frontend
yarn install
yarn dev
```

### Running Tests

```bash
# Backend
cd backend
uv run pytest

# Frontend
cd frontend
yarn test
```

### Code Style

- **Backend**: Follows Ruff formatting and type checking
- **Frontend**: Follows ESLint and Prettier

Run before committing:

```bash
# Backend
cd backend
uv run ruff check .
uv run ruff format .

# Frontend
cd frontend
yarn lint
```

## Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit with clear messages
6. Push to your fork
7. Open a Pull Request

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
