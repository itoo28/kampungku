extends TileMapLayer
class_name Ladang

# ID sumber TileSet untuk tanah cangkul (berdasarkan ladang_tileset.tres, grid 64x64)
const SOURCE_ID_TILLED: int = 0
const ATLAS_COORDS_TILLED: Vector2i = Vector2i(0, 0)
const TILE_SIZE_PX: float = 64.0

# Zona khusus yang diizinkan untuk mencangkul (koordinat petak 64x64).
# Default: col 11..16, row 12..15 -> area dunia X: 704..1088, Y: 768..1024 (6x4 petak)
@export var farmable_zones: Array[Rect2i] = [
	Rect2i(11, 12, 6, 4)
]

# Area terlarang tambahan (jalan batu, tangga, tebing) agar tidak pernah tertimpa cangkul
@export var blocked_world_rects: Array[Rect2] = [
	Rect2(512.0, -1024.0, 128.0, 2688.0), # JalanUtamaV & TanggaBatu
	Rect2(-512.0, 256.0, 2176.0, 128.0),  # JalanUtamaH
	Rect2(-512.0, -256.0, 2176.0, 128.0), # JalanUtaraH
	Rect2(128.0, 896.0, 384.0, 128.0),    # JalanKiriSawah
	Rect2(-512.0, 640.0, 2176.0, 64.0)    # TebingKiri & TebingKanan
]

# Dictionary penyimpan data ladang: Vector2i -> Dictionary
# Format: { "state": "tilled", "watered": false, "crop": null, "growth_stage": 0 }
var ladang_data: Dictionary = {}

var _probe_shape: RectangleShape2D

signal tile_dicangkul(coords: Vector2i, is_tilled: bool)
signal tile_ditolak(coords: Vector2i)


func _ready() -> void:
	if tile_set == null:
		var default_ts = load("res://sprites/ladang_tileset.tres")
		if default_ts:
			tile_set = default_ts

	_probe_shape = RectangleShape2D.new()
	_probe_shape.size = Vector2(TILE_SIZE_PX - 12.0, TILE_SIZE_PX - 12.0)

	# Siapkan petak ladang awal (3x2) di sudut kiri atas Area Ladang
	if ladang_data.is_empty():
		for col in range(11, 14):
			for row in range(12, 14):
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


func is_in_farmable_zone(coords: Vector2i) -> bool:
	for zone in farmable_zones:
		if zone.has_point(coords):
			return true
	return false


func is_near_farmable_zone(coords: Vector2i, margin: int = 2) -> bool:
	for zone in farmable_zones:
		var expanded := zone.grow(margin)
		if expanded.has_point(coords):
			return true
	return false


func is_tile_blocked_by_world(coords: Vector2i, exclude_rids: Array[RID] = []) -> bool:
	var center: Vector2 = get_tile_center_from_coords(coords)
	var tile_rect := Rect2(center - Vector2(TILE_SIZE_PX * 0.45, TILE_SIZE_PX * 0.45), Vector2(TILE_SIZE_PX * 0.9, TILE_SIZE_PX * 0.9))

	# 1. Cegah menimpa jalan, tangga, atau tebing
	for blocked in blocked_world_rects:
		if tile_rect.intersects(blocked):
			return true

	# 2. Cegah menimpa bangunan, pagar, pohon, lampu, bangku, sawah berair (StaticBody2D)
	var world_2d := get_world_2d()
	if world_2d and _probe_shape:
		var query := PhysicsShapeQueryParameters2D.new()
		query.shape = _probe_shape
		query.transform = Transform2D(0.0, center)
		query.collide_with_bodies = true
		query.collide_with_areas = false
		query.exclude = exclude_rids
		var hits := world_2d.direct_space_state.intersect_shape(query, 4)
		for hit in hits:
			var collider = hit.get("collider")
			if collider is StaticBody2D or collider is TileMapLayer:
				return true

	return false


func can_till_tile(coords: Vector2i, exclude_rids: Array[RID] = []) -> bool:
	if not is_in_farmable_zone(coords):
		return false
	if is_tile_blocked_by_world(coords, exclude_rids):
		return false
	return true


func cangkul_at_world_pos(world_pos: Vector2, exclude_rids: Array[RID] = []) -> bool:
	var coords: Vector2i = get_tile_coords(world_pos)
	return cangkul_tile(coords, exclude_rids)


func cangkul_tile(coords: Vector2i, exclude_rids: Array[RID] = []) -> bool:
	if not can_till_tile(coords, exclude_rids):
		tile_ditolak.emit(coords)
		return false

	if is_tilled(coords):
		# Jika sudah dicangkul dan belum ada tanaman, cangkul lagi untuk meratakan kembali tanah
		ladang_data.erase(coords)
		set_cell(coords, -1)
		tile_dicangkul.emit(coords, false)
		return true
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
