const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

const SUPABASE_URL="https://rvgcniaowzmsudzliozf.supabase.co";
const SUPABASE_KEY="sb_publishable_N_xCS0lbbTvG7qWTpAw0ag_vlg1lbHb";
const supabase=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const FUNCTION_URL=SUPABASE_URL+"/functions/v1/fat-generate-lesson";

let modal=$("#modal"),preview=$("#preview"),page=1,kind="lesson",currentSession=null;

function show(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const v=$("#"+id); if(v)v.classList.add("active");
  $$("nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  const t=$("#title");
  if(t)t.textContent=id==="home"?"What shall we create today? ✨":(id==="admin"?"Creator & Admin":id.charAt(0).toUpperCase()+id.slice(1));
}

function openGen(k,t){
  kind=k;
  $("#modalTitle").textContent={lesson:"Create a lesson",series:"Create a lesson series",sheet:"Create an activity sheet",workbook:"Create a workbook"}[k]||"Create a resource";
  if(t)$("#topic").value=t+" — English practice";
  page=1; showPage(); modal.classList.add("show");
}

function closeAll(){modal.classList.remove("show");preview.classList.remove("show")}

function showPage(){
  $$(".wizard-page").forEach(x=>x.classList.toggle("active",+x.dataset.page===page));
  $$(".step").forEach((x,i)=>x.classList.toggle("active",i===page-1));
  $("#pageLabel").textContent="Step "+page+" of 3";
  $("#back").style.visibility=page===1?"hidden":"visible";
  $("#next").hidden=page===3;
  $("#generate").hidden=page!==3;
}

function setAuthMessage(message,error=false){
  const el=$("#authMessage"); if(!el)return;
  el.textContent=message;
  el.style.color=error?"#b91c1c":"#64748b";
}

async function refreshAuth(){
  const {data}=await supabase.auth.getSession();
  currentSession=data.session;
  const user=data.session?.user;
  $("#authStatus").textContent=user?(user.email||"Connected"):"Not connected";
  $("#signOut").hidden=!user;
  $("#signIn").hidden=!!user;
  $("#signUp").hidden=!!user;
  $("#authEmail").hidden=!!user;
  $("#authPassword").hidden=!!user;
  setAuthMessage(user?"Connected — AI generation is available.":"Entre para salvar e gerar com IA.");
}

async function signIn(){
  const email=$("#authEmail").value.trim(),password=$("#authPassword").value;
  if(!email||!password)return setAuthMessage("Informe e-mail e senha.",true);
  setAuthMessage("Entrando...");
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)return setAuthMessage(error.message,true);
  setAuthMessage("Login realizado.");
  await refreshAuth();
}

async function signUp(){
  const email=$("#authEmail").value.trim(),password=$("#authPassword").value;
  if(!email||password.length<6)return setAuthMessage("Use um e-mail e uma senha com pelo menos 6 caracteres.",true);
  setAuthMessage("Criando conta...");
  const {error}=await supabase.auth.signUp({email,password});
  if(error)return setAuthMessage(error.message,true);
  setAuthMessage("Conta criada. Se a confirmação por e-mail estiver ativa, confirme seu e-mail e depois entre.");
}

async function signOut(){
  await supabase.auth.signOut();
  await refreshAuth();
}

async function generateWithAI(d){
  if(!currentSession){
    setAuthMessage("Faça login para usar a geração com IA.",true);
    show("admin");
    return;
  }
  $("#previewTitle").textContent=d.topic;
  $("#output").innerHTML='<div class="ai-loading"><h3>✨ Fluent AI está criando seu material...</h3><p>Gerando conteúdo alinhado ao CEFR '+esc(d.level)+'.</p></div>';
  modal.classList.remove("show"); preview.classList.add("show");
  const {data:{session}}=await supabase.auth.getSession();
  if(!session){currentSession=null;return refreshAuth();}
  try{
    const res=await fetch(FUNCTION_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
      body:JSON.stringify({...d,resourceType:kind})
    });
    const json=await res.json();
    if(!res.ok)throw new Error(json.error||"Não foi possível gerar o material.");
    $("#output").innerHTML=renderAI(json.resource,d);
    if(kind==="lesson")await saveLesson(d,json.resource);
  }catch(error){
    $("#output").innerHTML='<div class="ai-error"><b>Não foi possível gerar agora.</b><p>'+esc(error.message)+'</p><p>Verifique se a chave OPENAI_API_KEY foi configurada no Supabase Edge Function.</p></div>';
  }
}

