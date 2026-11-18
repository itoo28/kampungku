extends CharacterBody2D

@export var speed: float = 250.0
@export var acceleration: float = 1200.0
@export var friction: float = 1200.0
@export var touch_deadzone: float = 10.0
@export var max_drag_distance: float = 80.0
@export var snap_to_8_directions: bool = false

# Pengaturan interaksi grid tanah & selector (Skala Grid 128x128)
@export var ladang_node: NodePath = ^"../Ladang"
@export var selector_node: NodePath = ^"../Selector"
@export var interaction_offset: Vector2 = Vector2.ZERO
@export var interaction_distance: float = 96.0

var facing_direction: Vector2 = Vector2.DOWN
var is_acting: bool = false

var _touch_active: bool = false
var _touch_index: int = -1
var _touch_origin: Vector2 = Vector2.ZERO
var _touch_direction: Vector2 = Vector2.ZERO
var _sprite_base_pos: Vector2 = Vector2.ZERO

@onready var animated_sprite: AnimatedSprite2D = get_node_or_null("AnimatedSprite2D")
@onready var hoe_tool: Sprite2D = get_node_or_null("HoeTool")
@onready var ladang: Ladang = get_node_or_null(ladang_node) as Ladang
@onready var selector: Node2D = get_node_or_null(selector_node) as Node2D

signal cangkul_dilakukan(target_coords: Vector2i)


func _ready() -> void:
	if animated_sprite:
		animated_sprite.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST
		_sprite_base_pos = animated_sprite.position
	if not ladang and get_parent():
		ladang = get_parent().get_node_or_null("Ladang") as Ladang
		if not ladang and get_parent().get_parent():
			ladang = get_parent().get_parent().get_node_or_null("Ladang") as Ladang
	if not selector and get_parent():
		selector = get_parent().get_node_or_null("Selector") as Node2D
		if not selector and get_parent().get_parent():
			selector = get_parent().get_parent().get_node_or_null("Selector") as Node2D


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
				_touch_active = true
				_touch_index = event.index
				_touch_origin = event.position
				_touch_direction = Vector2.ZERO
		elif event.index == _touch_index:
			_reset_touch()

	elif event is InputEventScreenDrag:
		if _touch_active and event.index == _touch_index:
			_update_touch_direction(event.position)

	# Fallback mouse drag untuk pengujian di desktop (jika touch emulation nonaktif)
	elif event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		if event.pressed:
			if not _touch_active:
				_touch_active = true
				_touch_index = 0
				_touch_origin = event.position
				_touch_direction = Vector2.ZERO
		elif _touch_index == 0:
			_reset_touch()

	elif event is InputEventMouseMotion and _touch_active and _touch_index == 0:
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


func _play_animation(state: String, dir: Vector2) -> void:
	if not animated_sprite or is_acting:
		return

	var direction_suffix := "down"
	if abs(dir.x) > abs(dir.y):
		direction_suffix = "right" if dir.x > 0.0 else "left"
	else:
		direction_suffix = "down" if dir.y > 0.0 else "up"

	var anim_name := state + "_" + direction_suffix
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


func _update_touch_direction(current_position: Vector2) -> void:
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
	_touch_direction = Vector2.ZERO


# ==========================================
# Logika Interaksi Grid & Mencangkul
# ==========================================

func get_target_world_position() -> Vector2:
	var feet_pos: Vector2 = global_position + interaction_offset
	var dir: Vector2 = facing_direction if facing_direction != Vector2.ZERO else Vector2.DOWN
	return feet_pos + dir.normalized() * interaction_distance


func _update_selector() -> void:
	if not selector:
		return

	var target_pos: Vector2 = get_target_world_position()
	if ladang:
		selector.global_position = ladang.get_tile_center_world(target_pos)
	else:
		var snapped_pos: Vector2 = (target_pos / 128.0).floor() * 128.0 + Vector2(64.0, 64.0)
		selector.global_position = snapped_pos


