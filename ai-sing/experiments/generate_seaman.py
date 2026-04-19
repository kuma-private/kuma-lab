"""Generate Seaman-style image: human face on fish body using ComfyUI + PuLID + FLUX.2."""
import json
import urllib.request
import urllib.parse
import time
import sys
import os

COMFYUI_URL = "http://127.0.0.1:8188"

def queue_prompt(prompt):
    data = json.dumps({"prompt": prompt}).encode("utf-8")
    req = urllib.request.Request(f"{COMFYUI_URL}/prompt", data=data, headers={"Content-Type": "application/json"})
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read())

def get_history(prompt_id):
    resp = urllib.request.urlopen(f"{COMFYUI_URL}/history/{prompt_id}")
    return json.loads(resp.read())

def get_image(filename, subfolder, folder_type):
    params = urllib.parse.urlencode({"filename": filename, "subfolder": subfolder, "type": folder_type})
    resp = urllib.request.urlopen(f"{COMFYUI_URL}/view?{params}")
    return resp.read()

def upload_image(filepath):
    filename = os.path.basename(filepath)
    with open(filepath, "rb") as f:
        data = f.read()
    boundary = "----Boundary7MA4YWxkTrZu0gW"
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        f"Content-Type: image/png\r\n\r\n"
    ).encode() + data + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{COMFYUI_URL}/upload/image", data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"}
    )
    resp = urllib.request.urlopen(req)
    return json.loads(resp.read()).get("name", filename)

def build_workflow(face_image_name, prompt_text, seed=42):
    return {
        "1": {
            "class_type": "UNETLoader",
            "inputs": {"unet_name": "flux2-dev.safetensors", "weight_dtype": "default"}
        },
        "2": {
            "class_type": "DualCLIPLoader",
            "inputs": {"clip_name1": "clip_l.safetensors", "clip_name2": "t5xxl_fp8_e4m3fn.safetensors", "type": "flux"}
        },
        "3": {
            "class_type": "VAELoader",
            "inputs": {"vae_name": "ae.safetensors"}
        },
        "4": {
            "class_type": "CLIPTextEncode",
            "inputs": {"text": prompt_text, "clip": ["2", 0]}
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {"width": 768, "height": 512, "batch_size": 1}
        },
        "6": {
            "class_type": "LoadImage",
            "inputs": {"image": face_image_name}
        },
        # PuLID loaders
        "10": {
            "class_type": "PulidFluxModelLoader",
            "inputs": {"pulid_file": "pulid_flux_v0.9.1.safetensors"}
        },
        "11": {
            "class_type": "PulidFluxInsightFaceLoader",
            "inputs": {"provider": "CPU"}
        },
        "12": {
            "class_type": "PulidFluxEvaClipLoader",
            "inputs": {}
        },
        # Apply PuLID
        "13": {
            "class_type": "ApplyPulidFlux",
            "inputs": {
                "model": ["1", 0],
                "pulid_flux": ["10", 0],
                "eva_clip": ["12", 0],
                "face_analysis": ["11", 0],
                "image": ["6", 0],
                "weight": 0.9,
                "start_at": 0.0,
                "end_at": 1.0
            }
        },
        # Guidance for FLUX
        "14": {
            "class_type": "FluxGuidance",
            "inputs": {"conditioning": ["4", 0], "guidance": 4.0}
        },
        # KSampler
        "8": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["13", 0],
                "positive": ["14", 0],
                "negative": ["14", 0],
                "latent_image": ["5", 0],
                "seed": seed,
                "steps": 25,
                "cfg": 1.0,
                "sampler_name": "euler",
                "scheduler": "simple",
                "denoise": 1.0
            }
        },
        "9": {
            "class_type": "VAEDecode",
            "inputs": {"samples": ["8", 0], "vae": ["3", 0]}
        },
        "15": {
            "class_type": "SaveImage",
            "inputs": {"images": ["9", 0], "filename_prefix": "seaman"}
        }
    }

def main():
    face_path = sys.argv[1] if len(sys.argv) > 1 else "/Users/kuma/repos/kuma/kuma-lab/ai-sing/input/source/face.png"
    output_path = sys.argv[2] if len(sys.argv) > 2 else "/Users/kuma/repos/kuma/kuma-lab/ai-sing/seaman/Sources/Seaman/Resources/seaman.png"
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 42

    prompt_text = (
        "A Seaman Dreamcast game character, a large carp fish with a real human face replacing the fish head, "
        "the face is front-facing looking at the viewer, skin smoothly transitions into fish scales at the edges, "
        "the body is a complete fish with scales fins and tail, "
        "dark aquarium background with underwater plants, moody lighting, photorealistic, surreal creature"
    )

    print("Uploading face image...")
    face_name = upload_image(face_path)

    print("Building workflow...")
    workflow = build_workflow(face_name, prompt_text, seed)

    print("Queuing generation...")
    result = queue_prompt(workflow)
    prompt_id = result["prompt_id"]
    print(f"Prompt ID: {prompt_id}")

    print("Generating", end="", flush=True)
    while True:
        history = get_history(prompt_id)
        if prompt_id in history:
            if history[prompt_id].get("status", {}).get("completed", False) or "outputs" in history[prompt_id]:
                break
        time.sleep(3)
        print(".", end="", flush=True)
    print(" Done!")

    outputs = history[prompt_id].get("outputs", {})
    for node_id, output in outputs.items():
        if "images" in output:
            for img_info in output["images"]:
                img_data = get_image(img_info["filename"], img_info["subfolder"], img_info["type"])
                with open(output_path, "wb") as f:
                    f.write(img_data)
                print(f"=> {output_path}")
                return
    print("No image in output!")

if __name__ == "__main__":
    main()
