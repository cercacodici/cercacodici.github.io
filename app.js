(function(){
  "use strict";
  var root = document.documentElement;

  /* Tema Giorno / Notte */
  var tl = document.getElementById("t-light"), td = document.getElementById("t-dark");
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function store(k,v){ try{ localStorage.setItem(k,v); }catch(e){} }
  function read(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function effective(){ var t = root.getAttribute("data-theme"); if (t==="dark"||t==="light") return t; return mq && mq.matches ? "dark" : "light"; }
  function paint(){ var e = effective(); tl.setAttribute("aria-pressed", e==="light"); td.setAttribute("aria-pressed", e==="dark"); }
  function setTheme(t){ root.setAttribute("data-theme", t); store("theme", t); paint(); }
  var saved = read("theme"); if (saved==="dark"||saved==="light") root.setAttribute("data-theme", saved);
  paint();
  if (mq && mq.addEventListener) mq.addEventListener("change", paint);
  new MutationObserver(paint).observe(root, {attributes:true, attributeFilter:["data-theme"]});
  tl.addEventListener("click", function(){ setTheme("light"); });
  td.addEventListener("click", function(){ setTheme("dark"); });

  /* Scadenza: dal 1 gennaio 2027 (ora italiana) la pagina non mostra piu' i codici */
  var END = Date.UTC(2026,11,31,23,0,0);
  function closeSite(){
    document.getElementById("app").innerHTML =
      '<section class="closed wrap"><h1>Servizio terminato</h1><p>Le versioni di sperimentazione ICD-10-IM e CIPI erano valide fino al 31/12/2026. Consulta gli elenchi aggiornati sul sito del Ministero della Salute.</p></section>';
  }
  if (Date.now() >= END){ closeSite(); return; }
  var endTimer = setInterval(function(){ if (Date.now() >= END){ clearInterval(endTimer); closeSite(); } }, 30000);

  var PAGE = 200;
  var DB = {dx:null, px:null}, IDX = {dx:null, px:null}, DET = {dx:null, px:null}, detLoading = {};
  var state = {kind:"dx", q:"", hits:[], shown:0};
  var $ = function(id){return document.getElementById(id)};
  var clearBtn=$("clear"), form=$("form"), q=$("q"), tbody=$("tbody"), results=$("results"), more=$("more"), status=$("status");

  var k0 = read("kind"); if (k0==="px"||k0==="dx"){ state.kind=k0; $("k-"+k0).checked=true; }

  function norm(s){ return s.normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/[‘’´`]/g,"'").toLowerCase(); }
  function codeKey(s){ return s.toUpperCase().replace(/[^0-9A-Z]/g,""); }
  function esc(s){ return s.replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]}); }
  function fmt(n){ return n.toLocaleString("it-IT"); }

  function build(kind, rows){
    var n = rows.length, t = new Array(n), c = new Array(n), o = new Array(n), order = new Array(n);
    for (var i=0;i<n;i++){
      t[i] = norm(rows[i][1]);
      c[i] = codeKey(rows[i][0]);
      o[i] = (rows[i][2]||"").toUpperCase().split(/[^0-9A-Z.]+/).filter(Boolean).map(codeKey);
      order[i] = i;
    }
    order.sort(function(a,b){ var x=rows[a][0], y=rows[b][0]; return x<y?-1:x>y?1:a-b; });
    IDX[kind] = {t:t,c:c,o:o,order:order};
  }

  function load(kind){
    return fetch(kind+".json").then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
      .then(function(rows){ DB[kind]=rows; build(kind,rows); });
  }

  Promise.all([load("dx"), load("px")]).then(function(){
    status.textContent = fmt(DB.dx.length)+" diagnosi e "+fmt(DB.px.length)+" procedure disponibili.";
    if (q.value.trim().length>=3) run();
  }).catch(function(){
    status.textContent = "Impossibile caricare gli elenchi. Ricarica la pagina.";
  });

  function isCodeQuery(s){ return !/\s/.test(s) && /\d/.test(s); }

  function search(kind, raw){
    var rows = DB[kind], ix = IDX[kind], ord = ix.order, hits = [], i, j, m;
    if (isCodeQuery(raw)){
      var k = codeKey(raw);
      for (var p=0;p<ord.length;p++){
        i = ord[p];
        if (ix.c[i].indexOf(k)===0){ hits.push(i); continue; }
        var o = ix.o[i];
        for (j=0;j<o.length;j++){ if (o[j].indexOf(k)===0){ hits.push(i); break; } }
      }
      return hits;
    }
    var terms = norm(raw).split(/[^a-z0-9']+/).filter(function(w){return w.length>0});
    if (!terms.length) return hits;
    outer: for (var p2=0;p2<ord.length;p2++){
      i = ord[p2];
      var t = ix.t[i];
      for (m=0;m<terms.length;m++){ if (t.indexOf(terms[m])<0) continue outer; }
      hits.push(i);
    }
    return hits;
  }

  function highlight(text, raw){
    if (isCodeQuery(raw)) return esc(text);
    var terms = norm(raw).split(/[^a-z0-9']+/).filter(function(w){return w.length>1});
    if (!terms.length) return esc(text);
    var n = norm(text);
    if (n.length !== text.length) return esc(text);
    var marks = new Array(text.length+1).fill(0);
    terms.forEach(function(w){ var p=0; while((p=n.indexOf(w,p))>=0){ for(var x=p;x<p+w.length;x++) marks[x]=1; p+=w.length; } });
    var out="", on=false;
    for (var i=0;i<text.length;i++){
      if (marks[i] && !on){ out+="<mark>"; on=true; }
      if (!marks[i] && on){ out+="</mark>"; on=false; }
      out += esc(text[i]);
    }
    if (on) out+="</mark>";
    return out;
  }

  function rowHTML(kind, i, raw){
    var r = DB[kind][i];
    var hasDet = DET[kind] ? !!DET[kind][i] : null;
    return '<tr class="row'+(hasDet===false?'':' has')+'" data-k="'+kind+'" data-i="'+i+'" tabindex="0">'+
      '<td class="c-code"><div class="cc"><span class="code">'+esc(r[0])+'</span><button class="copy" type="button" data-copy="'+esc(r[0])+'" aria-label="Copia il codice '+esc(r[0])+'">Copia</button></div></td>'+
      '<td class="desc">'+highlight(r[1], raw)+(hasDet===false?'':'<span class="more-ind" aria-hidden="true">note ▾</span>')+'</td>'+
      '<td class="c-old">'+esc(r[2]||"")+'</td></tr>';
  }

  function render(append){
    var kind = state.kind, end = Math.min(state.hits.length, state.shown+PAGE), html = "";
    for (var i=state.shown;i<end;i++) html += rowHTML(kind, state.hits[i], state.q);
    if (!append) tbody.innerHTML = state.hits.length ? html : '<tr><td colspan="3" class="empty">Nessuna voce trovata. Prova con meno parole o con l\'inizio del codice.</td></tr>';
    else tbody.insertAdjacentHTML("beforeend", html);
    state.shown = end;
    var rest = state.hits.length - state.shown;
    more.hidden = rest<=0;
    more.textContent = "Mostra altri "+Math.min(rest,PAGE)+" risultati (ne restano "+fmt(rest)+")";
    if (!DET[kind]) loadDet(kind, true);
  }

  function run(){
    var raw = q.value.trim();
    state.kind = form.kind.value;
    clearBtn.hidden = !q.value;
    if (raw.length<3){ results.hidden = true; document.body.classList.remove("has-results"); return; }
    if (!DB[state.kind]){ results.hidden = true; tbody.innerHTML = ""; more.hidden = true; status.textContent="Caricamento degli elenchi ufficiali…"; return; }
    state.q = raw; state.hits = search(state.kind, raw); state.shown = 0;
    var n = state.hits.length;
    $("count").textContent = fmt(n);
    $("countLab").textContent = n===1 ? "voce trovata" : "voci trovate";
    $("countSub").textContent = (state.kind==="dx"?"Diagnosi ICD-10-IM":"Procedure CIPI")+" · ordinate per codice"+(n>PAGE?" · mostrate a gruppi di "+PAGE:"");
    results.hidden = false;
    document.body.classList.add("has-results");
    render(false);
  }

  function loadDet(kind, refresh){
    if (DET[kind] || detLoading[kind]) return detLoading[kind];
    detLoading[kind] = fetch(kind+"d.json").then(function(r){return r.json()}).then(function(d){
      DET[kind]=d;
      if (refresh){
        Array.prototype.forEach.call(tbody.querySelectorAll('tr.row[data-k="'+kind+'"]'), function(tr){
          var i=+tr.getAttribute("data-i");
          if (!d[i]){ tr.classList.remove("has"); var m=tr.querySelector(".more-ind"); if(m) m.remove(); }
        });
      }
    }).catch(function(){ detLoading[kind]=null; });
    return detLoading[kind];
  }

  function toggle(tr){
    var kind = tr.getAttribute("data-k"), i = +tr.getAttribute("data-i");
    var next = tr.nextElementSibling;
    if (next && next.classList.contains("det")){ next.remove(); tr.setAttribute("aria-expanded","false"); return; }
    Promise.resolve(loadDet(kind)).then(function(){
      var d = DET[kind] && DET[kind][i];
      if (!d) return;
      var html = '<tr class="det"><td colspan="3"><dl>'+d.map(function(p){return '<dt>'+esc(p[0])+'</dt><dd>'+esc(p[1]).replace(/;/g,';<wbr>')+'</dd>'}).join("")+'</dl></td></tr>';
      tr.insertAdjacentHTML("afterend", html);
      tr.setAttribute("aria-expanded","true");
    });
  }

  var timer;
  var scrolled = false;
  q.addEventListener("input", function(){ clearBtn.hidden = !q.value; clearTimeout(timer); timer=setTimeout(run,140);
    if (!scrolled && window.innerWidth<=640){ scrolled = true; setTimeout(function(){ form.scrollIntoView({block:"start"}); }, 160); } });
  clearBtn.addEventListener("click", function(){ q.value=""; run(); scrolled=false; q.focus(); });
  form.addEventListener("submit", function(e){ e.preventDefault(); clearTimeout(timer); run(); });
  Array.prototype.forEach.call(form.kind, function(r){ r.addEventListener("change", function(){
    store("kind", r.value);
    run(); q.focus();
  }); });
  more.addEventListener("click", function(){ render(true); });

  tbody.addEventListener("click", function(e){
    var b = e.target.closest(".copy");
    if (b){
      e.stopPropagation();
      var code = b.getAttribute("data-copy");
      var done = function(){ b.textContent="Copiato"; setTimeout(function(){b.textContent="Copia"},1400); };
      var fallback = function(){ var s=window.getSelection(), rg=document.createRange(); rg.selectNodeContents(b.previousElementSibling); s.removeAllRanges(); s.addRange(rg); b.textContent="Selezionato"; setTimeout(function(){b.textContent="Copia"},1400); };
      try{ navigator.clipboard.writeText(code).then(done, fallback); }catch(err){ fallback(); }
      return;
    }
    var tr = e.target.closest("tr.row.has");
    if (tr) toggle(tr);
  });
  tbody.addEventListener("keydown", function(e){
    if ((e.key==="Enter"||e.key===" ") && e.target.matches("tr.row.has")){ e.preventDefault(); toggle(e.target); }
  });
})();
