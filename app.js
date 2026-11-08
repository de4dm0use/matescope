import { Chess } from "chess.js";

const $ = id => document.getElementById(id);
const LIBRARY_KEY = "matescope.library.v1";
const state = {
  moves: [], positions: [], cursor: 0, worker: null, ready: false, currentSearch: null,
  evals: [], rows: [], pgn: "", headers: {}, bestLines: [], arrowUci: null,
  exploreGame: null, exploreBaseFen: null, trainingGame: null, training: [],
  trainingIndex: 0, trainingMode: false, trainingSolved: new Set(), selectedSquare: null,
  flipped: false, openingFen: null, openingData: null, analysisDepth: 13
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
}
function status(message, bad=false) {
  $("importStatus").textContent = message;
  $("importStatus").classList.toggle("error", bad);
}
function readLibrary() {
  try { const data = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]"); return Array.isArray(data) ? data : []; }
  catch { return []; }
}
function writeLibrary(items) {
  try { localStorage.setItem(LIBRARY_KEY, JSON.stringify(items.slice(0,100))); return true; }
  catch { status("Browser storage is full or unavailable. Export your PGN to keep a copy.", true); return false; }
}
function readTrainingBook() {
  try { return JSON.parse(localStorage.getItem("matescope.training.v1") || "{}"); }
  catch { return {}; }
}
function trainingKey(puzzle) { return puzzle.fen + "|" + puzzle.best; }
function trainingRecord(puzzle) {
  const book=readTrainingBook();
  return book[trainingKey(puzzle)] || {attempts:0,correct:0,solved:false};
}
function recordTrainingAttempt(puzzle,correct) {
  const book=readTrainingBook(),key=trainingKey(puzzle);
  const record=book[key] || {attempts:0,correct:0,solved:false};
  record.attempts++;
  if(correct){record.correct++;record.solved=true;}
  record.lastAttempt=Date.now();book[key]=record;
  try{localStorage.setItem("matescope.training.v1",JSON.stringify(book));}catch{}
  return record;
}
function updateTrainingHistory(puzzle,record) {
  $("trainingHistory").textContent="Saved progress · "+record.attempts+" legal attempts · "+record.correct+" correct · "+(record.solved?"solved before":"not solved yet");
}
function currentFen() {
  if (state.trainingMode && state.trainingGame) return state.trainingGame.fen();
  if (state.exploreGame) return state.exploreGame.fen();
  return state.positions[state.cursor] || new Chess().fen();
}
function uciToSan(fen, uci) {
  if (!uci || uci === "(none)" || uci === "0000") return "—";
  try {
    const game = new Chess(fen);
    return game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4] || "q"}).san;
  } catch { return uci; }
}
function lineToSan(fen, pv) {
  const game = new Chess(fen), result = [];
  for (const uci of (pv || [])) {
    try { result.push(game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4] || "q"}).san); }
    catch { break; }
  }
  return result;
}
function moveDescription(fen, uci) {
  if (!uci || uci === "(none)") return "No legal continuation was returned.";
  try {
    const game = new Chess(fen);
    const move = game.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4] || "q"});
    const notes = [];
    if (move.captured) notes.push("captures a " + ({p:"pawn",n:"knight",b:"bishop",r:"rook",q:"queen"}[move.captured] || "piece"));
    if (move.promotion) notes.push("promotes to a " + move.promotion);
    if (game.isCheckmate()) notes.push("delivers checkmate");
    else if (game.isCheck()) notes.push("gives check");
    return notes.length ? notes.join(" and ") : "improves the position through its longer-term consequences";
  } catch { return "The engine's preferred continuation."; }
}
function phaseForFen(fen, ply) {
  if (ply <= 20) return "Opening";
  try {
    const board = new Chess(fen).board();
    let queens = 0, material = 0;
    const values = {p:1,n:3,b:3,r:5,q:9};
    board.flat().forEach(p => { if (p) { material += values[p.type] || 0; if (p.type === "q") queens++; } });
    return queens === 0 && material <= 28 ? "Endgame" : "Middlegame";
  } catch { return "Middlegame"; }
}
function classify(loss) {
  return loss <= 18 ? "Best" : loss <= 45 ? "Excellent" : loss <= 90 ? "Good" : loss <= 160 ? "Inaccuracy" : loss <= 300 ? "Mistake" : "Blunder";
}
function moveAccuracy(loss) { return Math.max(0, 100 * Math.exp(-Math.max(0, loss) / 400)); }
function formatScore(score) {
  if (score >= 9900) return "+M" + Math.max(1,10000-score);
  if (score <= -9900) return "-M" + Math.max(1,10000+score);
  const n = score / 100;
  return (n > 0 ? "+" : "") + n.toFixed(2);
}
function pieceSvg(color, type) {
  const shapes = {
    k: '<path d="M48 7V22M40.5 14.5H55.5" class="piece-cross"/><path d="M33 29Q28 25 32 20Q36 17 40 23L48 28L56 23Q61 17 65 20Q69 25 63 29L60 38Q70 43 71 58L77 70H19L25 58Q26 43 36 38Z" class="piece-body"/><path d="M29 51H67M25 61H71" class="piece-detail"/>',
    q: '<path d="M24 32L19 18L34 27L48 12L62 27L77 18L72 32L65 58Q48 66 31 58Z" class="piece-body"/><circle cx="19" cy="15" r="5" class="piece-jewel"/><circle cx="48" cy="9" r="5" class="piece-jewel"/><circle cx="77" cy="15" r="5" class="piece-jewel"/><path d="M30 43Q48 50 66 43M34 59L29 69H67L62 59" class="piece-detail"/>',
    r: '<path d="M23 14H34V23H42V14H54V23H62V14H73V37L67 43L72 68H24L29 43L23 37Z" class="piece-body"/><path d="M30 42H66M34 50H62M29 61H67" class="piece-detail"/>',
    b: '<path d="M48 10Q31 20 34 34Q36 43 43 47L30 65H66L53 47Q61 42 62 34Q65 20 48 10Z" class="piece-body"/><path d="M40 22L55 38M34 59H62" class="piece-detail"/><circle cx="48" cy="12" r="4" class="piece-jewel"/>',
    n: '<path d="M23 69L27 55Q22 45 28 34L38 21L36 12L48 17L58 13L70 25L65 34L72 48L67 69Z" class="piece-body"/><path d="M37 28Q47 20 59 30L52 39L40 39M48 47Q57 52 65 48M31 60H68" class="piece-detail"/><circle cx="54" cy="28" r="2.8" class="piece-eye"/>',
    p: '<circle cx="48" cy="22" r="11" class="piece-body"/><path d="M39 34Q35 41 37 48L29 63H67L59 48Q61 41 57 34Z" class="piece-body"/><path d="M37 49H59M32 60H64" class="piece-detail"/>'
  };
  const tone = color === "w" ? "white" : "black";
  return '<svg class="piece-svg '+tone+'" viewBox="0 0 96 82" aria-hidden="true" focusable="false"><g stroke-linejoin="round" stroke-linecap="round">'+
    shapes[type]+'<path d="M18 69H78L82 77H14Z" class="piece-base"/><path d="M23 70H73" class="piece-detail"/></g></svg>';
}
function parseGame(pgn, extra={}) {
  const game = new Chess();
  try { game.loadPgn(pgn, {strict:false}); } catch (e) { throw new Error("Could not read PGN: " + e.message); }
  const moves = game.history({verbose:true});
  if (!moves.length) throw new Error("No moves found in that PGN.");
  const replay = new Chess(), positions = [replay.fen()];
  moves.forEach(move => { replay.move(move); positions.push(replay.fen()); });
  const headers = game.getHeaders();
  state.moves = moves; state.positions = positions; state.cursor = 0; state.evals = []; state.rows = []; state.flipped = false;
  state.pgn = pgn; state.headers = headers; state.bestLines = []; state.arrowUci = null;
  state.exploreGame = null; state.trainingGame = null; state.trainingMode = false; state.selectedSquare = null;
  $("workspace").classList.remove("hidden");
  $("gameTitle").textContent = extra.title || headers.Event || "Imported game";
  $("gameMeta").textContent = [headers.Date,headers.ECO,headers.Opening,headers.TimeControl].filter(Boolean).join(" · ") || "Imported PGN game";
  $("whiteName").textContent = headers.White || extra.white || "White";
  $("blackName").textContent = headers.Black || extra.black || "Black";
  $("whiteRating").textContent = headers.WhiteElo ? "Rating " + headers.WhiteElo : "—";
  $("blackRating").textContent = headers.BlackElo ? "Rating " + headers.BlackElo : "—";
  $("openingName").textContent = headers.Opening || "Looking up opening…";
  $("openingEco").textContent = headers.ECO ? "ECO " + headers.ECO : "Lichess opening database";
  $("moveCount").textContent = moves.length + " plies";
  ["whiteAccuracy","blackAccuracy","biggestSwing"].forEach(id => $(id).textContent = "—");
  $("whiteCounts").textContent = $("blackCounts").textContent = "Awaiting analysis";
  $("verdicts").innerHTML = '<div class="empty-state">Start engine analysis to see move classifications.</div>';
  $("coachNote").textContent = "Your review will highlight critical moments, missed opportunities and best continuations.";
  $("coachDetails").innerHTML = "";
  $("progressWrap").classList.add("hidden");
  $("trainingPanel").classList.add("hidden");
  $("phaseReport").innerHTML = '<div class="empty-state">Run game analysis to compare your opening, middlegame and endgame.</div>';
  $("variationsList").innerHTML = '<div class="empty-state">Analyse a position to see the engine’s top continuations.</div>';
  $("openingResults").innerHTML = '<div class="empty-state">Looking up opening data…</div>';
  $("librarySaveState").textContent = "";
  renderMoves(); renderBoard();
  $("workspace").scrollIntoView({behavior:"smooth",block:"start"});
  const openingPly = Math.min(8, moves.length);
  state.openingFen = positions[openingPly];
  lookupOpening(state.openingFen, true);
}
function renderMoves() {
  let html = "";
  for (let i=0; i<state.moves.length; i+=2) {
    const white = state.moves[i], black = state.moves[i+1];
    html += '<div class="move-pair"><span class="move-no">'+(i/2+1)+'.</span><button class="move-cell" data-ply="'+(i+1)+'">'+esc(white.san)+'</button><button class="move-cell" data-ply="'+(i+2)+'">'+(black?esc(black.san):"")+'</button></div>';
  }
  $("moveList").innerHTML = html;
  $("moveList").querySelectorAll("button").forEach(button => button.onclick = () => {
    if (state.trainingMode) endTraining();
    state.exploreGame = null; state.arrowUci = null;
    state.cursor = Number(button.dataset.ply); renderBoard();
  });
}
function renderBoard() {
  const boardEl = $("board");
  const activeGame = state.trainingMode ? state.trainingGame : state.exploreGame;
  const board = activeGame ? activeGame.board() : new Chess(currentFen()).board();
  const history = activeGame ? activeGame.history({verbose:true}) : state.moves.slice(0,state.cursor);
  const last = history.length ? history[history.length-1] : null;
  const legalTargets = new Set();
  if (activeGame && state.selectedSquare) {
    activeGame.moves({square:state.selectedSquare,verbose:true}).forEach(move => legalTargets.add(move.to));
  }
  boardEl.innerHTML = "";
  for (let r=0; r<8; r++) for (let c=0; c<8; c++) {
    const rank = state.flipped ? 7-r : r;
    const file = state.flipped ? 7-c : c;
    const p = board[rank][file];
    const name = "abcdefgh"[file] + (8-rank);
    const sq = document.createElement("button");
    sq.type = "button"; sq.className = "square " + ((r+c)%2 ? "dark" : "light");
    sq.dataset.square = name; sq.setAttribute("aria-label", name + (p ? " " + (p.color==="w"?"white ":"black ") + ({k:"king",q:"queen",r:"rook",b:"bishop",n:"knight",p:"pawn"}[p.type]) : " empty"));
    if (last && (last.from===name || last.to===name)) sq.classList.add("last");
    if (state.selectedSquare === name) sq.classList.add("selected");
    if (legalTargets.has(name)) sq.classList.add("legal-target");
    if (p) sq.innerHTML += pieceSvg(p.color,p.type);
    if (c===0) sq.innerHTML += '<span class="coord">'+(8-rank)+'</span>';
    if (r===7) sq.innerHTML += '<span class="coord file-coord">'+ "abcdefgh"[file] +'</span>';
    const interactive = !!activeGame && p && p.color===activeGame.turn();
    sq.draggable = !!interactive;
    sq.addEventListener("click", () => handleSquareClick(name));
    if (interactive) {
      sq.addEventListener("dragstart", e => { state.dragFrom=name; e.dataTransfer.setData("text/plain",name); e.dataTransfer.effectAllowed="move"; });
    }
    if (activeGame) {
      sq.addEventListener("dragover", e => e.preventDefault());
      sq.addEventListener("drop", e => { e.preventDefault(); const from=e.dataTransfer.getData("text/plain")||state.dragFrom; if(from)attemptBoardMove(from,name); });
    }
    boardEl.appendChild(sq);
  }
  renderArrow();
  const inTraining = state.trainingMode;
  $("firstMove").disabled = $("prevMove").disabled = inTraining || !!state.exploreGame || state.cursor===0;
  $("lastMove").disabled = $("nextMove").disabled = inTraining || !!state.exploreGame || state.cursor===state.moves.length;
  if (inTraining) $("moveCounter").textContent = "Puzzle " + (state.trainingIndex+1) + " of " + state.training.length;
  else if (state.exploreGame) $("moveCounter").textContent = "Explore · " + state.exploreGame.history().length + " moves";
  else $("moveCounter").textContent = state.cursor===0 ? "Start position" : "Move "+Math.ceil(state.cursor/2)+" · "+(state.cursor%2?"White":"Black")+" played";
  document.querySelectorAll(".move-cell").forEach(x => x.classList.toggle("active",!inTraining&&!state.exploreGame&&Number(x.dataset.ply)===state.cursor));
  $("undoExplore").disabled = !state.exploreGame || !state.exploreGame.history().length;
  $("resetExplore").disabled = !state.exploreGame;
  $("exitExplore").disabled = !state.exploreGame;
  $("explorePosition").disabled = inTraining;
  if (!state.exploreGame) $("boardModeStatus").textContent = inTraining ? "Solve the position by playing the engine’s best move." : "Review mode · select a move or explore a position.";
  if (state.evals[state.cursor] !== undefined && !inTraining && !state.exploreGame) updateEval(state.evals[state.cursor]);
}
function renderArrow() {
  const overlay = $("boardOverlay");
  if (!state.arrowUci || state.trainingMode || state.exploreGame || state.arrowUci.length<4) { overlay.innerHTML=""; return; }
  const point = square => {
    let file="abcdefgh".indexOf(square[0]), rank=8-Number(square[1]);
    if(state.flipped){file=7-file;rank=7-rank;}
    return {x:file+0.5,y:rank+0.5};
  };
  const a=point(state.arrowUci.slice(0,2)), b=point(state.arrowUci.slice(2,4));
  overlay.innerHTML='<defs><marker id="bestArrowHead" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0 0L5 2.5L0 5Z" fill="#ffd16c"/></marker></defs><path d="M'+a.x+' '+a.y+' L'+b.x+' '+b.y+'" class="best-arrow" marker-end="url(#bestArrowHead)"/>';
}
function handleSquareClick(square) {
  const game = state.trainingMode ? state.trainingGame : state.exploreGame;
  if (!game) return;
  if (!state.selectedSquare) {
    const piece = game.get(square);
    if (piece && piece.color===game.turn()) { state.selectedSquare=square; renderBoard(); }
    return;
  }
  if (state.selectedSquare===square) { state.selectedSquare=null; renderBoard(); return; }
  const target=game.get(square);
  if (target && target.color===game.turn()) { state.selectedSquare=square; renderBoard(); return; }
  attemptBoardMove(state.selectedSquare,square);
}
function attemptBoardMove(from,to) {
  const game = state.trainingMode ? state.trainingGame : state.exploreGame;
  if (!game) return;
  let move;
  try { move=game.move({from,to,promotion:"q"}); } catch { move=null; }
  state.selectedSquare=null;
  if (!move) { renderBoard(); return; }
  if (state.trainingMode) {
    const uci=move.from+move.to+(move.promotion||"");
    const puzzle=state.training[state.trainingIndex];
    if (uci!==puzzle.best) {
      game.undo(); const record=recordTrainingAttempt(puzzle,false);
      $("trainingMessage").textContent="That move is legal, but it is not the engine’s best move. Try again.";
      updateTrainingHistory(puzzle,record);renderBoard();return;
    }
    state.trainingSolved.add(state.trainingIndex);
    const record=recordTrainingAttempt(puzzle,true);
    $("trainingMessage").textContent="Correct. "+puzzle.bestSan+" is the best move. " + (puzzle.bestReason || "");
    $("trainingContinuation").textContent=puzzle.bestLineSan ? "Suggested continuation: "+puzzle.bestLineSan.join(" ") : "";
    updateTrainingHistory(puzzle,record);$("nextPuzzle").disabled=false;
  } else {
    $("boardModeStatus").textContent="Exploration line: "+game.history().join(" ");
  }
  renderBoard();
}
function updateEval(cp) {
  const n=Math.max(-10,Math.min(10,cp/100));
  $("evalNumber").textContent=formatScore(cp);
  $("evalCaption").textContent=n>.15?"White is better":n<-.15?"Black is better":"The position is roughly balanced";
  $("evalText").textContent=(n>0?"+":"")+n.toFixed(1);
  $("evalFill").style.height=Math.max(3,Math.min(97,50+n*4.7))+"%";
}
function chart(values) {
  const canvas=$("evalChart"),ctx=canvas.getContext("2d"),w=canvas.clientWidth||500,h=canvas.clientHeight||105,d=window.devicePixelRatio||1;
  canvas.width=w*d;canvas.height=h*d;ctx.scale(d,d);ctx.clearRect(0,0,w,h);
  ctx.strokeStyle="#304052";ctx.setLineDash([3,4]);ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();ctx.setLineDash([]);
  if(values.length<2)return;
  ctx.beginPath();values.forEach((v,i)=>{const px=i/(values.length-1)*w,py=h/2-Math.max(-1000,Math.min(1000,v))/2000*h;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
  ctx.strokeStyle="#80d6b0";ctx.lineWidth=2;ctx.stroke();
}
function engineMessage(line) {
  if (line==="uciok") {
    state.ready=true;$("engineState").classList.add("ready");$("engineState").innerHTML="<i></i> Stockfish ready";
  }
  if (line.startsWith("info ") && state.currentSearch) {
    const m=line.match(/depth (\d+).*?score (cp|mate) (-?\d+)/);
    if(m) {
      const depth=Number(m[1]),raw=Number(m[3]),side=state.currentSearch.side;
      const numeric=m[2]==="mate"?(raw>0?10000-Math.min(99,Math.abs(raw)): -10000+Math.min(99,Math.abs(raw))):raw;
      const score=side==="b"?-numeric:numeric;
      const mp=line.match(/multipv (\d+)/),index=mp?Number(mp[1]):1;
      const pvMatch=line.match(/ pv (.+)$/);
      const pv=(pvMatch?.[1]||"").trim().split(/\s+/).filter(Boolean);
      const old=state.currentSearch.lines.get(index);
      if(!old||depth>=old.depth)state.currentSearch.lines.set(index,{index,depth,score,pv,uci:pv[0]||""});
    }
  }
  if (line.startsWith("bestmove ") && state.currentSearch) {
    const pending=state.currentSearch;state.currentSearch=null;
    const best=line.split(/\s+/)[1],lines=[...pending.lines.values()].sort((a,b)=>a.index-b.index);
    if(!lines.length)lines.push({index:1,depth:0,score:0,pv:best&&best!=="(none)"?[best]:[],uci:best});
    if(!lines[0].uci&&best&&best!=="(none)"){lines[0].uci=best;lines[0].pv=[best];}
    pending.resolve({best,score:lines[0].score,lines});
  }
}
async function ensureEngine() {
  if(!state.worker) {
    state.ready=false;
    const workerUrl=new URL("./engine/stockfish-19-lite-single.js",import.meta.url);
    state.worker=new Worker(workerUrl);
    state.worker.onmessage=e=>engineMessage(String(e.data));
    state.worker.onerror=e=>{
      status("Stockfish worker error: "+(e.message||"engine failed to load"),true);
      if(state.currentSearch){state.currentSearch.reject?.(new Error("Stockfish worker failed."));state.currentSearch=null;}
      state.worker?.terminate();state.worker=null;state.ready=false;
    };
    state.worker.postMessage("uci");
  }
  for(let i=0;i<300&&!state.ready;i++)await new Promise(resolve=>setTimeout(resolve,100));
  if(!state.ready)throw new Error("Local Stockfish did not answer within 30 seconds. Check the engine files in the repository.");
}
function search(fen,depth,multiPv=1) {
  return new Promise((resolve,reject)=>{
    if(!state.worker||!state.ready){reject(new Error("Stockfish is not ready."));return;}
    const side=fen.split(" ")[1]||"w";
    state.currentSearch={resolve,reject,side,lines:new Map()};
    state.worker.postMessage("setoption name MultiPV value "+multiPv);
    state.worker.postMessage("position fen "+fen);
    state.worker.postMessage("go depth "+depth);
  });
}
function pvText(fen,pv) { return lineToSan(fen,pv).join(" "); }
function renderVariations(fen) {
  if(!state.bestLines.length){$("variationsList").innerHTML='<div class="empty-state">No engine lines yet. Run position analysis.</div>';return;}
  $("variationsList").innerHTML=state.bestLines.map((line,i)=>{
    const san=pvText(fen,line.pv);
    return '<button class="variation-row" data-line="'+i+'"><span class="variation-rank">'+(i+1)+'</span><span class="variation-main"><b>'+esc(san||uciToSan(fen,line.uci))+'</b><small>Depth '+line.depth+' · '+esc(formatScore(line.score))+'</small></span><span class="variation-play">Play line →</span></button>';
  }).join("");
  $("variationsList").querySelectorAll("button").forEach(button=>button.onclick=()=>{
    const line=state.bestLines[Number(button.dataset.line)];
    startExploreFromLine(fen,line.pv);
  });
}
function startExploreFromLine(fen,pv) {
  state.trainingMode=false;state.trainingGame=null;state.exploreBaseFen=fen;state.exploreGame=new Chess(fen);state.selectedSquare=null;
  for(const uci of pv||[]) {
    try{state.exploreGame.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"});}catch{break;}
  }
  $("boardModeStatus").textContent="Showing an engine variation. Use Undo or Reset to explore it.";
  renderBoard();
}
function renderPhaseReport() {
  const phases=["Opening","Middlegame","Endgame"];
  const html=phases.map(phase=>{
    const rows=state.rows.filter(row=>row.phase===phase);
    const byColor={w:rows.filter(r=>r.color==="w"),b:rows.filter(r=>r.color==="b")};
    const avg=list=>list.length?(list.reduce((sum,r)=>sum+moveAccuracy(r.loss),0)/list.length).toFixed(1)+"%":"—";
    const errors=rows.filter(r=>r.verdict==="Blunder"||r.verdict==="Mistake").length;
    return '<div class="phase-card"><span>'+phase.toUpperCase()+'</span><strong>'+rows.length+' moves</strong><div class="phase-sides"><small>White <b>'+avg(byColor.w)+'</b></small><small>Black <b>'+avg(byColor.b)+'</b></small></div><small>'+errors+' mistakes / blunders</small></div>';
  }).join("");
  $("phaseReport").innerHTML=html||'<div class="empty-state">No phase data available.</div>';
}
function coachForRow(row) {
  const moveName=Math.ceil(row.ply/2)+(row.color==="w"?".":"...");
  const sideName=row.color==="w"?"White":"Black";
  const bestWhy=moveDescription(state.positions[row.ply-1],row.best);
  const replyWhy=row.reply?moveDescription(state.positions[row.ply],row.reply):"";
  $("coachNote").textContent=sideName+" played "+row.move+" ("+row.verdict.toLowerCase()+"). Stockfish preferred "+row.bestSan+", which "+bestWhy+".";
  const reply=row.replySan&&row.replySan!=="—"?" After the played move, the engine's strongest reply was "+row.replySan+", which "+replyWhy+".":"";
  const continuation=row.bestLineSan&&row.bestLineSan.length?" Engine line: "+row.bestLineSan.join(" ")+".":"";
  $("coachDetails").innerHTML='<div class="coach-detail"><span>MOVE</span><b>'+moveName+' '+esc(row.move)+'</b></div><div class="coach-detail"><span>ENGINE CHOICE</span><b>'+esc(row.bestSan)+'</b><small>'+esc(bestWhy)+'</small></div><div class="coach-detail"><span>AFTER YOUR MOVE</span><b>'+esc(row.replySan||"No reply recorded")+'</b><small>'+esc(replyWhy||"")+'</small></div><p class="coach-explanation">Estimated evaluation loss: '+Math.round(row.loss)+' centipawns.'+esc(reply)+esc(continuation)+'</p>';
}
function renderVerdicts() {
  if(!state.rows.length){$("verdicts").innerHTML='<div class="empty-state">Start engine analysis to see move classifications.</div>';return;}
  $("verdicts").innerHTML=state.rows.map(row=>'<button class="verdict" data-ply="'+row.ply+'"><span class="move">'+Math.ceil(row.ply/2)+(row.color==="w"?".":"...")+" "+esc(row.move)+'</span><small>'+Math.round(row.loss)+' cp · '+moveAccuracy(row.loss).toFixed(0)+'% score</small><span class="best-line">Best: <b>'+esc(row.bestSan)+'</b></span><span class="tag '+row.verdict.toLowerCase()+'">'+row.verdict.toUpperCase()+'</span></button>').join("");
  $("verdicts").querySelectorAll("button").forEach(button=>button.onclick=()=>{
    const row=state.rows.find(r=>r.ply===Number(button.dataset.ply));
    if(!row)return;
    endExplore();if(state.trainingMode)endTraining();
    state.cursor=row.ply-1;state.arrowUci=row.best;renderBoard();coachForRow(row);
  });
}
function buildTraining() {
  state.training=state.rows.filter(row=>row.verdict==="Blunder"||row.verdict==="Mistake"||row.verdict==="Inaccuracy").sort((a,b)=>b.loss-a.loss).map(row=>({
    ply:row.ply,move:row.move,color:row.color,fen:state.positions[row.ply-1],best:row.best,bestSan:row.bestSan,
    loss:row.loss,bestLineSan:(row.bestLineSan||[]).slice(1),bestReason:moveDescription(state.positions[row.ply-1],row.best)
  }));
  $("trainingCount").textContent=state.training.length+" positions from this game";
  $("trainingPanel").classList.toggle("hidden",!state.training.length);
  $("startTraining").textContent="Start training";
  $("exitTraining").disabled=true;
  $("nextPuzzle").disabled=true;
}
function renderAnalysis() {
  if(!state.rows.length)return;
  const avg=list=>list.length?list.reduce((sum,row)=>sum+moveAccuracy(row.loss),0)/list.length:0;
  const white=state.rows.filter(r=>r.color==="w"),black=state.rows.filter(r=>r.color==="b");
  $("whiteAccuracy").textContent=avg(white).toFixed(1)+"%";
  $("blackAccuracy").textContent=avg(black).toFixed(1)+"%";
  const counts=(rows)=>rows.filter(r=>r.verdict==="Blunder").length+" blunders · "+rows.filter(r=>r.verdict==="Mistake").length+" mistakes · "+rows.filter(r=>r.verdict==="Inaccuracy").length+" inaccuracies";
  $("whiteCounts").textContent=counts(white);$("blackCounts").textContent=counts(black);
  const worst=[...state.rows].sort((a,b)=>b.loss-a.loss)[0];
  $("biggestSwing").textContent=worst?Math.round(worst.loss)+" cp · "+Math.ceil(worst.ply/2)+(worst.color==="w"?".":"..."):"—";
  renderVerdicts();renderPhaseReport();buildTraining();chart(state.evals);
  const bl=state.rows.filter(r=>r.verdict==="Blunder").length,mi=state.rows.filter(r=>r.verdict==="Mistake").length,ina=state.rows.filter(r=>r.verdict==="Inaccuracy").length;
  $("coachNote").textContent=bl+mi+ina===0?"Very clean game at this engine depth. Select any move verdict for a detailed explanation.":"This game contains "+bl+" blunders, "+mi+" mistakes and "+ina+" inaccuracies. Select a verdict to see the engine's preferred move and strongest reply.";
  $("coachDetails").innerHTML="";
  if(state.cursor<state.evals.length)updateEval(state.evals[state.cursor]);
}
async function analyseGame() {
  if(!state.moves.length||$("analyse").disabled||$("analysePosition").disabled)return;
  if(state.trainingMode)endTraining();
  if(state.exploreGame)endExplore();
  $("analyse").disabled=true;$("analysePosition").disabled=true;$("progressWrap").classList.remove("hidden");$("progressBar").style.width="0%";
  state.analysisDepth=Number($("depth").value)||13;
  try {
    status("Starting local Stockfish engine…");await ensureEngine();
    const depth=state.analysisDepth;
    let previous=await search(state.positions[0],depth,1),values=[previous.score],rows=[];
    for(let i=0;i<state.moves.length;i++) {
      const move=state.moves[i],next=await search(state.positions[i+1],depth,1);
      let loss=move.color==="w"?previous.score-next.score:next.score-previous.score;
      loss=Math.max(0,loss);
      const bestLine=previous.lines[0]?.pv||[previous.best];
      rows.push({
        ply:i+1,move:move.san,color:move.color,loss,verdict:classify(loss),best:previous.best,
        bestSan:uciToSan(state.positions[i],previous.best),reply:next.best,
        replySan:uciToSan(state.positions[i+1],next.best),phase:phaseForFen(state.positions[i],i+1),
        bestLine,bestLineSan:lineToSan(state.positions[i],bestLine)
      });
      values.push(next.score);previous=next;
      $("progressBar").style.width=Math.round((i+1)/state.moves.length*100)+"%";
      $("progressText").textContent="Analysing move "+(i+1)+" of "+state.moves.length+" · depth "+depth;
    }
    state.evals=values;state.rows=rows;state.arrowUci=null;renderAnalysis();renderBoard();
    status("Analysis complete. "+rows.length+" moves reviewed.");
    const saved=readLibrary().find(item=>item.pgn===state.pgn);
    if(saved)saveCurrentGame(true);
  } catch(error) {
    status(error.message||"Analysis failed.",true);$("progressText").textContent=error.message||"Analysis failed.";
  } finally { $("analyse").disabled=false;$("analysePosition").disabled=false; }
}
async function analysePosition() {
  if($("analyse").disabled||$("analysePosition").disabled)return;
  $("analysePosition").disabled=true;$("analyse").disabled=true;
  try {
    await ensureEngine();
    const fen=currentFen(),result=await search(fen,Number($("depth").value)||13,3);
    state.bestLines=result.lines;state.arrowUci=result.best;renderVariations(fen);renderBoard();
    status("Position analysed. Top engine continuations are shown beside the board.");
  } catch(error){status(error.message,true);}
  finally{$("analysePosition").disabled=false;$("analyse").disabled=false;}
}
async function lookupOpening(fen,quiet=false) {
  if(!fen)return;
  state.openingFen=fen;
  $("openingResults").innerHTML='<div class="empty-state">Querying Lichess opening explorer…</div>';
  try {
    const params=new URLSearchParams({variant:"chess",fen,moves:"8",topGames:"0",recentGames:"0"});
    const response=await fetch("https://explorer.lichess.org/masters?"+params.toString(),{headers:{Accept:"application/json"}});
    if(!response.ok)throw new Error("Opening database returned HTTP "+response.status);
    const data=await response.json();state.openingData=data;
    if(data.opening?.name) {
      $("openingName").textContent=data.opening.name;
      $("openingEco").textContent=data.opening.eco?"ECO "+data.opening.eco+" · Lichess Masters":"Lichess Masters database";
    } else if(!quiet) $("openingName").textContent="Unclassified position";
    const total=(data.white||0)+(data.draws||0)+(data.black||0);
    const pct=n=>total?Math.round(100*n/total)+"%":"—";
    let html='<div class="opening-stats"><span>'+total.toLocaleString()+' master games</span><span>White '+pct(data.white||0)+'</span><span>Draw '+pct(data.draws||0)+'</span><span>Black '+pct(data.black||0)+'</span></div>';
    if(data.moves?.length) {
      html+='<div class="opening-moves">'+data.moves.slice(0,8).map(move=>{
        const n=move.white+move.draws+move.black,rate=n?Math.round(100*n/Math.max(1,total))+"%":"";
        return '<button class="opening-move" data-uci="'+esc(move.uci)+'"><b>'+esc(move.san)+'</b><small>'+rate+' of games</small></button>';
      }).join("")+'</div>';
      $("openingResults").innerHTML=html;
      $("openingResults").querySelectorAll("button").forEach(button=>button.onclick=()=>{
        const base=state.openingFen;state.trainingMode=false;state.trainingGame=null;
        state.exploreBaseFen=base;state.exploreGame=new Chess(base);
        const uci=button.dataset.uci;
        try{state.exploreGame.move({from:uci.slice(0,2),to:uci.slice(2,4),promotion:uci[4]||"q"});$("boardModeStatus").textContent="Opening explorer: playing "+button.querySelector("b").textContent+" from this position.";renderBoard();}
        catch(error){status("Could not play this opening move.",true);}
      });
    } else {
      html+='<div class="empty-state">No master-game continuations were found for this exact position.</div>';$("openingResults").innerHTML=html;
    }
    if(!quiet)status("Opening explorer updated from the Lichess Masters database.");
  } catch(error) {
    $("openingResults").innerHTML='<div class="empty-state">Opening lookup unavailable. Check your connection and try again. '+esc(error.message)+'</div>';
    if(!quiet)status("Could not reach the Lichess opening database.",true);
  }
}
function startExplore() {
  if(!state.moves.length)return;
  if(state.trainingMode)endTraining();
  state.exploreBaseFen=currentFen();state.exploreGame=new Chess(state.exploreBaseFen);state.selectedSquare=null;state.arrowUci=null;
  $("boardModeStatus").textContent="Explore mode · click or drag pieces to test legal moves.";
  renderBoard();
}
function endExplore() {
  state.exploreGame=null;state.exploreBaseFen=null;state.selectedSquare=null;
}
function endTraining() {
  state.trainingMode=false;state.trainingGame=null;state.selectedSquare=null;
  state.flipped=state.savedFlip??state.flipped;
  $("trainingPanel").classList.remove("hidden");
  $("trainingMessage").textContent="Training paused. Start training to practise these positions again.";
  $("trainingContinuation").textContent="";
  $("startTraining").textContent="Start training";
  $("exitTraining").disabled=true;
  $("nextPuzzle").disabled=true;
  renderBoard();
}
function startTraining(index=0) {
  if(!state.training.length){status("No mistakes are available to practise. Analyse the game first.");return;}
  if(!state.trainingMode)state.savedFlip=state.flipped;
  state.trainingIndex=Math.max(0,Math.min(index,state.training.length-1));
  state.trainingMode=true;state.exploreGame=null;state.selectedSquare=null;
  const puzzle=state.training[state.trainingIndex];
  state.trainingGame=new Chess(puzzle.fen);state.flipped=puzzle.color==="b";
  $("trainingPanel").classList.remove("hidden");
  $("startTraining").textContent="Restart";
  $("exitTraining").disabled=false;
  $("trainingPosition").textContent=(puzzle.color==="w"?"White":"Black")+" to move · original move "+Math.ceil(puzzle.ply/2);
  $("trainingMessage").textContent="Find the strongest move. The answer is hidden.";
  $("trainingContinuation").textContent="Engine loss on the original move: "+Math.round(puzzle.loss)+" cp.";
  updateTrainingHistory(puzzle,trainingRecord(puzzle));
  $("nextPuzzle").disabled=true;
  renderBoard();$("trainingPanel").scrollIntoView({behavior:"smooth",block:"nearest"});
}
function nextPuzzle() {
  if(state.trainingIndex+1>=state.training.length) {
    $("trainingMessage").textContent="Training set complete. You solved "+state.trainingSolved.size+" of "+state.training.length+" positions.";
    $("nextPuzzle").disabled=true;return;
  }
  startTraining(state.trainingIndex+1);
}
function saveCurrentGame(silent=false) {
  if(!state.pgn){status("Import a game before saving it.",true);return;}
  const library=readLibrary(),existing=library.findIndex(item=>item.pgn===state.pgn);
  const entry={
    id:existing>=0?library[existing].id:String(Date.now())+"-"+Math.random().toString(36).slice(2,7),
    title:$("gameTitle").textContent,white:$("whiteName").textContent,black:$("blackName").textContent,
    date:state.headers.Date||"",savedAt:Date.now(),pgn:state.pgn,
    analysis:state.rows.length?{rows:state.rows,evals:state.evals}:null
  };
  if(existing>=0)library.splice(existing,1);
  library.unshift(entry);
  if(writeLibrary(library)){renderLibrary();$("librarySaveState").textContent="Saved in this browser";if(!silent)status("Game saved to your local MateScope library.");}
}
function saveFetchedGames(games) {
  const library=readLibrary();let added=0;
  for(const game of games) {
    if(!game.pgn)continue;
    const white=game.white?.username||"White",black=game.black?.username||"Black";
    if(library.some(item=>item.pgn===game.pgn))continue;
    library.unshift({
      id:String(Date.now())+"-"+Math.random().toString(36).slice(2,8),
      title:white+" vs "+black,white,black,
      date:game.end_time?new Date(game.end_time*1000).toLocaleDateString():"",
      savedAt:Date.now(),pgn:game.pgn,analysis:null
    });
    added++;
  }
  if(writeLibrary(library)){renderLibrary();status("Saved "+added+" new games to your MateScope library.");}
}
function loadSavedGame(id) {
  const entry=readLibrary().find(item=>item.id===id);if(!entry)return;
  try {
    parseGame(entry.pgn,{title:entry.title,white:entry.white,black:entry.black});
    if(entry.analysis?.rows?.length){state.rows=entry.analysis.rows;state.evals=entry.analysis.evals||[];renderAnalysis();renderBoard();}
    status("Loaded "+entry.title+" from your local library.");
  } catch(error){status("Could not load saved game: "+error.message,true);}
}
function deleteSavedGame(id) {
  const items=readLibrary().filter(item=>item.id!==id);writeLibrary(items);renderLibrary();
}
function renderLibrary() {
  const items=readLibrary(),query=($("librarySearch")?.value||"").trim().toLowerCase();
  $("libraryCount").textContent=items.length+" saved games";
  const analysed=items.filter(item=>item.analysis?.rows?.length);
  const avg=[];
  analysed.forEach(item=>item.analysis.rows.forEach(row=>avg.push(moveAccuracy(row.loss))));
  $("libraryStats").textContent=items.length+" games · "+analysed.length+" analysed · "+(avg.length?(avg.reduce((a,b)=>a+b,0)/avg.length).toFixed(1)+"% average move score":"no saved analysis yet");
  const filtered=items.filter(item=>(item.title+" "+item.white+" "+item.black+" "+item.date).toLowerCase().includes(query));
  $("libraryList").innerHTML=filtered.length?filtered.map(item=>'<div class="library-item"><div class="library-game"><b>'+esc(item.white||"White")+' vs '+esc(item.black||"Black")+'</b><small>'+esc(item.title||"Imported game")+' · '+esc(item.date||new Date(item.savedAt).toLocaleDateString())+' · '+(item.analysis?.rows?.length?"Analysed":"PGN saved")+'</small></div><button class="library-open" data-load="'+esc(item.id)+'">Open</button><button class="library-delete" data-delete="'+esc(item.id)+'" aria-label="Delete saved game">×</button></div>').join(""):'<div class="empty-state">No saved games match. Save an imported game to build your library.</div>';
  $("libraryList").querySelectorAll("[data-load]").forEach(button=>button.onclick=()=>loadSavedGame(button.dataset.load));
  $("libraryList").querySelectorAll("[data-delete]").forEach(button=>button.onclick=()=>deleteSavedGame(button.dataset.delete));
}
function exportPgn() {
  if(!state.pgn){status("No game to export.",true);return;}
  const blob=new Blob([state.pgn],{type:"application/x-chess-pgn"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="matescope-game.pgn";a.click();URL.revokeObjectURL(url);
}
function setBoardTheme(theme) {
  document.body.dataset.boardTheme=theme;
  try{localStorage.setItem("matescope.boardTheme",theme);}catch{}
}

$("loadPgn").onclick=()=>{try{parseGame($("pgnInput").value);status("Game loaded. Ready to analyse.");}catch(error){status(error.message,true);}};
$("pgnFile").onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  const text=await file.text();$("pgnInput").value=text;
  try{parseGame(text);status("Loaded "+file.name);}catch(error){status(error.message,true);}
};
$("newGame").onclick=()=>{endExplore();if(state.trainingMode)endTraining();$("workspace").classList.add("hidden");window.scrollTo({top:0,behavior:"smooth"});};
$("firstMove").onclick=()=>{state.cursor=0;state.arrowUci=null;renderBoard();};
$("prevMove").onclick=()=>{state.cursor=Math.max(0,state.cursor-1);state.arrowUci=null;renderBoard();};
$("nextMove").onclick=()=>{state.cursor=Math.min(state.moves.length,state.cursor+1);state.arrowUci=null;renderBoard();};
$("lastMove").onclick=()=>{state.cursor=state.moves.length;state.arrowUci=null;renderBoard();};
document.querySelectorAll(".tab").forEach(button=>button.onclick=()=>{
  const tab=button.dataset.tab;
  document.querySelectorAll(".tab").forEach(item=>item.classList.toggle("active",item===button));
  $("pgnPane").classList.toggle("hidden",tab!=="pgn");$("chesscomPane").classList.toggle("hidden",tab!=="chesscom");
});
$("themeToggle").onclick=()=>document.body.classList.toggle("light");
$("analyse").onclick=analyseGame;
$("analysePosition").onclick=analysePosition;
$("lookupOpening").onclick=()=>lookupOpening(currentFen());
$("explorePosition").onclick=startExplore;
$("undoExplore").onclick=()=>{if(state.exploreGame){state.exploreGame.undo();state.selectedSquare=null;renderBoard();}};
$("resetExplore").onclick=()=>{if(state.exploreBaseFen){state.exploreGame=new Chess(state.exploreBaseFen);state.selectedSquare=null;renderBoard();}};
$("exitExplore").onclick=()=>{endExplore();renderBoard();};
$("flipBoard").onclick=()=>{state.flipped=!state.flipped;renderBoard();};
$("boardTheme").onchange=event=>setBoardTheme(event.target.value);
$("saveGame").onclick=()=>saveCurrentGame(false);
$("exportGame").onclick=exportPgn;
$("startTraining").onclick=()=>startTraining(0);
$("nextPuzzle").onclick=nextPuzzle;
$("exitTraining").onclick=endTraining;
$("librarySearch").oninput=renderLibrary;
$("findGames").onclick=async()=>{
  const username=$("username").value.trim().toLowerCase();
  if(!/^[a-z0-9_-]{3,25}$/.test(username)){status("Enter a valid Chess.com username.",true);return;}
  $("gamePicker").textContent="Looking up public games…";status("Contacting Chess.com public API…");
  try {
    const response=await fetch("https://api.chess.com/pub/player/"+encodeURIComponent(username)+"/games/archives");
    if(!response.ok)throw new Error(response.status===404?"Username not found.":"Chess.com returned "+response.status);
    let archives=(await response.json()).archives||[];archives=archives.slice(-6).reverse();let games=[];
    for(const url of archives){const result=await fetch(url);if(result.ok){const data=await result.json();games.push(...(data.games||[]).reverse());}if(games.length>=30)break;}
    games=games.slice(0,30);if(!games.length)throw new Error("No recent public games found.");
    $("gamePicker").innerHTML='<div class="bulk-save-row"><span>'+games.length+' recent public games found</span><button class="tool-button" id="saveAllGames">Save all to library</button></div>'+games.map((game,index)=>{
      const white=game.white||{},black=game.black||{},date=game.end_time?new Date(game.end_time*1000).toLocaleDateString():"Date unknown";
      const result=(white.username||"White")+" "+(white.result==="win"?"1–0":black.result==="win"?"0–1":"½–½")+" "+(black.username||"Black");
      return '<button class="game-option" data-game="'+index+'"><span><b>'+esc(result)+'</b><br><small>'+esc(game.time_class||"game")+' · '+esc(date)+'</small></span><span>Import →</span></button>';
    }).join("");
    $("saveAllGames").onclick=()=>saveFetchedGames(games);
    $("gamePicker").querySelectorAll("button[data-game]").forEach(button=>button.onclick=()=>{
      const game=games[Number(button.dataset.game)];
      try{parseGame(game.pgn,{title:game.white.username+" vs "+game.black.username,white:game.white.username,black:game.black.username});status("Chess.com game imported.");}
      catch(error){status(error.message,true);}
    });
    status("Found "+games.length+" recent public games for "+username+".");
  } catch(error){$("gamePicker").textContent=error.message;status(error.message,true);}
};
$("libraryToggle").onclick=()=>{$("libraryBody").classList.toggle("hidden");$("libraryToggle").textContent=$("libraryBody").classList.contains("hidden")?"Show library":"Hide library";};
$("themeToggle").setAttribute("aria-pressed","false");
$("themeToggle").addEventListener("click",()=>$("themeToggle").setAttribute("aria-pressed",document.body.classList.contains("light")?"true":"false"));
try{setBoardTheme(localStorage.getItem("matescope.boardTheme")||"classic");$("boardTheme").value=document.body.dataset.boardTheme;}catch{setBoardTheme("classic");}
renderLibrary();
window.addEventListener("resize",()=>{if(state.evals.length)chart(state.evals);});
