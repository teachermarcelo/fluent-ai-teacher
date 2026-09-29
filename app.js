const $=s=>document.querySelector(s), $$=s=>document.querySelectorAll(s);

const SUPABASE_URL="https://rvgcniaowzmsudzliozf.supabase.co";
const SUPABASE_KEY="sb_publishable_N_xCS0lbbTvG7qWTpAw0ag_vlg1lbHb";
const FUNCTION_URL=SUPABASE_URL+"/functions/v1/fat-generate-lesson";

let supabaseClient=null;
let modal=$("#modal"),preview=$("#preview"),page=1,kind="lesson",currentSession=null;

function onClick(selector,handler){
  const el=$(selector);
  if(el) el.addEventListener("click",handler);
}

function show(id){
  $$(".view").forEach(v=>v.classList.remove("active"));
  const v=$("#"+id);
  if(v)v.classList.add("active");
  $$("nav button").forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  const t=$("#title");
  if(t)t.textContent=id==="home"?"What shall we create today? ✨":(id==="admin"?"Creator & Admin":id.charAt(0).toUpperCase()+id.slice(1));
}

function openGen(k,t){
  kind=k;
  const title=$("#modalTitle");
  if(title)title.textContent={lesson:"Create a lesson",series:"Create a lesson series",sheet:"Create an activity sheet",workbook:"Create a workbook"}[k]||"Create a resource";
  if(t&&$("#topic"))$("#topic").value=t+" — English practice";
  page=1; showPage();
  if(modal)modal.classList.add("show");
}

function closeAll(){
  if(modal)modal.classList.remove("show");
  if(preview)preview.classList.remove("show");
}

function showPage(){
  $$(".wizard-page").forEach(x=>x.classList.toggle("active",+x.dataset.page===page));
  $$(".step").forEach((x,i)=>x.classList.toggle("active",i===page-1));
  const label=$("#pageLabel"); if(label)label.textContent="Step "+page+" of 3";
  const back=$("#back"); if(back)back.style.visibility=page===1?"hidden":"visible";
  const next=$("#next"); if(next)next.hidden=page===3;
  const generate=$("#generate"); if(generate)generate.hidden=page!==3;
}

function setAuthMessage(message,error=false){
  const el=$("#authMessage"); if(!el)return;
  el.textContent=message;
  el.style.color=error?"#b91c1c":"#64748b";
}

async function refreshAuth(){
  if(!supabaseClient){
    currentSession=null;
    if($("#authStatus"))$("#authStatus").textContent="Not connected";
    setAuthMessage("Sistema de login carregando...");
    return;
  }
  try{
    const {data}=await supabaseClient.auth.getSession();
    currentSession=data?.session||null;
    const user=currentSession?.user;
    if($("#authStatus"))$("#authStatus").textContent=user?(user.email||"Connected"):"Not connected";
    if($("#signOut"))$("#signOut").hidden=!user;
    if($("#signIn"))$("#signIn").hidden=!!user;
    if($("#signUp"))$("#signUp").hidden=!!user;
    if($("#authEmail"))$("#authEmail").hidden=!!user;
    if($("#authPassword"))$("#authPassword").hidden=!!user;
    setAuthMessage(user?"Connected — AI generation is available.":"Entre para salvar e gerar com IA.");
  }catch(error){
    console.error("Auth refresh error:",error);
    setAuthMessage("Erro ao verificar a sessão.",true);
  }
}

async function signIn(){
  if(!supabaseClient){
    setAuthMessage("O sistema de login ainda não carregou. Recarregue a página e tente novamente.",true);
    return;
  }
  const email=$("#authEmail")?.value.trim()||"",password=$("#authPassword")?.value||"";
  if(!email||!password){setAuthMessage("Informe e-mail e senha.",true);return;}
  setAuthMessage("Entrando...");
  const {error}=await supabaseClient.auth.signInWithPassword({email,password});
  if(error){setAuthMessage(error.message,true);return;}
  await refreshAuth();
}

async function signUp(){
  if(!supabaseClient){
    setAuthMessage("O sistema de login ainda não carregou. Recarregue a página e tente novamente.",true);
    return;
  }
  const email=$("#authEmail")?.value.trim()||"",password=$("#authPassword")?.value||"";
  if(!email||password.length<6){setAuthMessage("Use um e-mail e uma senha com pelo menos 6 caracteres.",true);return;}
  setAuthMessage("Criando conta...");
  const {error}=await supabaseClient.auth.signUp({email,password});
  if(error){setAuthMessage(error.message,true);return;}
  setAuthMessage("Conta criada. Se a confirmação por e-mail estiver ativa, confirme seu e-mail e depois entre.");
}

async function signOut(){
  if(!supabaseClient)return;
  await supabaseClient.auth.signOut();
  await refreshAuth();
}

