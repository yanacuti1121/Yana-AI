import React from 'react';
import {AbsoluteFill, Audio, Composition, Img, interpolate, spring, staticFile, useCurrentFrame} from 'remotion';
import {Film} from './base/film';
import {copy} from './copy';

const purple = '#6b5cff', green = '#3ddc84', muted = '#a0a0ad';
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const p = (f: number, a: number, b: number) => interpolate(f, [a, b], [0, 1], clamp);
const panel: React.CSSProperties = {background: '#26262e', border: '1px solid #ffffff16', borderRadius: 18};
const Cursor: React.FC<{x: number; y: number; click?: boolean}> = ({x,y,click}) => <svg style={{position:'absolute',left:x,top:y,zIndex:20,transform:`scale(${click?.85:1})`,filter:'drop-shadow(0 3px 5px #0008)'}} width="30" height="36" viewBox="0 0 30 36"><path d="M3 2L3 29L10 22L15 34L20 32L15 20L25 20Z" fill="white" stroke="#141419" strokeWidth="2"/></svg>;
const Pill: React.FC<{children: React.ReactNode; color?:string}> = ({children,color=purple}) => <span style={{display:'inline-flex',alignItems:'center',padding:'8px 15px',borderRadius:12,color,background:`${color}24`,fontSize:23,fontWeight:900}}>{children}</span>;

