import { Chess } from "chess.js";
const $ = id => document.getElementById(id);
const state = { moves: [], positions: [], cursor: 0, worker: null, ready: false, evals: [] };
const glyph = {wk:"♔",wq:"♕",wr:"♖",wb:"♗",wn:"♘",wp:"♙",bk:"♚",bq:"♛",br:"♜",bb:"♝",bn:"♞",bp:"♟"};
function status(s, bad=false){$("importStatus").textContent=s;$("importStatus").classList.toggle("error",bad);}
function parseGame(pgn, extra={}) {
 const game=new Chess();
 try { game.loadPgn(pgn,{strict:false}); } catch(e) { throw new Error("Could not read PGN: "+e.message); }
 const moves=game.history({verbose:true}); if(!moves.length) throw new Error("No moves found in that PGN.");
 const replay=new Chess(), positions=[replay.fen()]; moves.forEach(m=>{replay.move(m);positions.push(replay.fen());});
 const h=game.getHeaders(); state.moves=moves;state.positions=positions;state.cursor=0;state.evals=[];
 $("workspace").classList.remove("hidden");$("gameTitle").textContent=extra.title||h.Event||"Imported game";
 $("gameMeta").textContent=[h.Date,h.ECO,h.Opening,h.TimeControl].filter(Boolean).join(" · ")||"Imported PGN game";
 $("whiteName").textContent=h.White||extra.white||"White";$("blackName").textContent=h.Black||extra.black||"Black";
 $("whiteRating").textContent=h.WhiteElo?"Rating "+h.WhiteElo:"—";$("blackRating").textContent=h.BlackElo?"Rating "+h.BlackElo:"—";
 $("openingName").textContent=h.Opening||"Not tagged";$("openingEco").textContent=h.ECO?"ECO "+h.ECO:"From PGN metadata";
 $("moveCount").textContent=moves.length+" plies";
 ["whiteAccuracy","blackAccuracy","biggestSwing"].forEach(id=>$(id).textContent="—");
 $("whiteCounts").textContent="Awaiting analysis";$("blackCounts").textContent="Awaiting analysis";
 $("verdicts").innerHTML='<div class="empty-state">Start engine analysis to see move classifications.</div>';
 $("coachNote").textContent="Your review will highlight critical moments and missed opportunities.";
 $("progressWrap").classList.add("hidden");renderMoves();renderBoard();$("workspace").scrollIntoView({behavior:"smooth",block:"start"});
}
function renderBoard(){
 const b=new Chess(state.positions[state.cursor]).board(),last=state.moves[state.cursor-1];$("board").innerHTML="";
 b.forEach((rank,r)=>rank.forEach((p,c)=>{
  const sq=document.createElement("button");sq.type="button";sq.className="square "+((r+c)%2?"dark":"light");
  const name="abcdefgh"[c]+(8-r);if(last&&(last.from===name||last.to===name))sq.classList.add("last");
  sq.innerHTML=(p?'<span class="piece">'+glyph[p.color+p.type]+'</span>':"")+(c===0?'<span class="coord">'+(8-r)+'</span>':"")+(r===7?'<span class="coord" style="left:auto;right:4px;top:auto;bottom:1px">'+ "abcdefgh"[c] +'</span>':"");
  $("board").appendChild(sq);
 }));
 $("moveCounter").textContent=state.cursor===0?"Start position":"Move "+Math.ceil(state.cursor/2)+" · "+(state.cursor%2?"White":"Black")+" played";
 $("firstMove").disabled=$("prevMove").disabled=state.cursor===0;
 $("lastMove").disabled=$("nextMove").disabled=state.cursor===state.moves.length;
 document.querySelectorAll(".move-cell").forEach(x=>x.classList.toggle("active",Number(x.dataset.ply)===state.cursor));
 if(state.evals[state.cursor]!==undefined)updateEval(state.evals[state.cursor]);
}
function renderMoves(){
 let html="";for(let i=0;i<state.moves.length;i+=2){let w=state.moves[i],b=state.moves[i+1];html+='<div class="move-pair"><span class="move-no">'+(i/2+1)+'.</span><button class="move-cell" data-ply="'+(i+1)+'">'+w.san+'</button><button class="move-cell" data-ply="'+(i+2)+'">'+(b?b.san:"")+'</button></div>';}
 $("moveList").innerHTML=html;$("moveList").querySelectorAll("button").forEach(x=>x.onclick=()=>{state.cursor=Number(x.dataset.ply);renderBoard();});
}
function updateEval(cp){let n=Math.max(-10,Math.min(10,cp/100));$("evalNumber").textContent=(n>0?"+":"")+n.toFixed(2);$("evalCaption").textContent=n>.15?"White is better":n<-.15?"Black is better":"The position is roughly balanced";$("evalText").textContent=(n>0?"+":"")+n.toFixed(1);$("evalFill").style.height=Math.max(3,Math.min(97,50+n*4.7))+"%";}
function chart(values){
 const c=$("evalChart"),x=c.getContext("2d"),w=c.clientWidth||500,h=c.clientHeight||105,d=window.devicePixelRatio||1;c.width=w*d;c.height=h*d;x.scale(d,d);x.clearRect(0,0,w,h);
 x.strokeStyle="#304052";x.setLineDash([3,4]);x.beginPath();x.moveTo(0,h/2);x.lineTo(w,h/2);x.stroke();x.setLineDash([]);if(values.length<2)return;
 x.beginPath();values.forEach((v,i)=>{let px=i/(values.length-1)*w,py=h/2-Math.max(-1000,Math.min(1000,v))/2000*h;i?x.lineTo(px,py):x.moveTo(px,py)});x.strokeStyle="#80d6b0";x.lineWidth=2;x.stroke();
}
$("loadPgn").onclick=()=>{try{parseGame($("pgnInput").value);status("Game loaded. Ready to analyse.");}catch(e){status(e.message,true);}};
$("pgnFile").onchange=async e=>{let f=e.target.files[0];if(!f)return;let t=await f.text();$("pgnInput").value=t;try{parseGame(t);status("Loaded "+f.name);}catch(err){status(err.message,true);}};
$("newGame").onclick=()=>{$("workspace").classList.add("hidden");window.scrollTo({top:0,behavior:"smooth"});};
$("firstMove").onclick=()=>{state.cursor=0;renderBoard();};$("prevMove").onclick=()=>{state.cursor=Math.max(0,state.cursor-1);renderBoard();};
$("nextMove").onclick=()=>{state.cursor=Math.min(state.moves.length,state.cursor+1);renderBoard();};$("lastMove").onclick=()=>{state.cursor=state.moves.length;renderBoard();};
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{let t=b.dataset.tab;document.querySelectorAll(".tab").forEach(x=>x.classList.toggle("active",x===b));$("pgnPane").classList.toggle("hidden",t!=="pgn");$("chesscomPane").classList.toggle("hidden",t!=="chesscom");});
$("themeToggle").onclick=()=>document.body.classList.toggle("light");
let resolveSearch=null,score=0,side="w";
function engineMessage(line){
 if(line==="uciok"){state.ready=true;$("engineState").classList.add("ready");$("engineState").innerHTML="<i></i> Stockfish ready";}
 if(line.startsWith("info ")&&line.includes(" score ")){let m=line.match(/score (cp|mate) (-?\d+)/);if(m){let n=m[1]==="mate"?(Number(m[2])>0?10000:-10000):Number(m[2]);score=side==="b"?-n:n;}}
 if(line.startsWith("bestmove ")&&resolveSearch){let r=resolveSearch;resolveSearch=null;r({best:line.split(/\s+/)[1],score});}
}
function search(fen,depth){return new Promise(resolve=>{side=fen.split(" ")[1];score=0;resolveSearch=resolve;state.worker.postMessage("position fen "+fen);state.worker.postMessage("go depth "+depth);});}
function classify(n){return n<=18?"Best":n<=45?"Excellent":n<=90?"Good":n<=160?"Inaccuracy":n<=300?"Mistake":"Blunder";}
$("analyse").onclick=async()=>{
 if(!state.moves.length||$("analyse").disabled)return;$("analyse").disabled=true;$("progressWrap").classList.remove("hidden");$("progressBar").style.width="0%";
 try{
  if(!state.worker){state.ready=false;status("Starting local Stockfish engine…");const workerUrl=new URL("./engine/stockfish-19-lite-single.js",import.meta.url);state.worker=new Worker(workerUrl);state.worker.onmessage=e=>engineMessage(String(e.data));state.worker.onerror=e=>{status("Local Stockfish worker error: "+(e.message||"engine failed to load"),true);state.worker?.terminate();state.worker=null;state.ready=false;};state.worker.postMessage("uci");}
  for(let i=0;i<300&&!state.ready;i++)await new Promise(r=>setTimeout(r,100));if(!state.ready){state.worker?.terminate();state.worker=null;throw new Error("Local Stockfish did not answer within 30 seconds. Check that the engine files have been added by the Vendor Stockfish workflow.");}
  let depth=Number($("depth").value),prev=await search(state.positions[0],depth),vals=[prev.score],rows=[],acc={w:[],b:[]};
  for(let i=0;i<state.moves.length;i++){let m=state.moves[i],next=await search(state.positions[i+1],depth),loss=m.color==="w"?prev.score-next.score:next.score-prev.score;loss=Math.max(0,loss);let verdict=classify(loss);rows.push({ply:i+1,move:m.san,color:m.color,loss,verdict,best:prev.best});acc[m.color].push(Math.max(0,100-Math.pow(loss/100,.75)*9));vals.push(next.score);prev=next;$("progressBar").style.width=Math.round((i+1)/state.moves.length*100)+"%";$("progressText").textContent="Analysing move "+(i+1)+" of "+state.moves.length+" · depth "+depth;}
  state.evals=vals;chart(vals);renderBoard();
  const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:0;$("whiteAccuracy").textContent=avg(acc.w).toFixed(1)+"%";$("blackAccuracy").textContent=avg(acc.b).toFixed(1)+"%";
  ["w","b"].forEach((c)=>{let a=rows.filter(r=>r.color===c),id=c==="w"?"whiteCounts":"blackCounts";$(id).textContent=a.filter(r=>r.verdict==="Blunder").length+" blunders · "+a.filter(r=>r.verdict==="Mistake").length+" mistakes · "+a.filter(r=>r.verdict==="Inaccuracy").length+" inaccuracies";});
  let worst=[...rows].sort((a,b)=>b.loss-a.loss)[0];$("biggestSwing").textContent=worst?worst.loss+" cp":"—";
  $("verdicts").innerHTML=rows.map(r=>'<div class="verdict"><span class="move">'+Math.ceil(r.ply/2)+(r.color==="w"?".":"...")+" "+r.move+'</span><small>'+r.loss+' cp loss · best '+r.best+'</small><span class="tag '+r.verdict.toLowerCase()+'">'+r.verdict.toUpperCase()+'</span></div>').join("");
  let bl=rows.filter(r=>r.verdict==="Blunder").length,mi=rows.filter(r=>r.verdict==="Mistake").length,ina=rows.filter(r=>r.verdict==="Inaccuracy").length;
  $("coachNote").textContent=bl+mi+ina===0?"Very clean game by this engine's evaluation.":"Review the critical swings: "+bl+" blunders, "+mi+" mistakes and "+ina+" inaccuracies. Compare each move with the engine's suggested continuation.";
  status("Analysis complete.");
 }catch(e){status(e.message,true);$("progressText").textContent=e.message;}finally{$("analyse").disabled=false;}
};
$("findGames").onclick=async()=>{
 let u=$("username").value.trim().toLowerCase();if(!/^[a-z0-9_-]{3,25}$/.test(u)){status("Enter a valid Chess.com username.",true);return;}
 $("gamePicker").textContent="Looking up public games…";status("Contacting Chess.com public API…");
 try{
  let r=await fetch("https://api.chess.com/pub/player/"+encodeURIComponent(u)+"/games/archives");if(!r.ok)throw new Error(r.status===404?"Username not found.":"Chess.com returned "+r.status);
  let a=(await r.json()).archives||[];a=a.slice(-6).reverse();let games=[];
  for(let url of a){let x=await fetch(url);if(x.ok){let d=await x.json();games.push(...(d.games||[]).reverse());}if(games.length>=30)break;}
  games=games.slice(0,30);if(!games.length)throw new Error("No recent public games found.");
  $("gamePicker").innerHTML=games.map((g,i)=>{let w=g.white||{},b=g.black||{},date=g.end_time?new Date(g.end_time*1000).toLocaleDateString():"Date unknown",result=(w.username||"White")+" "+(w.result==="win"?"1–0":b.result==="win"?"0–1":"½–½")+" "+(b.username||"Black");return '<button class="game-option" data-game="'+i+'"><span><b>'+result+'</b><br><small>'+(g.time_class||"game")+' · '+date+'</small></span><span>Import →</span></button>';}).join("");
  $("gamePicker").querySelectorAll("button").forEach(btn=>btn.onclick=()=>{let g=games[Number(btn.dataset.game)];try{parseGame(g.pgn,{title:g.white.username+" vs "+g.black.username,white:g.white.username,black:g.black.username});status("Chess.com game imported.");}catch(e){status(e.message,true);}});
  status("Found "+games.length+" recent public games for "+u+".");
 }catch(e){$("gamePicker").textContent=e.message;status(e.message,true);}
};
window.addEventListener("resize",()=>{if(state.evals.length)chart(state.evals);});
