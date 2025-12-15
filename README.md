# Scene Generator

## Overview
Scene Generator is a web application for creating AI-driven scene variations.
It allows users to upload a reference image, select variation categories (Angle, Shot, Expression), and generate a 3x3 preview grid. Users can then select a specific cell to upscale to a high-resolution final image.

## Tech Stack
- React
- Vite
- TypeScript
- Tailwind CSS
- Lucide React (Icons)

## Setup & Run
1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:5173` in your browser.

## Features implemented (Prototype)
- **Upload**: Reference image upload.
- **Logic Selection**: Automatic switching between Linear, Matrix, and Dynamic modes based on selected categories.
- **Preview Generation**: Mock API call simulating 2-second generation of a 3x3 grid.
- **Interactive Grid**: Click to select a cell from the grid.
- **Final Generation**: Mock API call simulating 3-second upscaling.
- **Stats Tracking**: Tracks usage and sends `postMessage` with `imageUrl` and `stats` upon completion.
