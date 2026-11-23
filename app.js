"use strict";

const el = id => document.getElementById(id);

const fmt = (number, digits = 2) => number.toLocaleString("en-ZA", { maximumFractionDigits: digits });

function list(id, values) {
  el(id).replaceChildren(...values.map(value => {
    const line = document.createElement("li");
    line.textContent = value;
    return line;
  }));
}

function refresh(draw) {
  try {
    draw();
    el("message").textContent = "";
    el("result").hidden = false;
  } catch (error) {
    el("message").textContent = error.message;
    el("result").hidden = true;
  }
}

const sample='<svg xmlns="http://www.w3.org/2000/svg" width="100mm" height="50mm" viewBox="0 0 100 50"><path id="outline" d="M10 10 H90 V40 H10 Z"/><path id="repeat" d="M90 10 H10"/><path id="slot" d="M25 22 h30"/></svg>';
let current=sample, name="Example drawing", version=0;
function report() {
  if (!current) throw new Error("Choose a readable SVG or load the example drawing.");
  for(const id of ["ew","eh"]) if(!el(id).validity.valid)throw new Error("Expected dimensions must be positive millimetres.");
  const r=inspectDrawing(current,el("ew").valueAsNumber,el("eh").valueAsNumber);
  const contours = r.openCount === 1 ? "open contour" : "open contours";
  const segments = r.duplicates === 1 ? "repeated segment" : "repeated segments";
  el("summary").textContent = r.openCount + " " + contours + " · " + r.duplicates + " " + segments;
  const size=r.width&&r.height?fmt(r.width,3)+" × "+fmt(r.height,3)+" mm":"Physical size unspecified";
  list("details",[name+" · "+r.shapes+(r.shapes===1?" geometry element":" geometry elements"),size,"viewBox "+(r.view.length?r.view.join(" "):"unspecified")]);
  const findings=el("findings"); findings.replaceChildren();
  for(const [heading,rows] of [["Findings",r.findings],["Coverage",r.limits]]) {
    if(!rows.length)continue;
    const h=document.createElement("h3"), ul=document.createElement("ul");h.textContent=heading;ul.className="rows";
    for(const line of rows){const item=document.createElement("li");item.textContent=line;ul.append(item);}
    findings.append(h,ul);
  }
  if(r.findings.length===120){const p=document.createElement("p");p.textContent="The list shows the first 120 findings.";findings.append(p);}
}
el("art").onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  const sequence=++version;
  try{
    if(file.size>5000000)throw new Error("Choose an SVG under 5 MB for this browser report.");
    const source=await file.text();if(sequence!==version)return;
    current=source;name=file.name;refresh(report);
  }catch(error){if(sequence===version){current=null;refresh(()=>{throw error;});}}
};
el("sample").onclick=()=>{version++;current=sample;name="Example drawing";el("art").value="";refresh(report);};
el("ew").oninput=el("eh").oninput=()=>refresh(report);
refresh(report);
