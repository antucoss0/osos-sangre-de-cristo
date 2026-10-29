import bpy, bmesh, numpy as np, math
from mathutils import Vector, Quaternion, Matrix

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def import_mesh(path):
    bpy.ops.import_scene.gltf(filepath=path)
    o=[o for o in bpy.context.scene.objects if o.type=='MESH'][0]
    bpy.context.view_layer.objects.active=o
    for ob in bpy.context.scene.objects: ob.select_set(ob==o)
    bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
    o.parent=None
    return o

def verts(o):
    me=o.data; V=np.zeros(len(me.vertices)*3); me.vertices.foreach_get('co',V); return V.reshape(-1,3)

def transform_mesh(o, scale, offset):
    o.data.transform(Matrix.Translation(Vector(offset))@Matrix.Scale(scale,4))
    o.data.update()

def decimate(o, target_tris):
    n=sum(len(p.vertices)-2 for p in o.data.polygons)
    if n<=target_tris: return
    m=o.modifiers.new('dec','DECIMATE'); m.ratio=target_tris/n; m.use_collapse_triangulate=True
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.modifier_apply(modifier=m.name)

def build_armature(name, bones):
    """bones: list of (name, head, tail, parent, deform)"""
    arm=bpy.data.armatures.new(name); ao=bpy.data.objects.new(name,arm)
    bpy.context.scene.collection.objects.link(ao)
    bpy.context.view_layer.objects.active=ao
    for ob in bpy.context.scene.objects: ob.select_set(ob==ao)
    bpy.ops.object.mode_set(mode='EDIT')
    eb={}
    for b in bones:
        nm,h,t,p=b[:4]; d=b[4] if len(b)>4 else True
        e=arm.edit_bones.new(nm); e.head=Vector(h); e.tail=Vector(t); e.roll=0
        e.use_deform=d
        if p: e.parent=eb[p]; e.use_connect=False
        eb[nm]=e
    bpy.ops.object.mode_set(mode='OBJECT')
    return ao

def skin(mesh, ao, voxel=0.012, proxy_tris=60000):
    # watertight proxy -> heat weights -> transfer
    bpy.ops.object.select_all(action='DESELECT')
    proxy=mesh.copy(); proxy.data=mesh.data.copy(); bpy.context.scene.collection.objects.link(proxy)
    proxy.name='proxy'
    m=proxy.modifiers.new('rm','REMESH'); m.mode='VOXEL'; m.voxel_size=voxel
    bpy.context.view_layer.objects.active=proxy; bpy.ops.object.modifier_apply(modifier=m.name)
    decimate(proxy, proxy_tris)
    print('proxy verts',len(proxy.data.vertices))
    bpy.ops.object.select_all(action='DESELECT')
    proxy.select_set(True); ao.select_set(True); bpy.context.view_layer.objects.active=ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    empty=[vg.name for vg in proxy.vertex_groups if not any(vg.index in [g.group for g in v.groups] for v in proxy.data.vertices[:0])]
    # transfer
    for b in ao.data.bones:
        if b.use_deform: mesh.vertex_groups.new(name=b.name)
    dt=mesh.modifiers.new('dt','DATA_TRANSFER'); dt.object=proxy; dt.use_vert_data=True
    dt.data_types_verts={'VGROUP_WEIGHTS'}; dt.vert_mapping='POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src='ALL'; dt.layers_vgroup_select_dst='NAME'
    bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.modifier_apply(modifier=dt.name)
    bpy.data.objects.remove(proxy, do_unlink=True)
    bpy.ops.object.select_all(action='DESELECT'); mesh.select_set(True); bpy.context.view_layer.objects.active=mesh
    bpy.ops.object.vertex_group_limit_total(group_select_mode='ALL', limit=4)
    bpy.ops.object.vertex_group_normalize_all(group_select_mode='ALL', lock_active=False)
    # unweighted check
    nz=[v for v in mesh.data.vertices if len(v.groups)==0 or sum(g.weight for g in v.groups)<1e-4]
    print('unweighted verts', len(nz))
    segs=[(b.name,b.head_local.copy(),b.tail_local.copy()) for b in ao.data.bones if b.use_deform]
    from mathutils.geometry import intersect_point_line
    for v in nz:
        best=None
        for nm,h,t in segs:
            p,f=intersect_point_line(v.co,h,t); f=max(0,min(1,f)); d=(v.co-h.lerp(t,f)).length
            if best is None or d<best[0]: best=(d,nm)
        mesh.vertex_groups[best[1]].add([v.index],1.0,'REPLACE')
    mesh.parent=ao
    am=mesh.modifiers.new('Armature','ARMATURE'); am.object=ao

def q(axis, deg):
    a={'X':Vector((1,0,0)),'Y':Vector((0,1,0)),'Z':Vector((0,0,1))}[axis]
    return Quaternion(a, math.radians(deg))

def qmul(*qs):
    r=Quaternion()
    for x in qs: r=r@x
    return r

def make_action(ao, name, fps, nframes, posefn, loop=True):
    """posefn(t in [0,1]) -> (dict bone->armature-space-quat, dict bone->armature-space-loc-offset)"""
    act=bpy.data.actions.new(name); act.use_fake_user=True
    ao.animation_data_create(); ao.animation_data.action=act
    rest={b.name:b.matrix_local.to_3x3().to_quaternion() for b in ao.data.bones}
    restM={b.name:b.matrix_local.to_3x3() for b in ao.data.bones}
    for pb in ao.pose.bones: pb.rotation_mode='QUATERNION'
    last = nframes if loop else nframes
    for f in range(0, last+1):
        t=(f/nframes)
        if loop: t=t%1.0
        rots,locs=posefn(t)
        for pb in ao.pose.bones:
            r=rest[pb.name]
            qa=rots.get(pb.name, Quaternion())
            pb.rotation_quaternion = r.inverted()@qa@r
            pb.keyframe_insert('rotation_quaternion', frame=f+1)
            if pb.name in locs or pb.parent is None:
                lo=Vector(locs.get(pb.name,(0,0,0)))
                pb.location = restM[pb.name].inverted()@lo
                pb.keyframe_insert('location', frame=f+1)
    for fc in act.fcurves:
        for k in fc.keyframe_points: k.interpolation='LINEAR'
    ao.animation_data.action=None
    return act

def shrink_images(size=2048):
    for im in bpy.data.images:
        if im.size[0]>size:
            im.scale(size,size)

def export(path, ao, mesh):
    bpy.ops.object.select_all(action='DESELECT')
    ao.select_set(True); mesh.select_set(True)
    for pb in ao.pose.bones:
        pb.rotation_quaternion=Quaternion(); pb.location=Vector()
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True,
        export_animations=True, export_animation_mode='ACTIONS', export_force_sampling=True,
        export_frame_step=1, export_def_bones=False, export_image_format='JPEG', export_jpeg_quality=82,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12, export_skins=True, export_all_influences=False,
        export_yup=True, export_apply=False, export_optimize_animation_size=False)

def smooth(x):  # 0..1 smoothstep
    x=max(0.0,min(1.0,x)); return x*x*(3-2*x)
def bump(t, c, w):
    d=(t-c+0.5)%1.0-0.5
    return math.exp(-(d/w)**2)
