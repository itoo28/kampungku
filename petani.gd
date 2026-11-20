extends CharacterBody2D

@export var speed: float = 250.0
@export var acceleration: float = 1200.0
@export var friction: float = 1200.0
@export var touch_deadzone: float = 10.0
@export var max_drag_distance: float = 80.0
@export var snap_to_8_directions: bool = false
@export var tap_max_distance: float = 18.0
@export var tap_max_duration_ms: int = 350
@export var selector_tap_half_size: float = 44.0

# Pengaturan interaksi grid tanah & selector (Skala Grid Realistis 64x64)
@export var ladang_node: NodePath = ^"../Ladang"
@export var selector_node: NodePath = ^"../Selector"
@export var interaction_offset: Vector2 = Vector2.ZERO
@export var interaction_distance: float = 56.0

const TEX_CLOD: Texture2D = preload("res://sprites/efek/gumpalan_tanah.png")
const TEX_SLASH: Texture2D = preload("res://sprites/efek/tebasan_cangkul.png")
const TEX_IMPACT: Texture2D = preload("res://sprites/efek/efek_dampak.png")

var facing_direction: Vector2 = Vector2.DOWN
var is_acting: bool = false

var _touch_active: bool = false
var _touch_index: int = -1
var _touch_is_screen: bool = false
var _touch_origin: Vector2 = Vector2.ZERO
var _touch_press_pos: Vector2 = Vector2.ZERO
var _touch_last_pos: Vector2 = Vector2.ZERO
var _touch_start_time_ms: int = 0
var _touch_max_travel: float = 0.0
var _touch_direction: Vector2 = Vector2.ZERO
var _sprite_base_pos: Vector2 = Vector2.ZERO
var _selector_shaking: bool = false

@onready var animated_sprite: AnimatedSprite2D = get_node_or_null("AnimatedSprite2D")
@onready var hoe_tool: Sprite2D = get_node_or_null("HoeTool")
@onready var camera: Camera2D = get_node_or_null("Camera2D")
@onready var ladang: Ladang = get_node_or_null(ladang_node) as Ladang
@onready var selector: Node2D = get_node_or_null(selector_node) as Node2D

signal cangkul_dilakukan(target_coords: Vector2i)


func _ready() -> void:
	if animated_sprite:
		animated_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_sprite_base_pos = animated_sprite.position
	if hoe_tool:
		hoe_tool.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	if not ladang and get_parent():
		ladang = get_parent().get_node_or_null("Ladang") as Ladang
		if not ladang and get_parent().get_parent():
			ladang = get_parent().get_parent().get_node_or_null("Ladang") as Ladang
	if not selector and get_parent():
		selector = get_parent().get_node_or_null("Selector") as Node2D
		if not selector and get_parent().get_parent():
			selector = get_parent().get_parent().get_node_or_null("Selector") as Node2D
	_update_selector()


func _unhandled_input(event: InputEvent) -> void:
	# Tombol aksi cangkul di desktop (Spasi / Enter / J / Action interact)
	if event.is_action_pressed("interact") \
		or event.is_action_pressed("ui_accept") \
		or (event is InputEventKey and event.pressed and not event.echo and (event.keycode == KEY_SPACE or event.keycode == KEY_J)):
		lakukan_aksi_cangkul()
		get_viewport().set_input_as_handled()
		return

	if is_acting:
		return

	if event is InputEventScreenTouch:
		if event.pressed:
			if not _touch_active:
				_begin_touch(event.index, event.position, true)
		elif _touch_active and _touch_is_screen and event.index == _touch_index:
			_end_touch(event.position)

	elif event is InputEventScreenDrag:
		if _touch_active and _touch_is_screen and event.index == _touch_index:
			_update_touch_direction(event.position)

	# Fallback mouse drag/klik untuk pengujian di desktop (tanpa duplikasi jika touch emulation aktif)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if not _touch_active:
				_begin_touch(0, event.position, false)
		elif _touch_active and not _touch_is_screen and _touch_index == 0:
			_end_touch(event.position)

	elif event is InputEventMouseMotion and _touch_active and not _touch_is_screen and _touch_index == 0:
		_update_touch_direction(event.position)


func _physics_process(delta: float) -> void:
	if is_acting:
		velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
		move_and_slide()
		return

	var move_direction := _get_movement_direction()

	if move_direction != Vector2.ZERO:
		velocity = velocity.move_toward(move_direction * speed, acceleration * delta)
		facing_direction = move_direction
		_play_animation("walk", move_direction)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
		_play_animation("idle", facing_direction)

	move_and_slide()
	_update_selector()


