"use strict";
// 一つのカテゴリーにつき施設位置・250m・500mの3ファイルを使用。
// 表示範囲はQGISによる「道路沿いの到達範囲」を想定（円形バッファではない）。
const CATEGORIES = {
  shelters:{label:"避難所",symbol:"避",color:"#34774f",points:"data/shelters.geojson",r250:"data/reach_250m.geojson",r500:"data/reach_500m.geojson"},
  fire:{label:"消防署",symbol:"消",color:"#b84e3e",points:"data/fire.geojson",r250:"data/fire_250m.geojson",r500:"data/fire_500m.geojson"},
  police:{label:"交番",symbol:"交",color:"#3f67ad",points:"data/police_boxes.geojson",r250:"data/police_250m.geojson",r500:"data/police_500m.geojson"},
  medical:{label:"病院・医療機関",symbol:"医",color:"#b24d70",points:"data/medical.geojson",r250:"data/medical_250m.geojson",r500:"data/medical_500m.geojson"},
  schools:{
  label:"小学校",
  symbol:"学",
  color:"#986c32",
  points:"data/elementary_schools.geojson",
  r250:"data/schools_250m.geojson",
  r500:"data/schools_500m.geojson"
},
juniorHigh:{
  label:"中学校",
  symbol:"中",
  color:"#7057a3",
  points:"data/junior_high_schools.geojson",
  r250:"data/junior_high_250m.geojson",
  r500:"data/junior_high_500m.geojson"
}
};
const map=L.map("map").setView([35.1326,137.0682],13);
L.tileLayer("https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png", {maxZoom:18,attribution:'<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer">地理院タイル</a>'}).addTo(map);
map.createPane("reach500");map.getPane("reach500").style.zIndex="410";
map.createPane("reach250");map.getPane("reach250").style.zIndex="420";
map.createPane("facilityPoints");map.getPane("facilityPoints").style.zIndex="440";
// Canvasで大量の道路を描画した際も前面の施設マークはDOMマーカーを使う。
const cache=new Map();
const categoryGroups=new Map();
const checkboxes=[...document.querySelectorAll('.facility-option input[type="checkbox"]')];
const statusEl=document.getElementById("status");
const countEl=document.getElementById("facilityCount");
const legendEl=document.getElementById("legendItems");
let hasAutoZoomed=false;
function selectedKeys(){return checkboxes.filter(el=>el.checked).map(el=>el.dataset.kind);}
function validBounds(layer){return layer && layer.getBounds && layer.getBounds().isValid();}
function zoomVisible(){const all=L.featureGroup();for(const kind of selectedKeys()){const g=categoryGroups.get(kind);if(g&&validBounds(g.group))all.addLayer(g.group);}if(validBounds(all))map.fitBounds(all.getBounds().pad(.12),{maxZoom:15});}
function setCategoryStatus(kind,message){const el=document.querySelector(`[data-status="${kind}"]`);if(el)el.textContent=message;}
function updateUI(){
  const keys=selectedKeys();
  document.querySelectorAll(".facility-option").forEach(el=>el.classList.toggle("selected",el.querySelector("input").checked));
  legendEl.replaceChildren();
  for(const key of keys){const c=CATEGORIES[key],tag=document.createElement("span"),dot=document.createElement("i");tag.className="legend-category";dot.className="legend-dot";dot.style.backgroundColor=c.color;tag.append(dot,document.createTextNode(c.label));legendEl.appendChild(tag);}
  if(!keys.length)legendEl.textContent="なし";
  let count=0,missing=[];
  for(const key of keys){const record=categoryGroups.get(key);if(record){count+=record.count;if(record.missing.length)missing.push(`${CATEGORIES[key].label}：${record.missing.join("・")}`);}}
  const pending=keys.filter(k=>!categoryGroups.has(k));
  countEl.textContent=`${keys.length}種類を選択 / 施設${count}件${pending.length?`（${pending.length}種類を読み込み中）`:""}`;
  if(!keys.length){statusEl.textContent="施設を選択すると、位置と250m・500mの到達範囲を重ねて表示します。";statusEl.classList.remove("warning");}
  else if(missing.length){statusEl.textContent=`未登録のデータがあります：${missing.join(" ／ ")}。ファイルを data フォルダに追加してください。`;statusEl.classList.add("warning");}
  else{statusEl.textContent=pending.length?"選択した施設データを読み込んでいます…":"選択した施設の位置と到達範囲を表示しています。施設マークを押すと詳細を確認できます。";statusEl.classList.remove("warning");}
}
async function readGeoJSON(path){
  if(!cache.has(path)){cache.set(path,fetch(path).then(async r=>{if(!r.ok)throw Error(`${r.status}: ${path}`);const data=await r.json();if(!data||!['Feature','FeatureCollection','GeometryCollection','Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon'].includes(data.type))throw Error(`GeoJSON形式ではありません: ${path}`);return data;}).catch(e=>{cache.delete(path);throw e;}));}
  return cache.get(path);
}
function propsValue(feature,names){const p=feature.properties||{};return names.map(k=>p[k]).find(v=>v!==undefined&&v!==null&&String(v).trim())||"";}
function pointLayer(json,c){let count=0;const layer=L.geoJSON(json,{pane:"facilityPoints",pointToLayer:(feature,latlng)=>{count++;return L.marker(latlng,{pane:"facilityPoints",icon:L.divIcon({className:"facility-map-marker",html:`<span class="pin-icon" style="background:${c.color}">${c.symbol}</span>`,iconSize:[30,30],iconAnchor:[15,15],popupAnchor:[0,-10]})});},style:{color:c.color,weight:2,fillOpacity:.1},onEachFeature:(f,l)=>{const popup=document.createElement("div"),name=document.createElement("strong"),addr=document.createElement("div");name.textContent=propsValue(f,["名称","施設名","施設名称","学校名","医療機関名","name","Name","NAME"])||c.label;addr.textContent=propsValue(f,["所在地","住所","address","addr:full"]);popup.appendChild(name);if(addr.textContent)popup.appendChild(addr);l.bindPopup(popup);}});return {layer,count:count||((json.features||[]).length)};}
function rangeLayer(json,c,meters){const near=meters===250;return L.geoJSON(json,{pane:near?"reach250":"reach500",interactive:false,style:{color:c.color,weight:near?5:7,opacity:near?.92:.45,dashArray:near?null:"7 8",fillColor:c.color,fillOpacity:near?.27:.09}});}
async function loadCategory(kind){
  const c=CATEGORIES[kind];setCategoryStatus(kind,"読込中");
  // 最初のロードは3種類を並列読み込み。404は画面全体の動作を止めない。
  const [points,r250,r500]=await Promise.allSettled([readGeoJSON(c.points),readGeoJSON(c.r250),readGeoJSON(c.r500)]);
  const group=L.featureGroup(),missing=[];let count=0;
  // 500m → 250m → 施設マークの順で重ねる。
  if(r500.status==="fulfilled")group.addLayer(rangeLayer(r500.value,c,500));else missing.push("500m");
  if(r250.status==="fulfilled")group.addLayer(rangeLayer(r250.value,c,250));else missing.push("250m");
  if(points.status==="fulfilled"){const built=pointLayer(points.value,c);group.addLayer(built.layer);count=built.count;}else missing.push("施設位置");
  categoryGroups.set(kind,{group,count,missing});
  setCategoryStatus(kind,missing.length?"一部未登録":`${count}件`);
  if(selectedKeys().includes(kind)){group.addTo(map);if(!hasAutoZoomed&&validBounds(group)){hasAutoZoomed=true;zoomVisible();}}
  updateUI();
}
function syncSelections(){for(const kind of Object.keys(CATEGORIES)){const checked=selectedKeys().includes(kind),record=categoryGroups.get(kind);if(checked){if(record){record.group.addTo(map);}else if(!loading.has(kind)){const p=loadCategory(kind).finally(()=>loading.delete(kind));loading.set(kind,p);}}else if(record){map.removeLayer(record.group);}}updateUI();}
const loading=new Map();
checkboxes.forEach(el=>el.addEventListener("change",syncSelections));
document.getElementById("selectAll").addEventListener("click",()=>{checkboxes.forEach(x=>x.checked=true);syncSelections();});
document.getElementById("clearAll").addEventListener("click",()=>{checkboxes.forEach(x=>x.checked=false);syncSelections();});
document.getElementById("zoomToData").addEventListener("click",zoomVisible);
syncSelections();