function Governance({f}:{f:number}) {
 const chosen=f>90, blocked=f>220;
 return <>
  <div style={{fontSize:34,fontWeight:900}}>Quyền cho phiên làm việc</div>
  <div style={{color:muted,fontSize:23,marginTop:10}}>AI đề xuất. Chính sách kiểm tra trước khi thực thi.</div>
  <div style={{...panel,marginTop:26,padding:24,display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{fontSize:21,color:muted}}>Phạm vi được cấp</div><div style={{fontSize:28,fontWeight:900,marginTop:8}}>Dự án /landing-page</div></div><Pill color={chosen?green:purple}>{chosen?'✓ Chỉ trong dự án này':'Chọn phạm vi'}</Pill></div>
  {[['Đọc tệp trong dự án','Cho phép',green],['Ghi tệp / chạy lệnh','Yêu cầu duyệt','#f3b95c'],['Truy cập ngoài phạm vi','Chặn','#ff7f84']].map(([name,state,c],i)=><div key={name} style={{...panel,marginTop:14,padding:'20px 24px',display:'flex',alignItems:'center',justifyContent:'space-between',opacity:p(f,100+i*24,120+i*24),transform:`translateX(${(1-p(f,100+i*24,120+i*24))*55}px)`}}><span style={{fontSize:26,fontWeight:700}}>{name}</span><Pill color={c}>{state}</Pill></div>)}
  <div style={{marginTop:24,padding:20,borderRadius:15,background:'#ff7f8415',color:'#ff9a9e',fontSize:23,opacity:p(f,220,245)}}>{blocked?'Ngoài /landing-page → không được thực thi.':''}</div>
  {f<125&&<Cursor x={interpolate(f,[20,75],[840,889],clamp)} y={interpolate(f,[20,75],[530,202],clamp)} click={f>85&&f<98}/>}
 </>;
}
function Audit({f}:{f:number}) {
 const rows=[['Đề xuất','Sửa theme.css'],['Quyết định','Bạn đã duyệt phạm vi'],['Thực thi','Áp dụng diff đã xem'],['Bằng chứng','Diff + kết quả được liên kết']];
 const active=Math.min(3,Math.floor(Math.max(0,f-25)/55));
 return <>
  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}><div style={{fontSize:34,fontWeight:900}}>Dấu vết của một thay đổi</div><Pill color={green}>Audit + Evidence</Pill></div>
  <div style={{marginTop:14,color:muted,fontSize:23}}>Xem lại đề xuất, quyết định và kết quả tương ứng.</div>
  <div style={{display:'flex',gap:22,marginTop:30}}><div style={{flex:1}}>{rows.map(([label,detail],i)=><div key={label} style={{...panel,marginBottom:14,padding:20,opacity:p(f,20+i*55,40+i*55),borderColor:active===i?'#6b5cff':'#ffffff16',transform:`translateY(${(1-p(f,20+i*55,40+i*55))*35}px)`}}><div style={{fontSize:20,color:purple,fontWeight:900}}>0{i+1} · {label}</div><div style={{fontSize:25,marginTop:7,fontWeight:700}}>{detail}</div></div>)}</div><div style={{...panel,width:310,padding:24,opacity:p(f,170,200)}}><div style={{fontSize:23,fontWeight:900}}>Chuỗi kiểm tra</div><div style={{fontSize:24,lineHeight:2,marginTop:22,color:green}}>Đề xuất<br/>↓ Quyết định<br/>↓ Kết quả<br/>↓ Evidence</div><div style={{fontSize:21,lineHeight:1.5,marginTop:24,color:muted}}>Hash-chain giúp phát hiện dấu vết can thiệp.</div></div></div>
 </>;
}
function Connectors({f}:{f:number}) {
 const revoked=f>215;
 return <><div style={{fontSize:34,fontWeight:900}}>Kết nối & quyền truy cập</div><div style={{fontSize:23,color:muted,marginTop:10}}>Đăng nhập và quyền dịch vụ được tách riêng.</div>
  {[['G','Google · Danh tính','Xác minh hồ sơ','#6aa1ff'],['M','Gmail','Chỉ đọc thư','#ff7f84'],['⌘','GitHub','Quyền theo kết nối','#c9c4ff']].map(([icon,label,desc,c],i)=><div key={label} style={{...panel,padding:24,marginTop:24,display:'flex',alignItems:'center',gap:24,opacity:p(f,i*30,i*30+25)}}><div style={{width:54,height:54,borderRadius:15,background:`${c}25`,color:c,display:'grid',placeItems:'center',fontSize:30,fontWeight:900}}>{icon}</div><div style={{flex:1}}><div style={{fontSize:28,fontWeight:900}}>{label}</div><div style={{fontSize:22,color:muted,marginTop:5}}>{desc}</div></div><Pill color={i===1&&revoked?muted:green}>{i===1&&revoked?'Đã thu hồi':'Đã kết nối'}</Pill>{i===1&&<div style={{padding:'13px 18px',borderRadius:12,background:'#ff7f8420',color:'#ff9a9e',fontSize:21,fontWeight:900}}>{revoked?'Kết nối lại':'Thu hồi'}</div>}</div>)}
  <div style={{marginTop:28,color:revoked?green:muted,fontSize:25,fontWeight:700}}>{revoked?'Gmail đã ngắt. Danh tính Google vẫn giữ nguyên.':'Mỗi kết nối có phạm vi và quyền thu hồi riêng.'}</div>
  {f>135&&f<245&&<Cursor x={interpolate(f,[140,200],[770,924],clamp)} y={interpolate(f,[140,200],[520,347],clamp)} click={f>210&&f<223}/>}
 </>;
}
function Continuity({f}:{f:number}) {
 const command='yana-rt chat';const n=Math.floor(p(f,115,190)*command.length);
 return <><div style={{fontSize:34,fontWeight:900}}>Công việc không dừng ở một cuộc chat</div><div style={{display:'flex',gap:16,marginTop:28}}>{['Mục tiêu','Công việc','Bộ nhớ dự án'].map((t,i)=><div key={t} style={{...panel,flex:1,padding:24,opacity:p(f,i*22,i*22+22),transform:`translateY(${(1-p(f,i*22,i*22+22))*35}px)`}}><div style={{fontSize:28,fontWeight:900}}>{t}</div><div style={{fontSize:22,color:green,marginTop:15}}>✓ Giữ mạch ngữ cảnh</div></div>)}</div>
  <div style={{...panel,marginTop:28,overflow:'hidden',opacity:p(f,90,115)}}><div style={{padding:'14px 23px',background:'#33333c',fontSize:22,fontWeight:900}}>Studio ↔ Runtime CLI</div><div style={{fontFamily:'Menlo, monospace',fontSize:28,padding:26,height:158}}><span style={{color:green}}>❯ </span>{command.slice(0,n)}<span style={{color:purple}}>|</span>{f>200&&<div style={{fontFamily:'Nunito',fontSize:24,color:muted,marginTop:24}}>Cùng runtime. Cùng lớp quyền hạn và bằng chứng.</div>}</div></div>
  <div style={{display:'flex',gap:15,marginTop:26,opacity:p(f,255,280)}}>{['Yana AI','Yana Studio','Wheelbot · nhánh đang phát triển'].map(t=><div key={t} style={{padding:'13px 17px',borderRadius:13,background:'#6b5cff20',fontSize:21,fontWeight:700,color:'#c9c4ff'}}>{t}</div>)}</div>
 </>;
}

