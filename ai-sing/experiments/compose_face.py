"""Compose a face onto a fish body image, Seaman-style."""
import argparse
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

def create_face_mask(size):
    """Create a soft elliptical mask for blending."""
    mask = Image.new("L", size, 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse([0, 0, size[0], size[1]], fill=255)
    # Soften edges
    mask = mask.filter(ImageFilter.GaussianBlur(radius=size[0] // 8))
    return mask

def tint_to_fish(face_np, fish_color):
    """Tint face to match fish body color."""
    # Convert fish color to float
    fc = np.array(fish_color[:3], dtype=np.float32) / 255.0
    face_f = face_np.astype(np.float32) / 255.0

    # Blend: keep face luminance, shift hue toward fish color
    gray = np.mean(face_f[:, :, :3], axis=2, keepdims=True)
    tinted = face_f[:, :, :3] * 0.55 + (gray * fc[None, None, :]) * 0.45

    return (np.clip(tinted, 0, 1) * 255).astype(np.uint8)

def compose(fish_path, face_path, output_path, face_center=(0.38, 0.5), face_scale=0.45):
    fish = Image.open(fish_path).convert("RGBA")
    face = Image.open(face_path).convert("RGBA")

    # Calculate face size relative to fish
    face_w = int(fish.width * face_scale)
    face_h = int(face_w * face.height / face.width)
    face_resized = face.resize((face_w, face_h), Image.LANCZOS)

    # Sample fish color from target area for tinting
    cx = int(fish.width * face_center[0])
    cy = int(fish.height * face_center[1])
    fish_np = np.array(fish)
    # Sample a small region to get average fish color
    region = fish_np[max(0,cy-10):cy+10, max(0,cx-10):cx+10]
    # Only use non-transparent pixels
    opaque = region[region[:,:,3] > 128]
    if len(opaque) > 0:
        fish_color = opaque.mean(axis=0).astype(int)
    else:
        fish_color = np.array([100, 160, 200, 255])

    # Tint face
    face_np = np.array(face_resized)
    face_rgb = tint_to_fish(face_np, fish_color)

    # Create soft mask
    mask = create_face_mask((face_w, face_h))

    # Create tinted face image
    tinted_face = Image.fromarray(face_rgb).convert("RGBA")
    # Apply mask as alpha
    tinted_face.putalpha(mask)

    # Position face on fish
    paste_x = cx - face_w // 2
    paste_y = cy - face_h // 2

    # Composite
    result = fish.copy()
    result = Image.alpha_composite(result, Image.new("RGBA", fish.size, (0, 0, 0, 0)))

    # Paste face
    temp = Image.new("RGBA", fish.size, (0, 0, 0, 0))
    temp.paste(tinted_face, (paste_x, paste_y))
    result = Image.alpha_composite(result, temp)

    result.save(output_path)
    print(f"=> {output_path}")

def main():
    parser = argparse.ArgumentParser(description="Compose face onto fish body")
    parser.add_argument("--fish", required=True, help="Fish body image")
    parser.add_argument("--face", required=True, help="Face image")
    parser.add_argument("--output", required=True, help="Output image")
    parser.add_argument("--cx", type=float, default=0.38, help="Face center X (0-1)")
    parser.add_argument("--cy", type=float, default=0.5, help="Face center Y (0-1)")
    parser.add_argument("--scale", type=float, default=0.45, help="Face scale relative to fish")
    args = parser.parse_args()

    compose(args.fish, args.face, args.output,
            face_center=(args.cx, args.cy), face_scale=args.scale)

if __name__ == "__main__":
    main()