func lakukan_aksi_cangkul() -> void:
	if is_acting:
		return

	is_acting = true
	var dir: Vector2 = facing_direction if facing_direction != Vector2.ZERO else Vector2.DOWN
	var target_pos: Vector2 = get_target_world_position()
	_play_hoe_animation(dir, target_pos)


func _play_hoe_animation(dir: Vector2, target_pos: Vector2) -> void:
	if not hoe_tool or not animated_sprite:
		if ladang:
			var coords: Vector2i = ladang.get_tile_coords(target_pos)
			ladang.cangkul_tile(coords)
			cangkul_dilakukan.emit(coords)
		is_acting = false
		return

	# Tentukan pose cangkul sesuai arah hadap
	var start_pos: Vector2 = Vector2(25, 20)
	var end_pos: Vector2 = Vector2(10, 85)
	var start_rot: float = deg_to_rad(-45.0)
	var end_rot: float = deg_to_rad(65.0)
	var tool_z: int = 1

	if abs(dir.x) > abs(dir.y):
		if dir.x > 0.0:
			# Hadap Kanan
			start_pos = Vector2(15, 10)
			end_pos = Vector2(70, 75)
			start_rot = deg_to_rad(-65.0)
			end_rot = deg_to_rad(45.0)
			tool_z = 1
			animated_sprite.play("idle_right")
		else:
			# Hadap Kiri
			start_pos = Vector2(-15, 10)
			end_pos = Vector2(-70, 75)
			start_rot = deg_to_rad(65.0)
			end_rot = deg_to_rad(-45.0)
			tool_z = 1
			animated_sprite.play("idle_left")
	else:
		if dir.y < 0.0:
			# Hadap Atas (Membelakangi kamera)
			start_pos = Vector2(-25, 30)
			end_pos = Vector2(-10, -5)
			start_rot = deg_to_rad(-120.0)
			end_rot = deg_to_rad(-10.0)
			tool_z = -1
			animated_sprite.play("idle_up")
		else:
			# Hadap Bawah (Menghadap kamera)
			start_pos = Vector2(25, 20)
			end_pos = Vector2(10, 85)
			start_rot = deg_to_rad(-45.0)
			end_rot = deg_to_rad(65.0)
			tool_z = 1
			animated_sprite.play("idle_down")

	hoe_tool.z_index = tool_z
	hoe_tool.position = _sprite_base_pos + start_pos
	hoe_tool.rotation = start_rot
	hoe_tool.visible = true
	hoe_tool.modulate = Color.WHITE

	var tween: Tween = create_tween()
	# 1. Ancang-ancang (windup): karakter sedikit terangkat
	tween.tween_property(animated_sprite, "position:y", _sprite_base_pos.y - 6.0, 0.08)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2(0.96, 1.04), 0.08)

	# 2. Hentakan menancap tanah (swing down & squash)
	tween.tween_property(hoe_tool, "position", _sprite_base_pos + end_pos, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(hoe_tool, "rotation", end_rot, 0.12).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tween.parallel().tween_property(animated_sprite, "position:y", _sprite_base_pos.y + 5.0, 0.12)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2(1.08, 0.92), 0.12)

	# 3. Callback benturan: ubah tile tanah
	tween.tween_callback(func():
		if ladang:
			var coords: Vector2i = ladang.get_tile_coords(target_pos)
			ladang.cangkul_tile(coords)
			cangkul_dilakukan.emit(coords)
	)

	# 4. Pemulihan kembali normal
	tween.tween_property(animated_sprite, "position", _sprite_base_pos, 0.10)
	tween.parallel().tween_property(animated_sprite, "scale", Vector2.ONE, 0.10)
	tween.parallel().tween_property(hoe_tool, "modulate:a", 0.0, 0.10)

	# 5. Selesai
	tween.tween_callback(func():
		hoe_tool.visible = false
		is_acting = false
	)
