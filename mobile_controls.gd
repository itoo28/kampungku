extends CanvasLayer
class_name MobileControls

@export var petani: CharacterBody2D

@onready var btn_cangkul: TextureButton = get_node_or_null("Control/BtnCangkul")


func _ready() -> void:
	if not petani:
		petani = get_node_or_null("../petani") as CharacterBody2D
	if not petani:
		petani = get_node_or_null("../DuniaKampung/petani") as CharacterBody2D
	
	if btn_cangkul:
		btn_cangkul.pressed.connect(_on_cangkul_pressed)


func _on_cangkul_pressed() -> void:
	if petani and petani.has_method("lakukan_aksi_cangkul"):
		petani.lakukan_aksi_cangkul()