func _get_direction_suffix(dir: Vector2) -> String:
	if abs(dir.x) > abs(dir.y):
		return "right" if dir.x > 0.0 else "left"
	return "down" if dir.y >= 0.0 else "up"


func _play_animation(state: String, dir: Vector2) -> void:
	if not animated_sprite or is_acting:
		return

	var anim_name := state + "_" + _get_direction_suffix(dir)
	if animated_sprite.animation != anim_name or not animated_sprite.is_playing():
		animated_sprite.play(anim_name)


func _get_movement_direction() -> Vector2:
	var key_direction := Vector2.ZERO

	if (InputMap.has_action("move_left") and Input.is_action_pressed("move_left")) \
		or Input.is_action_pressed("ui_left") \
		or Input.is_key_pressed(KEY_A) \
		or Input.is_key_pressed(KEY_LEFT):
		key_direction.x -= 1.0

	if (InputMap.has_action("move_right") and Input.is_action_pressed("move_right")) \
		or Input.is_action_pressed("ui_right") \
		or Input.is_key_pressed(KEY_D) \
		or Input.is_key_pressed(KEY_RIGHT):
		key_direction.x += 1.0

	if (InputMap.has_action("move_up") and Input.is_action_pressed("move_up")) \
		or Input.is_action_pressed("ui_up") \
		or Input.is_key_pressed(KEY_W) \
		or Input.is_key_pressed(KEY_UP):
		key_direction.y -= 1.0

	if (InputMap.has_action("move_down") and Input.is_action_pressed("move_down")) \
		or Input.is_action_pressed("ui_down") \
		or Input.is_key_pressed(KEY_S) \
		or Input.is_key_pressed(KEY_DOWN):
		key_direction.y += 1.0

	if key_direction != Vector2.ZERO:
		return key_direction.normalized()

	return _touch_direction


func _begin_touch(index: int, pos: Vector2, is_screen: bool) -> void:
	_touch_active = true
	_touch_index = index
	_touch_is_screen = is_screen
	_touch_origin = pos
	_touch_press_pos = pos
	_touch_last_pos = pos
	_touch_start_time_ms = Time.get_ticks_msec()
	_touch_max_travel = 0.0
	_touch_direction = Vector2.ZERO


func _end_touch(release_pos: Vector2) -> void:
	var travel := maxf(_touch_max_travel, release_pos.distance_to(_touch_press_pos))
	var elapsed_ms := Time.get_ticks_msec() - _touch_start_time_ms
	_reset_touch()

	# Jika sentuhan singkat dan hampir tidak bergeser -> perlakukan sebagai TAP untuk mencangkul
	if travel <= tap_max_distance and elapsed_ms <= tap_max_duration_ms:
		_handle_tap_at_screen_pos(release_pos)


func _update_touch_direction(current_position: Vector2) -> void:
	_touch_last_pos = current_position
	_touch_max_travel = maxf(_touch_max_travel, current_position.distance_to(_touch_press_pos))

	var drag_vector := current_position - _touch_origin

	if drag_vector.length() > max_drag_distance:
		_touch_origin = current_position - drag_vector.normalized() * max_drag_distance
		drag_vector = current_position - _touch_origin

	if drag_vector.length() >= touch_deadzone:
		var dir := drag_vector.normalized()
		if snap_to_8_directions:
			dir = _snap_to_8_directions(dir)
		_touch_direction = dir
	else:
		_touch_direction = Vector2.ZERO


func _snap_to_8_directions(direction: Vector2) -> Vector2:
	if direction == Vector2.ZERO:
		return Vector2.ZERO
	var snapped_angle: float = snappedf(direction.angle(), PI / 4.0)
	return Vector2.RIGHT.rotated(snapped_angle).normalized()


func _reset_touch() -> void:
	_touch_active = false
	_touch_index = -1
	_touch_is_screen = false
	_touch_max_travel = 0.0
	_touch_direction = Vector2.ZERO


func _screen_to_world(screen_pos: Vector2) -> Vector2:
	return get_viewport().get_canvas_transform().affine_inverse() * screen_pos


func _handle_tap_at_screen_pos(screen_pos: Vector2) -> void:
	if is_acting or not ladang:
		return
	var world_pos := _screen_to_world(screen_pos)
	coba_cangkul_dari_tap_dunia(world_pos)


