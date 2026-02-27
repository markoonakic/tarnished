# Tarnished

Tarnished is a self-hosted job application tracker designed to help you manage every stage of your job search.

Think of it as a command center for your job search. Track applications, store your CVs and cover letters, analyze interview videos, and let AI analyze where your pipeline is breaking so you can focus on what actually matters.

## Features

- **Track Every Application** - Company, position, salary, status, contacts, links... Never lose track of where you applied, and how you applied.

- **Documents & Media** - Upload your CV and cover letter for each application. Upload recorded video or audio of interviews for later review.

- **Debug Your Job Search** - AI-powered insights analyze your pipeline to find where you're getting stuck. See conversion rates between stages, identify if you're failing at technical or behavioral interviews, and get actionable recommendations to improve.

- **Save Jobs from Anywhere** - The browser extension extracts job details from any page with a job description using AI, no need to manually copy-paste.

- **Visualize Your Pipeline** - Dashboard with response rates, interview conversion funnels, and weekly activity tracking.

- **Customizable Pipeline** - Define your own statuses and interview round types to match your unique job search process.

- **Customizable Themes** - Choose from Gruvbox Dark, Gruvbox Light, Catppuccin, or Dracula. Pick your accent color to match your style.

- **Full Data Portability** - Export all your data (JSON, CSV, or ZIP with media) and import to migrate or backup.

- **Your Data, Your Server** - 100% self-hosted. No accounts, no tracking, no cloud. Everything stays on your hardware.

## Quick Start

```bash
git clone https://github.com/markoonakic/tarnished.git
cd tarnished
docker-compose up -d

# Open in browser
open http://localhost:5577
```

That's it. The first account you create becomes admin automatically.

### Where is my data?

Your data is stored in the `./data` folder (for SQLite) or your PostgreSQL database. Back up this folder to save your data.

## Installation

### Docker Compose

#### SQLite Mode (Default)

Best for personal use, home servers, and trying it out.

```bash
git clone https://github.com/markoonakic/tarnished.git
cd tarnished
docker-compose up -d
```

#### PostgreSQL Mode (Recommended for "production")

Best for multi-user deployments or when you need better performance.

```bash
git clone https://github.com/markoonakic/tarnished.git
cd tarnished

# Create .env with PostgreSQL password
echo "POSTGRES_PASSWORD=$(openssl rand -hex 32)" > .env

# Start
docker-compose -f docker-compose.postgres.yml up -d
```

### Helm Chart

For Kubernetes deployments.

```bash
# Install with SQLite (default)
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished

# Or with PostgreSQL
helm install tarnished oci://ghcr.io/markoonakic/charts/tarnished \
  --set postgresql.enabled=true \
  --set postgresql.host=postgres.example.com \
  --set postgresql.password=your-password
```

See [chart/README.md](chart/README.md) for full configuration options.

## Configuration

### Environment Variables

| Variable            | Default                 | Description                     |
| ------------------- | ----------------------- | ------------------------------- |
| `APP_PORT`          | `5577`                  | Port the app listens on         |
| `APP_URL`           | `http://localhost:5577` | Public URL (for CORS and links) |
| `POSTGRES_HOST`     | _(SQLite)_              | PostgreSQL host                 |
| `POSTGRES_PASSWORD` | _(SQLite)_              | PostgreSQL password             |
| `SECRET_KEY`        | auto-generated          | JWT signing key                 |

See `.env.example` for all available options.

## AI Features

Tarnished uses AI for job extraction and pipeline insights. You need to bring your own API key.

### Supported Providers

Works with any provider supported by [LiteLLM](https://litellm.ai/), including:

- OpenAI, Anthropic, Google Gemini, Azure OpenAI
- Self-hosted models (Ollama, llama.cpp, vLLM, etc.)

### Configuration

1. Go to **Settings** → **AI Settings** (admin only)
2. Enter your model (e.g., `gpt-4o-mini`, `claude-3-haiku`, `ollama/llama3`)
3. Enter your API key
4. (Optional) Enter a custom base URL
5. Click Save

Your API key is encrypted and stored in the database.

**Note:** AI features use your own API key. You're responsible for any costs.

## Browser Extention

The browser extention lets you save jobs from anywhere and autofill application forms.

### Installation

1. Download the latest release from [GitHub Releases](https://github.com/markoonakic/tarnished/releases)
2. Extract the ZIP file for your browser (Chrome or Firefox)
3. Load the extension:
   - **Chrome**: Go to `chrome://extensions/`, enable "Developer mode", click "Load unpacked", select the extracted folder
   - **Firefox**: Go to `about:debugging#/runtime/this-firefox`, click "Load Temporary Add-on", select any file in the extracted folder

### Configuration

1. Click the extension icon in your browser toolbar
2. Click the **Settings** button (gear icon), then go to settings page
3. Enter your **App URL** (e.g., `http://localhost:5577` or your public URL)
4. Enter your **API Key** (generate one in Tarnished under Settings > API Keys)

See [extension/README.md](extension/README.md) for full documentation.

## Support

- **Bug Reports**: [GitHub Issues](https://github.com/markoonakic/tarnished/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/markoonakic/tarnished/issues)
- **Discussion**: [GitHub Discussions](https://github.com/markoonakic/tarnished/discussions)

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License — see [LICENSE](LICENSE)
