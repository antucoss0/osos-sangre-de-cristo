import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import *
argv=sys.argv[sys.argv.index('--')+1:]
src,out,H=argv[0],argv[1],float(argv[2])
reset()
o=import_mesh(src); o.name='Body'
V=verts(o)
s=H/(V[:,2].max()-V[:,2].min())
transform_mesh(o, s, (0,0,0))
V=verts(o)
off=(-(V[:,0].max()+V[:,0].min())/2, -np.median(V[:,1]), -V[:,2].min())
transform_mesh(o,1,off)
decimate(o, 70000)
V=verts(o)
X,Y,Z=V[:,0],V[:,1],V[:,2]
top=Z.max()
def sl(z0,z1): return V[(Z>=z0)&(Z<z1)]
# arm band
zs=np.arange(0,top,0.01); widths=[]
for z in zs:
    qq=sl(z,z+0.01); widths.append(np.abs(qq[:,0]).max() if len(qq) else 0)
widths=np.array(widths)
tip=widths.max()
band=zs[widths>0.55*tip]
armZ0,armZ1=band.min(),band.max()+0.01
torso=sl(armZ0-0.08,armZ0-0.02); shX=np.abs(torso[:,0]).max()
# crotch
crotch=None
for z in np.arange(0.25*H,0.6*H,0.005):
    qq=sl(z,z+0.01)
    if np.sum(np.abs(qq[:,0])<0.015)>8: crotch=z; break
headBase=top-0.125*H; neckBase=top-0.175*H
print('LANDMARKS tip',tip,'armZ',armZ0,armZ1,'shX',shX,'crotch',crotch,'neck',neckBase,headBase,'top',top)
def armpt(side,x):
    m=(np.abs(X-side*x)<0.02)&(Z>armZ0-0.05)&(Z<armZ1+0.08)&(np.sign(X)==side)
    qq=V[m]; return Vector(((side*x), (qq[:,1].min()+qq[:,1].max())/2, (qq[:,2].min()+qq[:,2].max())/2))
def legpt(side,z):
    m=(Z>z-0.015)&(Z<z+0.015)&(np.sign(X)==side)&(np.abs(X)>0.01)
    qq=V[m]; return Vector(((qq[:,0].min()+qq[:,0].max())/2,(qq[:,1].min()+qq[:,1].max())/2,z))
def midpt(z):
    m=(Z>z-0.02)&(Z<z+0.02)&(np.abs(X)<0.08); qq=V[m]
    return Vector((0,(qq[:,1].min()+qq[:,1].max())/2,z))
hipZ=crotch+0.03*H
spine=[midpt(hipZ), midpt(hipZ+0.09*H), midpt(hipZ+0.18*H), midpt(neckBase-0.05*H), midpt(neckBase)]
neckTop=midpt(headBase); headTop=Vector((0,neckTop.y,top))
bones=[('Hips',spine[0],spine[1],None),('Spine',spine[1],spine[2],'Hips'),('Spine1',spine[2],spine[3],'Spine'),
       ('Spine2',spine[3],spine[4],'Spine1'),('Neck',spine[4],neckTop,'Spine2'),('Head',neckTop,headTop,'Neck')]
wristX=tip-0.085*H; shJ=shX*0.85
for side,P in ((1,'Left'),(-1,'Right')):
    sh=armpt(side,shJ); wr=armpt(side,wristX); el=sh.lerp(wr,0.5); el=armpt(side,el.x*side)
    tp=armpt(side,tip-0.01)
    clav0=Vector((side*0.025,spine[4].y,sh.z-0.01))
    bones+= [(P+'Shoulder',clav0,sh,'Spine2'),(P+'Arm',sh,el,P+'Shoulder'),(P+'ForeArm',el,wr,P+'Arm'),(P+'Hand',wr,tp,P+'ForeArm')]
    hj=legpt(side,crotch-0.02); hj.z=hipZ-0.01
    kn=legpt(side,0.285*H); an=legpt(side,0.05*H)
    fm=(np.sign(X)==side)&(Z<0.06*H)&(np.abs(X)>0.01); fq=V[fm]
    toeY=fq[:,1].min()
    ball=Vector((an.x, toeY+0.35*(an.y-toeY), 0.02)); toe=Vector((an.x,toeY,0.015))
    bones+= [(P+'UpLeg',hj,kn,'Hips'),(P+'Leg',kn,an,P+'UpLeg'),(P+'Foot',an,ball,P+'Leg'),(P+'ToeBase',ball,toe,P+'Foot')]
ao=build_armature('Rig',bones)
skin(o,ao,voxel=0.011)
SIDES=(('Left',1),('Right',-1))
def arms_down(r, deg=74, elbow=12, swingL=0, swingR=0, inL=0, inR=0):
    for P,sd in SIDES:
        sw=swingL if sd>0 else swingR; inn=inL if sd>0 else inR
        r[P+'Arm']=qmul(q('X',sw), q('Z',-sd*inn), q('Y',sd*deg))
        r[P+'ForeArm']=q('Z',-sd*elbow)
        r[P+'Hand']=q('Y',sd*8)
