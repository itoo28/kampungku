# Project Guidelines: 2D Pixel Art Indonesian Farming Sim
- **Engine:** Godot 4.x (GDScript 2.0). NEVER use Godot 3 syntax (e.g., use `@export` instead of `export`, `CharacterBody2D` instead of `KinematicBody2D`, `move_and_slide()` without parameters).
- **Target Platform:** Android (Mobile-first) & Desktop testing.
- **Art Style:** 2D Top-Down Pixel Art.
- **Architecture:** Keep scripts modular. Attach movement logic to `CharacterBody2D` and tile interactions to `TileMapLayer`.