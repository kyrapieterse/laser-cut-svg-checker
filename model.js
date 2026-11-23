"use strict";
const svgNumber = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;
function numbers(text) {
  if (text.replace(svgNumber,"").replace(/[\s,]/g,"")) throw new Error("Malformed numeric list.");
  return (text.match(svgNumber)||[]).map(Number);
}
function millimetres(text) {
  const match=/^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(mm|cm|in|pt|pc|px|q)?\s*$/i.exec(text||"");
  if (!match || Number(match[1])<=0) return null;
  return Number(match[1])*({mm:1,cm:10,in:25.4,pt:25.4/72,pc:25.4/6,px:25.4/96,q:.25}[(match[2]||"px").toLowerCase()]);
}
function matrix(value) {
  let current=new DOMMatrix(), rest=value.trim();
  while(rest) {
    const match=/^(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)[\s,]*/.exec(rest);
    if(!match) throw new Error("Unsupported transform.");
    const v=numbers(match[2]), kind=match[1]; let step;
    if(kind==="matrix"&&v.length===6) step=new DOMMatrix(v);
    if(kind==="translate"&&[1,2].includes(v.length)) step=new DOMMatrix().translate(v[0],v[1]||0);
    if(kind==="scale"&&[1,2].includes(v.length)) step=new DOMMatrix().scale(v[0],v[1]??v[0]);
    if(kind==="rotate"&&[1,3].includes(v.length)) step=new DOMMatrix().translate(v[1]||0,v[2]||0).rotate(v[0]).translate(-(v[1]||0),-(v[2]||0));
    if(kind==="skewX"&&v.length===1) step=new DOMMatrix().skewX(v[0]);
    if(kind==="skewY"&&v.length===1) step=new DOMMatrix().skewY(v[0]);
    if(!step) throw new Error("Invalid transform arguments.");
    current=current.multiply(step);rest=rest.slice(match[0].length);
  }
  return current;
}
// Expand relative commands, shorthand curves and implicit line segments.
function walkPath(data, segment, open) {
  const token=/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
  let at=0, cmd="", cur=[0,0], start=null, drawing=false, prev="", previousControl=null, pathNo=0;
  function skip(){while(at<data.length && /[\s,]/.test(data[at])) at++;}
  function num(flag=false){
    skip();
    if(flag) {if(!/[01]/.test(data[at]||"x")) throw new Error("Invalid arc flag."); return Number(data[at++]);}
    token.lastIndex=at; const m=token.exec(data);
    if(!m || !Number.isFinite(Number(m[0]))) throw new Error("Invalid path coordinate.");
    at=token.lastIndex;return Number(m[0]);
  }
  function finish(){if(drawing && (Math.abs(cur[0]-start[0])>1e-7 || Math.abs(cur[1]-start[1])>1e-7)) open(pathNo); drawing=false;}
  while(true) {
    skip();if(at>=data.length) break;
    if(/[a-z]/i.test(data[at])) cmd=data[at++];
    if(!cmd) throw new Error("Missing path command.");
    const k=cmd.toUpperCase(), rel=cmd!==k;
    const point=()=>{let x=num(),y=num();return rel?[cur[0]+x,cur[1]+y]:[x,y];};
    if(k==="M") {finish();cur=point();start=cur;pathNo++;cmd=rel?"l":"L";prev="M";continue;}
    if(!start) throw new Error("Path must begin with a move.");
    if(k==="Z") {if(drawing)segment("L",[cur,start]);cur=start;drawing=false;cmd="";prev="Z";continue;}
    if(prev==="Z"){start=cur;pathNo++;}
    let end, ctrl;
    const reflect=(allowed)=>allowed.includes(prev) && previousControl ? [2*cur[0]-previousControl[0],2*cur[1]-previousControl[1]] : cur;
    if(k==="L"||k==="H"||k==="V"){
      if(k==="L")end=point();
      else if(k==="H")end=[num()+(rel?cur[0]:0),cur[1]];
      else end=[cur[0],num()+(rel?cur[1]:0)];
      segment("L",[cur,end]);
    } else if(k==="Q"||k==="T"){ctrl=k==="Q"?point():reflect(["Q","T"]);end=point();segment("Q",[cur,ctrl,end]);}
    else if(k==="C"||k==="S"){const first=k==="C"?point():reflect(["C","S"]);ctrl=point();end=point();segment("C",[cur,first,ctrl,end]);}
    else if(k==="A"){const rx=num(),ry=num(),rotation=num(),large=num(true),sweep=num(true);end=point();if(rx===0||ry===0)segment("L",[cur,end]);else segment("A",[cur,end],[rx,ry,rotation,large,sweep]);}
    else throw new Error("Unsupported path command "+k+".");
    previousControl=ctrl;prev=k;cur=end;drawing=true;
  }
  finish();
}
function inspectDrawing(source, expectedWidth, expectedHeight) {
  const doc=new DOMParser().parseFromString(source,"image/svg+xml"), root=doc.documentElement;
  if(root.localName!=="svg" || doc.querySelector("parsererror")) throw new Error("Choose a well-formed SVG drawing.");
  const width=millimetres(root.getAttribute("width")), height=millimetres(root.getAttribute("height"));
  const findings=[], limits=new Set(), firstUse=new Map();let openCount=0, duplicates=0, shapes=0;
  const add=text=>{if(findings.length<120) findings.push(text);};
  if(root.querySelector("style")) limits.add("Stylesheets are not evaluated. Review CSS-styled or hidden geometry separately.");
  if(!width||!height) add("Supply explicit physical width and height to confirm the drawing size.");
  const view=numbers(root.getAttribute("viewBox")||"");
  if(width&&height&&view.length===4&&view[2]>0&&view[3]>0 && Math.abs((width/height)/(view[2]/view[3])-1)>.001) add("The declared size and viewBox have different aspect ratios. Review margins or stretching in the cutter import.");
  for(const [actual,expected,axis] of [[width,expectedWidth,"width"],[height,expectedHeight,"height"]]) {
    if(actual && expected && Math.abs(actual-expected)>.05) add("Expected "+axis+" "+expected+" mm differs from declared "+actual.toFixed(2)+" mm.");
  }
  const rounded=n=>Number(n.toFixed(6));
  function visit(node,parent) {
    const type=node.localName, tag=node.id||type+" "+(shapes+1);
    if(["defs","metadata","title","desc","style","script","clipPath","mask","pattern","symbol"].includes(type))return;
    const style=node.getAttribute("style")||"";
    if(node.getAttribute("display")==="none" || /display\s*:\s*none/i.test(style))return;
    if(node.getAttribute("visibility")==="hidden" || /visibility\s*:\s*hidden/i.test(style) || /transform\s*:/i.test(style) || node.hasAttribute("clip-path") || node.hasAttribute("mask")){
      limits.add("Hidden, clipped, masked and CSS-transformed elements need separate review.");return;
    }
    try {
      const m=parent.multiply(matrix(node.getAttribute("transform")||""));
      if(type==="g" || node===root){for(const child of node.children)visit(child,m);return;}
      if(!["path","rect","line","circle","ellipse","polygon","polyline"].includes(type)){limits.add("Separate review needed for <"+type+"> elements.");return;}
      shapes++;
      const coord=(key,defaultValue=0)=>{const a=node.getAttribute(key);if(a===null)return defaultValue;if(!a.trim()||!Number.isFinite(Number(a)))throw new Error("Use plain user-unit geometry or flatten unit-bearing shapes.");return Number(a);};
      const world=([x,y])=>[rounded(m.a*x+m.c*y+m.e),rounded(m.b*x+m.d*y+m.f)];
      function record(key) {
        if(firstUse.has(key)){duplicates++;add(tag+" repeats a cut segment already present in "+firstUse.get(key)+".");}
        else firstUse.set(key,tag);
      }
      function segment(kind, points, arc) {
        const p=points.map(world);
        if(kind==="L" && String(p[0])===String(p[1]))return;
        const forward=JSON.stringify(p), backward=JSON.stringify([...p].reverse());
        if(!arc){record(kind+([forward,backward].sort()[0]));return;}
        const suffix=[...arc.slice(0,4),m.a,m.b,m.c,m.d].map(rounded).join(",");
        record("A"+suffix+"|"+[forward+arc[4],backward+(1-arc[4])].sort()[0]);
      }
      const opened=i=>{openCount++;add(tag+" has an open contour"+(i?" (subpath "+i+")":"")+".");};
      if(type==="path")walkPath(node.getAttribute("d")||"",segment,opened);
      else if(type==="line"){const a=[coord("x1"),coord("y1")],b=[coord("x2"),coord("y2")];segment("L",[a,b]);if(String(a)!==String(b))opened();}
      else if(type==="ellipse"||type==="circle"){
        const rx=coord(type==="circle"?"r":"rx"),ry=type==="circle"?rx:coord("ry");
        if(rx>0&&ry>0)record("ellipse"+JSON.stringify([world([coord("cx"),coord("cy")]),...[m.a*m.a*rx*rx+m.c*m.c*ry*ry,m.a*m.b*rx*rx+m.c*m.d*ry*ry,m.b*m.b*rx*rx+m.d*m.d*ry*ry].map(rounded)]));
      }else{
        let points=[];
        if(type==="rect"){
          if(coord("rx")||coord("ry")){limits.add("Rounded rectangles need separate duplicate review.");return;}
          const x=coord("x"),y=coord("y"),w=coord("width"),h=coord("height");if(w<=0||h<=0)return;
          points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
        }else{
          const v=numbers(node.getAttribute("points")||"");if(v.length%2)throw new Error("Unpaired point coordinate.");
          for(let i=0;i<v.length;i+=2)points.push([v[i],v[i+1]]);
        }
        if(points.length<2)return;
        for(let i=1;i<points.length;i++)segment("L",[points[i-1],points[i]]);
        if(type!=="polyline")segment("L",[points.at(-1),points[0]]);
        else if(String(points[0])!==String(points.at(-1)))opened();
      }
    }catch(error){limits.add(tag+" · "+error.message);}
  }
  visit(root,new DOMMatrix());
  return {width,height,view,openCount,duplicates,shapes,findings,limits:[...limits]};
}
