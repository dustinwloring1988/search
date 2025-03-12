# AI-Powered Browser Automation

## Project Overview

This project integrates AI with browser automation to enable natural language-based browser control. Users can ask questions or give instructions in plain English, and the application will translate these into browser actions using a combination of AI understanding and automated browser control.

## Goals

- Provide a simple, intuitive interface for controlling web browsers with natural language
- Leverage local AI models via ollama for processing natural language input
- Automate browser actions using Playwright
- Offer real-time visual feedback of automated actions

## Architecture

The application is built on the following architecture:

### Core Components

1. **Electron Framework**
   - Cross-platform desktop application with main and renderer processes
   - User interface with dual-panel layout

2. **AI Integration**
   - Uses ollama API to process natural language queries
   - Leverages granite3.2-vision model for structured output generation

3. **Tool System**
   - Dynamic tool loading system for extensibility
   - Generic tool interface that standardizes input/output
   - Central executor that maps AI commands to tool actions

4. **Browser Automation**
   - Playwright integration for browser control
   - Real-time visual feedback of browser actions

## Tech Stack

- **Electron**: Desktop application framework
- **TypeScript**: Type-safe programming language
- **ollama API**: Local AI model integration
- **Playwright**: Browser automation library
- **ESLint/Prettier**: Code quality and formatting tools

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm
- ollama installed locally with required models

### Installation

```bash
# Clone the repository
git clone [repository-url]

# Install dependencies
npm install

# Start the application
npm start
```

## Development

```bash
# Build the application
npm run build

# Run linting
npm run lint

# Run tests
npm run test
```

## Tools and Their Roles

| Tool | Role |
|------|------|
| **ollama API** | Processes natural language queries and generates responses |
| **granite3.2-vision** | Formats AI output into structured commands |
| **Playwright** | Executes browser automation based on AI commands |

## Project Structure

```
/
├── src/
│   ├── main/          # Electron main process
│   ├── renderer/      # Electron renderer process (UI)
│   └── tools/         # Tool implementations
├── dist/              # Compiled output
└── tests/             # Test files
```

## License

This project is licensed under the MIT License - see the LICENSE file for details. 