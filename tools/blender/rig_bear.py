import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import *
argv=sys.argv[sys.argv.index('--')+1:]
src,out=argv[0],argv[1]
reset()
o=import_mesh(src); o.name='Bear'
V=verts(o)
SC=1.15  # ~2.2m long grizzly
transform_mesh(o,SC,(0,0,0)); V=verts(o)
transform_mesh(o,1,(-(V[:,0].max()+V[:,0].min())/2,0,-V[:,2].min())); V=verts(o)
decimate(o,60000); V=verts(o)
X,Y,Z=V[:,0],V[:,1],V[:,2]
print('BBOX',V.min(0),V.max(0))
# original-space landmarks (bear faces -Y; z from -0.54 ground) -> convert
def P(x,y,z): return Vector((x*SC, y*SC, (z+0.539)*SC))
hp=V[(Z<0.06*SC)&(Y>0.25*SC)]; hpy=(hp[:,1].min()/SC, hp[:,1].max()/SC)
fp=V[(Z<0.06*SC)&(Y<0.15*SC)]; fpy=(fp[:,1].min()/SC, fp[:,1].max()/SC)
print('hind paw y',hpy,'front paw y',fpy)
bones=[('Hips',P(0,0.62,0.18),P(0,0.30,0.22),None),
 ('Spine',P(0,0.30,0.22),P(0,-0.02,0.26),'Hips'),
 ('Chest',P(0,-0.02,0.26),P(0,-0.33,0.29),'Spine'),
 ('Neck',P(0,-0.33,0.29),P(0,-0.60,0.31),'Chest'),
 ('Head',P(0,-0.60,0.31),P(0,-0.94,0.27),'Neck'),
 ('Jaw',P(0,-0.64,0.21),P(0,-0.90,0.175),'Head'),
 ('Tail',P(0,0.80,0.16),P(0,0.93,0.07),'Hips')]
for sd,S in ((1,'L'),(-1,'R')):
    x=0.18*sd
    bones+=[(S+'Scapula',P(0.10*sd,-0.22,0.30),P(x,-0.12,0.02),'Chest'),
            (S+'UpperArm',P(x,-0.12,0.02),P(x,-0.05,-0.26),S+'Scapula'),
            (S+'ForeArm',P(x,-0.05,-0.26),P(x,-0.07,-0.47),S+'UpperArm'),
            (S+'FrontPaw',P(x,-0.07,-0.47),P(x*1.03,fpy[0]+0.04,-0.53),S+'ForeArm'),
            (S+'Thigh',P(0.15*sd,0.55,0.12),P(x,0.42,-0.20),'Hips'),
            (S+'Shin',P(x,0.42,-0.20),P(x,0.66,-0.43),S+'Thigh'),
            (S+'Hock',P(x,0.66,-0.43),P(x,0.62,-0.51),S+'Shin'),
            (S+'HindPaw',P(x,0.62,-0.51),P(x,hpy[0]+0.05,-0.535),S+'Hock')]
ao=build_armature('Rig',bones)
skin(o,ao,voxel=0.012)
def legs_front(r,S,sw,elbow,paw,lift=0):
    r[S+'UpperArm']=q('X',sw); r[S+'ForeArm']=q('X',-elbow); r[S+'FrontPaw']=q('X',paw)
def legs_hind(r,S,sw,knee,hock,paw):
    r[S+'Thigh']=q('X',sw); r[S+'Shin']=q('X',-knee); r[S+'Hock']=q('X',hock); r[S+'HindPaw']=q('X',paw)
def neutral(r):
    for S in 'LR': legs_front(r,S,0,0,0); legs_hind(r,S,0,0,0,0)
def idle(t):
    r={};L={}; b=math.sin(2*math.pi*t)
    neutral(r)
    r['Spine']=q('X',0.8*b); r['Chest']=q('X',-0.8*b)
    r['Neck']=qmul(q('Z',4*math.sin(2*math.pi*t)), q('X',2*math.sin(4*math.pi*t)))
    r['Head']=qmul(q('Z',3*math.sin(2*math.pi*t+0.8)), q('X',2*b))
    r['Jaw']=q('X',2+1.5*b); r['Tail']=q('Z',8*math.sin(4*math.pi*t))
    L['Hips']=(0,0,0.004*b)
    return r,L
