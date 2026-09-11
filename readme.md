# Ein Theater

> **Visual Deep Learning Architecture Design Studio & Interactive Circuit Editor**

Ein Theater is a solution to free up your mind from coding, and let you focus on designing the model architecture.

Inspired by electrical PCB schematics and IC chip diagrams, **Ein Theater** turns PyTorch neural network construction into an intuitive, visual drag-and-drop schematic editor with orthogonal 90° wiring, interactive diamond fold waypoints, multi-model workspace tabs, live hyperparameter configuration, and instant standalone PyTorch `nn.Module` code generation via symbolic graph tracing.

---

## Quickstart

### Prerequisites
- **Go** (1.20+)
- **Python** (3.10+) with PyTorch (`pip install torch`)
- Modern web browser

### Running the Application

```bash
# Clone and enter the repository
cd src

# Option 1: Run the full Studio web server (Canvas + future studio modes)
go run main.go

# Option 2: Run standalone Canvas mode directly
go run Canvas/canvas.go
```

Then open your browser at `http://localhost:8080`.

---

## Key Highlights

- ⚡ **Electronic Circuit Schematic Canvas**: 50px dot-grid with snap-to-grid, orthogonal 90° right-angle wiring, interactive diamond fold handles, and rigid multi-block drag preservation.
- 📋 **Full Clipboard System**: Copy (`Ctrl+C`), cut (`Ctrl+X`), and paste (`Ctrl+V`) single blocks or multi-block circuits with internal wire preservation and automatic 0-indexed ID generation.
- 🧩 **152 Categorized PyTorch Modules**: Complete coverage of `torch.nn` layer classes across 15 categories, plus a 10-layer Fundamental Blocks sidebar palette.
- 💾 **1-Click Model Serialization & Code Generation**: Generates clean, standalone, executable PyTorch `nn.Module` scripts with device detection (`cuda`/`cpu`) and graph specifications (`<model_name>.json` and `<model_name>.py`).
- 🧠 **Smart Model Folder Detection**: Automatically identifies verified model packages in the workspace and restores them onto the canvas in a single click.

---

## Documentation

- [Master Project Documentation](./document.md) — Comprehensive reference, interactive modes guide, REST API reference, and FX compiler details.
- [Canvas Subsystem Documentation](./src/Canvas/document.md) — Architecture, standalone vs integrated execution, and component breakdown of Canvas mode.
- [Go Backend Handlers Documentation](./src/Canvas/handler/document.md) — Concurrency model, state structs, and HTTP handlers.
- [Frontend Client Modules Documentation](./src/Canvas/static/js/document.md) — Vis.js custom rendering, PCB circuit drawing, and reactive state.
- [PyTorch Code Generation Engine](./src/Canvas/utils/generate%20code/document.md) — Symbolic tracing, connection classification, and AST code generator.