type Kind='governance'|'audit'|'connectors'|'continuity';
function FeatureScene({f,kind}:{f:number;kind:Kind}) {
 const s=spring({frame:f,fps:60,config:{damping:17,stiffness:110}});
 const nav=['Trò chuyện','Quyền hạn','Audit','Mô hình','Kết nối','Công việc','Runtime'];
 const selected={governance:1,audit:2,connectors:4,continuity:6}[kind];
 return <AbsoluteFill style={{background:'radial-gradient(120% 90% at 50% 30%, #fbfaf6 0%, #f1efe8 100%)',fontFamily:'Nunito',color:'#17171c',overflow:'hidden'}}>
  <div style={{position:'absolute',left:120,top:95,fontSize:70,fontWeight:900,letterSpacing:-2,maxWidth:1680,lineHeight:1.1,opacity:Math.min(1,s),transform:`translateY(${(1-s)*25}px)`}}>{copy[kind]}</div>
  <div style={{position:'absolute',left:320,top:250,width:1280,height:760,borderRadius:26,background:'#1c1c21',color:'#ecebe6',overflow:'hidden',boxShadow:'0 40px 100px #14141e40',transform:`translateY(${(1-s)*35}px) scale(${.97+s*.03+.015*p(f,40,420)})`}}>
   <div style={{height:54,borderBottom:'1px solid #ffffff15',display:'flex',alignItems:'center',padding:'0 22px',gap:9}}>{['#ff5f57','#febc2e','#28c840'].map(c=><span key={c} style={{width:13,height:13,borderRadius:8,background:c}}/>)}<div style={{margin:'auto',color:muted,fontSize:17}}>Yana · Landing page</div></div>
   <div style={{position:'absolute',left:0,top:54,bottom:0,width:232,padding:22,boxSizing:'border-box',borderRight:'1px solid #ffffff15'}}><div style={{display:'flex',alignItems:'center',gap:10,fontSize:22,fontWeight:900,marginBottom:25}}><Img src={staticFile('branding/yana-mark.svg')} style={{width:30,height:30}}/>Yana</div>{nav.map((t,i)=><div key={t} style={{padding:'13px 12px',borderRadius:10,fontSize:19,fontWeight:700,color:i===selected?'white':muted,background:i===selected?'#ffffff15':'transparent'}}>{t}</div>)}</div>
   <div style={{position:'absolute',left:232,right:0,top:54,bottom:0,padding:'30px 38px',boxSizing:'border-box'}}>{kind==='governance'?<Governance f={f}/>:kind==='audit'?<Audit f={f}/>:kind==='connectors'?<Connectors f={f}/>:<Continuity f={f}/>}</div>
  </div>
 </AbsoluteFill>;
}

export const WebsiteFilm:React.FC=()=>{
 const f=useCurrentFrame();let content:React.ReactNode;
 if(f<900)content=<Film frameOverride={f}/>;
 else if(f<1320)content=<FeatureScene kind="governance" f={f-900}/>;
 else if(f<1740)content=<FeatureScene kind="audit" f={f-1320}/>;
 else if(f<2220)content=<Film frameOverride={f-1740+900}/>;
 else if(f<2640)content=<FeatureScene kind="connectors" f={f-2220}/>;
 else if(f<3180)content=<Film frameOverride={f-2640+1380}/>;
 else if(f<3600)content=<FeatureScene kind="continuity" f={f-3180}/>;
 else if(f<3900)content=<Film frameOverride={f-3600+1920}/>;
 else content=<Film frameOverride={f-3900+2220}/>;
 return <AbsoluteFill>{content}<Audio src={staticFile('audio/yana-site-mix.mp3')}/></AbsoluteFill>;
};
export const SiteRoot:React.FC=()=> <Composition id="YanaWebsiteFilm" component={WebsiteFilm} width={1920} height={1080} fps={60} durationInFrames={4200}/>;
