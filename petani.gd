extends CharacterBody2D

@export var speed: float = 150.0
@export var acceleration: float = 1200.0
@export var friction: float = 1200.0
@export var touch_deadzone: float = 10.0
@export var max_drag_distance: float = 80.0
@export var snap_to_8_directions: bool = false

var facing_direction: Vector2 = Vector2.DOWN

var _touch_active: bool = false
var _touch_index: int = -1
var _touch_origin: Vector2 = Vector2.ZERO
var _touch_direction: Vector2 = Vector2.ZERO

@onready var animated_sprite: AnimatedSprite2D = get_node_or_null("AnimatedSprite2D")


func _unhandled_input(event: InputEvent) -> void:
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
	var move_direction := _get_movement_direction()

	if move_direction != Vector2.ZERO:
		velocity = velocity.move_toward(move_direction * speed, acceleration * delta)
		facing_direction = move_direction
		_play_animation("walk", move_direction)
	else:
		velocity = velocity.move_toward(Vector2.ZERO, friction * delta)
		_play_animation("idle", facing_direction)

	move_and_slide()


func _play_animation(state: String, dir: Vector2) -> void:
	if not animated_sprite:
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
	var snapped_angle := snappedf(direction.angle(), PI / 4.0)
	return Vector2.RIGHT.rotated(snapped_angle).normalized()


func _reset_touch() -> void:
	_touch_active = false
	_touch_index = -1
	_touch_direction = Vector2.ZERO