func coba_cangkul_dari_tap_dunia(world_pos: Vector2) -> bool:
	if is_acting or not ladang:
		return false

	# 1. Tap langsung di area selektor yang sedang aktif
	if selector and selector.visible:
		var dx_sel := absf(world_pos.x - selector.global_position.x)
		var dy_sel := absf(world_pos.y - selector.global_position.y)
		if dx_sel <= selector_tap_half_size and dy_sel <= selector_tap_half_size:
			lakukan_aksi_cangkul(selector.global_position)
			return true

	var feet_pos := global_position + interaction_offset
	var farmer_coords := ladang.get_tile_coords(feet_pos)
	var tapped_coords := ladang.get_tile_coords(world_pos)

	# 2. Tap di salah satu dari 8 petak sekitar petani (jarak 1 petak sekeliling petani)
	var dx_tile: int = absi(tapped_coords.x - farmer_coords.x)
	var dy_tile: int = absi(tapped_coords.y - farmer_coords.y)
	if dx_tile <= 1 and dy_tile <= 1:
		if tapped_coords == farmer_coords:
			# Tap tepat di pijakan petani -> cangkul petak target di depan petani jika dekat ladang
			var front_pos := get_target_world_position()
			var front_coords := ladang.get_tile_coords(front_pos)
			if ladang.is_near_farmable_zone(front_coords, 1):
				lakukan_aksi_cangkul(front_pos)
				return true
			return false
		else:
			# Hanya jalankan aksi/umpan balik jika petak berada di dalam atau tepat di tepi Area Ladang
			if ladang.is_near_farmable_zone(tapped_coords, 1):
				var tapped_center := ladang.get_tile_center_from_coords(tapped_coords)
				lakukan_aksi_cangkul(tapped_center)
				return true
			return false

	# 3. Tap tepat di sprite badan/caping petani -> cangkul petak di depan petani jika dekat ladang
	var body_rect := Rect2(global_position + Vector2(-42.0, -128.0), Vector2(84.0, 128.0))
	if body_rect.has_point(world_pos):
		var front_pos := get_target_world_position()
		var front_coords := ladang.get_tile_coords(front_pos)
		if ladang.is_near_farmable_zone(front_coords, 1):
			lakukan_aksi_cangkul(front_pos)
			return true

	return false


# ==========================================
# Logika Interaksi Grid & Animasi Mencangkul
# ==========================================

func get_target_world_position() -> Vector2:
	var feet_pos: Vector2 = global_position + interaction_offset
	var dir: Vector2 = facing_direction if facing_direction != Vector2.ZERO else Vector2.DOWN
	return feet_pos + dir.normalized() * interaction_distance


func _update_selector() -> void:
	if not selector or _selector_shaking:
		return

	var target_pos: Vector2 = get_target_world_position()
	if not ladang:
		selector.visible = false
		return

	var coords: Vector2i = ladang.get_tile_coords(target_pos)
	var center: Vector2 = ladang.get_tile_center_from_coords(coords)
	var exclude_list: Array[RID] = [get_rid()]

	if ladang.can_till_tile(coords, exclude_list):
		selector.visible = true
		selector.global_position = center
		selector.modulate = Color(1.0, 1.0, 1.0, 0.95)
		var pulse: float = 1.0 + sin(Time.get_ticks_msec() * 0.007) * 0.035
		selector.scale = Vector2(pulse, pulse)
	elif ladang.is_near_farmable_zone(coords, 1):
		selector.visible = true
		selector.global_position = center
		selector.modulate = Color(1.0, 0.30, 0.30, 0.65)
		selector.scale = Vector2.ONE
	else:
		selector.visible = false


func lakukan_aksi_cangkul(custom_target_pos: Variant = null) -> void:
	if is_acting:
		return

	is_acting = true
	var target_pos: Vector2
	if custom_target_pos is Vector2:
		target_pos = custom_target_pos
		var to_target: Vector2 = target_pos - (global_position + interaction_offset)
		if to_target.length() > 8.0:
			facing_direction = to_target.normalized()
	else:
		target_pos = get_target_world_position()

	var dir: Vector2 = facing_direction if facing_direction != Vector2.ZERO else Vector2.DOWN
	if selector and ladang:
		selector.global_position = ladang.get_tile_center_world(target_pos)
	_play_hoe_animation(dir, target_pos)


