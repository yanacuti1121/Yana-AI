import json, struct

with open('/Users/vutam/Desktop/Yana-AI/docs/apple_3d/macbook-14.glb', 'rb') as f:
    magic, version, length = struct.unpack('<4sII', f.read(12))
    c0_len, c0_type = struct.unpack('<II', f.read(8))
    json_bytes = f.read(c0_len)
    data = json.loads(json_bytes.decode('utf-8'))
    print("Keys in GLTF:", data.keys())
    if 'bufferViews' in data:
        print("BufferViews count:", len(data['bufferViews']))
    print("Accessors sample:", data['accessors'][:2])