def walk(t, run=False):
    r={};L={}
    amp=1.4 if run else 1.0
    for S,ph,front in (('L',0.0,False),('L',0.25,True),('R',0.5,False),('R',0.75,True)):
        p=(t+ph)%1
        # stance 0..0.62 moving back; swing 0.62..1 moving forward
        if p<0.62: s=1-2*(p/0.62)
        else: s=-1+2*smooth((p-0.62)/0.38)
        lift=bump(p,0.81,0.09)
        if front:
            legs_front(r,S,-20*amp*s, 55*amp*lift, 35*amp*lift-8*bump(p,0.6,0.06))
        else:
            legs_hind(r,S,-18*amp*s-4, 45*amp*lift, 35*amp*lift, -30*amp*lift+10*bump(p,0.6,0.06))
    w=math.sin(2*math.pi*t)
    r['Hips']=qmul(q('Z',5*amp*w), q('Y',3*amp*math.sin(2*math.pi*t)))
    r['Spine']=q('Z',-3*amp*w); r['Chest']=qmul(q('Z',-4*amp*math.sin(2*math.pi*t+1.6)), q('Y',-3*amp*math.sin(2*math.pi*t+1.6)))
    r['Neck']=qmul(q('X',(3 if not run else -6)+4*math.sin(4*math.pi*t)), q('Z',4*math.sin(2*math.pi*t+2.0)))
    r['Head']=q('X',-3*math.sin(4*math.pi*t+0.5)); r['Jaw']=q('X',3)
    r['Tail']=q('Z',10*w)
    L['Hips']=(0,0,0.015*amp*math.cos(4*math.pi*t))
    return r,L
def run(t): return walk(t,True)
def sniff(t):
    r={};L={}; neutral(r)
    k=math.sin(2*math.pi*t*6)
    r['Chest']=q('X',8); r['Neck']=qmul(q('X',30), q('Z',8*math.sin(2*math.pi*t)))
    r['Head']=q('X',10+3*k); r['Jaw']=q('X',2+1*k)
    for S in 'LR': legs_front(r,S,-6,10,4)
    L['Hips']=(0,0,0)
    return r,L
def roar(t):
    r={};L={}; neutral(r)
    a=smooth(t/0.18)*(1-smooth((t-0.82)/0.18))   # envelope
    rise=smooth(t/0.25)
    shake=math.sin(2*math.pi*t*14)*a
    r['Hips']=q('X',-4*a)
    r['Chest']=q('X',-10*a)
    r['Neck']=qmul(q('X',-25*a+8*a*smooth((t-0.3)/0.2)), q('Z',2*shake))
    r['Head']=q('X',-12*a+ 2*shake)
    r['Jaw']=q('X',3+40*a*(0.85+0.15*math.sin(2*math.pi*t*9)))
    for S in 'LR': legs_front(r,S,12*a,8*a,-10*a); legs_hind(r,S,-6*a,10*a,6*a,0)
    L['Hips']=(0,0.02*a,-0.03*a)
    return r,L
def huff(t):
    r={};L={}; neutral(r)
    k=bump(t,0.25,0.07)+bump(t,0.55,0.07)
    r['Neck']=q('X',10*k); r['Head']=q('X',-6*k); r['Jaw']=q('X',2+10*k)
    r['Chest']=q('X',-3*k)
    return r,L
def rear(t):
    r={};L={}
    a=smooth(t/0.3)*(1-smooth((t-0.8)/0.2))
    r['Hips']=q('X',-55*a); r['Spine']=q('X',-10*a); r['Chest']=q('X',-8*a)
    r['Neck']=q('X',40*a); r['Head']=q('X',20*a); r['Jaw']=q('X',3+35*a*bump(t,0.5,0.2))
    for S in 'LR':
        legs_front(r,S,-30*a,60*a,40*a); legs_hind(r,S,55*a,20*a,-10*a,-20*a)
    L['Hips']=(0,0.25*a,0.05*a)
    return r,L
FPS=30
make_action(ao,'Idle',FPS,150,idle)
make_action(ao,'Walk',FPS,42,walk)
make_action(ao,'Run',FPS,26,run)
make_action(ao,'Sniff',FPS,90,sniff)
make_action(ao,'Roar',FPS,90,roar,loop=False)
make_action(ao,'Huff',FPS,45,huff,loop=False)
make_action(ao,'Rear',FPS,120,rear,loop=False)
shrink_images(2048)
export(out, ao, o)
print('DONE',out)