func _play_hoe_animation(dir: Vector2, target_pos: Vector2) -> void:
	var dir_suffix := _get_direction_suffix(dir)
	var exclude_list: Array[RID] = [get_rid()]
	var can_till := false
	var target_coords := Vector2i.ZERO
	var tile_center := target_pos

	if ladang:
		target_coords = ladang.get_tile_coords(target_pos)
		tile_center = ladang.get_tile_center_from_coords(target_coords)
		can_till = ladang.can_till_tile(target_coords, exclude_list)

	if not hoe_tool or not animated_sprite:
		if ladang and can_till:
			ladang.cangkul_tile(target_coords, exclude_list)
			cangkul_dilakukan.emit(target_coords)
		is_acting = false
		return

	# Konfigurasi pose cangkul yang presisi untuk 4 arah hadap
	var windup_pos := Vector2(22, -26)
	var strike_pos := Vector2(8, 56)
	var windup_rot := deg_to_rad(-85.0)
	var strike_rot := deg_to_rad(52.0)
	var lunge_offset := Vector2(0, 6)
	var tool_z := 1
	var flip_tool := false
	var slash_offset := Vector2(0, 48)
	var slash_rot := deg_to_rad(45.0)
	var slash_flip_h := false

	match dir_suffix:
		"right":
			windup_pos = Vector2(-10, -34)
			strike_pos = Vector2(52, 46)
			windup_rot = deg_to_rad(-115.0)
			strike_rot = deg_to_rad(42.0)
			lunge_offset = Vector2(8, 3)
			tool_z = 1
			flip_tool = false
			slash_offset = Vector2(44, 16)
			slash_rot = deg_to_rad(10.0)
			slash_flip_h = false
		"left":
			windup_pos = Vector2(10, -34)
			strike_pos = Vector2(-52, 46)
			windup_rot = deg_to_rad(115.0)
			strike_rot = deg_to_rad(-42.0)
			lunge_offset = Vector2(-8, 3)
			tool_z = 1
			flip_tool = true
			slash_offset = Vector2(-44, 16)
			slash_rot = deg_to_rad(-10.0)
			slash_flip_h = true
		"up":
			windup_pos = Vector2(-16, -32)
			strike_pos = Vector2(-6, -2)
			windup_rot = deg_to_rad(-135.0)
			strike_rot = deg_to_rad(-15.0)
			lunge_offset = Vector2(0, -6)
			tool_z = -1
			flip_tool = false
			slash_offset = Vector2(0, -24)
			slash_rot = deg_to_rad(-70.0)
			slash_flip_h = false
		_: # "down"
			windup_pos = Vector2(22, -28)
			strike_pos = Vector2(8, 58)
			windup_rot = deg_to_rad(-95.0)
			strike_rot = deg_to_rad(55.0)
			lunge_offset = Vector2(0, 7)
			tool_z = 1
			flip_tool = false
			slash_offset = Vector2(6, 36)
			slash_rot = deg_to_rad(60.0)
			slash_flip_h = false

	# Jika target di luar Area Ladang / menabrak bangunan atau jalan -> umpan balik ditolak
	if not can_till:
		_play_invalid_hoe_feedback(dir_suffix, tile_center, windup_pos, windup_rot, flip_tool, tool_z)
		return

	# Set frame pose angkat cangkul (windup)
	var hoe_anim := "hoe_" + dir_suffix
	if animated_sprite.sprite_frames and animated_sprite.sprite_frames.has_animation(hoe_anim):
		animated_sprite.animation = hoe_anim
		animated_sprite.stop()
		animated_sprite.frame = 0
	else:
		animated_sprite.play("idle_" + dir_suffix)

	hoe_tool.z_index = tool_z
	hoe_tool.flip_h = flip_tool
	hoe_tool.position = _sprite_base_pos + windup_pos * 0.6
	hoe_tool.rotation = windup_rot * 0.65
	hoe_tool.scale = Vector2(0.85, 0.85)
	hoe_tool.visible = true
	hoe_tool.modulate = Color.WHITE

	var tween: Tween = create_tween()

	# 1. Fase Ancang-ancang (Windup): angkat cangkul tinggi dengan antisipasi
	tween.tween_property(hoe_tool, "position", _sprite_base_pos + windup_pos, 0.11).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(hoe_tool, "rotation", windup_rot, 0.11).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(hoe_tool, "scale", Vector2(1.12, 1.12), 0.11)
	tween.parallel().tween_property(animated_sprite, "position", _sprite_base_pos + Vector2(0, -6.0) - lunge_offset * 0.35, 0.11).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2(0.93, 1.07), 0.11)

	# 2. Fase Tebasan Cepat (Strike Arc): ganti frame hentakan & munculkan kilatan ayunan
	tween.tween_callback(func():
		if animated_sprite.sprite_frames and animated_sprite.sprite_frames.has_animation(hoe_anim):
			animated_sprite.frame = 1
		_spawn_slash_fx(slash_offset, slash_rot, slash_flip_h, tool_z)
	)
	tween.tween_property(hoe_tool, "position", _sprite_base_pos + strike_pos, 0.085).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(hoe_tool, "rotation", strike_rot, 0.085).set_trans(Tween.TRANS_EXPO).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(hoe_tool, "scale", Vector2(1.18, 0.96), 0.085)
	tween.parallel().tween_property(animated_sprite, "position", _sprite_base_pos + lunge_offset, 0.085).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2(1.10, 0.90), 0.085)

	# 3. Fase Benturan (Impact): ubah tile tanah, ledakan partikel tanah, cincin debu, getaran mikro kamera
	tween.tween_callback(func():
		if ladang:
			var was_tilled := ladang.is_tilled(target_coords)
			if ladang.cangkul_tile(target_coords, exclude_list):
				cangkul_dilakukan.emit(target_coords)
				_spawn_dirt_burst_fx(tile_center, not was_tilled)
				_punch_camera(dir)
	)

	# Hitstop singkat agar hentakan terasa berbobot
	tween.tween_interval(0.045)

	# 4. Fase Pemulihan (Follow-through & Recovery)
	tween.tween_callback(func():
		if animated_sprite.sprite_frames and animated_sprite.sprite_frames.has_animation(hoe_anim):
			if animated_sprite.sprite_frames.get_frame_count(hoe_anim) > 2:
				animated_sprite.frame = 2
	)
	tween.tween_property(animated_sprite, "position", _sprite_base_pos, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2.ONE, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tween.parallel().tween_property(hoe_tool, "modulate:a", 0.0, 0.11)
	tween.parallel().tween_property(hoe_tool, "scale", Vector2(0.85, 0.85), 0.11)

	# 5. Selesai
	tween.tween_callback(func():
		hoe_tool.visible = false
		hoe_tool.scale = Vector2.ONE
		is_acting = false
		_play_animation("idle", dir)
		_update_selector()
	)


func _play_invalid_hoe_feedback(dir_suffix: String, tile_center: Vector2, windup_pos: Vector2, windup_rot: float, flip_tool: bool, tool_z: int) -> void:
	# Animasi pendek tertahan + kilatan merah pada selektor agar pemain paham area terlarang
	var hoe_anim := "hoe_" + dir_suffix
	if animated_sprite.sprite_frames and animated_sprite.sprite_frames.has_animation(hoe_anim):
		animated_sprite.animation = hoe_anim
		animated_sprite.stop()
		animated_sprite.frame = 0

	hoe_tool.z_index = tool_z
	hoe_tool.flip_h = flip_tool
	hoe_tool.position = _sprite_base_pos + windup_pos * 0.75
	hoe_tool.rotation = windup_rot * 0.75
	hoe_tool.scale = Vector2(0.95, 0.95)
	hoe_tool.visible = true
	hoe_tool.modulate = Color(1.0, 0.85, 0.85, 0.9)

	_flash_invalid_selector(tile_center)

	var tween: Tween = create_tween()
	tween.tween_property(animated_sprite, "position:x", _sprite_base_pos.x - 4.0, 0.05)
	tween.parallel().tween_property(hoe_tool, "rotation", windup_rot * 0.45, 0.05)
	tween.tween_property(animated_sprite, "position:x", _sprite_base_pos.x + 4.0, 0.06)
	tween.tween_property(animated_sprite, "position", _sprite_base_pos, 0.07)
	tween.parallel().tween_property(hoe_tool, "modulate:a", 0.0, 0.09)
	tween.tween_callback(func():
		hoe_tool.visible = false
		hoe_tool.scale = Vector2.ONE
		is_acting = false
		_play_animation("idle", facing_direction)
		_update_selector()
	)


func _flash_invalid_selector(tile_center: Vector2) -> void:
	if not selector:
		return
	_selector_shaking = true
	selector.visible = true
	selector.global_position = tile_center
	selector.scale = Vector2(1.05, 1.05)
	selector.modulate = Color(1.0, 0.22, 0.22, 0.92)

	var st := create_tween()
	st.tween_property(selector, "global_position:x", tile_center.x - 6.0, 0.04)
	st.tween_property(selector, "global_position:x", tile_center.x + 6.0, 0.05)
	st.tween_property(selector, "global_position:x", tile_center.x - 3.0, 0.04)
	st.tween_property(selector, "global_position:x", tile_center.x, 0.04)
	st.tween_property(selector, "modulate:a", 0.0, 0.12)
	st.tween_callback(func():
		_selector_shaking = false
		_update_selector()
	)


func _spawn_slash_fx(local_offset: Vector2, rot: float, flip_h: bool, z_idx: int) -> void:
	var slash := Sprite2D.new()
	slash.texture = TEX_SLASH
	slash.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	slash.position = _sprite_base_pos + local_offset
	slash.rotation = rot
	slash.flip_h = flip_h
	slash.z_index = z_idx + 1
	slash.scale = Vector2(0.75, 0.75)
	slash.modulate = Color(1.0, 0.98, 0.88, 0.95)
	add_child(slash)

	var tw := create_tween()
	tw.tween_property(slash, "scale", Vector2(1.15, 1.15), 0.10).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(slash, "modulate:a", 0.0, 0.11).set_ease(Tween.EASE_IN)
	tw.tween_callback(slash.queue_free)


func _spawn_dirt_burst_fx(world_center: Vector2, digging_fresh: bool) -> void:
	var fx_parent: Node = get_parent() if get_parent() else self

	# 1. Cincin debu hentakan di permukaan tanah
	var ring := Sprite2D.new()
	ring.texture = TEX_IMPACT
	ring.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
	ring.global_position = world_center + Vector2(0, 6)
	ring.z_index = 2
	ring.scale = Vector2(0.55, 0.55)
	ring.modulate = Color(1.0, 0.96, 0.88, 0.95)
	fx_parent.add_child(ring)

	var rtw := ring.create_tween()
	rtw.tween_property(ring, "scale", Vector2(1.15, 1.05), 0.18).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	rtw.parallel().tween_property(ring, "modulate:a", 0.0, 0.22).set_ease(Tween.EASE_IN)
	rtw.tween_callback(ring.queue_free)

	# 2. Percikan 8 gumpalan tanah & rumput melambung parabola
	var clod_colors: Array[Color] = [
		Color(1.0, 1.0, 1.0),
		Color(0.88, 0.72, 0.58),
		Color(0.75, 0.58, 0.45),
		Color(0.55, 0.92, 0.42) if digging_fresh else Color(0.95, 0.82, 0.65)
	]

	for i in range(8):
		var clod := Sprite2D.new()
		clod.texture = TEX_CLOD
		clod.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		clod.global_position = world_center + Vector2(randf_range(-10.0, 10.0), randf_range(-6.0, 6.0))
		clod.z_index = 4
		var base_scale := randf_range(0.55, 0.95)
		clod.scale = Vector2(base_scale, base_scale)
		clod.modulate = clod_colors[i % clod_colors.size()]
		fx_parent.add_child(clod)

		var angle := (TAU / 8.0) * float(i) + randf_range(-0.3, 0.3)
		var horiz := cos(angle) * randf_range(18.0, 42.0)
		var apex_y := -randf_range(22.0, 42.0)
		var land_y := sin(angle) * randf_range(8.0, 20.0)
		var dur_up := randf_range(0.11, 0.16)
		var dur_down := randf_range(0.14, 0.20)
		var start_pos := clod.global_position
		var spin := randf_range(-5.0, 5.0)

		var ctw := clod.create_tween()
		# Melambung ke puncak
		ctw.tween_property(clod, "global_position:x", start_pos.x + horiz * 0.5, dur_up)
		ctw.parallel().tween_property(clod, "global_position:y", start_pos.y + apex_y, dur_up).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
		ctw.parallel().tween_property(clod, "rotation", spin * 0.5, dur_up)
		# Jatuh ke tanah & memudar
		ctw.tween_property(clod, "global_position:x", start_pos.x + horiz, dur_down)
		ctw.parallel().tween_property(clod, "global_position:y", start_pos.y + land_y, dur_down).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
		ctw.parallel().tween_property(clod, "rotation", spin, dur_down)
		ctw.parallel().tween_property(clod, "modulate:a", 0.0, dur_down).set_delay(0.05)
		ctw.tween_callback(clod.queue_free)


func _punch_camera(dir: Vector2) -> void:
	if not camera:
		return
	var punch := dir.normalized() * 3.5 + Vector2(0, 2.5)
	var ctw := create_tween()
	ctw.tween_property(camera, "offset", punch, 0.04).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	ctw.tween_property(camera, "offset", Vector2.ZERO, 0.10).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
