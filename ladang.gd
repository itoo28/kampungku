extends TileMapLayer
class_name Ladang

# ID sumber TileSet untuk tanah cangkul (berdasarkan ladang_tileset.tres)
const SOURCE_ID_TILLED: int = 0
const ATLAS_COORDS_TILLED: Vector2i = Vector2i(0, 0)

# Dictionary penyimpan data ladang: Vector2i -> Dictionary
# Format: { "state": "tilled", "watered": false, "crop": null, "growth_stage": 0 }
var ladang_data: Dictionary = {}

signal tile_dicangkul(coords: Vector2i, is_tilled: bool)


func _ready() -> void:
	# Pastikan TileSet terpasang jika belum diset di inspector
	if tile_set == null:
		var default_ts = load("res://sprites/ladang_tileset.tres")
		if default_ts:
			tile_set = default_ts

	# Siapkan petak ladang awal di area sawah agar pemain langsung melihat area garapan
	if ladang_data.is_empty():
		for col in range(5, 8):
			for row in range(6, 8):
				var coords := Vector2i(col, row)
				ladang_data[coords] = {
					"state": "tilled",
					"watered": false,
					"crop": null,
					"growth_stage": 0
				}
				set_cell(coords, SOURCE_ID_TILLED, ATLAS_COORDS_TILLED)


func get_tile_coords(world_pos: Vector2) -> Vector2i:
	return local_to_map(to_local(world_pos))


func get_tile_center_world(world_pos: Vector2) -> Vector2:
	var coords: Vector2i = get_tile_coords(world_pos)
	return to_global(map_to_local(coords))


func get_tile_center_from_coords(coords: Vector2i) -> Vector2:
	return to_global(map_to_local(coords))


func is_tilled(coords: Vector2i) -> bool:
	return ladang_data.has(coords) and ladang_data[coords].get("state", "") == "tilled"


func cangkul_at_world_pos(world_pos: Vector2) -> bool:
	var coords: Vector2i = get_tile_coords(world_pos)
	return cangkul_tile(coords)


func cangkul_tile(coords: Vector2i) -> bool:
	if is_tilled(coords):
		# Jika sudah dicangkul dan belum ada tanaman, cangkul lagi untuk meratakan kembali tanah
		ladang_data.erase(coords)
		set_cell(coords, -1)
		tile_dicangkul.emit(coords, false)
		return false
	else:
		# Petak belum dicangkul -> ubah menjadi tanah garapan
		ladang_data[coords] = {
			"state": "tilled",
			"watered": false,
			"crop": null,
			"growth_stage": 0
		}
		set_cell(coords, SOURCE_ID_TILLED, ATLAS_COORDS_TILLED)
		tile_dicangkul.emit(coords, true)
		return true


func get_tile_info(coords: Vector2i) -> Dictionary:
	return ladang_data.get(coords, {})
