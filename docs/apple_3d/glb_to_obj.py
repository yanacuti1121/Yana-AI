import json, struct, os, sys

def glb_to_obj(glb_path, obj_path):
    with open(glb_path, 'rb') as f:
        magic, version, length = struct.unpack('<4sII', f.read(12))
        if magic != b'glTF':
            print("Not a valid GLB file")
            return
        
        # Chunk 0: JSON
        c0_len, c0_type = struct.unpack('<II', f.read(8))
        json_data = json.loads(f.read(c0_len).decode('utf-8'))
        
        # Chunk 1: BIN
        c1_len, c1_type = struct.unpack('<II', f.read(8))
        bin_data = f.read(c1_len)

    buffer_views = json_data.get('bufferViews', [])
    accessors = json_data.get('accessors', [])
    meshes = json_data.get('meshes', [])

    def get_data(accessor_idx):
        acc = accessors[accessor_idx]
        bv = buffer_views[acc['bufferView']]
        offset = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
        count = acc['count']
        atype = acc['type']
        ctype = acc['componentType']
        
        # 5126 = FLOAT, 5123 = UNSIGNED_SHORT, 5125 = UNSIGNED_INT
        if atype == 'VEC3' and ctype == 5126:
            data = []
            for i in range(count):
                x, y, z = struct.unpack_from('<fff', bin_data, offset + i * 12)
                data.append((x, y, z))
            return data
        elif atype == 'SCALAR':
            data = []
            if ctype == 5123: # unsigned short
                for i in range(count):
                    v, = struct.unpack_from('<H', bin_data, offset + i * 2)
                    data.append(v)
            elif ctype == 5125: # unsigned int
                for i in range(count):
                    v, = struct.unpack_from('<I', bin_data, offset + i * 4)
                    data.append(v)
            return data
        return []

    v_offset = 1
    with open(obj_path, 'w') as out:
        out.write("# Official Apple MacBook Pro 3D Mesh\n")
        for m_idx, mesh in enumerate(meshes):
            out.write(f"o {mesh.get('name', f'Mesh_{m_idx}')}\n")
            for prim in mesh.get('primitives', []):
                attrs = prim.get('attributes', {})
                if 'POSITION' not in attrs:
                    continue
                pos_idx = attrs['POSITION']
                positions = get_data(pos_idx)
                for x, y, z in positions:
                    # Đổi trục nếu cần (glTF Y-up to Fusion Z-up)
                    out.write(f"v {x*10:.6f} {z*10:.6f} {-y*10:.6f}\n")
                
                if 'indices' in prim:
                    indices = get_data(prim['indices'])
                    for i in range(0, len(indices), 3):
                        i1 = indices[i] + v_offset
                        i2 = indices[i+1] + v_offset
                        i3 = indices[i+2] + v_offset
                        out.write(f"f {i1} {i2} {i3}\n")
                v_offset += len(positions)
    print(f"Exported OBJ successfully to {obj_path} ({v_offset-1} vertices)")

glb_to_obj('/Users/vutam/Desktop/Yana-AI/docs/apple_3d/macbook_14_apple_official.glb', '/Users/vutam/Desktop/Yana-AI/docs/apple_3d/macbook_14_apple_official.obj')
