# Tri-Fusal
Tri-fusal is a cooperative three-player bomb-defusal puzzle game where each player is given different pieces of information to help each other solve a shared board before detonation. 

## Overview
Communication is the key to success. Each player has access to unique clues, tools, or perspectives that must be shared with their teammates to solve increasingly challenging bomb-defusal puzzles. No single player has all the information needed to succeed, making teamwork and coordination essential.

## Features (Planned)
- Three-player cooperative gameplay
- Information asymmetry between players
- Time-limited bomb-defusal puzzles
- Increasing puzzle complexity and difficulty
- Engaging UI
- Leaderboard / ranking system

## Local Development
1. Run `npm install` in the repo root, then run `npm install` inside `client/` and `server/` if needed.
2. Start the app with `npm run dev` from the repo root.
3. Open `http://localhost:8080/deploy` for the main menu, or `http://localhost:8080/` for the in-progress bomb interface.

## Current Structure
- `client/` contains the React + Vite frontend and the current UI.
- `server/` contains the Colyseus multiplayer server and API routes.
- The old standalone prototype `index.html` flow has been retired in favor of the client/server app.

## Audio Credits
- Round music: "Closed Casket Funeral", "The Park On The Old Mountain", and "The Walls Are Painted With Blood" by NoLongerNull.
- This is a non-commercial prototype. All music rights remain with the original creators; confirm permission/licensing before any public release or monetized use.
