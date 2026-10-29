import bpy, sys, mathutils, math
argv=sys.argv[sys.argv.index('--')+1:]
src,out=argv[0],argv[1]; frames=[float(x) for x in argv[2].split(',')]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
scn=bpy.context.scene
arm=[o for o in scn.objects if o.type=='ARMATURE'][0]
mesh=[o for o in scn.objects if o.type=='MESH'][0]
scn.render.engine='BLENDER_EEVEE_NEXT'; scn.render.resolution_x=360; scn.render.resolution_y=420
w=bpy.data.worlds.new('w');scn.world=w;w.use_nodes=True;w.node_tree.nodes['Background'].inputs[1].default_value=3.0
sun=bpy.data.objects.new('s',bpy.data.lights.new('s','SUN'));scn.collection.objects.link(sun);sun.rotation_euler=(0.8,0.2,0.5);sun.data.energy=4
bb=[mesh.matrix_world@mathutils.Vector(c) for c in mesh.bound_box]
mn=mathutils.Vector([min(v[i] for v in bb) for i in range(3)]);mx=mathutils.Vector([max(v[i] for v in bb) for i in range(3)])
c=(mn+mx)/2; s=max(mx-mn)*1.25
acts=[a for a in bpy.data.actions]
print('ACTIONS',[a.name for a in acts])
cams=[]
for name,loc in (('front',(0,-1,0)),('side',(1,0,0)),('q',(0.7,-0.7,0.25))):
    cam=bpy.data.cameras.new('c');cam.type='ORTHO';cam.ortho_scale=s
    co=bpy.data.objects.new('c',cam);scn.collection.objects.link(co)
    co.location=c+mathutils.Vector(loc)*5; co.rotation_euler=(c-co.location).to_track_quat('-Z','Y').to_euler(); cams.append((name,co))
for a in acts:
    arm.animation_data.action=a
    n=a.frame_range[1]
    for fr in frames:
        scn.frame_set(int(1+fr*(n-1)))
        for name,co in cams:
            if name=='front' and len(frames)>1 and fr!=frames[0]: continue
            scn.camera=co; scn.render.filepath=f'{out}/{a.name}_{fr:.2f}_{name}.png'; bpy.ops.render.render(write_still=True)