async function saveLesson(d,r){
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const payload={
    owner_id:user.id,title:r.title||d.topic,topic:d.topic,cefr_level:d.level,
    duration_minutes:parseInt(d.duration)||90,audience:d.audience,main_skill:d.skill,
    grammar:d.grammar,vocabulary:d.vocab,communication_focus:"Communication",
    critical_thinking:"Critical thinking",lesson_plan:{objectives:r.objectives||[],warm_up:r.warm_up||"",language_focus:r.language_focus||"",reading:r.reading||"",speaking:r.speaking||"",teacher_notes:r.teacher_notes||""},
    worksheet:{items:r.worksheet||[]},answer_key:{quiz:r.quiz||[]},quiz:{items:r.quiz||[]},
    homework:{content:r.homework||""},visual_style:d.design,ai_model:"gpt-5.6-luna",generation_prompt:d
  };
  const {error}=await supabase.from("fat_lessons").insert(payload);
  if(error)console.warn("Lesson save failed:",error.message);
}

function renderAI(r,d){
  const objectives=Array.isArray(r.objectives)?r.objectives:[];
  const vocab=Array.isArray(r.vocabulary)?r.vocabulary:[];
  const worksheet=Array.isArray(r.worksheet)?r.worksheet:[];
  const quiz=Array.isArray(r.quiz)?r.quiz:[];
  return '<article class="paper"><div class="head"><span class="tag">'+esc(d.level)+'</span><span class="tag">'+esc(d.duration)+'</span><span class="tag">'+esc(d.audience)+'</span><h1>'+esc(r.title||d.topic)+'</h1><p>English • '+esc(d.skill)+' • '+esc(d.design)+'</p></div>'+
  '<h3>LEARNING OBJECTIVES</h3><ul>'+objectives.map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul>'+
  '<h3>1 · WARM-UP</h3><div class="task">'+esc(r.warm_up||"")+'</div>'+
  '<h3>2 · VOCABULARY</h3><div class="ai-vocab">'+vocab.map(x=>'<div><b>'+esc(x.word||"")+'</b><br><small>'+esc(x.meaning||"")+'</small></div>').join("")+'</div>'+
  '<h3>3 · LANGUAGE FOCUS</h3><div class="task">'+esc(r.language_focus||"")+'</div>'+
  '<h3>4 · READING</h3><div class="task">'+esc(r.reading||"")+'</div>'+
  '<h3>5 · SPEAKING</h3><div class="task">'+esc(r.speaking||"")+'</div>'+
  '<h3>6 · WORKSHEET</h3><div class="task">'+worksheet.map((x,i)=>(i+1)+'. '+esc(x)).join("<br>")+'</div>'+
  '<h3>7 · QUIZ</h3>'+quiz.map((q,i)=>'<div class="ai-quiz"><b>'+(i+1)+'. '+esc(q.question||"")+'</b><ol>'+((q.options||[]).map(o=>'<li>'+esc(o)+'</li>').join(""))+'</ol><small>Answer: '+esc(q.answer||"")+'</small></div>').join("")+
  '<h3>8 · HOMEWORK</h3><div class="task">'+esc(r.homework||"")+'</div>'+
  '<div class="key"><b>TEACHER NOTES</b><p>'+esc(r.teacher_notes||"")+'</p></div></article>';
}

document.addEventListener("click",e=>{
  const o=e.target.closest("[data-open]"); if(o)openGen(o.dataset.open);
  const t=e.target.closest(".template"); if(t)openGen("sheet",t.dataset.template);
});

$$("nav button").forEach(b=>b.onclick=()=>show(b.dataset.view));
$("#closeGenerator").onclick=closeAll;
$("#closePreview").onclick=closeAll;
$("#back").onclick=()=>{if(page>1){page--;showPage()}};
$("#next").onclick=()=>{if(page<3){page++;showPage()}};
$$(".choice").forEach(b=>b.onclick=()=>b.classList.toggle("selected"));

$("#generate").onclick=()=>{
  const d={
    topic:$("#topic").value||"English Lesson",level:$("#level").value,duration:$("#duration").value,
    audience:$("#audience").value,skill:$("#skill").value,grammar:$("#grammar").value,
    vocab:$("#vocab").value,design:$("#design").value
  };
  generateWithAI(d);
};

$("#print").onclick=()=>window.print();
$("#signIn").onclick=signIn;
$("#signUp").onclick=signUp;
$("#signOut").onclick=signOut;

const planLink=document.querySelector("#planLink");
if(planLink)planLink.value=location.href.split("#")[0]+"#admin";
const copyPlan=document.querySelector("#copyPlan");
if(copyPlan)copyPlan.onclick=()=>{
  navigator.clipboard.writeText(planLink.value).then(()=>copyPlan.textContent="✓ Copiado");
};

supabase.auth.onAuthStateChange(()=>refreshAuth());
refreshAuth();
showPage();

function esc(s){
  return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
}