def legs(r, P, hip, knee, ankle):
    r[P+'UpLeg']=q('X',-hip); r[P+'Leg']=q('X',knee); r[P+'Foot']=q('X',ankle)

def idle(t):
    r={};L={}
    b=math.sin(2*math.pi*t); b2=math.sin(4*math.pi*t)
    r['Spine1']=q('X',-1.2*b); r['Spine2']=q('X',-1.0*b)
    r['Hips']=q('Z',1.5*math.sin(2*math.pi*t)); L['Hips']=(0.006*math.sin(2*math.pi*t),0,-0.004+0.002*b2)
    r['Head']=qmul(q('Z',2*math.sin(2*math.pi*t+1)), q('X',1.5*b))
    arms_down(r, 74+1.5*b, 12+2*b, 2, 2)
    legs(r,'Left',2,4,-1); legs(r,'Right',2,4,-1)
    return r,L
def walk(t, run=False):
    r={};L={}
    A=1.6 if run else 1.0
    for P,ph in (('Left',0.0),('Right',0.5)):
        p=(t+ph)%1
        hip=(26 if run else 21)*math.cos(2*math.pi*p)+(10 if run else 4)
        knee=(8 if run else 5)+(85 if run else 55)*bump(p,0.68 if run else 0.72,0.16 if run else 0.13)+(25 if run else 12)*bump(p,0.12,0.1)
        ank=-12*bump(p,0.0,0.08)+(20 if run else 14)*bump(p,0.5,0.08)-10*bump(p,0.75,0.1)
        legs(r,P,hip,knee,ank)
    sway=math.sin(2*math.pi*t)
    lean=10 if run else 3
    r['Hips']=qmul(q('Z',6*A*math.sin(2*math.pi*t)), q('X',lean*0.3))
    r['Spine']=qmul(q('Z',-4*A*math.sin(2*math.pi*t)), q('X',lean*0.4))
    r['Spine1']=q('Z',-3*A*math.sin(2*math.pi*t)); r['Spine2']=q('X',lean*0.3)
    r['Head']=qmul(q('Z',1*sway), q('X',-lean*0.7))
    L['Hips']=(0.015*sway, 0, (0.03 if run else 0.018)*math.cos(4*math.pi*t)-(0.06 if run else 0.012))
    swing=(32 if run else 18)*math.cos(2*math.pi*t)
    if run: arms_down(r,72,85,-swing-10,swing-10,8,8)
    else: arms_down(r,76,15,-swing-2,swing-2)
    return r,L
def run(t): return walk(t,True)
def scared(t):
    r={};L={}
    b=math.sin(4*math.pi*t)
    r['Spine1']=q('X',2*b+6); r['Spine2']=q('X',2*b+6)
    r['Head']=q('X',-8+2*math.sin(2*math.pi*t))
    for P,sd in SIDES:
        r[P+'Shoulder']=q('Y',-sd*6)
    arms_down(r,60,70,-30,-30,25,25)
    legs(r,'Left',14,26,-12); legs(r,'Right',10,22,-12)
    L['Hips']=(0,0.01,-0.05+0.003*b)
    return r,L
def crouch(t):
    r={};L={}
    b=math.sin(2*math.pi*t)
    r['Hips']=q('X',20); r['Spine']=q('X',15); r['Spine1']=q('X',12+1.5*b); r['Spine2']=q('X',5)
    r['Head']=q('X',10)
    legs(r,'Left',95,125,-28); legs(r,'Right',70,120,-50)
    arms_down(r,70,40,-35,-25,10,6)
    L['Hips']=(0,0.05,-0.42*H/1.75)
    return r,L
def aim(t):
    r={};L={}
    b=math.sin(2*math.pi*t)
    r['Spine1']=q('X',-1*b); r['Head']=q('X',4)
    for P,sd in SIDES:
        r[P+'Arm']=qmul(q('Z',-sd*50), q('Y',sd*6))
        r[P+'ForeArm']=q('Z',-sd*118)
        r[P+'Hand']=q('Y',-sd*10)
    legs(r,'Left',4,6,-2); legs(r,'Right',-2,4,0)
    return r,L
FPS=30
make_action(ao,'Idle',FPS,120,idle)
make_action(ao,'Walk',FPS,34,walk)
make_action(ao,'Run',FPS,21,run)
make_action(ao,'Scared',FPS,60,scared)
make_action(ao,'Crouch',FPS,90,crouch)
make_action(ao,'Aim',FPS,60,aim)
shrink_images(2048)
export(out, ao, o)
print('DONE', out)
