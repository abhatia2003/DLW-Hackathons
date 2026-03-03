# Codex Map (DLW-Hackathons)

Codex Map is a next-generation, AI-assisted development platform designed to bridge the gap between codebase context, system architecture, and policy alignment. 

The application provides a suite of interactive tools for solution architects, developers, and project managers to visually manage context ingestion, track commit histories, design architectures, and ensure code aligns with predefined architectural and safety rules.

## 🚀 Key Features and Modules

The prototype is divided into four main interactive modules, each accessible via its respective HTML page:

### 1. Architect Studio (`architect.html`)
A visual drag-and-drop canvas for Solution Architects.
- **Node Topology Building:** Drag components (Web Apps, Databases, Workers, etc.) from the palette onto the canvas.
- **AI Design Generation:** Features a "Design Agent" that can generate architecture suggestions or inspire new designs based on the ingested context.
- **Link Mode:** Connect different infrastructure components together to map out the application's infrastructure graph.

### 2. Context Ingestion Lab (`context.html`)
The staging area where the AI assistant builds its "memory".
- **Knowledge Base Building:** Simulates feeding PDFs, CSVs, and other documentation into the agent.
- **RAG & OCR Pipeline:** Demonstrates how data goes through OCR parsing, chunking, and metadata extraction.
- **Theme Detection:** Automatically groups ingested documents into contextual themes (e.g., Auth, Optimization) to feed the AI planner.

### 3. Alignment Control Center (`control-center.html`)
A dashboard for automated policy enforcement and compliance tracking.
- **Rule Engine Validation:** Simulates an Application Server + Model Context Protocol (MCP) + CLI harness that evaluates commits against strict hackathon or enterprise policies.
- **Detection Rules:** Checks for issues like hardcoded secrets, unauthorized package imports, or missing rollback logic.
- **Simulated Codex Approvals:** Reviews "Codex Proposals" (automated patches and refactors) and provides a human-in-the-loop approval gate.

### 4. Visual Commit Navigator (`trial.html`)
An interactive, graphical view of the repository's Git commit history.
- **Frontier Navigation:** Maps out the branch structure and highlights the current "frontier" of commits.
- **Node Inspector:** Clicking on a commit node reveals an AI-generated analysis of that specific commit, including structural changes, context evidence, and proposed fixes.

## 🛠️ Codebase Structure

- `*.html` (e.g., `architect.html`, `context.html`): The main UI views. Built with vanilla HTML/CSS, featuring modern, dark-themed glassmorphism aesthetics.
- `agent-context.js`: Manages the state of the agent's memory and handles data feeding for the context lab and control center.
- `solution-architect.js`: Controls the canvas logic, node linking interactions, and diagram generation in the Architect Studio.
- `alignment-runtime.js`: Simulates the rule engine that analyzes commits and enforces policies in the Control Center.
- `mode_dataset.json`: The mock payload data containing typical architecture nodes, a simulated commit graph, and context data used to power the front-end dynamically.

## 💻 How to Run

Because this is a static frontend prototype, no complex build steps or installations are required to view the UI.

1. Clone the repository.
2. Open any of the HTML files (e.g., `trial.html` or `architect.html`) directly in your web browser.
3. Use the top navigation bar to seamlessly switch between the Architect Studio, Context Lab, Control Center, and Commit Map.

## 🎨 Technologies Used
- HTML5 & CSS3 (Native CSS variables, Grid, Flexbox)
- Vanilla JavaScript
- SVG for dynamic node/edge rendering (Canvas/Architect Map)