async function generateWithAI(d){
  if(!supabaseClient||!currentSession){
    setAuthMessage("Faça login para usar a geração com IA.",true);
    show("admin");
    return;
  }
  if($("#previewTitle"))$("#previewTitle").textContent=d.topic;
  if($("#output"))$("#output").innerHTML='<div class="ai-loading"><h3>✨ Fluent AI está criando seu material...</h3><p>Gerando conteúdo alinhado ao CEFR '+esc(d.level)+'.</p></div>';
  if(modal)modal.classList.remove("show");
  if(preview)preview.classList.add("show");
  const {data:{session}}=await supabaseClient.auth.getSession();
  if(!session){currentSession=null;await refreshAuth();return;}
  try{
    const res=await fetch(FUNCTION_URL,{
      method:"POST",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token},
      body:JSON.stringify({...d,resourceType:kind})
    });
    const json=await res.json();
    if(!res.ok){ const detail=json.detail ? (typeof json.detail==="string" ? json.detail : JSON.stringify(json.detail)) : ""; throw new Error((json.error||"Não foi possível gerar o material.")+(detail ? " — "+detail : "")); }
    if($("#output"))$("#output").innerHTML=renderAI(json.resource||{},d);
    if(kind==="lesson")await saveLesson(d,json.resource||{});
  }catch(error){
    console.error(error);
    if($("#output"))$("#output").innerHTML='<div class="ai-error"><b>Não foi possível gerar agora.</b><p>'+esc(error.message)+'</p><p>Verifique OPENAI_API_KEY e a Edge Function no Supabase.</p></div>';
  }
}

async function saveLesson(d,r){
  if(!supabaseClient)return;
  const {data:{user}}=await supabaseClient.auth.getUser();
  if(!user)return;
  const payload={
    owner_id:user.id,title:r.title||d.topic,topic:d.topic,cefr_level:d.level,
    duration_minutes:parseInt(d.duration)||90,audience:d.audience,main_skill:d.skill,
    grammar:d.grammar,vocabulary:d.vocab,communication_focus:"Communication",
    critical_thinking:"Critical thinking",
    lesson_plan:{objectives:r.objectives||[],warm_up:r.warm_up||"",language_focus:r.language_focus||"",reading:r.reading||"",speaking:r.speaking||"",teacher_notes:r.teacher_notes||""},
    worksheet:{items:r.worksheet||[]},answer_key:{quiz:r.quiz||[]},quiz:{items:r.quiz||[]},
    homework:{content:r.homework||""},visual_style:d.design,ai_model:"gpt-5.6-luna",generation_prompt:d
  };
  const {error}=await supabaseClient.from("fat_lessons").insert(payload);
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

function bindUI(){
  $$("nav button").forEach(b=>b.addEventListener("click",()=>show(b.dataset.view)));
  onClick("#closeGenerator",closeAll);
  onClick("#closePreview",closeAll);
  onClick("#back",()=>{if(page>1){page--;showPage();}});
  onClick("#next",()=>{if(page<3){page++;showPage();}});
  $$(".choice").forEach(b=>b.addEventListener("click",()=>b.classList.toggle("selected")));
  onClick("#generate",()=>{
    const d={
      topic:$("#topic")?.value||"English Lesson",level:$("#level")?.value||"B1",duration:$("#duration")?.value||"90 minutes",
      audience:$("#audience")?.value||"Adults",skill:$("#skill")?.value||"Mixed skills",
      grammar:$("#grammar")?.value||"",vocab:$("#vocab")?.value||"",design:$("#design")?.value||"Modern Classroom"
    };
    generateWithAI(d);
  });
  onClick("#print",()=>window.print());
  onClick("#signIn",signIn);
  onClick("#signUp",signUp);
  onClick("#signOut",signOut);
  onClick("#copyPlan",()=>{
    const planLink=$("#planLink");
    if(!planLink)return;
    navigator.clipboard?.writeText(planLink.value).then(()=>{
      const btn=$("#copyPlan"); if(btn)btn.textContent="✓ Copiado";
    });
  });
  document.addEventListener("click",e=>{
    const o=e.target.closest?.("[data-open]");
    if(o){e.preventDefault();openGen(o.dataset.open);}
    const t=e.target.closest?.(".template");
    if(t){e.preventDefault();openGen("sheet",t.dataset.template);}
  });
}

async function initSupabase(){
  try{
    if(window.supabase?.createClient){
      supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    }else{
      const script=document.createElement("script");
      script.src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.onload=()=>{try{
        supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
        supabaseClient.auth.onAuthStateChange(()=>refreshAuth());
        refreshAuth();
      }catch(e){console.error(e);setAuthMessage("Não foi possível iniciar o login.",true);}};
      script.onerror=()=>setAuthMessage("Biblioteca de login não carregou. Verifique sua conexão ou bloqueador do navegador.",true);
      document.head.appendChild(script);
      return;
    }
    supabaseClient.auth.onAuthStateChange(()=>refreshAuth());
    await refreshAuth();
  }catch(error){
    console.error("Supabase init error:",error);
    setAuthMessage("Login temporariamente indisponível. Os menus continuam funcionando.",true);
  }
}

function esc(s){
  return String(s??"").replace(/[&<>"]/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[m]));
}

bindUI();
showPage();
window.__FAT_READY=true;

const planLink=$("#planLink");
if(planLink)planLink.value=location.href.split("#")[0]+"#admin";

setAuthMessage("Carregando login...");
initSupabase();
