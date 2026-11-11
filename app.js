const API_BASE = (window.VBTRACKER_API || "").replace(/\/$/, "");
const $ = (id) => document.getElementById(id);
const money = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat("vi-VN").format(Number(n)) + " đ" : "—";
const shortMoney = (n) => Number.isFinite(Number(n)) ? new Intl.NumberFormat("vi-VN").format(Number(n)) : "—";
let products = [], history = [], selectedRange = "7", chart = null, lastPayload = null;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
function setStatus(state, label) { $("connection").className = "status " + state; $("connection").lastChild.textContent = " " + label; }
function setNotice(message, warning = false) { $("notice").lastElementChild.textContent = message; $("notice").style.borderColor = warning ? "#ef777755" : ""; }
function timeLabel(value) { if (!value) return "Không rõ"; const d = new Date(value); return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString("vi-VN"); }
async function request(path) { const response = await fetch(API_BASE + path, {headers:{accept:"application/json"},cache:"no-store"}); const body = await response.json().catch(()=>({})); if (!response.ok) throw new Error(body.error || ("HTTP " + response.status)); return body; }
function renderProducts() {
  $("product-count").textContent = products.length + " sản phẩm";
  $("price-grid").innerHTML = products.length ? products.map((p,i)=>{const formatDelta=(v)=>v===null||v===undefined?'<span class="muted">Chưa đủ dữ liệu so sánh</span>':(Number(v)>0?'<span class="up">▲ +'+money(Number(v))+'</span>':Number(v)<0?'<span class="down">▼ −'+money(Math.abs(Number(v)))+'</span>':'<span class="muted">• Không đổi</span>');return '<article class="price-card '+(i===0?'selected':'')+'"><div class="product-name">'+esc(p.name)+'</div><div class="product-sub">'+esc(p.unit||"VNĐ")+'</div><div class="price-pair"><div><div class="price-label">MUA VÀO</div><div class="price-value buy">'+money(p.buy)+'</div></div><div><div class="price-label">BÁN RA</div><div class="price-value sell">'+money(p.sell)+'</div></div></div><div class="change">So với lần ghi nhận trước · Mua: '+formatDelta(p.buyChange)+' · Bán: '+formatDelta(p.sellChange)+'</div></article>'}).join("") : '<div class="loading-card">Nguồn chưa trả về danh mục giá hợp lệ.</div>';
  const options = products.map((p,i)=>'<option value="'+i+'">'+esc(p.name)+'</option>').join("");
  $("product-select").innerHTML = options || '<option value="">Chưa có sản phẩm</option>';
  $("calc-product").innerHTML = options || '<option value="">Chưa có sản phẩm</option>';
  updateCalculator();
}
function renderHistory() {
  const rows = history.slice(0,100);
  $("history-body").innerHTML = rows.length ? rows.map(h=>'<tr><td>'+esc(timeLabel(h.time))+'</td><td>'+esc(h.name)+'</td><td>'+money(h.buy)+'</td><td>'+money(h.sell)+'</td><td>'+money(Number(h.sell)-Number(h.buy))+'</td><td>'+esc(h.source||'—')+'</td></tr>').join("") : '<tr><td colspan="6" class="empty">Chưa có lịch sử. Lịch sử sẽ tích lũy sau khi hệ thống bắt đầu thu thập dữ liệu.</td></tr>';
}
function renderChart() {
  const index = Number($("product-select").value || 0), p = products[index];
  const cutoff = selectedRange === "all" ? 0 : Date.now() - Number(selectedRange)*86400000;
  const points = history.filter(h => (!p || h.productId === p.id || h.name === p.name) && new Date(h.time).getTime() >= cutoff).slice().reverse();
  const canvas = $("price-chart"), empty = $("chart-empty");
  empty.style.display = points.length ? "none" : "grid";
  if (chart) chart.destroy();
  if (!points.length || typeof Chart === "undefined") return;
  chart = new Chart(canvas,{type:"line",data:{labels:points.map(x=>new Date(x.time).toLocaleString("vi-VN",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})),datasets:[{label:"Mua vào",data:points.map(x=>x.buy),borderColor:"#6fd0a0",backgroundColor:"#6fd0a022",pointRadius:2,tension:.25},{label:"Bán ra",data:points.map(x=>x.sell),borderColor:"#d9b65d",backgroundColor:"#d9b65d22",pointRadius:2,tension:.25}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:"index",intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.dataset.label+": "+money(c.raw)}}},scales:{x:{ticks:{color:"#9b9aa3",maxTicksLimit:7},grid:{color:"#ffffff0b"}},y:{ticks:{color:"#9b9aa3",callback:v=>shortMoney(v)},grid:{color:"#ffffff12"}}}}});
}
function updateCalculator() {
  const p=products[Number($("calc-product").value||0)], qty=Number($("calc-qty").value||0), unit=$("calc-unit").value, side=$("calc-side").value;
  if(!p || !Number.isFinite(qty) || qty<0){$("calc-total").textContent="—";return}
  const grams={luong:37.5,chi:3.75,phan:.375,gram:1}[unit], total=qty*grams/37.5*Number(p[side]||0);
  $("calc-total").textContent=money(total);
}
async function loadData(showSpinner=false) {
  if(showSpinner) $("refresh").classList.add("spinning");
  try {
    const data=await request("/api/prices");
    if(!Array.isArray(data.products)) throw new Error("Dữ liệu nguồn không đúng định dạng");
    products=data.products; history=Array.isArray(data.history)?data.history:[];
    lastPayload=data; renderProducts(); renderHistory(); renderChart();
    $("updated").textContent=timeLabel(data.fetchedAt || data.updatedAt);
    $("source-time").textContent="Nguồn: "+(data.source||"Không rõ")+(data.sourceUpdatedAt ? " · Công bố: "+timeLabel(data.sourceUpdatedAt) : " · Thời gian hệ thống nhận dữ liệu");
    if(data.stale){setStatus("error","Dữ liệu cũ");setNotice("Không lấy được dữ liệu mới. Đang hiển thị bản ghi gần nhất từ "+(data.source||"nguồn trước đó")+"; vui lòng kiểm tra lại thời điểm cập nhật.",true)}
    else if(data.fallback){setStatus("error","Nguồn dự phòng NDH");setNotice("VietinBank chưa cung cấp dữ liệu hợp lệ ở lần kiểm tra này. Đang dùng bảng giá tham khảo từ NDH; hãy đối chiếu với website VietinBank trước khi giao dịch.",true)}
    else {setStatus("ok","Đã kết nối");setNotice("Nguồn dữ liệu trực tiếp: VietinBank Gold & Jewellery. Chu kỳ kiểm tra phụ thuộc cấu hình backend; giá chỉ thay đổi khi nguồn công bố cập nhật.")}
  } catch(error) {
    setStatus("error","Mất kết nối");
    setNotice("Không thể lấy bảng giá VietinGold: "+error.message+". Không sử dụng giá thay thế hoặc dữ liệu giả lập.",true);
    $("updated").textContent="Không có dữ liệu mới";
    if(!products.length) $("price-grid").innerHTML='<div class="loading-card">Chưa có dữ liệu từ nguồn chính thức. Hãy cấu hình Worker và thử lại.</div>';
  } finally { $("refresh").classList.remove("spinning"); }
}
$("refresh").addEventListener("click",()=>loadData(true));
$("product-select").addEventListener("change",renderChart);
$("ranges").addEventListener("click",e=>{const b=e.target.closest("button[data-range]");if(!b)return;selectedRange=b.dataset.range;document.querySelectorAll("#ranges button").forEach(x=>x.classList.toggle("active",x===b));renderChart()});
["calc-product","calc-qty","calc-unit","calc-side"].forEach(id=>$(id).addEventListener("input",updateCalculator));
$("csv").addEventListener("click",()=>{if(!history.length){setNotice("Chưa có dữ liệu lịch sử để xuất.",true);return}const rows=[["Thời gian","Sản phẩm","Giá mua","Giá bán","Nguồn"],...history.map(h=>[h.time,h.name,h.buy,h.sell,h.source||"—"])];const csv="\uFEFF"+rows.map(r=>r.map(v=>'"'+String(v??"").replace(/"/g,'""')+'"').join(",")).join("\r\n");const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));a.download="vietingold-price-history.csv";a.click();URL.revokeObjectURL(a.href)});
loadData();setInterval(loadData,60000);
if("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));