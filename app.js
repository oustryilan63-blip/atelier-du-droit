(() => {
  'use strict';
  const D = window.STUDY_DATA;
  const M = D.methodology || {guides:[],exercises:[],profiles:[],sources:[],sessions:[]};
  const methodGuides=Object.assign(Object.create(null),Object.fromEntries(M.guides.map(g=>[g.id,g])));
  const methodExercises=Object.assign(Object.create(null),Object.fromEntries(M.exercises.map(e=>[e.id,e])));
  const methodSources=Object.assign(Object.create(null),Object.fromEntries(M.sources.map(s=>[s.id,s])));
  const T=D.td||{documents:[],sessions:[],missing:[]},E=D.examens||{assessments:[],packs:[],articles:[]};
  const tdSessions=Object.assign(Object.create(null),Object.fromEntries(T.sessions.map(s=>[s.id,s])));
  const tdDocuments=Object.assign(Object.create(null),Object.fromEntries(T.documents.map(d=>[d.id,d])));
  const P=D.pedagogy||{lessons:[],repairs:[],reading:[],sources:[]};
  const guidedLessons=Object.assign(Object.create(null),Object.fromEntries(P.lessons.map(l=>[l.id,l])));
  const L=D.teaching||{lessons:[],scope:'',updated:D.updated};
  const teachingById=Object.assign(Object.create(null),Object.fromEntries(L.lessons.map(l=>[l.id,l])));
  const learningKeys=new Set(L.lessons.flatMap(l=>learningTasks(l).map(t=>l.id+'/'+t.id)));
  const C=D.controlFocus||{articles:[],td3:[],copies:[],drills:[],copySteps:[]};
  const controlKeys=new Set([...C.articles.map(x=>'article:'+x.id),...C.td3.map(x=>'td3:'+x.id),...C.copies.flatMap(x=>[...C.copySteps.map(t=>'copy:'+x.id+'/'+t.id),'copy:'+x.id+'/bilan']),...C.drills.map(x=>'drill:'+x.id)]);
  const R=D.learningPaths||{chapters:[],errors:[],updated:D.updated};
  const pathByChapter=Object.assign(Object.create(null),Object.fromEntries(R.chapters.map(p=>[p.chapter,p])));
  const pathTaskKeys=new Set(R.chapters.flatMap(p=>p.tasks.map(t=>p.chapter+'/'+t.id)));
  const pathFormKeys=new Set([...pathTaskKeys].flatMap(key=>[key+'/base',key+'/variante']));
  const pathReviewKeys=new Set([...pathTaskKeys,...C.articles.map(a=>'controle/article:'+a.id),...C.td3.map(q=>'controle/td3:'+q.id)]);
  let controlChoices=Object.create(null);
  let guidedSession=null;
  let methodTimer=null,methodClockInterval=null,examClockInterval=null;
  const KEY = 'atelier-droit:progress:v1' + (new URLSearchParams(location.search).has('verification') ? ':verification' : '');
  const docs = Object.fromEntries(D.documents.map(d => [d.id, d]));
  const subjects = Object.fromEntries(D.subjects.map(s => [s.id, s]));
  const chapterById = Object.fromEntries(D.chapters.map(c => [c.id, c]));
  const main = document.getElementById('main');
  const readingNotes = D.readingNotes || [];
  const notesByPassage = new Map();
  for(const note of readingNotes) for(const target of note.targets){
    const key=target.doc+':'+target.index;
    if(!notesByPassage.has(key))notesByPassage.set(key,[]);
    notesByPassage.get(key).push(note);
  }
  const dateLabel = date => new Date((date||D.updated)+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:'long',year:'numeric'});
  const passageNotes = (doc,index) => notesByPassage.get(doc+':'+index)||[];

  let state = { pathways:emptyPathways(), control:emptyControl(), learning:emptyLearning(), study:emptyStudy(), version: 1, chapters: {}, notes: {}, favorites: [], reviews: {}, quizzes: {}, lastChapter: null, methodology:{drafts:{},checks:{},reviewed:[],instructions:{},rework:{}} };
  let storageAvailable = true;
  let session = null;
  let quizSession = null;
  let toastTimer;
  let highlightSelection = null;
  let highlightSequence = 0;
  let renderedRoute = '';
  const highlightScopes = '.reader-body, .reference-card, .timeline-content, .scheme, .flashcard, .quiz-question';
  const highlightExcluded = 'a, button:not(.flashcard), input, textarea, select, svg, .eyebrow, .page-actions, .source-strip, .flashcard small';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, x => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[x]));
  const normalize = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const icons = {
    balance:'<path d="M12 3v18m-5 0h10M4 7h16M6 7l-4 8h8zm12 0l-4 8h8z"/><circle cx="12" cy="5" r="2"/>',
    home:'<path d="m3 10 9-7 9 7v11H3zM9 21v-8h6v8"/>',
    book:'<path d="M12 5v16M12 5C8 2 3 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-1-1-6-2-10 1Z"/>',
    cards:'<rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7H3v15h13v-1m-5-12h5m-5 4h5"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 7h14M5 17h14"/>',
    arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
    chevron:'<path d="m9 5 7 7-7 7"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
    check:'<path d="m5 12 4 4 10-10"/>',
    cross:'<path d="m6 6 12 12M18 6 6 18"/>',
    star:'<path d="m12 3 2.8 5.8 6.4.9-4.6 4.5 1.1 6.4-5.7-3-5.7 3 1.1-6.4-4.6-4.5 6.4-.9z"/>',
    timeline:'<path d="M5 3v18m0-15h14M5 12h10M5 18h14"/><circle cx="5" cy="6" r="2"/><circle cx="5" cy="12" r="2"/><circle cx="5" cy="18" r="2"/>',
    scheme:'<rect x="8" y="2" width="8" height="5" rx="1"/><path d="M12 7v5m-7 0h14M5 12v5m14-5v5"/><rect x="1" y="17" width="8" height="5" rx="1"/><rect x="15" y="17" width="8" height="5" rx="1"/>',
    feather:'<path d="M20 3c-8-1-15 4-14 13l5-1c6-3 9-7 9-12ZM3 21 15 9m-8 8H4"/>',
    folder:'<path d="M3 6V4h7l2 3h9v14H3V6z"/>',
    settings:'<circle cx="12" cy="12" r="3"/><path d="m10 3-1 3-3 1-3-1-1 4 3 2v3l-2 2 3 3 3-1 3 1 1 3 4-1 1-3 3-1 3 1 1-4-3-2v-3l2-2-3-3-3 1-3-1-1-3z" transform="translate(0 -1) scale(.9)"/>',
    lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
    info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
    download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
    upload:'<path d="M12 15V3m-4 4 4-4 4 4M4 16v5h16v-5"/>',
    note:'<path d="M4 3h16v18H4zM8 8h8m-8 4h8m-8 4h5"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    external:'<path d="M14 3h7v7m0-7-11 11M10 3H3v18h18v-7"/>',
    print:'<path d="M6 8V2h12v6M6 17H3V8h18v9h-3M6 14h12v8H6z"/>',
    refresh:'<path d="M20 7v5h-5M4 17v-5h5m11 0a8 8 0 0 0-14-6m-2 6a8 8 0 0 0 14 6"/>',
  };
  const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.book}</svg>`;
  function highlightScope(node) {
    const el=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
    if(!el||el.closest(highlightExcluded))return null;
    const scope=el.closest(highlightScopes);
    return scope&&main.contains(scope)?scope:null;
  }
  function updateHighlightControls() {
    const apply=main.querySelector('[data-action="highlight-selection"]');
    if(!apply)return;
    const count=new Set([...main.querySelectorAll('mark.study-highlight')].map(m=>m.dataset.highlight)).size;
    apply.disabled=!highlightSelection;
    main.querySelector('[data-action="clear-highlights"]').disabled=!count;
    const label=count?`${count} passage${count>1?'s':''} surligné${count>1?'s':''}`:'Aucun passage surligné';
    const status=main.querySelector('#highlight-status');
    if(status.textContent!==label)status.textContent=label;
  }
  function captureHighlightSelection() {
    if(!main.querySelector('.study-highlighter'))return;
    const selection=window.getSelection();
    if(!selection?.rangeCount||selection.isCollapsed){
      if(document.activeElement?.closest('.study-highlighter'))return;
      highlightSelection=null;updateHighlightControls();return;
    }
    const range=selection.getRangeAt(0),scope=highlightScope(range.startContainer);
    highlightSelection=scope&&scope===highlightScope(range.endContainer)&&range.toString().trim()?{range:range.cloneRange(),scope}:null;
    updateHighlightControls();
  }
  function textOffset(scope,node,offset) {
    const prefix=document.createRange();prefix.selectNodeContents(scope);prefix.setEnd(node,offset);
    return prefix.toString().length;
  }
  function highlightText(scope,start,end,id) {
    const walker=document.createTreeWalker(scope,NodeFilter.SHOW_TEXT),pieces=[];
    let node,position=0;
    while((node=walker.nextNode())){
      const length=node.data.length,left=Math.max(0,start-position),right=Math.min(length,end-position);
      if(left<right&&node.data.slice(left,right).trim()&&!node.parentElement.closest(highlightExcluded+', mark.study-highlight'))pieces.push({node,left,right});
      position+=length;
    }
    // Split text nodes only, retaining paragraphs, headings and source links.
    for(const {node,left,right} of pieces.reverse()){
      node.splitText(right);const selected=node.splitText(left),mark=document.createElement('mark');
      mark.className='study-highlight';mark.dataset.highlight=id;selected.replaceWith(mark);mark.appendChild(selected);
    }
    return pieces.length;
  }
  function applyHighlight() {
    if(!highlightSelection)return;
    const {range,scope}=highlightSelection;
    if(!scope.isConnected||!scope.contains(range.startContainer)||!scope.contains(range.endContainer)){highlightSelection=null;updateHighlightControls();return;}
    const start=textOffset(scope,range.startContainer,range.startOffset),end=textOffset(scope,range.endContainer,range.endOffset);
    highlightText(scope,start,end,String(++highlightSequence));
    highlightSelection=null;window.getSelection()?.removeAllRanges();updateHighlightControls();
  }
  function clearHighlights() {
    highlightSelection=null;
    const parents=new Set();
    for(const mark of main.querySelectorAll('mark.study-highlight')){parents.add(mark.parentElement);mark.replaceWith(...mark.childNodes);}
    for(const parent of parents)parent.normalize();
    updateHighlightControls();
  }
  function snapshotHighlights() {
    return [...main.querySelectorAll(highlightScopes)].map((scope,index)=>({index,text:scope.textContent,marks:[...scope.querySelectorAll('mark.study-highlight')].filter(mark=>mark.closest(highlightScopes)===scope).map(mark=>({id:mark.dataset.highlight,start:textOffset(scope,mark.parentNode,[...mark.parentNode.childNodes].indexOf(mark)),length:mark.textContent.length}))})).filter(s=>s.marks.length);
  }
  function setupHighlighter(saved=[]) {
    highlightSelection=null;
    const scopes=[...main.querySelectorAll(highlightScopes)];if(!scopes.length)return;
    const bar=document.createElement('section');bar.className='study-highlighter';bar.setAttribute('aria-label','Surlignage temporaire');
    bar.innerHTML=`<div class="highlighter-intro"><strong>Surlignage temporaire</strong><small>Sélectionne un passage, puis surligne-le. Les couleurs s’effacent quand tu quittes la lecture.</small></div><div class="highlighter-actions"><button class="btn highlight-button" data-action="highlight-selection" disabled><span class="highlight-swatch" aria-hidden="true"></span>Surligner la sélection</button><button class="btn" data-action="clear-highlights" disabled>Tout effacer</button><span id="highlight-status" role="status" aria-live="polite">Aucun passage surligné</span></div>`;
    main.querySelector('.page-head').after(bar);
    for(const snapshot of saved){const scope=scopes[snapshot.index];if(scope?.textContent===snapshot.text)for(const mark of snapshot.marks)highlightText(scope,mark.start,mark.start+mark.length,mark.id);}
    updateHighlightControls();
  }
  function cleanState(input) {
    if (!input || input.version !== 1 || typeof input !== 'object') throw new Error('Format de sauvegarde non reconnu.');
    const next = {version:1,chapters:{},notes:{},favorites:[],reviews:{},quizzes:{},lastChapter:chapterById[input.lastChapter]?input.lastChapter:null,methodology:{drafts:{},checks:{},reviewed:[],instructions:{},rework:{}}};
    for (const [id,status] of Object.entries(input.chapters || {})) if(chapterById[id] && ['started','done'].includes(status)) next.chapters[id]=status;
    for (const [id,text] of Object.entries(input.notes || {})) if(chapterById[id] && typeof text==='string' && text.length<=100000) next.notes[id]=text;
    next.favorites = [...new Set((Array.isArray(input.favorites)?input.favorites:[]).filter(id=>chapterById[id]))];
    for (const [id,r] of Object.entries(input.reviews || {})) if(D.cards.some(c=>c.id===id) && r && Number.isFinite(r.due) && r.due>0 && r.due<1e14) {next.reviews[id]={due:r.due,seen:Math.max(1,Math.min(100000,Number(r.seen)||1)),grade:r.grade==='again'?'again':'known'};const recall=cleanRecall(r);if(recall)for(const field of ['streak','intervalDays','reviewedAt'])if(Object.hasOwn(r,field))next.reviews[id][field]=recall[field];}
    for (const [id,q] of Object.entries(input.quizzes || {})) if((D.quizzes||[]).some(item=>item.id===id) && q) {next.quizzes[id]={correct:!!q.correct,attempts:Math.max(1,Math.min(100000,Number(q.attempts)||1))};if(typeof q.lastCorrect==='boolean')next.quizzes[id].lastCorrect=q.lastCorrect;if(Number.isInteger(q.wrongAttempts)&&q.wrongAttempts>=0)next.quizzes[id].wrongAttempts=Math.min(q.wrongAttempts,100000);}
    const methods=input.methodology||{};
    for(const [id,text] of Object.entries(methods.drafts||{}))if(methodExercises[id]&&typeof text==='string'&&text.length<=500000)next.methodology.drafts[id]=text;
    for(const [id,values] of Object.entries(methods.checks||{}))if(methodExercises[id]&&Array.isArray(values))next.methodology.checks[id]=[...new Set(values.filter(i=>Number.isInteger(i)&&i>=0&&i<methodExercises[id].checks.length))];
    next.methodology.reviewed=[...new Set((Array.isArray(methods.reviewed)?methods.reviewed:[]).filter(id=>methodExercises[id]))];
    for(const [id,text] of Object.entries(methods.instructions||{}))if(['all',...M.profiles.map(p=>p.id)].includes(id)&&typeof text==='string'&&text.length<=500000)next.methodology.instructions[id]=text;
    for(const [id,text] of Object.entries(methods.rework||{}))if(methodExercises[id]&&typeof text==='string'&&text.length<=500000)next.methodology.rework[id]=text;
    next.control=cleanControl(input.control);
    next.learning=cleanLearning(input.learning);
    next.study=cleanStudy(input.study);
    next.pathways=cleanPathways(input.pathways,next.study.exams);
    return next;
  }
  try { const saved = localStorage.getItem(KEY); if(saved) state = cleanState(JSON.parse(saved)); }
  catch { storageAvailable = false; }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch { storageAvailable=false; showToast('Enregistrement indisponible : exporte ta progression pour la conserver.'); return false; }
  }
  function showToast(message) {
    const el=document.getElementById('toast'); el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),3500);
  }
  const done = subject => D.chapters.filter(c=>(!subject||c.subject===subject)&&state.chapters[c.id]==='done').length;
  const dueCards = subject => D.cards.filter(c=>(!subject||subject==='all'||c.subject===subject)&&(!state.reviews[c.id]||state.reviews[c.id].due<=Date.now()));
  const documentLabel = doc => doc?.kind==='cours'?(doc.generated?'Cours complémentaire':'Cours fourni'):doc?.kind==='fiche'?(doc.generated?'Fiche préparée':'Fiche fournie'):doc?.kind==='officiel'?'Plan officiel':'Archive';
  const sourceLabel = source => source?.url?'Source institutionnelle':documentLabel(docs[source?.doc]);
  function sourceLink(source, label = 'Voir le passage source') {
    if(source.url) return `<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener">${icon('external')}${esc(source.label||label)}</a>`;
    return `<a class="source-link" href="#document/${esc(source.doc)}/${source.index}">${icon('book')}${esc(label)}</a>`;
  }
  function contentReview(item) {
    const review=item.contentReview;if(!review)return '';
    return `<details class="content-review"><summary>Relu le ${esc(dateLabel(review.date))} · sources de vérification</summary><p class="small muted">Réponse et explication relues à partir des supports reçus et des références ci-dessous. Cette relecture ajoutée reste distincte d’un corrigé officiel du professeur.</p><div class="guide-sources">${(review.sources||[]).map(s=>sourceLink(s)).join('')||sourceLink(item.source,'Passage du support vérifié')}</div></details>`;
  }
  function button(label, href, primary=false, symbol='arrow') {
    return `<a class="btn ${primary?'primary':''}" href="${esc(href)}">${esc(label)}${icon(symbol)}</a>`;
  }
  function header(title, subtitle, eyebrow='L1 DROIT · SEMESTRE 1', actions='') {
    return `<div class="page-head ${actions?'row':''}"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${subtitle?`<p class="lead">${esc(subtitle)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
  }
  function empty(title,text,action='') { return `<div class="empty-state">${icon('book')}<h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`; }
  function notice(text) {return `<div class="notice">${icon('info')}<p>${esc(text)}</p></div>`;}
  function tabs(items,active) {return `<nav class="section-tabs" aria-label="Sections">${items.map(([id,label,url])=>`<a href="${url}" class="${(id==='examens/controle'?active==='examens'&&route[1]==='controle':active===id&&!(id==='examens'&&route[1]==='controle'))?'active':''}" ${(id==='examens/controle'?active==='examens'&&route[1]==='controle':active===id&&!(id==='examens'&&route[1]==='controle'))?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
  function filters(page, selected='all', section='') {return `<nav class="filters" aria-label="Filtrer par matière">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,title])=>`<a class="filter-chip ${selected===id?'active':''}" href="#${page}/${id}${section?'/'+section:''}" ${selected===id?'aria-current="page"':''}>${esc(title)}</a>`).join('')}</nav>`;}
  const subjectName = id => subjects[id]?.title || 'Toutes les matières';
  function sidebar(route) {
    const nav=[['home','Mon tableau de bord','home'],['aujourdhui','Mon programme du jour','clock'],['difficultes','Mes difficultés','note'],['subjects','Mes matières','book'],['td','Mes TD et corrections','folder'],['cards','Flashcards','cards'],['quiz','Quiz corrigés','check'],['examens/controle','Mon contrôle privé','note'],['examens','Préparer mes examens','clock'],['parcours','Apprendre un chapitre','book'],['methodologie','Méthodologie','note'],['timeline','Frises chronologiques','timeline'],['schemes','Schémas','scheme'],['actualites','Actualité juridique','globe'],['references','Approfondir','feather'],['corrections','Corrections & précisions','info'],['favorites','Mes favoris','star']];
    const active = ['revisions','reparer','apprendre'].includes(route[0])?'parcours':route[0]||'home';
    document.getElementById('sidebar').innerHTML = `<a class="brand" href="#home" aria-label="L’Atelier du droit, accueil"><span class="brand-mark">${icon('balance','lg')}</span><span><strong>L’Atelier<br>du droit</strong><small>Apprendre & comprendre</small></span></a><div class="semester"><span>L1 Droit</span><small>Semestre 1</small></div><nav><div class="nav-label">Mon espace</div>${nav.map(([id,label,symbol])=>`<a class="nav-link ${(id==='examens/controle'?active==='examens'&&route[1]==='controle':active===id&&!(id==='examens'&&route[1]==='controle'))?'active':''}" href="#${id}" ${(id==='examens/controle'?active==='examens'&&route[1]==='controle':active===id&&!(id==='examens'&&route[1]==='controle'))?'aria-current="page"':''}>${icon(symbol)}${label}</a>`).join('')}<div class="nav-label">Mes matières</div>${D.subjects.map(s=>`<a class="nav-link ${s.color} ${active==='subject'&&route[1]===s.id?'active':''}" href="#subject/${s.id}"><span class="subject-dot"></span>${s.title}</a>`).join('')}<div class="nav-label">Ma bibliothèque</div><a class="nav-link ${active==='sources'||active==='document'?'active':''}" href="#sources">${icon('folder')}Cours & documents</a><a class="nav-link ${active==='settings'?'active':''}" href="#settings">${icon('settings')}Mon espace personnel</a></nav><div class="sidebar-end">${icon('lock')}<span>Un chapitre à la fois.<br>À ton rythme.</span></div>`;
  }
  function topbar(title, query='') {
    document.getElementById('topbar').innerHTML=`<button class="mobile-menu" data-action="menu" aria-label="Ouvrir ou fermer la navigation" aria-expanded="${document.body.classList.contains('menu-open')}">${icon('menu')}</button><div class="crumb"><span>L1 Droit</span>${icon('chevron')}<strong>${esc(title)}</strong></div><div class="top-right"><form class="search-box" id="search-form" role="search"><label class="screen-reader-only" for="global-search">Rechercher dans mes contenus</label><input id="global-search" name="q" value="${esc(query)}" placeholder="Rechercher une notion…" autocomplete="off"><button type="submit" aria-label="Rechercher">${icon('search')}</button></form><span class="avatar" aria-label="Espace personnel">L1</span></div>`;
  }
  function subjectCard(s) {
    const chapters=D.chapters.filter(c=>c.subject===s.id), count=done(s.id), percent=Math.round(count/chapters.length*100);
    return `<a class="subject-card ${s.color}" href="#subject/${s.id}"><div class="subject-card-top"><span class="subject-visual">${icon(s.icon)}</span><span class="pill small">S1</span></div><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><div class="subject-meta">${chapters.length} chapitres <span>·</span> Cours & fiche</div><div class="progress" aria-label="${percent} % des chapitres marqués révisés"><span style="width:${percent}%"></span></div><div class="subject-bottom"><span>${count} / ${chapters.length} révisés</span>${icon('arrow')}</div></a>`;
  }
  // BEGIN NEWS UI
  // Actualités : données éditoriales séparées du cours et de la progression.
  const newsData=window.STUDY_NEWS||{lastChecked:null,editions:[],items:[]};
  const newsAnswers=Object.create(null);
  const newsItems=()=>[...newsData.items].sort((a,b)=>b.edition.localeCompare(a.edition)||a.scope.localeCompare(b.scope));
  const newsEditions=()=>[...newsData.editions].sort((a,b)=>b.date.localeCompare(a.date));
  const newsScope=id=>id==='france'?'France':'International';
  const newsToday=()=>new Date().toLocaleDateString('sv-SE',{timeZone:'Europe/Paris'});
  const newsMinutes=n=>Math.max(2,Math.ceil([n.summary,...n.facts,...n.explanation,n.course.text,...(n.glossary||[]).map(g=>g.meaning),n.check?.question||'',n.check?.explanation||''].join(' ').split(/\s+/).length/180)+1);
  function newsListUrl(scope='all',query='',page=1){
    if(query)return '#actualites/recherche/'+encodeURIComponent(query)+'/'+scope+(page>1?'/'+page:'');
    return '#actualites'+(scope==='all'?(page>1?'/all':''):'/'+scope)+(page>1?'/'+page:'');
  }
  function newsFreshness(){
    if(!newsData.lastChecked)return notice('La première sélection est en préparation.');
    const checked=newsData.lastChecked;
    return `<div class="news-verification"><span class="pill">${icon('check')}Vérifié le ${dateLabel(checked)}</span><p>${checked===newsToday()?'La sélection a été vérifiée aujourd’hui. Les dates des événements sont précisées dans les brèves.':'Aucune vérification datée d’aujourd’hui n’est encore affichée. La dernière sélection reste consultable ci-dessous.'}</p></div>`;
  }
  function newsSearch(query='',scope='all'){
    const selected=['france','international'].includes(scope)?scope:'all';
    return `<form id="news-search-form" class="news-search" role="search" aria-label="Rechercher dans les actualités"><div class="news-search-field"><label for="news-query">Rechercher dans les éditions</label><input id="news-query" name="q" type="search" maxlength="160" value="${esc(query)}" placeholder="Un sujet, une institution, un mot…"></div><div class="news-search-field"><label for="news-scope">Zone</label><select name="scope" id="news-scope">${[['all','France & international'],['france','France'],['international','International']].map(([id,label])=>`<option value="${id}" ${selected===id?'selected':''}>${label}</option>`).join('')}</select></div><button class="btn primary" type="submit">${icon('search')}Rechercher</button></form>`;
  }
  function newsCard(n){
    return `<article class="news-card"><div class="news-meta"><span class="pill ${n.scope==='france'?'':'blue'}">${newsScope(n.scope)}</span><time datetime="${esc(n.edition)}">${dateLabel(n.edition)}</time><span>${newsMinutes(n)} min · lecture et rappel</span></div><h3><a href="#actualites/article/${esc(n.id)}">${esc(n.title)}</a></h3><p>${esc(n.summary)}</p><p class="small muted">${esc(n.institution)} · ${esc(n.status)}</p>${n.corrections?.length?`<p class="news-update">Précisé le ${dateLabel(n.corrections.at(-1).date)}</p>`:''}<a class="text-link" href="#actualites/article/${esc(n.id)}">Comprendre et m’entraîner ${icon('arrow')}</a></article>`;
  }
  function newsHome(){
    const first=newsItems().slice(0,2);
    if(!first.length)return '';
    return `<section class="spaced news-home"><div class="section-heading"><div><span class="eyebrow">LE DROIT DANS L’ACTUALITÉ</span><h2>Relier l’actualité à mes cours.</h2></div><a class="text-link" href="#actualites">Toute l’actualité ${icon('arrow')}</a></div><p class="small muted">Dernière vérification : ${dateLabel(newsData.lastChecked)} · Explications ajoutées pour la L1.</p><div class="news-grid">${first.map(newsCard).join('')}</div></section>`;
  }
  function newsNav(scope,query=''){
    return `<nav class="filters" aria-label="Filtrer les actualités">${[['all',query?'Tout':'Dernière édition'],['france','France'],['international','International'],['archives','Toutes les éditions']].map(([id,label])=>`<a class="filter-chip ${id===scope?'active':''}" href="${esc(newsListUrl(id,query))}" ${id===scope?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
  }
  function newsPagination(page,total,scope,query=''){
    if(total<=1)return '';
    return `<nav class="news-pagination" aria-label="Pages des actualités">${page>1?button('Page précédente',newsListUrl(scope,query,page-1),false,'back'):''}<span>Page ${page} sur ${total}</span>${page<total?button('Page suivante',newsListUrl(scope,query,page+1),false,'arrow'):''}</nav>`;
  }
  function newsEditionBlock(e){
    const items=newsItems().filter(n=>n.edition===e.date);
    return `<section class="news-edition"><div class="section-heading"><h2><a href="#actualites/edition/${esc(e.date)}">Édition du ${dateLabel(e.date)}</a></h2><span class="small muted">${items.length} brève${items.length>1?'s':''}</span></div>${e.note?`<p class="news-edition-note">${esc(e.note)}</p>`:''}${items.length?`<div class="news-grid">${items.map(newsCard).join('')}</div>`:'<p class="notice">Aucune nouvelle brève publiée dans cette édition. Les éditions précédentes restent disponibles.</p>'}</section>`;
  }
  function newsEditionPage(date){
    const editions=newsEditions(),index=editions.findIndex(e=>e.date===date);
    if(index<0)return notFound();
    return `${header('Édition du '+dateLabel(date),'Retrouver les nouvelles et les précisions publiées à cette date.','ACTUALITÉ JURIDIQUE',button('Toutes les éditions','#actualites/archives',false,'back'))}${newsEditionBlock(editions[index])}<nav class="news-pagination" aria-label="Naviguer entre les éditions">${editions[index+1]?button('Édition précédente','#actualites/edition/'+editions[index+1].date,false,'back'):''}${editions[index-1]?button('Édition suivante','#actualites/edition/'+editions[index-1].date,false,'arrow'):''}</nav>`;
  }
  function newsPage(route){
    if(route[1]==='article')return newsArticle(route[2]);
    if(route[1]==='edition')return newsEditionPage(route[2]);
    const searching=route[1]==='recherche',scope=searching?(route[3]||'all'):(route[1]||'all');
    if(!['all','france','international','archives'].includes(scope))return notFound();
    const query=searching?String(route[2]||'').trim().slice(0,160):'',requested=Number(searching?route[4]||1:route[2]||1);
    if(!Number.isSafeInteger(requested)||requested<1)return notFound();
    const editions=newsEditions(),edition=editions[0],term=normalize(query);
    let items=newsItems().filter(n=>(!['france','international'].includes(scope)||n.scope===scope)&&(!term||normalize([n.title,n.summary,n.institution,n.status,...n.facts,...n.explanation,n.course.text,...(n.glossary||[]).flatMap(g=>[g.term,g.meaning])].join(' ')).includes(term)));
    if(scope==='all'&&!query)items=items.filter(n=>n.edition===edition?.date);
    const archive=scope==='archives'&&!query,total=Math.max(1,Math.ceil((archive?editions.length:items.length)/(archive?10:12))),page=Math.min(requested,total);
    let list='';
    if(archive)list=editions.slice((page-1)*10,page*10).map(newsEditionBlock).join('');
    else if(scope==='all'&&!query&&edition)list=newsEditionBlock(edition);
    else{
      let last='';list=`<div class="news-archive">${items.slice((page-1)*12,page*12).map(n=>{const heading=n.edition!==last?`<h2 class="news-date"><a href="#actualites/edition/${esc(n.edition)}">Édition du ${dateLabel(n.edition)}</a></h2>`:'';last=n.edition;return heading+newsCard(n);}).join('')}</div>`;
    }
    const title=query?'Les actualités qui m’intéressent.':scope==='archives'?'Toutes les éditions.':scope==='france'?'L’actualité juridique en France.':scope==='international'?'Le droit au-delà des frontières.':'Actualité juridique';
    const caption=query?`${items.length} résultat${items.length>1?'s':''} pour « ${query} » dans les éditions conservées.`:archive?`${editions.length} édition${editions.length>1?'s':''} conservée${editions.length>1?'s':''}, y compris les jours sans nouvelle brève.`:`${items.length} brève${items.length>1?'s':''} dans cette sélection.`;
    const noResults=!items.length&&!archive&&!(scope==='all'&&!query&&edition);
    return `${header(title,'Justice, droits et institutions : comprendre les faits et les relier à tes cours.','FRANCE & INTERNATIONAL')}${newsFreshness()}${newsSearch(query,scope)}${newsNav(scope,query)}<p class="count-caption" role="status">${esc(caption)}</p>${noResults?empty(query?'Aucune actualité ne correspond à cette recherche.':'Aucune nouvelle brève dans cette sélection.',query?'Essaie un autre mot ou élargis la zone.':'Les autres éditions restent accessibles.',button('Toutes les éditions','#actualites/archives',false,'book')):list||empty('Aucune édition pour le moment.','La première sélection est en préparation.','')}${newsPagination(page,total,scope,query)}<details class="panel spaced news-editorial"><summary>Comment sont préparées ces actualités ?</summary><p>Les faits sont reformulés à partir de sources officielles et séparés des explications ajoutées pour la L1. Les dates et la portée exacte de chaque texte ou décision restent visibles.</p><p>La sélection vise une brève française et une internationale par jour, quand une nouveauté fiable est disponible. Les archives conservent aussi les éditions sans nouvelle brève. Les questions sont des entraînements ajoutés, sans note universitaire ni évaluation automatique d’un texte libre.</p></details>`;
  }
  function newsQuiz(n){
    const q=n.check;if(!q)return '';
    const picked=Object.hasOwn(newsAnswers,n.id)?newsAnswers[n.id]:null,answered=picked!==null,correct=picked===q.correct;
    return `<section class="news-quiz" id="news-check"><span class="eyebrow">M’ENTRAÎNER · QUESTION AJOUTÉE</span><h2>Ai-je compris la décision ?</h2><p>${esc(q.question)}</p><div class="quiz-options">${q.options.map((option,i)=>`<button class="quiz-option ${answered?(i===q.correct?'correct':i===picked?'incorrect':''):''}" data-action="news-answer" data-id="${esc(n.id)}" data-option="${i}" ${answered?'disabled':''}><span class="option-letter">${String.fromCharCode(65+i)}</span><span class="quiz-option-text">${esc(option)}${answered&&(i===q.correct||i===picked)?`<small class="answer-label">${i===q.correct?'Bonne réponse'+(i===picked?' · ton choix':''):'Mauvaise réponse · ton choix'}</small>`:''}</span></button>`).join('')}</div>${answered?`<div class="quiz-feedback ${correct?'correct':'incorrect'}" role="status"><strong>${correct?'Bonne réponse.':'À reprendre.'}</strong><p>${esc(q.explanation)}</p></div><button class="btn" data-action="news-retry" data-id="${esc(n.id)}">${icon('refresh')}Réessayer</button>`:'<p class="small muted">Choisis une réponse pour afficher la correction et son explication.</p>'}<p class="small muted">Cet essai reste temporaire dans la page. Il ne modifie pas ta progression.</p></section>`;
  }
  function handleNewsAction(action,id,target){
    if(!['news-answer','news-retry'].includes(action))return false;
    const n=newsData.items.find(n=>n.id===id);if(!n?.check)return true;
    if(action==='news-retry')delete newsAnswers[id];
    else{
      const choice=Number(target.dataset.option);
      if(Object.hasOwn(newsAnswers,id)||!Number.isInteger(choice)||choice<0||choice>=n.check.options.length)return true;
      newsAnswers[id]=choice;
    }
    render(false);return true;
  }
  function newsArticle(id){
    const n=newsData.items.find(x=>x.id===id);if(!n)return notFound();
    const course=chapterById[n.course.chapter],glossary=n.glossary||[];
    const jumps=[['news-facts','Comprendre'],...(glossary.length?[['news-vocabulary','Vocabulaire']]:[]),['news-practice','M’entraîner'],['news-sources','Sources']];
    return `${header(n.title,n.summary,newsScope(n.scope).toUpperCase()+' · ÉDITION DU '+dateLabel(n.edition).toUpperCase(),button('Mon édition','#actualites/edition/'+n.edition,false,'back'))}<div class="news-article-meta"><span class="pill">${esc(n.institution)}</span><span class="pill">${esc(n.status)}</span><span class="pill">${newsMinutes(n)} min · lecture et rappel</span><p>Événement : <time datetime="${esc(n.eventDate)}">${dateLabel(n.eventDate)}</time> · ${n.sourcePublished?'Source publiée le '+dateLabel(n.sourcePublished):'Date de mise en ligne non établie'} · Vérifié le ${dateLabel(n.checked)}</p></div><nav class="filters news-reading-nav" aria-label="Dans cette actualité">${jumps.map(([id,label])=>`<a class="filter-chip" href="#${id}" data-scroll="${id}">${label}</a>`).join('')}</nav><article class="reader news-article"><div class="reader-body"><section id="news-facts"><span class="eyebrow">FAITS · SYNTHÈSE DE LA SOURCE OFFICIELLE</span><h2>Ce qui s’est passé</h2>${n.facts.map(t=>`<p>${esc(t)}</p>`).join('')}</section><section><span class="eyebrow">EXPLICATION AJOUTÉE</span><h2>La portée de cette actualité</h2>${n.explanation.map(t=>`<p>${esc(t)}</p>`).join('')}</section>${glossary.length?`<section id="news-vocabulary" class="news-vocabulary"><span class="eyebrow">VOCABULAIRE · EXPLICATIONS AJOUTÉES</span><h2>Les mots à comprendre</h2><dl>${glossary.map(g=>`<dt>${esc(g.term)}</dt><dd>${esc(g.meaning)}</dd>`).join('')}</dl></section>`:''}<section class="news-course"><span class="eyebrow">FAIRE LE LIEN AVEC LA L1</span><h2>${esc(n.course.label)}</h2><p>${esc(n.course.text)}</p>${course?button('Revoir le chapitre','#chapter/'+course.id+'/cours',false,'book'):button('Revoir la matière','#subject/'+n.subject,false,'book')}</section><section id="news-practice"><h2>Passer de la lecture à une réponse</h2><p class="news-instruction">Explique d’abord à voix haute ce qui a été décidé et ce qui reste ouvert. Essaie ensuite les questions avant de lire les corrections.</p>${newsQuiz(n)}<section class="news-recall"><h3>Une question pour retenir</h3><p>${esc(n.recall.question)}</p><details><summary>Voir l’explication après ma réponse</summary><p>${esc(n.recall.answer)}</p></details></section></section><section class="news-sources" id="news-sources"><h2>Lire les sources</h2><ul>${n.sources.map(s=>`<li><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${icon('external')}${esc(s.label)}</a></li>`).join('')}</ul><p class="small muted">Reformulation pédagogique originale. Les sources restent la référence pour la teneur exacte et la portée de la décision.</p></section>${n.corrections?.length?`<section><h2>Précisions apportées après publication</h2>${n.corrections.map(c=>`<p>${dateLabel(c.date)} : ${esc(c.text)}</p>`).join('')}</section>`:''}</div></article><div class="page-actions spaced">${button('Toutes les actualités','#actualites',false,'back')}${button('Autres nouvelles de '+(n.scope==='france'?'France':'l’international'),'#actualites/'+n.scope,false,'globe')}${button('Toutes les éditions','#actualites/archives',false,'book')}</div>`;
  }
  document.addEventListener('submit',event=>{
    if(event.target.id!=='news-search-form')return;
    event.preventDefault();
    const query=String(event.target.elements.q.value).trim().slice(0,160),value=event.target.elements.scope.value,scope=['france','international'].includes(value)?value:'all';
    location.hash=newsListUrl(scope,query);
  });

  // END NEWS UI
  function home() {
    const recent=(chapterById[state.lastChapter]&&state.chapters[state.lastChapter]!=='done'?chapterById[state.lastChapter]:null) || D.chapters.find(c=>state.chapters[c.id]==='started') || D.chapters.find(c=>state.chapters[c.id]!=='done') || D.chapters[0];
    return `${header('Mon semestre, à mon rythme.','Un espace pour retrouver tes cours, comprendre les notions et réviser un peu chaque jour.','BIENVENUE DANS TON ATELIER',`<span class="pill date-pill">${icon('book')}${D.subjects.length} matières · S1</span>`)}${dailyOverview()}${examResume()}<section class="hero"><div><span class="eyebrow">Le prochain petit pas</span><h2>${state.chapters[recent.id]==='started'?'Reprendre là où tu en étais.':'Un chapitre aujourd’hui,<br>une notion en plus.'}</h2><p>${esc(subjectName(recent.subject))} · ${esc(recent.title)}<br>Le cours et ta fiche sont réunis au même endroit.</p>${button('Apprendre ce chapitre',`#parcours/${recent.id}/comprendre`,true)}${button('Lire le cours',`#chapter/${recent.id}/cours`,false,'book')}${button('Préparer mes examens','#examens',false,'clock')}</div><div class="hero-art" aria-hidden="true"><span class="floating-label one">Comprendre</span><div class="hero-orbit">${icon('balance')}</div><span class="floating-label two">Puis mémoriser</span></div></section><div class="stats"><div class="stat"><span class="stat-icon">${icon('book')}</span><div><strong>${D.chapters.length}</strong><small>chapitres disponibles</small></div></div><div class="stat"><span class="stat-icon">${icon('cards')}</span><div><strong>${dueCards().length}</strong><small>cartes à découvrir ou revoir</small></div></div><div class="stat"><span class="stat-icon">${icon('check')}</span><div><strong>${done()}<span class="muted" style="font-size:13px"> / ${D.chapters.length}</span></strong><small>chapitres marqués révisés</small></div></div></div><section><div class="section-heading"><h2>Mes matières</h2><a class="text-link" href="#sources">Voir mes documents ${icon('arrow')}</a></div><div class="cards-grid" data-count="${D.subjects.length}">${D.subjects.map(subjectCard).join('')}</div></section><div class="lower-grid"><section class="panel training-panel"><div class="deck-art" aria-hidden="true">${icon('cards')}</div><div><span class="eyebrow">Révision active</span><h2>Faire travailler ma mémoire.</h2><p>Définitions et questions de compréhension, avec leur passage source.</p>${button('Lancer une session','#cards/all',true)}</div></section><section class="panel"><span class="eyebrow">Changer de perspective</span><h2>Relier les idées.</h2><div class="tool-list"><a class="tool-row" href="#examens"><span>${icon('clock')}Mes contrôles et partiels blancs</span>${icon('arrow')}</a><a class="tool-row" href="#td"><span>${icon('folder')}Mes TD et leurs corrections</span>${icon('arrow')}</a><a class="tool-row" href="#methodologie"><span>${icon('note')}Méthodologie & entraînements</span>${icon('arrow')}</a><a class="tool-row" href="#quiz"><span>${icon('check')}${D.quizzes.length} questions avec correction</span>${icon('arrow')}</a><a class="tool-row" href="#timeline"><span>${icon('timeline')}${D.timelines.length} repères chronologiques</span>${icon('arrow')}</a><a class="tool-row" href="#schemes"><span>${icon('scheme')}${D.schemes.length} schémas pour comprendre</span>${icon('arrow')}</a><a class="tool-row" href="#corrections"><span>${icon('info')}${readingNotes.length} corrections & précisions</span>${icon('arrow')}</a><a class="tool-row" href="#references"><span>${icon('feather')}Auteurs & approfondissements</span>${icon('arrow')}</a></div></section></div>${newsHome()}`;
  }
  function chapterRow(c) {
    const status=state.chapters[c.id], starred=state.favorites.includes(c.id);
    return `<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/cours"><span class="chapter-number">${status==='done'?icon('check'):String(c.number).padStart(2,'0')}</span><span class="chapter-title"><h3>${esc(c.title)} ${starred?`<span class="pinned-star">${icon('star')}</span>`:''}</h3><small>${c.generated?'Complément UNJF · Cours et fiche':'Cours · Fiche'} · ${c.minutes} min de lecture${c.partial?' · Contenu partiel':''}</small></span><span class="status ${status==='done'?'complete':''}"><span class="status-dot"></span>${status==='done'?'Révisé':status==='started'?'En cours':'À découvrir'}</span>${icon('chevron')}</a>`;
  }
  function subjectPage(id) {
    const s=subjects[id];if(!s)return notFound();
    const chapters=D.chapters.filter(c=>c.subject===id);
    let last='';
    return `${header(s.title,s.description,'MA MATIÈRE · SEMESTRE 1',button('Réviser les cartes',`#cards/${id}`,false,'cards')+button('Fiche complète',`#document/${id}-fiche`,false,'book')+button('Les compléments',`#references/${id}/additions`,false,'feather')+button('Points vérifiés',`#corrections/${id}`,false,'info'))}${tabs([['chapters','Mes chapitres',`#subject/${id}`],...(['public','prive'].includes(id)?[['td','Mes TD',`#td/${id}`],['examens','Examens',`#examens/${id==='public'?'public':'controle'}`]]:[]),['apprendre','Leçons expliquées',`#apprendre/matiere/${id}`],['methodologie','Méthodologie',`#methodologie/matiere/${id}`],['timeline','Frise',`#timeline/${id}`],['references','Approfondir',`#references/${id}`],['sources','Documents',`#sources/${id}`]],'chapters')}${D.notices.filter(n=>n.subject===id).map(n=>notice(n.text)).join('')}<div class="section-heading"><h2>Le plan de ma matière</h2><span class="small muted">${done(id)} / ${chapters.length} révisés</span></div><div class="chapter-list">${chapters.map(c=>{const part=c.part!==last?`<h3 class="part-heading">${esc(c.part)}</h3>`:'';last=c.part;return part+chapterRow(c);}).join('')}</div>${id==='international'&&D.internationalSuite?`<section class="panel spaced suite-panel"><span class="eyebrow">SUITE RÉDIGÉE · SUPPORT AJOUTÉ</span><h2>La suite du programme avec les ressources UNJF</h2><p>Cinq chapitres rédigés poursuivent tes notes de CM : diplomatie, règlement juridictionnel, usage de la force, droit humanitaire et responsabilité de protéger. Ils comportent des fiches et exercices. Les sources officielles complètent les leçons UNJF lorsque nécessaire.</p><div class="page-actions">${button('Commencer la suite','#chapter/international-07/cours',true,'book')}${button('Tout le cours complémentaire','#document/international-complement-cours',false,'book')}${button('Les fiches du complément','#document/international-complement-fiche',false,'cards')}</div><p class="small spaced">Complément préparé à partir des ressources. Il reste distinct du CM et des consignes du professeur.</p></section>`:''}${id==='histoire'?`<section class="panel spaced"><h2>Ma fiche complète et l’archive</h2><p>La fiche et les exercices suivent uniquement le cours actuel jusqu’au CM5. L’ancien cours reste accessible à part.</p><div class="page-actions">${button('Lire la fiche complète','#document/histoire-fiche',false,'book')}${button('Consulter l’archive','#document/histoire-archive',false,'folder')}</div></section>`:''}`;
  }
  function paragraph(p,highlight=false) {
    let tag='p',cls='';
    if(p.level!==null && p.level<3){tag=['h2','h3','h4'][p.level];cls='source-heading';}
    else if(!p.style && p.text.length<200 && /^(CHAPITRE|Chapitre|PARTIE|Partie|INTRODUCTION|Introduction générale)/.test(p.text)){tag='h2';cls='source-heading';}
    else if(!p.style && p.text.length<150 && /^(Section|SECTION|[IVX]+\s*[-:.]|[A-D]\s*[.-])/.test(p.text)){tag='h3';cls='source-heading';}
    else if(/Definition/i.test(p.style))cls='definition';
    else if(/Bullet|Compact List/.test(p.style))cls='source-bullet';
    else if(/SmallNote/.test(p.style))cls='source-note';
    else if(/Correction/.test(p.style))cls='source-correction';
    const text=p.links?'Sources : '+p.links.map(link=>`<a class="source-link" href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label)}</a>`).join(' · '):esc(p.text);
    return `<${tag} id="p-${p.index}" class="${cls} ${highlight?'spotlight':''}">${text}</${tag}>`;
  }
  function accompaniedParagraph(doc,p,highlight=false) {
    const notes=passageNotes(doc.id,p.index);
    const corrected=notes.some(n=>['Correction','Mise à jour'].includes(n.kind));
    if(!corrected)return paragraph(p,highlight)+notes.map(n=>readingNote(n,true)).join('');
    const original=paragraph(p,false).replace(`id="p-${p.index}"`,'');
    return `<div id="p-${p.index}" class="accompanied-passage ${highlight?'spotlight':''}">${notes.map(n=>readingNote(n,true)).join('')}<details class="source-original"><summary>Voir le passage original à corriger</summary><p class="small muted">Ce passage contient une erreur ou une formulation à actualiser. L’explication ajoutée ci-dessus indique le point à retenir.</p>${original}</details></div>`;
  }
  function renderReader(doc,ps,label,highlight=null) {
    const headings=ps.filter(p=>(p.level!==null&&p.level<2)||(!p.style&&p.text.length<150&&/^(CHAPITRE|Chapitre|PARTIE|Partie|Section|INTRODUCTION|Introduction générale|[IVX]+\s*[-:.]|[A-D]\s*[.-])/.test(p.text)));
    const kind=doc.kind==='cours'?(doc.generated?'Cours complémentaire rédigé · UNJF et sources officielles':'Cours fourni · notes originales'):doc.kind==='fiche'?(doc.generated?(doc.provenance==='unjf-complement'?'Fiche préparée · complément UNJF':'Fiche préparée à partir du cours'):'Fiche de révision fournie'):doc.kind==='officiel'?'Plan officiel conservé dans le projet':'Archive du projet';
    return `<details class="reading-index"><summary>Sommaire de cette lecture</summary><nav aria-label="Sommaire sur téléphone">${headings.map(p=>`<a href="#p-${p.index}" data-scroll="p-${p.index}">${esc(p.text.slice(0,125))}</a>`).join('')}</nav><button class="btn" data-action="print">${icon('print')}Imprimer la lecture</button></details><div class="reader-layout"><article class="reader"><div class="source-strip"><span>${icon('book')} ${kind}</span><a class="source-link" href="${doc.url}" download="${esc(doc.name)}">${icon('download')}${doc.generated?(doc.kind==='cours'?'Cours Word':'Fiche Word'):'Document original'}</a></div><div class="reader-body">${ps.map(p=>accompaniedParagraph(doc,p,p.index===highlight)).join('')}</div></article><aside class="reading-tools" aria-label="Sommaire de la lecture"><button class="btn" data-action="print">${icon('print')}Imprimer la lecture</button><h3>Dans cette lecture</h3>${headings.map(p=>`<a href="#p-${p.index}" data-scroll="p-${p.index}">${esc(p.text.slice(0,125))}</a>`).join('')}<p>Les corrections et actualisations sont affichées en priorité. Les passages originaux concernés se déplient ; les précisions seules conservent le texte visible. Pour la mise en page, ouvre le document conservé.</p></aside></div>`;
  }
  function chapterPage(id,tab='cours') {
    const c=chapterById[id];if(!c)return notFound();
    if(!['cours','fiche','cartes','quiz','notes','plus','corrections'].includes(tab))tab='cours';
    const star=state.favorites.includes(id),status=state.chapters[id];
    const actions=`<button class="btn ${star?'pinned-star':''}" data-action="favorite" data-id="${id}" aria-pressed="${star}">${icon('star')}${star?'En favoris':'Favori'}</button><button class="btn ${status==='done'?'':'primary'}" data-action="complete" data-id="${id}" aria-pressed="${status==='done'}">${icon('check')}${status==='done'?'Marqué révisé':'Marquer révisé'}</button>`;
    const intro=`<a class="text-link back" href="#subject/${c.subject}">${icon('back')}${esc(subjectName(c.subject))}</a>${header(c.title,c.part,`${c.generated?'COMPLÉMENT UNJF':'CHAPITRE'} ${String(c.number).padStart(2,'0')} · ${subjectName(c.subject).toUpperCase()}`,actions)}${tabs([['cours','Cours',`#chapter/${id}/cours`],['fiche','Fiche',`#chapter/${id}/fiche`],['cartes','Flashcards',`#chapter/${id}/cartes`],['quiz','Quiz',`#chapter/${id}/quiz`],['plus','Approfondir',`#chapter/${id}/plus`],['corrections','Points vérifiés',`#chapter/${id}/corrections`],['notes','Mes notes',`#chapter/${id}/notes`]],tab)}`;
    if(tab==='quiz')return intro+quizLanding(c.subject,id,false);
    if(tab==='corrections'){
      const notes=readingNotes.filter(n=>n.targets.some(t=>[c.course,c.fiche].some(r=>r.doc===t.doc&&t.index>=r.start&&t.index<r.end)));
      return intro+(notes.length?`<p class="lead">Corrections et précisions ajoutées après comparaison des documents et vérification des points signalés. Le passage original concerné reste accessible dans la lecture, sous une rubrique à déplier.</p><div class="reference-grid">${notes.map(n=>readingNote(n)).join('')}</div>`:notice('Aucun point particulier n’a été signalé pour ce chapitre lors de la relecture du 14 octobre 2026. Les compléments et les consignes du professeur restent accessibles séparément.'));
    }

    if(tab==='notes')return intro+`<label class="screen-reader-only" for="chapter-note">Mes notes sur ${esc(c.title)}</label><textarea class="note-editor" id="chapter-note" data-chapter="${id}" maxlength="100000" placeholder="Ce que j’ai compris, mes exemples, les questions à poser…">${esc(state.notes[id]||'')}</textarea><p class="note-status" id="note-status">${storageAvailable?'Enregistrement automatique sur cet appareil.':'Stockage indisponible. Exporte tes notes avant de fermer.'}</p><p class="small muted">Ces notes sont tes ajouts personnels. Elles restent séparées du cours et de la fiche.</p>`;
    if(tab==='cartes'){
      const cards=D.cards.filter(card=>card.chapter===id);
      return intro+(cards.length?`<p class="lead">${cards.length} cartes de révision sont liées à ce chapitre. Tu peux les consulter ou les travailler dans une session.</p>${button('Réviser ces cartes',`#cards/chapter/${id}`,true,'cards')}<div class="reference-grid spaced">${cards.map(card=>`<article class="reference-card"><span class="eyebrow">${esc(card.type)} · ${card.added?'Support ajouté':sourceLabel(card.source)}</span><h3>${esc(card.question)}</h3><p>${esc(card.answer)}</p>${sourceLink(card.source)}</article>`).join('')}</div>`:empty('Pas encore de cartes pour ce chapitre.','Le premier lot reprend les définitions des glossaires fournis. De nouvelles cartes pourront être ajoutées lorsque tu me les demanderas.',button('Réviser cette matière',`#cards/${c.subject}`,true,'cards')));
    }
    if(tab==='plus'){
      const additions=D.enrichments.filter(e=>e.chapter===id);
      const articles=(D.articles||[]).filter(a=>a.chapter===id),schemes=D.schemes.filter(s=>s.chapter===id);
      return intro+`<p class="lead">Les compléments de ta fiche et les nouveaux supports sont identifiés par leur provenance. Ils ne remplacent pas les consignes du professeur.</p>${additions.length?`<h2>Compléments et exercices</h2><div class="reference-grid">${additions.map(e=>guideCard(e,false)).join('')}</div>`:''}${articles.length?`<h2 class="spaced">Lire les articles officiels</h2><div class="reference-grid">${articles.map(a=>articleCard(a,false)).join('')}</div>`:''}${schemes.length?`<section class="panel spaced"><h2>Organiser les idées</h2><p>${schemes.map(s=>esc(s.title)).join(' · ')}</p>${button('Voir les schémas',`#schemes/${c.subject}`,false,'scheme')}</section>`:''}${!additions.length&&!articles.length&&!schemes.length?empty('Explorer les liens entre les notions.','Retrouve les auteurs, les compléments et les ressources de la matière.',button('Approfondir cette matière',`#references/${c.subject}`,true,'feather')):''}`;
    }
    const range=tab==='cours'?c.course:c.fiche,doc=docs[range.doc],ps=doc.paragraphs.slice(range.start,range.end);
    const courseNote=c.generated?notice('Cours complémentaire rédigé à partir des leçons UNJF, des fiches et de sources officielles. Les sources figurent au fil des sections. Ce support ajouté ne constitue pas le CM de ton professeur.'):tab==='cours'?notice('Notes de cours conservées telles que fournies. Les corrections et nuances présentes dans ta fiche ne sont pas appliquées silencieusement aux notes originales.'):'';
    const partial=c.partial?notice(c.partialNote||'Le document s’arrête au début des immunités diplomatiques. La suite du programme n’est pas encore fournie.'):'';
    const chapters=D.chapters.filter(x=>x.subject===c.subject),position=chapters.indexOf(c);
    const nav=`<div class="reader-nav">${position?button('Chapitre précédent',`#chapter/${chapters[position-1].id}/${tab}`,false,'back'):'<span></span>'}${position<chapters.length-1?button('Chapitre suivant',`#chapter/${chapters[position+1].id}/${tab}`):button('Retour à la matière',`#subject/${c.subject}`)}</div>`;
    const corrections=readingNotes.filter(n=>n.targets.some(t=>t.doc===doc.id&&t.index>=range.start&&t.index<range.end));
    const checked=corrections.length?`<div class="reading-alert"><strong>${corrections.length} point${corrections.length>1?'s':''} corrigé${corrections.length>1?'s':''} ou précisé${corrections.length>1?'s':''} dans cette lecture.</strong><span>Les notes ajoutées apparaissent sous les passages concernés.</span><a class="source-link" href="#chapter/${id}/corrections">Voir les points vérifiés ${icon('arrow')}</a></div>`:'';
    const continuation=id==='international-06'&&D.internationalSuite?`<section class="panel suite-panel spaced"><h2>Poursuivre avec le complément UNJF</h2><p>La suite rédigée commence par les missions et immunités diplomatiques, puis poursuit le plan officiel.</p>${button('Lire la suite','#chapter/international-07/'+tab,true,'arrow')}</section>`:'';
    return intro+courseNote+partial+checked+chapterLearning(c)+renderReader(doc,ps,tab)+chapterLearningEnd(c)+continuation+nav;
  }
  function documentPage(id,index) {
    const doc=docs[id];if(!doc)return notFound();
    const p=Number(index),highlight=index!==undefined&&Number.isInteger(p)&&p>=0&&p<doc.paragraphs.length?p:null;
    return `<a class="text-link back" href="#sources/${doc.subject}">${icon('back')}Cours & documents</a>${header(doc.displayTitle||(doc.kind==='cours'?`Cours de ${subjectName(doc.subject).toLowerCase()}`:doc.kind==='fiche'?`Fiche · ${subjectName(doc.subject)}`:doc.kind==='officiel'?'Plan officiel des institutions internationales':'Archive nommée Syllabus'),doc.name,doc.generated?(doc.provenance==='unjf-complement'?'COMPLÉMENT RÉDIGÉ · UNJF ET SOURCES OFFICIELLES':'FICHE PRÉPARÉE · COURS ACTUEL'):doc.kind==='archive'?'ARCHIVE · ANNÉE ANTÉRIEURE':'DOCUMENT FOURNI · TEXTE INTÉGRAL')}${doc.note?notice(doc.note):''}${notice('Les tableaux sont présentés ici dans leur ordre de lecture. Les illustrations et la mise en page d’origine sont disponibles dans le document à télécharger. Les annotations du site sont des explications ajoutées ; le téléchargement conserve le texte reçu.')}${renderReader(doc,doc.paragraphs,'Document',highlight)}`;
  }
  function sourcesPage(selected='all') {
    if(!subjects[selected])selected='all';
    const list=D.documents.filter(d=>(selected==='all'||d.subject===selected)&&['cours','fiche'].includes(d.kind));
    return `${header('Ma bibliothèque de cours.','Les documents que tu as transmis, les ressources du projet et leur provenance.','COURS & DOCUMENTS')}${filters('sources',selected)}${selected==='all'||selected==='prive'?`<section class="panel recap-link"><h2>Mon récapitulatif d’articles de compétence</h2><p>Explications ajoutées après relecture des trois pages photographiées que tu as transmises.</p>${button('Consulter la version expliquée','#examens/recapitulatif',false,'book')}</section>`:''}<div class="reference-grid">${list.map(d=>`<article class="reference-card ${subjects[d.subject].color}"><span class="eyebrow">${esc(subjectName(d.subject))} · ${documentLabel(d)}</span><h3>${d.provenance==='unjf-complement'?(d.kind==='cours'?'Cours complémentaire UNJF':'Fiches du complément UNJF'):d.kind==='cours'?'Mes notes de cours':'Ma fiche de révision'}</h3><p class="file-name">${esc(d.name)}</p><p>${d.paragraphs.length} paragraphes accessibles en lecture.<br>${d.provenance==='unjf-complement'?'Support ajouté rédigé à partir des leçons UNJF et de sources officielles.':d.generated?'Fiche préparée à partir du cours actuel, dans la présentation des autres fiches.':'Document original conservé à l’identique.'}</p><div class="page-actions">${button('Lire',`#document/${d.id}`,true,'book')}<a class="btn" href="${d.url}" download="${esc(d.name)}">${icon('download')}${d.generated?(d.kind==='cours'?'Cours Word':'Fiche Word'):'Original'}</a></div></article>`).join('')}</div>${selected==='all'||selected==='histoire'?`<section class="panel spaced"><h2>Histoire du droit : cours actuel et archive</h2><p>Le cours actuel et la fiche s’arrêtent au CM5. L’archive de l’année précédente est séparée et ne sert pas aux exercices de cette année.</p><div class="page-actions">${button('Fiche complète','#document/histoire-fiche',false,'book')}${button('Archive de l’année précédente','#document/histoire-archive',false,'folder')}</div></section>`:''}${selected==='all'||selected==='international'?`<section class="spaced"><h2>Références du cours d’institutions internationales</h2><p class="lead">Plan officiel, leçons UNJF et bibliographie du cours conservés dans le projet. Ces ressources restent distinctes de tes notes.</p>${D.notices.filter(n=>n.subject==='international').map(n=>notice(n.text)).join('')}<div class="resource-row"><div><h3>Plan du cours · L1 groupe 3 · 2026</h3><p>Contenu officiel conservé dans le projet. Moodle reste la référence actuelle.</p></div>${button('Consulter','#document/international-plan',false,'book')}</div><div class="resources-list spaced">${D.resources.map(r=>`<article class="resource-row"><div><h3>${esc(r.name.replace(/^UNJF \d+\. /,''))}</h3><p>${r.kind==='bibliography'?'Bibliographie officielle du cours':'UNJF'} · ${r.pages} pages · Ressource complémentaire du projet</p></div><a class="btn" href="${r.url}" target="_blank" rel="noopener">Ouvrir le PDF ${icon('external')}</a></article>`).join('')}</div><p class="count-caption">Seules les ressources accessibles dans ce projet ont été ajoutées. L’ensemble de ta bibliothèque ChatGPT n’a pas été parcouru.</p></section>`:''}`;
  }
  function cardStart(subject='all',chapter=null,collection=null) {
    const filtered=D.cards.filter(c=>collection?c.collection===collection:chapter?c.chapter===chapter:(subject==='all'||c.subject===subject));
    const available=filtered.filter(c=>!state.reviews[c.id]||state.reviews[c.id].due<=Date.now());
    const title=collection?'Les articles de compétence':chapter?chapterById[chapter]?.title:subjectName(subject);
    const startId=collection?`collection:${collection}`:chapter?`chapter:${chapter}`:subject;
    return `${header('Retrouver, sans relire.','Teste tes définitions et ta compréhension des mécanismes. Retourne chaque carte, puis indique si tu l’as retenue.','FLASHCARDS')}${collection?button('Retour aux articles','#examens/articles',false,'back'):!chapter?filters('cards',subject):`<a class="text-link back" href="#chapter/${chapter}/cartes">${icon('back')}Retour au chapitre</a>`}<section class="panel"><span class="eyebrow">${esc(title)}</span><h2>${available.length?'Une courte session pour avancer.':'Les cartes de ce lot ont été revues.'}</h2><p>${filtered.length} cartes dans ce lot · ${available.length} nouvelles ou à revoir aujourd’hui.</p><div class="page-actions"><button class="btn primary" data-action="start-session" data-target="${startId}" data-mode="due" ${!available.length?'disabled':''}>${icon('cards')}Commencer ${Math.min(10,available.length)} cartes</button><button class="btn" data-action="start-session" data-target="${startId}" data-mode="all" ${!filtered.length?'disabled':''}>Réviser aussi les cartes déjà vues ${icon('refresh')}</button></div><p class="small spaced">Les cartes viennent des fiches, des cours et des supports ajoutés ; chaque question indique sa source. « À revoir » programme un rappel dans environ 10 minutes. « Bien retenu » espace progressivement les rappels : 1 jour, puis 3, 7, 14, 30 et 60 jours selon les réussites lors de journées distinctes. Le suivi est enregistré sur cet appareil.</p></section>${!collection&&!chapter&&subject==='all'?`<div class="deck-summary">${D.subjects.map(s=>`<section class="deck-card ${s.color}"><span class="subject-visual">${icon(s.icon)}</span><h3 class="spaced">${esc(s.title)}</h3><p>${D.cards.filter(c=>c.subject===s.id).length} cartes · ${dueCards(s.id).length} à découvrir ou revoir</p>${button('Ouvrir le lot',`#cards/${s.id}`,false,'cards')}</section>`).join('')}</div>`:''}`;
  }
  function sessionPage() {
    if(!session)return cardStart();
    if(session.index>=session.cards.length)return `${header('Une session de plus.','Tu viens de travailler tes notions. Les prochaines dates de révision sont enregistrées.','FLASHCARDS')}<div class="empty-state">${icon('check')}<h2>${session.cards.length} cartes travaillées.</h2><div class="answer-result-summary"><p class="answer-good">${session.known} bien retenue${session.known>1?'s':''}</p><p class="answer-bad">${session.cards.length-session.known} à reprendre dans environ 10 minutes</p></div><div class="page-actions" style="justify-content:center"><button class="btn" data-action="end-session">Retour aux lots ${icon('back')}</button>${button('Continuer ma lecture','#subjects',true,'book')}</div></div>`;
    const card=session.cards[session.index];
    return `${header('Un instant pour mémoriser.','Réponds à voix haute ou dans ta tête avant de retourner la carte.','FLASHCARDS')}<div class="flash-workspace"><button class="btn ghost" data-action="end-session">${icon('back')}Quitter la session</button><div class="flash-meta"><span>${esc(subjectName(card.subject))}</span><span>Carte ${session.index+1} / ${session.cards.length}</span></div><div class="progress"><span style="width:${session.index/session.cards.length*100}%"></span></div><button class="flashcard spaced ${subjects[card.subject].color}" data-action="flip" aria-label="${session.flipped?'Afficher la question':'Afficher la réponse'}"><span class="eyebrow">${session.flipped?'La réponse · '+esc(sourceLabel(card.source)):esc(card.type)+' · '+(card.added?'Support ajouté':sourceLabel(card.source))}</span>${session.flipped?`<span class="answer">${esc(card.answer)}</span>`:`<span class="question">${esc(card.question)}</span>`}<small>${icon('refresh')}Cliquer pour ${session.flipped?'revoir la question':'retourner la carte'}</small></button>${session.flipped?`<div class="review-actions"><button class="btn again" data-action="grade" data-grade="again">${icon('refresh')}À revoir</button><button class="btn known" data-action="grade" data-grade="known">${icon('check')}Bien retenu</button></div><div class="flash-source">${sourceLink(card.source)}${card.secondarySource?sourceLink(card.secondarySource):''}</div>${contentReview(card)}`:`<div class="review-actions"><button class="btn primary" data-action="flip">Afficher la réponse ${icon('arrow')}</button></div>`}</div>`;
  }
  function timelinePage(selected='all') {
    if(!subjects[selected])selected='all';
    const items=D.timelines.filter(t=>selected==='all'||t.subject===selected).sort((a,b)=>a.year-b.year||a.date.localeCompare(b.date));
    return `${header('Situer les notions dans le temps.','Les repères historiques et les décisions recensés dans tes fiches, avec un accès au passage source.','FRISES CHRONOLOGIQUES')}${filters('timeline',selected)}<p class="count-caption">${items.length} repères · Repères issus des fiches de révision</p><div class="timeline">${items.map(t=>`<article class="timeline-item ${subjects[t.subject].color}"><div class="timeline-date">${esc(t.date)}</div><span class="timeline-dot" aria-hidden="true"></span><div class="timeline-content"><span class="pill">${esc(subjectName(t.subject))}</span><p>${esc(t.text)}</p>${sourceLink(t.source)}</div></article>`).join('')}</div>`;
  }
  function schemesPage(selected='all') {
    if(!subjects[selected])selected='all';
    return `${header('Voir les liens entre les idées.','Des schémas pour organiser ce que tu apprends. Chaque schéma indique son passage de fiche ou sa source officielle.','SCHÉMAS DE RÉVISION')}${filters('schemes',selected)}${D.schemes.filter(s=>selected==='all'||s.subject===selected).map(s=>`<article class="scheme ${subjects[s.subject].color}"><span class="eyebrow">${esc(subjectName(s.subject))} · Support ajouté</span><h2>${esc(s.title)}</h2><div class="center-node">${esc(s.center)}</div><div class="scheme-line"></div><div class="scheme-nodes" data-count="${s.nodes.length}">${s.nodes.map(n=>`<div class="scheme-node"><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p></div>`).join('')}</div><div class="scheme-caption"><span>${esc(s.caption)}</span>${sourceLink(s.source)}${s.secondarySource?sourceLink(s.secondarySource,'CPI dans la fiche'):''}</div></article>`).join('')}`;
  }
  function referencesPage(selected='all',tab='authors',category='all') {
    if(!subjects[selected])selected='all';
    const collection=tab==='bibliography'?D.bibliography:tab==='articles'?D.articles:tab==='decisions'?D.decisions:tab==='additions'?D.enrichments:D.authors;
    const items=(collection||[]).filter(item=>selected==='all'||item.subject===selected);
    if(tab==='additions')items.sort((a,b)=>Number(!!b.added)-Number(!!a.added));
    const intro=`${header('Comprendre un peu plus loin.','Auteurs, décisions, articles officiels et compléments. Les supports ajoutés restent distincts du cours et des fiches que tu as fournis.','AUTEURS & COMPLÉMENTS')}${filters('references',selected,tab)}${tabs([['authors','Les auteurs',`#references/${selected}/authors`],['articles','Articles officiels',`#references/${selected}/articles`],['decisions','Décisions & repères',`#references/${selected}/decisions`],['additions','Approfondissements',`#references/${selected}/additions`],['bibliography','Bibliographie',`#references/${selected}/bibliography`],['resources','Ressources',`#sources/${selected}`]],tab)}`;
    if(!items.length)return intro+empty('Pas encore de références dans cette sélection.','Les références sont ajoutées à partir de tes fiches et de textes officiels identifiés. Tu peux consulter les autres matières.',button('Toutes les références',`#references/all/${tab}`,false,'book'));
    if(tab==='bibliography')return intro+bibliographyCards(items,selected,category);
    if(tab==='additions')return intro+`<p class="lead">Mini-fiches et exercices préparés pour approfondir les notions. Les corrections proposées sont des supports de révision ajoutés.</p><p class="count-caption">${items.filter(item=>item.added).length} mini-fiches ajoutées · ${items.filter(item=>!item.added).length} compléments des fiches de révision</p><div class="reference-grid">${items.map(item=>guideCard(item)).join('')}</div>`;
    if(tab==='articles')return intro+`<p class="lead">Fiches de lecture ajoutées pour comprendre le texte et repérer les confusions. Les liens ouvrent la source officielle ; ces ajouts ne sont pas des consignes du professeur.</p><div class="reference-grid">${items.map(article=>articleCard(article)).join('')}</div>`;
    return intro+`<div class="reference-grid">${items.map(item=>`<article class="reference-card ${subjects[item.subject].color}"><span class="eyebrow">${esc(subjectName(item.subject))} · ${sourceLabel(item.source)}${item.date?' · '+esc(item.date):''}</span>${item.name||item.title?`<h3>${esc(item.name||item.title)}</h3>`:''}<p>${esc(item.text)}</p>${sourceLink(item.source)}</article>`).join('')}</div><p class="count-caption">Auteurs et décisions sont issus des fiches de révision ; celle d’histoire a été préparée à partir du cours actuel. Les articles officiels sont accompagnés de fiches de lecture ajoutées le 13 octobre 2026.</p>`;
  }
  function guideCard(item,includeChapter=true) {
    if(!item.added)return `<article class="reference-card ${subjects[item.subject].color}"><span class="eyebrow">${esc(subjectName(item.subject))} · ${sourceLabel(item.source)}</span>${item.title?`<h3>${esc(item.title)}</h3>`:''}<p>${esc(item.text)}</p>${sourceLink(item.source)}</article>`;
    return `<article class="reference-card study-guide ${subjects[item.subject].color}" id="guide-${item.id}"><span class="eyebrow">${esc(subjectName(item.subject))} · Support ajouté</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p><ul class="guide-points">${item.points.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><div class="practice-case"><strong>À toi de raisonner</strong><p>${esc(item.practice.question)}</p><details class="practice-solution"><summary>Voir la correction proposée</summary><p>${esc(item.practice.answer)}</p></details></div><p class="pitfall"><strong>À surveiller</strong><br>${esc(item.pitfall)}</p><div class="guide-sources">${sourceLink(item.source)}${item.source.url?sourceLink(item.courseSource,'Retrouver la fiche'):''}</div>${includeChapter?`<div class="page-actions">${button('Retrouver le chapitre',`#chapter/${item.chapter}/plus`,false,'book')}</div>`:''}<small class="muted">Complément préparé le ${dateLabel(item.checked)}.</small></article>`;
  }
  function bibliographyCards(items,subject,category='all') {
    const sections=[['all','Toutes les références'],['manuels','Manuels'],['revision','Pour réviser'],['approfondir','Pour aller plus loin'],['revues','Revues'],['sites','Sites institutionnels']];
    if(!sections.some(([id])=>id===category))category='all';
    const filtered=items.filter(item=>category==='all'||item.section===category);
    return `<p class="lead">Les 45 références de la bibliographie du cours d’institutions internationales, groupe 3, 2026. Elles indiquent des pistes de lecture ; les contenus des livres ne sont pas reproduits ici.</p><nav class="filters" aria-label="Catégories de la bibliographie">${sections.map(([id,label])=>`<a class="filter-chip ${category===id?'active':''}" href="#references/${subject}/bibliography/${id}">${label}</a>`).join('')}</nav><p class="count-caption">${filtered.length} référence${filtered.length>1?'s':''} dans cette sélection · Les notices du catalogue peuvent demander une connexion universitaire.</p><div class="reference-grid">${filtered.map(item=>`<article class="reference-card blue"><span class="eyebrow">${esc(item.sectionLabel)} · Bibliographie du cours</span><h3>${esc(item.title)}</h3><p>${esc(item.author)}${item.year?' · '+esc(item.year):''}</p><details class="bibliography-details"><summary>Informations du catalogue</summary><p>${esc(item.metadata)}</p></details><a class="source-link" href="${esc(item.url)}" target="_blank" rel="noopener">${icon('external')}Notice du catalogue</a></article>`).join('')}</div><div class="page-actions spaced"><a class="btn" href="documents/international-bibliographie.pdf" target="_blank" rel="noopener">${icon('book')}Ouvrir la bibliographie originale</a></div>`;
  }
  function articleCard(article,includeChapter=true) {
    return `<article class="reference-card ${subjects[article.subject].color}"><span class="eyebrow">${esc(article.reference)} · Support ajouté</span><h3>${esc(article.title)}</h3><p>${esc(article.summary)}</p><p class="pitfall"><strong>Point de vigilance</strong><br>${esc(article.pitfall)}</p>${sourceLink(article.source)}${includeChapter?`<div class="page-actions">${button('Retrouver le chapitre',`#chapter/${article.chapter}/plus`,false,'book')}</div>`:''}<small class="muted">Sources vérifiées le 13 octobre 2026.</small></article>`;
  }
  function shuffled(items) {
    const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;
  }
  function balancedSample(items,limit) {
    const groups=D.subjects.map(s=>shuffled(items.filter(item=>item.subject===s.id))),out=[];
    while(out.length<limit&&groups.some(g=>g.length)){for(const group of groups){if(group.length&&out.length<limit)out.push(group.shift());}}
    return out;
  }
  function quizLanding(selected='all',chapter=null,showHeader=true) {
    if(!subjects[selected])selected='all';
    const items=(D.quizzes||[]).filter(q=>chapter?q.chapter===chapter:(selected==='all'||q.subject===selected));
    const passed=items.filter(q=>state.quizzes[q.id]?.correct).length;
    const quizChapters=[...new Set(items.map(q=>q.chapter))].map(id=>chapterById[id]);
    const intro=showHeader?header('Vérifier que j’ai compris.','Choisis une réponse, lis la correction et retrouve le passage de ta fiche.','QUIZ CORRIGÉS')+(!chapter?filters('quiz',selected):`<a class="text-link back" href="#chapter/${chapter}/quiz">${icon('back')}Retour au chapitre</a>`):'';
    if(!items.length)return intro+empty('Le quiz n’est pas encore disponible.','Retrouve les questions et corrections des autres chapitres.',button('Tous les quiz','#quiz/all',false,'check'));
    const target=chapter?'chapter:'+chapter:selected;
    return `${intro}<section class="panel"><span class="eyebrow">${esc(chapter?chapterById[chapter].title:subjectName(selected))}</span><h2>${items.length===1?'Une question pour ce chapitre.':'Un petit test de compréhension.'}</h2><p>${items.length} question${items.length>1?'s':''} disponible${items.length>1?'s':''} · ${passed} déjà réussie${passed>1?'s':''} au moins une fois.</p><button class="btn primary" data-action="start-quiz" data-target="${esc(target)}">${icon('check')}Commencer ${Math.min(items.length,10)} question${items.length===1?'':'s'}</button><p class="small spaced">Exercices ajoutés à partir des fiches et des cours complémentaires. Ils servent à t’entraîner ; les consignes et le format du partiel restent ceux du professeur.</p></section>${showHeader&&!chapter?`<div class="chapter-list spaced">${quizChapters.map(c=>{const questions=items.filter(q=>q.chapter===c.id),score=questions.filter(q=>state.quizzes[q.id]?.correct).length;return `<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/quiz"><span class="chapter-number">${icon(score===questions.length?'check':'book')}</span><span class="chapter-title"><h3>${esc(c.title)}</h3><small>${esc(subjectName(c.subject))} · ${questions.length} questions corrigées · ${score} réussie${score>1?'s':''}</small></span>${icon('chevron')}</a>`;}).join('')}</div>`:''}`;
  }
  function quizPage() {
    if(!quizSession)return quizLanding();
    if(quizSession.index>=quizSession.questions.length)return `${header('Un point sur ma compréhension.','Relis les corrections des questions qui t’ont posé problème et retourne aux passages de ta fiche.','RÉSULTAT DU QUIZ')}<div class="empty-state">${icon('check')}<h2>${quizSession.score} / ${quizSession.questions.length} bonnes réponses</h2><div class="answer-result-summary" role="group" aria-label="Bilan de mes réponses"><p class="answer-good">${quizSession.score} bonne${quizSession.score>1?'s':''} réponse${quizSession.score>1?'s':''}</p><p class="answer-bad">${quizSession.questions.length-quizSession.score} réponse${quizSession.questions.length-quizSession.score>1?'s':''} à revoir</p></div><p>Ce résultat sert à orienter tes révisions. Il ne remplace pas un entraînement à la rédaction.</p><button class="btn primary" data-action="end-quiz">Retour aux quiz ${icon('back')}</button></div>`;
    const q=quizSession.questions[quizSession.index],answered=quizSession.chosen!==null,correct=quizSession.chosen===q.correct;
    return `${header('Comprendre, puis choisir.','Une seule réponse est attendue. La correction s’affiche après ton choix.','QUIZ CORRIGÉS')}<div class="flash-workspace"><button class="btn ghost" data-action="end-quiz">${icon('back')}Quitter le quiz</button><div class="flash-meta"><span>${esc(subjectName(q.subject))}</span><span>Question ${quizSession.index+1} / ${quizSession.questions.length}</span></div><div class="progress"><span style="width:${quizSession.index/quizSession.questions.length*100}%"></span></div><section class="quiz-question spaced"><span class="eyebrow">${esc(chapterById[q.chapter].title)} · Exercice ajouté</span><h2>${esc(q.question)}</h2><div class="quiz-options" role="group" aria-label="Réponses proposées">${q.options.map((option,index)=>`<button class="quiz-option ${answered&&index===q.correct?'correct':answered&&index===quizSession.chosen?'incorrect':''}" data-action="quiz-answer" data-option="${index}" ${answered?'disabled':''}><span>${String.fromCharCode(65+index)}</span><span class="quiz-option-text">${esc(option)}${answered&&index===q.correct?`<small class="answer-label">Bonne réponse${index===quizSession.chosen?' · ton choix':''}</small>`:answered&&index===quizSession.chosen?'<small class="answer-label">Mauvaise réponse · ton choix</small>':''}</span>${answered&&index===q.correct?icon('check'):answered&&index===quizSession.chosen?icon('cross'):''}</button>`).join('')}</div>${answered?`<div class="quiz-feedback ${correct?'correct':'incorrect'}" role="status"><strong>${correct?'Bonne réponse.':'Mauvaise réponse.'}</strong><p>${esc(q.explanation)}</p>${sourceLink(q.source)}${contentReview(q)}</div><button class="btn primary spaced" data-action="quiz-next">${quizSession.index+1===quizSession.questions.length?'Voir mon résultat':'Question suivante'}${icon('arrow')}</button>`:''}</section></div>`;
  }

  function readingNote(note,inline=false) {
    const target=note.targets[0];
    const source=sourceLink(note.source,note.source.url?(note.source.label||'Texte de référence'):'Lire la synthèse de la fiche');
    const links=inline?source:`${source}${sourceLink(target,'Lire le passage concerné')}${note.ficheSource&&(note.source.doc!==note.ficheSource.doc||note.source.index!==note.ficheSource.index)?sourceLink(note.ficheSource,'Comparer avec la fiche'):''}`;
    return `<${inline?'aside':'article'} ${inline?'role="note"':`id="note-${note.id}"`} class="${inline?'reading-correction':'reference-card correction-card'} ${subjects[note.subject].color}"><span class="eyebrow">${inline?'Note ajoutée':esc(subjectName(note.subject))+' · Support ajouté'} · ${esc(note.kind)}</span><h3>${esc(note.title)}</h3><p>${esc(note.text)}</p><div class="guide-sources">${links}${note.secondarySource?sourceLink(note.secondarySource,'Autre source officielle'):''}${(note.extraSources||[]).map(s=>sourceLink(s)).join('')}</div><small class="muted">Point vérifié le ${dateLabel(note.checked)} · Le document original est conservé.</small></${inline?'aside':'article'}>`;
  }
  function correctionsPage(selected='all') {
    if(!subjects[selected])selected='all';
    const notes=readingNotes.filter(n=>selected==='all'||n.subject===selected);
    const coverage=(D.audit?.subjects||[]).filter(s=>selected==='all'||s.subject===selected);
    return `${header('Apprendre avec les bonnes distinctions.','Les erreurs de transcription, dates et formulations à nuancer repérées lors de la relecture. Chaque note est reliée au passage concerné et à une source officielle.','CORRECTIONS & PRÉCISIONS')}${filters('corrections',selected)}<section class="panel audit-overview"><h2>Ce qui a été revu</h2><p>Les quatre matières ont été comparées aux documents transmis : texte des cours et fiches, découpage des chapitres, cartes, quiz, schémas, frises et renvois de sources. Les points ci-dessous ont fait l’objet d’une vérification ciblée ; cette relecture ne constitue pas une validation intégrale par le professeur.</p><div class="audit-subjects">${coverage.map(s=>`<div><strong>${esc(subjectName(s.subject))}</strong><span>${esc(s.scope)}</span></div>`).join('')}</div><p class="small">Les originaux restent inchangés. Les corrections et actualisations ajoutées sont affichées en priorité pendant la lecture ; le passage original concerné se déplie. Dernière relecture : ${dateLabel(D.updated)}.</p></section><p class="count-caption">${notes.length} correction${notes.length>1?'s':''} ou précision${notes.length>1?'s':''} dans cette sélection</p>${notes.length?`<div class="reference-grid">${notes.map(n=>readingNote(n)).join('')}</div>`:notice('Aucun point supplémentaire n’est signalé dans cette sélection. Les limites du cours reçu sont indiquées ci-dessus.')}`;
  }

  function favoritesPage() {
    const favorites=D.chapters.filter(c=>state.favorites.includes(c.id));
    return `${header('Garder mes repères à portée de main.','Les chapitres que tu as ajoutés à tes favoris.','MES FAVORIS')}${favorites.length?`<div class="chapter-list">${favorites.map(chapterRow).join('')}</div>`:empty('Ta sélection commence ici.','Clique sur « Favori » dans un chapitre pour le retrouver dans cet espace.',button('Explorer mes matières','#subjects',true,'book'))}`;
  }

  function searchPage(query,selected='all',kind='all') {
    if(!subjects[selected])selected='all';
    if(!['cours','fiche','officiel','supports','td'].includes(kind))kind='all';
    const term=normalize(query).trim();
    if(!term)return header('Chercher une notion.','Entre un mot pour retrouver les passages des cours, fiches, corrections et compléments.','RECHERCHE');
    const results=[];
    if(kind!=='supports')for(const d of D.documents.filter(d=>['cours','fiche','officiel'].includes(d.kind)&&(selected==='all'||d.subject===selected)&&(kind==='all'||d.kind===kind))){
      for(const p of d.paragraphs)if(normalize(p.text).includes(term)){const ns=passageNotes(d.id,p.index),corrected=ns.some(n=>['Correction','Mise à jour'].includes(n.kind));results.push({subject:d.subject,label:documentLabel(d)+(corrected?' · Passage corrigé':''),text:corrected?ns.map(n=>n.title+' : '+n.text).join(' '):p.text,url:`#document/${d.id}/${p.index}`,hasCorrection:passageNotes(d.id,p.index).length>0});}
    }
    if(kind==='all'||kind==='supports'){
      const added=[
        ...newsItems().map(n=>({subject:n.subject,label:'Actualité juridique · '+dateLabel(n.edition),title:n.title,text:[n.summary,...n.facts,...n.explanation,n.course.text,...(n.glossary||[]).flatMap(g=>[g.term,g.meaning])].join(' '),url:'#actualites/article/'+n.id})),
        ...(E.receivedRecap?.sections||[]).map(s=>({subject:'prive',label:'Récapitulatif reçu : explication ajoutée',title:s.title,text:s.text,url:'#examens/recapitulatif'})),
        ...T.sessions.filter(s=>s.annexReview).flatMap(s=>s.annexReview.sections.map(p=>({subject:s.subject,label:'Lecture des annexes ajoutée',title:p.title,text:p.text+' '+p.practice.question+' '+p.practice.answer,url:'#td/seance/'+s.id}))),
        ...T.sessions.filter(s=>s.peerReview).flatMap(s=>s.peerReview.sections.map(p=>({subject:s.subject,label:'Correction complémentaire relue ajoutée',title:p.title,text:p.text,url:'#td/seance/'+s.id}))),
        ...T.sessions.flatMap(s=>s.sections.map(p=>({subject:s.subject,label:'Explication de TD ajoutée',title:p.title,text:p.text,url:'#td/seance/'+s.id}))),
        ...E.articles.map(a=>({subject:'prive',label:'Repère de compétence ajouté',title:a.title,text:a.rule+' '+a.trap,url:'#examens/articles/all'})),
        ...L.lessons.map(l=>({subject:l.subject,label:'Leçon expliquée ajoutée',title:l.title,text:[l.summary,...l.concepts.map(c=>c.text),...l.model.map(s=>s.text+' '+s.why),...l.variants.map(v=>v.prompt+' '+(Array.isArray(v.answer)?v.answer.join(' '):v.answer))].join(' '),url:teachingLink(l)})),
        ...P.lessons.map(l=>({subject:l.subject==='all'?selected:l.subject,label:'Méthode guidée ajoutée',title:l.title,text:l.goal+' '+l.context+' '+l.steps.map(s=>s.question+' '+s.takeaway).join(' '),url:'#methodologie/pas-a-pas/'+l.id})),
        ...P.repairs.map(r=>({subject:selected,label:'Aide de méthode ajoutée',title:r.title,text:r.diagnosis+' '+r.action+' '+r.task,url:'#methodologie/debloquer'})),
        ...M.guides.map(g=>({subject:selected,label:'Méthodologie ajoutée',title:g.title,text:[...g.intro,...g.steps.map(s=>s.title+' '+s.text),g.example.after].join('\n'),url:'#methodologie/'+g.id})),
        ...M.exercises.map(e=>({subject:e.subject==='all'?selected:e.subject,label:'Atelier de méthode ajouté',title:e.title,text:e.prompt+'\n'+e.tasks.join('\n'),url:'#methodologie/entrainement/'+e.id})),
        ...readingNotes.map(n=>({subject:n.subject,label:n.kind+' ajoutée',title:n.title,text:n.text,url:`#corrections/${n.subject}/${n.id}`})),
        ...D.enrichments.filter(n=>n.added).map(n=>({subject:n.subject,label:'Mini-fiche ajoutée',title:n.title,text:[n.text,...n.points,n.practice.question,n.practice.answer,n.pitfall].join('\n'),url:`#references/${n.subject}/additions/${n.id}`})),
        ...(D.articles||[]).map(n=>({subject:n.subject,label:'Lecture d’article ajoutée',title:n.reference+' · '+n.title,text:n.summary+'\n'+n.pitfall,url:`#chapter/${n.chapter}/plus`}))
      ];
      for(const item of added)if((selected==='all'||item.subject===selected)&&normalize(item.title+' '+item.text).includes(term))results.push(item);
    }
    if(kind==='all'||kind==='td')for(const d of T.documents.filter(d=>selected==='all'||d.subject===selected))for(const p of d.paragraphs)if(!d.search_excluded_pages?.includes(p.page)&&normalize(p.text).includes(term))results.push({subject:d.subject,label:d.label+' · TD',title:d.filename,text:p.text,url:`#td/document/${d.id}/${p.index}`});
    // Put verified corrections first so a matching source typo is not learned alone.
    if(['all','supports'].includes(kind))for(const p of R.chapters){const c=chapterById[p.chapter],text=[c.title,...p.goals,...p.explanation,...p.tasks.map(t=>t.prompt)].join(' ');if((selected==='all'||p.subject===selected)&&normalize(text).includes(term))results.push({subject:p.subject,label:'Parcours de chapitre ajouté',title:c.title,text,url:'#parcours/'+p.chapter+'/comprendre'});}
    results.sort((a,b)=>Number(b.label.endsWith(' ajoutée'))-Number(a.label.endsWith(' ajoutée')));
    function excerpt(text){const index=normalize(text).indexOf(term);if(index<0)return esc(text.slice(0,260))+(text.length>260?' …':'');const left=Math.max(0,index-90),right=Math.min(text.length,index+term.length+230),clip=text.slice(left,right),pos=normalize(clip).indexOf(term);return(left?'… ':'')+esc(clip.slice(0,pos))+'<mark>'+esc(clip.slice(pos,pos+term.length))+'</mark>'+esc(clip.slice(pos+term.length))+(right<text.length?' …':'');}
    const filter=`<nav class="filters" aria-label="Filtrer la recherche par matière">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,title])=>`<a class="filter-chip ${selected===id?'active':''}" href="#search/${encodeURIComponent(query)}/${id}/${kind}" ${selected===id?'aria-current="page"':''}>${esc(title)}</a>`).join('')}</nav><nav class="section-tabs" aria-label="Filtrer la recherche par document">${[['all','Tous les contenus'],['cours','Cours'],['fiche','Fiches'],['officiel','Plan officiel'],['supports','Supports ajoutés'],['td','TD et notes']].map(([id,label])=>`<a class="${kind===id?'active':''}" href="#search/${encodeURIComponent(query)}/${selected}/${id}" ${kind===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
    return `${header(`Résultats pour « ${query} »`,`${results.length} passage${results.length>1?'s':''} trouvé${results.length>1?'s':''}. ${results.length>100?'Les 100 premiers sont affichés ; précise ta recherche pour affiner.':''}`,'RECHERCHE DANS MES CONTENUS')}${filter}<div class="search-results">${results.slice(0,100).map(item=>`<a class="result" href="${esc(item.url)}"><span class="eyebrow">${esc(subjectName(item.subject))} · ${esc(item.label)}</span>${item.title?`<h3>${excerpt(item.title)}</h3>`:''}<p>${excerpt(item.text)}</p>${item.hasCorrection?'<span class="result-correction">Une correction ou précision accompagne ce passage.</span>':''}<span class="text-link">Ouvrir le passage ${icon('arrow')}</span></a>`).join('')}</div>${!results.length?empty('Aucun passage trouvé.','Essaie un mot plus court, un synonyme ou le nom d’un auteur.'):''}`;
  }
  function settingsPage() {
    const noteCount=Object.values(state.notes).filter(n=>n.trim()).length;
    const methodDraftCount=Object.values(state.methodology.drafts).filter(t=>t.trim()).length;
    const ownNotes=D.chapters.filter(c=>state.notes[c.id]?.trim());
    return `${header('Un espace qui suit mon travail.','Tes notes, favoris et révisions sont enregistrés dans ce navigateur. Tu peux exporter une sauvegarde pour les conserver ou les transférer.','MON ESPACE PERSONNEL')}${!storageAvailable?notice('Le stockage du navigateur est indisponible. Exporte tes données avant de fermer cette page.'):''}<section class="panel"><div class="settings-row"><div><h3>Ma progression</h3><p>${done()} chapitre${done()>1?'s':''} révisé${done()>1?'s':''} · ${state.favorites.length} favori${state.favorites.length>1?'s':''} · ${noteCount} chapitre${noteCount>1?'s':''} avec des notes</p></div><span class="pill">Cet appareil</span></div><div class="settings-row"><div><h3>Conserver ou transférer mes données</h3><p>La sauvegarde contient tes notes, tes brouillons, tes copies en mode examen, tes réponses aux leçons expliquées et aux parcours de chapitre, les dates des rappels, tes réécritures ciblées, tes bilans, les étapes de ton programme et ton suivi. Les cours sont conservés dans le site.</p></div><div class="page-actions"><button class="btn primary" data-action="export">${icon('download')}Exporter</button><button class="btn" data-action="restore">${icon('upload')}Restaurer</button></div></div><div class="settings-row"><div><h3>Méthodologie et entraînements</h3><p>${methodDraftCount} brouillon${methodDraftCount>1?'s':''} · ${state.methodology.reviewed.length} atelier${state.methodology.reviewed.length>1?'s':''} comparé${state.methodology.reviewed.length>1?'s':''} au corrigé. Ces travaux restent dans ton navigateur.</p></div><div class="page-actions">${button('Retrouver mes essais','#methodologie/mes-essais/started',false,'note')}</div></div><div class="settings-row"><div><h3>Ajouter de nouveaux cours et supports</h3><p>Envoie-les dans notre conversation. Je pourrai les intégrer à la matière et au chapitre concernés.</p></div></div></section>${ownNotes.length?`<section class="spaced"><h2>Retrouver mes notes</h2><div class="chapter-list">${ownNotes.map(c=>`<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/notes"><span class="chapter-number">${icon('note')}</span><span class="chapter-title"><h3>${esc(c.title)}</h3><small>${esc(state.notes[c.id].slice(0,140))}${state.notes[c.id].length>140?'…':''}</small></span>${icon('arrow')}</a>`).join('')}</div></section>`:''}<section class="panel spaced"><h2>Comprendre la provenance</h2><p><strong>Cours fourni</strong> : tes notes originales, conservées sans correction silencieuse.</p><p><strong>Fiche fournie</strong> : ton document de révision, avec ses propres corrections et compléments.</p><p><strong>Fiche préparée</strong> : la fiche d’histoire suit le cours actuel jusqu’au CM5. La fiche complémentaire d’institutions internationales accompagne les cinq chapitres rédigés à partir des leçons UNJF et de sources officielles. L’archive d’histoire reste séparée.</p><p><strong>Contenu officiel</strong> : le plan du professeur conservé dans le projet. Moodle reste la référence actuelle.</p><p><strong>Cours complémentaire</strong> : cinq chapitres d’institutions internationales rédigés à partir des ressources UNJF, des fiches et de sources officielles. Ils poursuivent le plan et restent distincts du CM du professeur.</p><p><strong>Support ajouté</strong> : questions de compréhension, quiz corrigés et schémas préparés à partir des fiches. Les fiches de lecture d’articles comportent leurs liens vers les sources officielles.</p><p>Dernière relecture et mise à jour : ${dateLabel(D.updated)}. Le cours d’institutions internationales et le syllabus présentent les limites indiquées dans la bibliothèque.</p>${button('Consulter mes documents','#sources',false,'folder')}</section>`;
  }
  function guidedCard(lesson) {
    return `<a class="guided-card ${subjects[lesson.subject]?.color||''}" href="#methodologie/pas-a-pas/${lesson.id}"><span class="eyebrow">${lesson.subject==='all'?'SOCLE COMMUN':esc(subjectName(lesson.subject))} · ${lesson.minutes} MIN ENVIRON</span><h3>${esc(lesson.title)}</h3><p>${esc(lesson.goal)}</p><span class="text-link">${lesson.steps.length} étapes expliquées ${icon('arrow')}</span></a>`;
  }
  function guidedOverview(subject='all') {
    const lessons=subject==='all'?P.lessons:P.lessons.filter(l=>l.subject===subject);
    if(!lessons.length)return '';
    return `<section class="spaced guided-overview"><div class="section-heading"><h2>Apprendre pas à pas</h2><span class="small muted">Choisir · comprendre · reformuler</span></div><p class="lead">Avant chaque choix, formule une réponse avec tes mots. Le retour explique ton raisonnement, puis un atelier te permet de rédiger sans guidage.</p><div class="guided-grid">${lessons.map(guidedCard).join('')}</div></section>`;
  }
  function pedagogyLink(link) {
    return link.route?button(link.label,link.route,false,'book'):`<a class="source-link" href="${esc(link.url)}" target="_blank" rel="noopener">${icon('external')}${esc(link.label)}</a>`;
  }
  function guidedPage(id) {
    const lesson=guidedLessons[id];if(!lesson)return notFound();
    if(guidedSession?.id!==id)guidedSession={id,index:0,answers:[]};
    const n=guidedSession.index,answer=guidedSession.answers[n],done=answer!==undefined;
    const head=header(lesson.title,lesson.goal,'APPRENDRE PAS À PAS · '+(lesson.subject==='all'?'SOCLE COMMUN':subjectName(lesson.subject).toUpperCase()),button('Tous les parcours','#methodologie',false,'back')+button('Revoir la méthode','#methodologie/'+lesson.method,false,'book'));
    if(n>=lesson.steps.length){
      const missed=lesson.steps.filter((s,i)=>guidedSession.answers[i]!==s.correct);
      return `${head}<section class="panel guided-finish"><span class="eyebrow">PASSER À UNE RÉPONSE PERSONNELLE</span><h2>À toi de reconstruire le raisonnement.</h2><div class="answer-result-summary" role="group" aria-label="Bilan des choix du parcours"><p class="answer-good">${lesson.steps.length-missed.length} choix correct${lesson.steps.length-missed.length>1?'s':''}</p><p class="answer-bad">${missed.length} choix à reprendre</p></div><p>Les choix t’ont aidé à repérer les étapes. Pour vérifier que tu sais les refaire, rédige ou parle sans les propositions sous les yeux. Ce parcours ne donne pas de note et ne valide pas une maîtrise.</p>${missed.length?`<h3>Les repères à reprendre</h3><ul>${missed.map(s=>`<li>${esc(s.takeaway)}</li>`).join('')}</ul>`:'<p>Tu as repéré la réponse attendue à chaque étape. Essaie maintenant de la justifier sans les choix.</p>'}<div class="page-actions">${button('Rédiger ou parler sans guidage','#methodologie/entrainement/'+lesson.exercise,true,'note')}<button class="btn" data-action="guided-restart" data-id="${id}">${icon('refresh')}Refaire le parcours</button></div></section><section class="panel spaced"><h2>Garder une trace utile</h2><p>Dans l’atelier, conserve ton essai et note une seule difficulté dans « Mon point à retravailler ». Compare ensuite avec le corrigé et réécris le passage concerné sans le modèle.</p></section>${guidedReferences(lesson)}`;
    }
    const s=lesson.steps[n];
    return `${head}<div class="guided-progress" aria-label="Progression dans le parcours"><span>Étape ${n+1} sur ${lesson.steps.length}</span><ol>${lesson.steps.map((step,i)=>`<li ${i===n?'aria-current="step"':''} class="${i<n?'visited':''}"><span>${i+1}</span>${esc(step.title)}</li>`).join('')}</ol></div><section class="panel guided-context"><span class="eyebrow">LE POINT DE DÉPART</span><p>${esc(lesson.context)}</p></section><section class="guided-question panel" aria-labelledby="guided-question-title"><span class="eyebrow">${esc(s.title)}</span><h2 id="guided-question-title">${esc(s.question)}</h2><p id="guided-answer-help" class="small muted">Essaie d’abord de répondre avec tes mots, puis choisis la proposition qui correspond le mieux.</p><fieldset aria-describedby="guided-answer-help"><legend class="screen-reader-only">Choisir une réponse</legend>${s.options.map((option,i)=>`<label class="guided-option ${done&&i===s.correct?'expected':''} ${done&&i===answer&&answer!==s.correct?'to-rethink':''}"><input type="radio" name="guided-choice" value="${i}" ${done?'disabled':''} ${answer===i?'checked':''}><span>${esc(option)}${done&&i===s.correct?`<small>Bonne réponse${i===answer?' · ton choix':''}</small>`:''}${done&&i===answer&&answer!==s.correct?'<small>Mauvaise réponse · ton choix</small>':''}</span></label>`).join('')}</fieldset>${done?`<div id="guided-feedback" class="guided-feedback ${answer===s.correct?'correct':'incorrect'}" role="status" tabindex="-1"><h3>${answer===s.correct?'Bonne réponse.':'Mauvaise réponse.'}</h3><p>${esc(s.explanations[answer])}</p>${answer!==s.correct?`<p><strong>Pourquoi retenir l’autre proposition ?</strong> ${esc(s.explanations[s.correct])}</p>`:''}<p class="guided-takeaway"><strong>À retenir</strong> ${esc(s.takeaway)}</p><p class="small">Reformule maintenant la réponse en une phrase, sans la recopier.</p></div><button class="btn primary" data-action="guided-next" data-id="${id}" data-step="${n}">${n+1===lesson.steps.length?'Terminer et passer à l’essai':'Étape suivante'} ${icon('arrow')}</button>`:`<button class="btn primary" data-action="guided-answer" data-id="${id}" data-step="${n}">Vérifier mon raisonnement ${icon('check')}</button><p id="guided-selection-status" role="status" class="small muted"></p>`}</section><p class="method-scope">${esc(P.scope)} Les choix de ce petit parcours sont temporaires ; il repart à zéro quand tu le quittes. Les brouillons de tes ateliers restent sauvegardés.</p>${guidedReferences(lesson)}`;
  }
  function guidedReferences(lesson) {
    return `<details class="pedagogy-references"><summary>Retrouver la méthode et les supports</summary><div class="page-actions spaced">${button('Méthode expliquée','#methodologie/'+lesson.method,false,'book')}${lesson.links.map(pedagogyLink).join('')}</div></details>`;
  }
  function guidedAnswer(id,index,choice) {
    const lesson=guidedLessons[id];
    if(!lesson||!lesson.steps[index]||guidedSession?.id!==id||guidedSession.index!==index||guidedSession.answers[index]!==undefined||!Number.isInteger(choice)||choice<0||choice>=lesson.steps[index].options.length)return false;
    guidedSession.answers[index]=choice;return true;
  }
  function repairCard(r) {
    return `<details class="repair-card"><summary>${esc(r.title)}</summary><div><p><strong>Ce qui bloque.</strong> ${esc(r.diagnosis)}</p><p><strong>Comment reprendre.</strong> ${esc(r.action)}</p><p class="repair-task"><strong>Petit travail à faire.</strong> ${esc(r.task)}</p><div class="page-actions">${r.lesson?button('Me faire guider','#methodologie/pas-a-pas/'+r.lesson,false,'arrow'):button('Revoir la méthode','#methodologie/'+r.guide,false,'book')}${button('Essayer sur un exercice','#methodologie/entrainement/'+r.exercise,false,'note')}</div></div></details>`;
  }
  function repairPage() {
    return `${header('Un blocage, une action pour avancer.','Choisis la difficulté que tu reconnais dans ton travail. Reprends un petit morceau de ta réponse, puis vérifie ce qui a changé.','MÉTHODOLOGIE · ME DÉBLOQUER',button('Toutes les méthodes','#methodologie',false,'back'))}<div class="repair-list">${P.repairs.map(repairCard).join('')}</div><section class="panel spaced"><h2>Comment savoir si je progresse ?</h2><p>Compare deux productions : la première avec le corrigé, puis une nouvelle sans ce modèle. Cherche ce que tu sais maintenant expliquer ou appliquer. Une bonne réponse choisie dans une liste ne suffit pas à montrer que tu sais encore rédiger seul.</p>${button('Retrouver mes essais','#methodologie/mes-essais/started',true,'note')}</section><details class="pedagogy-references spaced"><summary>Les repères pédagogiques utilisés</summary><p>${esc(P.scope)}</p>${P.sources.map(s=>`<p><a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title)}</a><br>${esc(s.note)}</p>`).join('')}</details>`;
  }
  function practiceRepairs(method) {
    const items=P.repairs.filter(r=>r.methods.includes(method));
    return items.length?`<section class="practice-repairs spaced"><h3>Si je bloque</h3>${items.map(repairCard).join('')}</section>`:'';
  }
  function chapterLearning(c) {
    const p=pathByChapter[c.id];
    return (p?`<section class="panel path-course-entry spaced"><span class="eyebrow">MON PARCOURS DE CHAPITRE</span><h2>Ce que je dois savoir expliquer.</h2><ul>${p.goals.map(g=>`<li>${esc(g)}</li>`).join('')}</ul><div class="page-actions">${button('Apprendre ce chapitre','#parcours/'+c.id+'/comprendre',true,'book')}${button('Essayer les questions ouvertes','#parcours/'+c.id+'/essayer',false,'note')}</div></section>`:'')+`<details class="chapter-learning"><summary>Comment travailler ce chapitre ?</summary><ol>${P.reading.map(s=>`<li><strong>${esc(s.title)}</strong><p>${esc(s.text)}</p></li>`).join('')}</ol><p class="small muted">Méthode de travail proposée. Les consignes de ton enseignant restent prioritaires.</p></details>`;
  }
  function chapterLearningEnd(c) {
    const hasQuiz=D.quizzes.some(q=>q.chapter===c.id),hasCards=D.cards.some(card=>card.chapter===c.id);
    return `<section class="panel chapter-learning-end spaced"><span class="eyebrow">APRÈS CETTE LECTURE</span><h2>Ce que je peux expliquer sans regarder.</h2><p>Retrouve une définition, explique un mécanisme et donne un exemple. Vérifie ensuite le passage qui t’a manqué, puis garde une question précise dans tes notes.</p><div class="page-actions">${hasQuiz?button('Me tester sur ce chapitre','#chapter/'+c.id+'/quiz',true,'check'):''}${hasCards?button('Retrouver les notions','#cards/chapter/'+c.id,false,'cards'):''}${button('Noter ma difficulté','#chapter/'+c.id+'/notes',false,'note')}${button('M’entraîner à la méthode','#methodologie/matiere/'+c.subject,false,'arrow')}</div></section>${teachingOverview(c.subject,c.id)}${button('Mes questions ouvertes et variantes','#parcours/'+c.id+'/essayer',true,'note')}`;
  }

  function methodNav(active='all') {
    return `<nav class="filters" aria-label="Parcours de méthodologie">${[['all','Socle commun'],...M.profiles.map(p=>[p.id,p.title])].map(([id,title])=>`<a class="filter-chip ${active===id?'active':''}" href="#methodologie${id==='all'?'':'/matiere/'+id}" ${active===id?'aria-current="page"':''}>${esc(title)}</a>`).join('')}</nav>`;
  }
  function methodSource(id) {
    const s=methodSources[id];if(!s)return '';
    return `<a class="source-link" href="${esc(s.url||'#methodologie/sources/'+s.id)}" ${s.url?'target="_blank" rel="noopener"':''}>${icon(s.url?'external':'book')}${esc(s.title)}</a>`;
  }
  function methodGuideCard(g) {
    return `<a class="method-card" href="#methodologie/${esc(g.id)}"><span class="method-card-icon">${icon('note')}</span><h3>${esc(g.title)}</h3><p>${esc(g.summary)}</p><span class="text-link">Comprendre la méthode ${icon('arrow')}</span></a>`;
  }
  function methodProgress(ex) {
    const draft=state.methodology.drafts[ex.id]||'',rework=state.methodology.rework[ex.id]||'',checked=state.methodology.checks[ex.id]||[],reviewed=state.methodology.reviewed.includes(ex.id);
    const started=!!(draft.trim()||rework.trim()||checked.length||reviewed),remaining=ex.checks.filter((_,i)=>!checked.includes(i)),reworkActive=!!rework.trim()&&!state.study.resolvedMethods.includes(ex.id);
    return {draft,rework,checked,reviewed,started,remaining,reworkActive,todo:started&&(!reviewed||reworkActive||remaining.length>0)};
  }
  function methodExerciseCard(ex) {
    const p=methodProgress(ex);
    return `<a class="method-exercise" href="#methodologie/entrainement/${esc(ex.id)}"><div><span class="eyebrow">${ex.subject==='all'?'SOCLE COMMUN':esc(subjectName(ex.subject))} · ${ex.minutes} min conseillées</span><h3>${esc(ex.title)}</h3><p>${esc(methodGuides[ex.method].title)}</p><small>${p.reworkActive?'Un point personnel à retravailler':p.reviewed?'Comparaison au corrigé effectuée':p.started?'Essai commencé':'À essayer'}</small></div>${icon('arrow')}</a>`;
  }
  function methodResume(subject='all') {
    const items=M.exercises.filter(ex=>(subject==='all'||ex.subject===subject)&&methodProgress(ex).started);
    return `<section class="panel method-resume"><div><span class="eyebrow">MON TRAVAIL PERSONNEL</span><h2>${items.length?'Reprendre mes entraînements':'Choisir mon prochain entraînement'}</h2><p>${items.length?`${items.length} atelier${items.length>1?'s':''} commencé${items.length>1?'s':''}. Retrouve tes brouillons, tes critères et tes points à retravailler.`:'Retrouve tous les ateliers au même endroit et choisis selon ta matière et le temps disponible.'}</p></div>${button(items.length?'Retrouver mes essais':'Voir les ateliers',`#methodologie/mes-essais/${items.length?'started':'all'}/${subject}`,true,'note')}</section>`;
  }
  function methodologyAttempts(status='all',subject='all',time='all') {
    if(!['all','started','todo','reviewed'].includes(status))status='all';
    if(!['all',...M.profiles.map(p=>p.id),'common'].includes(subject))subject='all';
    if(!['all','15','30','60'].includes(time))time='all';
    const base=M.exercises.filter(ex=>(subject==='all'||ex.subject===(subject==='common'?'all':subject))&&(time==='all'||ex.minutes<=Number(time)));
    const matches=(ex,key)=>{const p=methodProgress(ex);return key==='all'||key==='started'&&p.started||key==='todo'&&p.todo||key==='reviewed'&&p.reviewed;};
    const items=base.filter(ex=>matches(ex,status)),count=key=>base.filter(ex=>matches(ex,key)).length;
    const filters=[['all','Tous les ateliers'],['started','Mes essais'],['todo','À reprendre'],['reviewed','Comparés']];
    return `${header('Mes essais et mes points à retravailler.','Choisis un atelier, retrouve ton brouillon et transforme la comparaison au corrigé en une action précise.','MÉTHODOLOGIE · MON SUIVI',button('Les méthodes','#methodologie',false,'back')+button('Sauvegarder mon travail','#settings',false,'download'))}<p class="method-scope">Tes essais et bilans restent sur cet appareil. « À reprendre » rassemble les essais non encore comparés, les critères restant à vérifier et les points que tu as notés. Ces repères viennent de ton autoévaluation.</p><nav class="filters" aria-label="Filtrer mes entraînements">${filters.map(([key,label])=>`<a class="filter-chip ${status===key?'active':''}" href="#methodologie/mes-essais/${key}/${subject}/${time}" ${status===key?'aria-current="page"':''}>${label} · ${count(key)}</a>`).join('')}</nav><div class="method-attempt-filters"><label for="method-subject-filter">Matière<select id="method-subject-filter" data-status="${status}">${[['all','Toutes les matières'],['common','Socle commun'],...M.profiles.map(p=>[p.id,p.title])].map(([key,title])=>`<option value="${key}" ${subject===key?'selected':''}>${esc(title)}</option>`).join('')}</select></label><label for="method-time-filter">Temps disponible<select id="method-time-filter" data-status="${status}">${[['all','Toutes les durées'],['15','15 minutes maximum'],['30','30 minutes maximum'],['60','Une heure maximum']].map(([key,title])=>`<option value="${key}" ${time===key?'selected':''}>${title}</option>`).join('')}</select></label><p role="status">${items.length} atelier${items.length>1?'s':''} affiché${items.length>1?'s':''}</p></div><div class="method-attempt-list">${items.map(ex=>{
      const p=methodProgress(ex);
      return `<article class="method-attempt"><div class="method-attempt-heading"><div><span class="eyebrow">${ex.subject==='all'?'SOCLE COMMUN':esc(subjectName(ex.subject))} · ${ex.minutes} min conseillées</span><h2>${esc(ex.title)}</h2></div><span class="pill">${p.reviewed?'Comparé au corrigé':p.started?'Essai commencé':'À essayer'}</span></div><p class="small muted">${esc(methodGuides[ex.method].title)}</p>${p.draft.trim()?`<p class="method-draft-excerpt"><strong>Mon brouillon</strong> ${esc(p.draft.trim().slice(0,180))}${p.draft.trim().length>180?'…':''}</p>`:''}${p.rework.trim()?`<div class="method-rework-preview"><strong>Mon point à retravailler</strong><p>${esc(p.rework)}</p></div>`:''}${p.started?`<p class="small muted">${p.checked.length} / ${ex.checks.length} critères cochés · autoévaluation</p>`:''}${p.reviewed&&p.remaining.length?`<details class="method-remaining"><summary>${p.remaining.length} critère${p.remaining.length>1?'s':''} restant${p.remaining.length>1?'s':''} à vérifier</summary><ul>${p.remaining.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></details>`:''}<div class="page-actions">${button(p.started?'Reprendre mon essai':'Commencer cet atelier','#methodologie/entrainement/'+ex.id,true,'note')}${button('Revoir la méthode','#methodologie/'+ex.method,false,'book')}</div></article>`;
    }).join('')}</div>${!items.length?empty('Aucun atelier dans cette sélection.','Change la matière ou la durée, ou affiche tous les ateliers pour commencer un essai.',button('Voir tous les ateliers','#methodologie/mes-essais',true)):''}`;
  }
  function methodInstructions(id) {
    return `<section class="method-instructions"><label for="method-instructions"><strong>Mes consignes confirmées</strong><span>Note le format, la durée, les documents autorisés ou une règle de présentation donnée en TD.</span></label><textarea id="method-instructions" data-profile="${esc(id)}" maxlength="5000" rows="3" placeholder="À compléter quand ton enseignant précise les modalités…">${esc(state.methodology.instructions[id]||'')}</textarea><small id="method-instructions-status">Enregistré sur cet appareil avec ta progression. Ce texte personnel ne modifie pas les guides.</small></section>`;
  }
  function methodologyHome() {
    return `${header('La méthode, puis la pratique.',M.intro,'MÉTHODOLOGIE · PRÉPARER MES ÉPREUVES',button('Mes essais et ateliers','#methodologie/mes-essais',false,'note')+button('Sources et repères','#methodologie/sources',false,'book'))}${methodNav()}${teachingOverview()}${methodResume()}${guidedOverview()}<section class="panel pedagogy-help spaced"><div><span class="eyebrow">UNE DIFFICULTÉ PRÉCISE ?</span><h2>Reprendre ce qui bloque.</h2><p>Une mineure trop vague, un plan descriptif, une confusion dans un arrêt : trouve une action courte pour améliorer ta réponse.</p></div>${button('Trouver une piste de travail','#methodologie/debloquer',false,'arrow')}</section><p class="method-scope">${esc(M.scope)}</p><section class="spaced"><div class="section-heading"><h2>Mes quatre parcours</h2><span class="small muted">Deux majeures · deux mineures</span></div><div class="method-profile-grid">${M.profiles.map(p=>`<a class="method-profile ${subjects[p.id].color}" href="#methodologie/matiere/${p.id}"><span class="eyebrow">${esc(p.role)}</span><h3>${esc(p.title)}</h3><p>${esc(p.format)}</p><span class="text-link">Ouvrir mon parcours ${icon('arrow')}</span></a>`).join('')}</div></section><section class="spaced"><div class="section-heading"><h2>Les méthodes à comprendre</h2><span class="small muted">${M.guides.length} guides expliqués</span></div><div class="method-grid">${M.guides.map(methodGuideCard).join('')}</div></section><section class="spaced"><h2>Deux ateliers pour le socle commun</h2><div class="method-exercises">${M.exercises.filter(ex=>ex.subject==='all').map(methodExerciseCard).join('')}</div></section><section class="panel spaced"><h2>Un parcours en six séances</h2><p class="small muted">Un ordre de travail possible, à répartir selon le temps dont tu disposes. Commence par les exercices déjà travaillés en TD.</p><div class="method-session-grid">${M.sessions.map(s=>`<div><h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>${button('Ouvrir l’atelier','#methodologie/entrainement/'+s.exercise,false,'arrow')}</div>`).join('')}</div></section>${methodInstructions('all')}`;
  }
  function methodologyProfile(id) {
    const p=M.profiles.find(p=>p.id===id);if(!p)return notFound();
    return `${header('M’entraîner en '+p.title.toLocaleLowerCase('fr-FR'),p.intro,'MÉTHODOLOGIE · '+p.role.toUpperCase(),button('Tous les parcours','#methodologie',false,'back')+button('Revoir la matière','#subject/'+p.id,false,'book'))}${methodNav(id)}${teachingOverview(id)}${guidedOverview(id)}${methodResume(id)}<section class="panel"><h2>Préparer mon épreuve</h2><p>${esc(p.format)}</p><p class="method-scope">${esc(p.warning)}</p><ol class="method-routine">${p.routine.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></section><section class="spaced"><div class="section-heading"><h2>Les méthodes utiles</h2></div><div class="method-grid">${p.guides.map(id=>methodGuideCard(methodGuides[id])).join('')}</div></section><section class="spaced"><div class="section-heading"><h2>Mes ateliers corrigés</h2><span class="small muted">Des essais écrits ou à voix haute</span></div><div class="method-exercises">${p.exercises.map(id=>methodExerciseCard(methodExercises[id])).join('')}</div></section>${methodInstructions(id)}`;
  }
  function methodologyGuide(id) {
    const g=methodGuides[id];if(!g)return notFound();
    const guided=P.lessons.find(l=>l.method===id||id==='cas-pratique'&&l.id==='competence'||id==='apprendre'&&l.id==='raisonner');
    const practices=M.exercises.filter(e=>e.method===id||id==='apprendre'&&['histoire-romain','international-etat'].includes(e.id)||id==='commentaire-arret'&&e.id==='prive-arret');
    return `${header(g.title,g.summary,'MÉTHODOLOGIE · COMPRENDRE',button('Toutes les méthodes','#methodologie',false,'back')+`<button class="btn" data-action="print">${icon('print')}Imprimer la méthode</button>`)}<div class="reader-layout method-guide-layout"><article class="reader"><div class="source-strip"><span>${icon('book')}Explications et exemples ajoutés</span><a class="source-link" href="#methodologie/sources">Provenance des supports</a></div><div class="reader-body method-prose">${g.intro.map(p=>`<p>${esc(p)}</p>`).join('')}${g.steps.map((s,i)=>`<section id="method-step-${i}"><h2>${i+1}. ${esc(s.title)}</h2><p>${esc(s.text)}</p></section>`).join('')}<h2>Voir la différence dans un exemple</h2><h3>Une formulation à améliorer</h3><p>${esc(g.example.before)}</p><h3>Une formulation plus précise</h3><p>${esc(g.example.after)}</p><p><strong>Pourquoi ?</strong> ${esc(g.example.why)}</p>${['fiche-arret','commentaire-arret'].includes(id)?`<section class="panel spaced"><h2>Appliquer la lecture aux annexes du TD3</h2><p>Identifier qui parle, comparer les styles de rédaction et lire la portée du dispositif, avec les précisions de date.</p>${button('Comprendre les annexes','#td/seance/prive-03',false,'book')}</section>`:''}<h2>Les erreurs à repérer</h2><ul>${g.pitfalls.map(t=>`<li>${esc(t)}</li>`).join('')}</ul><h2>Sur quoi repose cette méthode</h2><div class="guide-sources">${g.sources.map(methodSource).join('')}</div><p class="source-note">Les exemples sont des créations pédagogiques. Les conventions de ton TD et les consignes de l’épreuve restent prioritaires.</p></div></article><aside class="reading-tools method-reading-tools" aria-label="Étapes de la méthode"><h3>Dans cette méthode</h3>${g.steps.map((s,i)=>`<a href="#method-step-${i}" data-scroll="method-step-${i}">${i+1}. ${esc(s.title)}</a>`).join('')}${guided?`<h3 class="spaced">Voir les étapes en action</h3>${button('Me faire guider','#methodologie/pas-a-pas/'+guided.id,false,'arrow')}`:''}<h3 class="spaced">À toi d’essayer</h3>${practices.map(e=>`<a href="#methodologie/entrainement/${e.id}">${esc(e.title)} · ${e.minutes} min</a>`).join('')}</aside></div>${practices.length?`<section class="spaced"><h2>Passer à l’entraînement</h2><div class="method-exercises">${practices.map(methodExerciseCard).join('')}</div></section>`:button('Choisir un atelier','#methodologie',true,'note')}`;
  }
  function methodLink(link) {
    if(link.td)return `<a class="source-link" href="#td/seance/${esc(link.td)}">${icon('book')}${esc(link.label||'Revoir le TD')}</a>`;
    if(link.source)return methodSource(link.source);
    return sourceLink(link,link.label||'Revenir au support');
  }
  function methodElapsed(id) {
    return methodTimer?.id===id?Math.max(0,methodTimer.elapsed+(methodTimer.running?Date.now()-methodTimer.started:0)):0;
  }
  function methodClockText(ms) {
    const seconds=Math.floor(ms/1000);return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
  }
  function updateMethodClock() {
    if(!methodTimer)return;
    const output=document.getElementById('method-clock');if(output)output.textContent=methodClockText(methodElapsed(methodTimer.id));
  }
  function updateMethodTimerControls(id) {
    const control=main.querySelector('[data-action="method-timer"]');if(!control)return;
    const running=methodTimer?.id===id&&methodTimer.running;
    control.innerHTML=icon(running?'clock':'arrow')+(running?'Mettre en pause':methodElapsed(id)?'Reprendre':'Démarrer le chrono');
    control.classList.toggle('primary',!running);updateMethodClock();
  }
  function pauseMethodClock() {
    if(methodTimer?.running){methodTimer.elapsed=methodElapsed(methodTimer.id);methodTimer.running=false;}
    if(methodClockInterval){clearInterval(methodClockInterval);methodClockInterval=null;}
  }
  function methodPractice(id) {
    const ex=methodExercises[id];if(!ex)return notFound();
    const checked=state.methodology.checks[id]||[],draft=state.methodology.drafts[id]||'',reviewed=state.methodology.reviewed.includes(id),running=methodTimer?.id===id&&methodTimer.running;
    return `${header(ex.title,methodGuides[ex.method].summary,'MÉTHODOLOGIE · '+(ex.subject==='all'?'SOCLE COMMUN':subjectName(ex.subject).toUpperCase()),button('Revoir la méthode','#methodologie/'+ex.method,false,'book')+button('Mes essais','#methodologie/mes-essais/started',false,'note')+button('Mode examen','#examen/'+id,false,'clock')+button(ex.preparation?'Retour aux révisions':'Retour au parcours',ex.preparation?'#examens/'+ex.preparation:ex.subject==='all'?'#methodologie':'#methodologie/matiere/'+ex.subject,false,'back'))}<p class="method-scope">${esc(ex.status)}</p><section class="method-timer" aria-label="Chronomètre d’entraînement"><div><strong id="method-clock" role="timer" aria-live="off">${methodClockText(methodElapsed(id))}</strong><span>Temps écoulé · repère proposé : ${ex.minutes} min</span></div><div class="page-actions"><button class="btn ${running?'':'primary'}" data-action="method-timer" data-id="${id}">${icon(running?'clock':'arrow')}${running?'Mettre en pause':methodElapsed(id)?'Reprendre':'Démarrer le chrono'}</button><button class="btn" data-action="method-timer-reset" data-id="${id}">Remettre le chrono à zéro</button></div><small>Chronomètre facultatif. Il se met en pause quand tu quittes cet atelier ; il n’envoie aucune alerte.</small></section><div class="method-workspace"><div><article class="reader"><div class="reader-body method-prose"><h2>L’énoncé</h2>${ex.rules.length?`<h3>Règles données pour l’exercice</h3>${ex.rules.map(p=>`<p>${esc(p)}</p>`).join('')}`:''}<p>${esc(ex.prompt)}</p><h3>Ton travail</h3><ol>${ex.tasks.map(t=>`<li>${esc(t)}</li>`).join('')}</ol></div></article><section class="method-draft"><h2><label for="method-draft">Mon essai</label></h2><p id="method-draft-help" class="small muted">Rédige ici, ou garde quelques mots-clés pour ta réponse orale.</p><textarea id="method-draft" aria-describedby="method-draft-help method-draft-status" class="note-editor" data-exercise="${id}" maxlength="50000" placeholder="Essaie d’abord sans ouvrir le corrigé…">${esc(draft)}</textarea><div class="method-draft-status"><small id="method-draft-status" role="status">${storageAvailable?'Brouillon enregistré sur cet appareil avec ta progression.':'Enregistrement indisponible : exporte ta progression avant de fermer.'}</small><button class="btn" data-action="method-template" data-id="${id}" ${draft.trim()?'disabled':''}>Insérer un canevas</button></div></section>${ex.hints.length?`<details class="method-hints"><summary>Un indice pour avancer</summary>${ex.hints.map(t=>`<p>${esc(t)}</p>`).join('')}</details>`:''}<details class="method-correction"><summary>Comparer mon essai au corrigé expliqué</summary><div class="reader-body method-prose"><p class="source-note">Une proposition de réponse pour comprendre la démarche. Tu peux employer d’autres formulations justifiées ; ce n’est pas un barème officiel.</p>${ex.correction.map(s=>`<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join('')}${ex.links.length?`<h3>Vérifier dans les supports</h3><div class="guide-sources">${ex.links.map(methodLink).join('')}</div>`:''}</div></details></div><aside class="method-self-check"><section class="panel"><span class="eyebrow">APRÈS TON ESSAI</span><h2>Ce que je vérifie</h2><p class="small">Coche seulement les critères que tu retrouves dans ta réponse après comparaison. Le site ne corrige pas automatiquement ton texte.</p><div class="method-checks">${ex.checks.map((t,i)=>`<label><input type="checkbox" data-method-check="${id}" data-index="${i}" ${checked.includes(i)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><p id="method-check-count" class="small muted" role="status">${checked.length} / ${ex.checks.length} critères cochés · autoévaluation</p><button class="btn ${reviewed?'':'primary'} full-width" data-action="method-reviewed" data-id="${id}" aria-pressed="${reviewed}">${icon('check')}${reviewed?'Comparaison effectuée':'J’ai comparé mon essai'}</button><p class="small spaced">Pour conserver tes brouillons et critères cochés, utilise aussi Exporter dans Mon espace personnel.</p>${button('Ma sauvegarde','#settings',false,'download')}</section>${errorAudit('atelier:'+ex.id,ex.subject)}${practiceRepairs(ex.method)}<section class="panel method-rework spaced"><h3><label for="method-rework">Mon point à retravailler</label></h3><p id="method-rework-help" class="small">Note une difficulté et une action concrète : « J’ai oublié une condition. Je la confronte aux faits, puis je réécris la mineure sans le modèle. »</p><textarea id="method-rework" data-exercise="${id}" rows="5" maxlength="50000" aria-describedby="method-rework-help method-rework-status" placeholder="Ce que je veux améliorer ; ce que je vais refaire…">${esc(state.methodology.rework[id]||'')}</textarea><small id="method-rework-status" role="status">${storageAvailable?'Enregistré avec ton essai et inclus dans ta sauvegarde.':'Enregistrement indisponible : copie ce bilan avant de fermer.'}</small>${button('Toutes mes difficultés','#difficultes',false,'note')}${state.study.resolvedMethods.includes(id)?'<p class="small">Ce point personnel est marqué retravaillé ; ton bilan reste conservé.</p>':`<button class="btn" data-action="study-resolve-method" data-id="${id}">J’ai retravaillé ce point personnel</button>`}</section></aside></div>`;
  }
  function methodologySources() {
    return `${header('Les repères de cet espace.','Les documents de méthode retrouvés dans tes dossiers sont complétés par des ressources universitaires et des textes officiels.','MÉTHODOLOGIE · SOURCES',button('Revenir aux méthodes','#methodologie',false,'back'))}<section class="panel"><h2>Lire les sources avec leur contexte</h2><p>Les documents de TD datés de 2020–2021 ou 2024–2025 apportent des repères, pas les consignes de ton épreuve actuelle. Les fiches de travail préparées et tes notes personnelles restent distinguées des ressources universitaires.</p><p>Les exemples et simulations du site sont rédigés pour ton entraînement. Une règle ou une décision fictive porte cette mention dans son énoncé. Les méthodes et les réponses proposées doivent être adaptées aux consignes de ton enseignant.</p></section><div class="reference-grid spaced">${M.sources.map(s=>`<article class="reference-card" id="method-source-${s.id}"><span class="eyebrow">${s.url?'Ressource externe':'Tes documents de méthode'}</span><h3>${esc(s.title)}</h3><p>${esc(s.institution)}</p><p>${esc(s.note)}</p>${s.url?`<a class="source-link" href="${esc(s.url)}" target="_blank" rel="noopener">${icon('external')}Consulter la ressource</a>`:'<small class="muted">Consulté dans tes fichiers de fac ; le document original reste dans tes dossiers.</small>'}</article>`).join('')}</div>`;
  }
  function methodologyPage(route) {
    if(route[1]==='pas-a-pas')return guidedPage(route[2]);
    if(route[1]==='debloquer')return repairPage();
    if(route[1]==='mes-essais')return methodologyAttempts(route[2],route[3],route[4]);
    if(route[1]==='matiere')return methodologyProfile(route[2]);
    if(route[1]==='entrainement')return methodPractice(route[2]);
    if(route[1]==='sources')return methodologySources();
    return route[1]?methodologyGuide(route[1]):methodologyHome();
  }

  function tdSubjectNav(selected='all') {
    return `<nav class="filters" aria-label="Filtrer les TD">${[['all','Tous mes TD'],['prive','Droit privé'],['public','Droit public']].map(([id,title])=>`<a class="filter-chip ${id===selected?'active':''}" href="#td/${id}" ${id===selected?'aria-current="page"':''}>${title}</a>`).join('')}</nav>`;
  }
  function tdSessionCard(s) {
    return `<a class="td-session ${subjects[s.subject].color}" href="#td/seance/${s.id}"><span class="eyebrow">${esc(subjectName(s.subject))} · SÉANCE ${s.number}</span><h3>${esc(s.title)}</h3><span class="pill">${esc(s.status)}</span><p>${esc(s.summary)}</p><span class="text-link">Ouvrir la séance ${icon('arrow')}</span></a>`;
  }
  function tdDocCard(d) {
    return `<article class="td-document"><div><span class="eyebrow">${esc(d.label)}</span><h3>${esc(d.filename)}</h3><p class="small muted">${esc(subjectName(d.subject))}${d.page_count?' · '+d.page_count+' pages':''}</p></div><div class="page-actions">${button('Lire','#td/document/'+d.id,false,'book')}<a class="btn" href="${esc(d.url)}" download>${icon('download')}Original</a></div></article>`;
  }
  function tdHome(selected='all') {
    if(!['public','prive'].includes(selected))selected='all';
    const items=T.sessions.filter(s=>selected==='all'||s.subject===selected);
    return `${header('Mes TD, séance par séance.','Les supports, tes préparations et les explications corrigées sont réunis sans confondre leur provenance.','TD & CORRECTIONS',button('Préparer mes examens','#examens',true,'clock')+button('Tous les fichiers','#td/documents',false,'folder'))}${tdSubjectNav(selected)}<p class="method-scope">${esc(T.scope)}</p><div class="td-session-grid">${items.map(tdSessionCard).join('')}</div><section class="panel spaced"><h2>Ce qui reste à compléter</h2><ul class="guide-points">${T.missing.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></section>`;
  }
  function tdDocumentLibrary() {
    return `${header('Les fichiers de mes TD.','Les originaux restent téléchargeables. Les notes et préparations sont distinguées des supports de séance.','BIBLIOTHÈQUE · TD',button('Retour aux séances','#td',false,'back'))}<div class="td-documents">${T.documents.map(tdDocCard).join('')}</div>`;
  }
  function teachingSection(s,index) {
    return `<section id="td-section-${index}"><h2>${esc(s.title)}</h2>${s.text.split(/\n\n/).map(text=>`<p>${esc(text)}</p>`).join('')}${s.links?.length?`<div class="guide-sources">${s.links.map(link=>`<a class="source-link" href="${esc(link.url)}" target="_blank" rel="noopener">${icon('external')}${esc(link.label)}</a>`).join('')}</div>`:''}</section>`;
  }
  function tdPeerReview(r) {
    return `<section id="td-peer-review" class="panel peer-review spaced"><span class="eyebrow">NOTES D’UNE CAMARADE · COMPARAISON AJOUTÉE</span><h2>${esc(r.title)}</h2><p>${esc(r.summary)}</p><p class="small peer-scope"><strong>${esc(r.sourceLabel)}.</strong> ${esc(r.scope)}</p><details class="method-correction peer-correction"><summary>Voir les ${r.sections.length} apports et rectifications</summary><div class="reader-body td-prose">${r.sections.map((part,i)=>teachingSection(part,'peer-'+i)).join('')}</div></details></section>`;
  }
  function annexNotice(n) {
    return `<aside class="reading-correction" role="note"><span class="eyebrow">REPÈRE AJOUTÉ · ${esc(n.kind)}</span><h3>${esc(n.title)}</h3><p>${esc(n.text)}</p>${n.links?.length?`<div class="guide-sources">${n.links.map(l=>sourceLink(l)).join('')}</div>`:''}</aside>`;
  }
  function tdAnnexReview(r) {
    return `<section id="td-annex-review" class="spaced"><span class="eyebrow">ANNEXES RETROUVÉES · EXPLICATIONS AJOUTÉES</span><h2>${esc(r.title)}</h2><p class="lead">${esc(r.intro)}</p><p class="method-scope">Les textes de 2009 et 2019 sont conservés à leur date. Les précisions ajoutées sont vérifiées le ${dateLabel(r.checked)} ; elles ne constituent pas de nouvelles consignes de l’enseignant.</p><article class="reader"><div class="reader-body td-prose">${r.sections.map((s,i)=>`<section id="annex-section-${i}"><h2>${esc(s.title)}</h2>${s.text.split(/\n\n/).map(t=>`<p>${esc(t)}</p>`).join('')}<div class="guide-sources">${s.links.map(l=>l.route?button(l.label,l.route,false,'book'):sourceLink(l)).join('')}</div><div class="practice-case"><h3>Essayer sur les annexes</h3><p>${esc(s.practice.question)}</p><details class="practice-solution"><summary>Comparer avec l’explication</summary><p>${esc(s.practice.answer)}</p></details></div></section>`).join('')}</div></article></section>`;
  }

  function tdChronology(s) {
    return `<section id="td-chronology" class="spaced"><div class="section-heading"><h2>${esc(s.chronologyTitle||'Les repères chronologiques')}</h2><span class="pill">Repères sourcés</span></div><article class="reader"><div class="reader-body td-prose"><ol class="td-chronology">${s.chronology.map(item=>`<li><h3>${item.date.length===10?dateLabel(item.date):esc(item.date)}</h3><p>${esc(item.text)}</p><div class="guide-sources">${(item.links||[]).map(methodLink).join('')}</div></li>`).join('')}</ol></div></article></section>`;
  }
  function tdSessionPage(id) {
    const s=tdSessions[id];if(!s)return notFound();
    return `${header(s.title,s.summary,subjectName(s.subject).toUpperCase()+' · TD '+s.number,button('Mes TD','#td/'+s.subject,false,'back')+button('Préparer mon épreuve','#examens/'+(s.preparation||(s.subject==='public'?'public':'controle')),true,'clock'))}<p class="td-status">${esc(s.status)}</p><nav class="filters" aria-label="Dans cette séance"><a class="filter-chip" href="#td-supports" data-scroll="td-supports">Supports et notes</a>${s.annexReview?'<a class="filter-chip" href="#td-annex-review" data-scroll="td-annex-review">Comprendre les annexes</a>':''}${s.peerReview?'<a class="filter-chip" href="#td-peer-review" data-scroll="td-peer-review">'+esc(s.peerReview.navLabel||'Correction de ma camarade')+'</a>':''}${s.sections.length?'<a class="filter-chip" href="#td-correction" data-scroll="td-correction">Explications et rectifications</a>':''}${s.chronology?.length?'<a class="filter-chip" href="#td-chronology" data-scroll="td-chronology">Frise Perruche</a>':''}${s.exercises.length?'<a class="filter-chip" href="#td-practice" data-scroll="td-practice">M’entraîner</a>':''}</nav><section id="td-supports"><h2>Les documents reçus</h2><div class="td-documents">${s.documents.map(id=>tdDocCard(tdDocuments[id])).join('')||notice(s.sourceNote||'Aucun fichier lisible n’a été intégré à cette séance pour le moment.')}</div></section>${s.peerReview?tdPeerReview(s.peerReview):''}${s.annexReview?tdAnnexReview(s.annexReview):''}${s.limits.length?`<div class="notice spaced">${icon('info')}<div>${s.limits.map(t=>`<p>${esc(t)}</p>`).join('')}</div></div>`:''}${s.sections.length?`<section class="spaced" id="td-correction"><div class="section-heading"><h2>Comprendre et rectifier</h2><span class="pill">Explications ajoutées</span></div><p class="method-scope">Ces réponses et plans sont proposés pour réviser. Ils ne sont pas présentés comme le corrigé officiel du chargé de TD. ${s.sourceNote?'Les réponses transmises ont été reformulées et vérifiées dans cette séance.':'Les formulations et documents reçus restent accessibles ci-dessus.'}</p><article class="reader"><div class="reader-body td-prose">${s.sections.map(teachingSection).join('')}</div></article></section>`:''}${s.chronology?.length?tdChronology(s):''}${s.checks.length?`<section class="panel spaced"><h2>Ce que je dois savoir expliquer</h2><ul class="guide-points">${s.checks.map(text=>`<li>${esc(text)}</li>`).join('')}</ul></section>`:''}${s.exercises.length?`<section class="spaced" id="td-practice"><h2>Passer à l’entraînement</h2><div class="method-exercises">${s.exercises.map(id=>methodExerciseCard(methodExercises[id])).join('')}</div></section>`:''}`;
  }
  function tdDocumentPage(id,index) {
    const d=tdDocuments[id];if(!d)return notFound();
    const related=T.sessions.filter(s=>s.documents.includes(id));
    const pdf=d.filename.toLowerCase().endsWith('.pdf');
    return `${header(d.filename,d.label+' · '+subjectName(d.subject),'TD · DOCUMENT TRANSMIS',button('Les séances','#td/'+d.subject,false,'back')+`<a class="btn primary" href="${esc(d.url)}" ${pdf?'target="_blank" rel="noopener"':'download'}>${icon(pdf?'external':'download')}${pdf?'Ouvrir le PDF original':'Télécharger l’original'}</a>`)}${notice(d.note)}${d.currentness?`<section class="panel spaced"><h2>Les dates à garder en tête</h2><p>Ces repères ajoutés accompagnent le document historique. Les textes originaux et leurs anciennes références restent conservés ci-dessous.</p>${d.currentness.map(annexNotice).join('')}</section>`:''}<div class="page-actions back">${related.map(s=>button('Explications du TD '+s.number,'#td/seance/'+s.id,false,'note')).join('')}</div><article class="reader"><div class="source-strip"><span>${icon('book')}${esc(d.label)} · texte reçu</span></div><div class="reader-body td-prose">${d.paragraphs.map((p,i)=>`<section id="td-p-${i}" class="${String(index)===String(i)?'td-target':''}">${p.page?`<h2>Page ${p.page}</h2>`:''}${(d.currentness||[]).filter(n=>n.page_ranges.some(([a,b])=>p.page===a||b-a<4&&p.page>=a&&p.page<=b)).map(annexNotice).join('')}${p.text.trim()?`<p>${esc(p.text)}</p>`:''}${p.page&&(p.text.trim().length<180||d.visual_pages?.includes(p.page))?`<p class="source-note">Page comportant un schéma ou du contenu en image : <a class="source-link" href="${esc(d.url)}#page=${p.page}" target="_blank" rel="noopener">lire cette page dans le PDF original</a>.</p>`:''}</section>`).join('')}</div></article>`;
  }
  function tdPage(route) {
    if(route[1]==='seance')return tdSessionPage(route[2]);
    if(route[1]==='document')return tdDocumentPage(route[2],route[3]);
    if(route[1]==='documents')return tdDocumentLibrary();
    return tdHome(route[1]);
  }
  function examAssessmentCard(a) {
    return `<article class="exam-assessment ${subjects[a.subject].color}"><span class="eyebrow">${esc(subjectName(a.subject))}</span><p class="exam-date">${dateLabel(a.date)}</p><h2>${esc(a.title)}</h2><p><strong>${a.minutes<60?a.minutes+' minutes':Math.floor(a.minutes/60)+' h'+(a.minutes%60?' '+a.minutes%60:'')}</strong> · ${esc(a.slot)}</p><p class="small muted">${esc(a.scope)}</p>${button('Préparer cette épreuve','#examens/'+a.pack,true,'arrow')}</article>`;
  }
  function examHome() {
    return `${header('Préparer mes examens, concrètement.','Choisir une priorité, rappeler les règles puis s’entraîner avec un corrigé expliqué.','RÉVISIONS · CONTRÔLES & PARTIELS',button('Mon programme','#aujourdhui',true,'clock')+button('Mes difficultés','#difficultes',false,'note')+button('Mes TD','#td',false,'book'))}${examResume()}<div class="exam-assessments">${E.assessments.map(examAssessmentCard).join('')}</div><p class="method-scope">${esc(E.scope)}</p><section class="panel method-resume"><div><span class="eyebrow">COMPÉTENCE · MÉMORISER LES RÈGLES</span><h2>Le bon article pour la bonne question.</h2><p>Revoir les références, expliquer ce qu’elles permettent de décider et repérer leurs limites.</p></div><div class="page-actions">${button('Les articles à retenir','#examens/articles',true,'book')}${button('Mon récapitulatif relu','#examens/recapitulatif',false,'note')}${button('Les 18 cartes d’articles','#cards/collection/competence',false,'cards')}</div></section>${methodResume()}`;
  }
  function examPackPage(id) {
    const p=E.packs.find(p=>p.id===id);if(!p)return notFound();
    const a=E.assessments.find(a=>a.pack===id);
    return `${header(p.title,p.intro,'RÉVISIONS · '+(a?dateLabel(a.date).toUpperCase():'MON PARCOURS'),button('Mes évaluations','#examens',false,'back')+button('Articles et pièges','#examens/articles',false,'book'))}${a?notice(a.minutes+' minutes · '+a.slot+'. '+a.scope):''}<section class="exam-priority panel"><div><span class="eyebrow">UN ESSAI, PUIS UN POINT À REPRENDRE</span><h2>${id==='controle'?'Commencer une simulation de 20 minutes.':'Passer des connaissances à une réponse.'}</h2><p>Rédige d’abord, ouvre le corrigé ensuite, puis garde une trace de ce que tu veux améliorer.</p>${button('Commencer l’entraînement','#methodologie/entrainement/'+p.exercises[0],true,'note')}${button('Faire un essai en mode examen','#examen/'+p.exercises[0],false,'clock')}${button('Commencer par un guidage','#methodologie/pas-a-pas/'+(id==='public'?'argumenter':'competence'),false,'arrow')}</div></section><article class="reader spaced"><div class="reader-body td-prose">${p.steps.map(teachingSection).join('')}</div></article><section class="spaced"><h2>Mes entraînements corrigés</h2><div class="method-exercises">${p.exercises.map(id=>methodExerciseCard(methodExercises[id])).join('')}</div></section><section class="spaced"><h2>Les séances à reprendre</h2><div class="td-session-grid">${p.sessions.map(id=>tdSessionCard(tdSessions[id])).join('')}</div></section>`;
  }
  function examArticlesPage(mode='priority') {
    const all=mode==='all',items=E.articles.filter(a=>all||a.priority);
    return `${header('Connaître la règle et savoir l’utiliser.','Cache la réponse, explique à voix haute le rôle de l’article, puis vérifie les conditions et le piège. Les résumés reformulent les textes officiels.','RÉVISIONS · ARTICLES DE COMPÉTENCE',button('Parcours du contrôle','#examens/controle',false,'back')+button('Réviser les 18 cartes','#cards/collection/competence',true,'cards'))}<nav class="filters" aria-label="Choisir les références"><a class="filter-chip ${!all?'active':''}" href="#examens/articles" ${!all?'aria-current="page"':''}>Les cinq repères prioritaires</a><a class="filter-chip ${all?'active':''}" href="#examens/articles/all" ${all?'aria-current="page"':''}>Tous les repères · ${E.articles.length}</a></nav><section class="panel recap-link"><h2>Ton récapitulatif photographié</h2><p>Les références de tes trois pages, leurs corrections expliquées et trois questions pour vérifier que tu sais les utiliser.</p>${button("Ouvrir mon récapitulatif relu","#examens/recapitulatif",true,"note")}</section><p class="method-scope">Références vérifiées le ${dateLabel(E.updated)}. Les attributions spéciales et les règles territoriales propres à une matière restent à vérifier. Les textes officiels priment sur le résumé ; mémoriser un numéro sans ses conditions ne suffit pas.</p><div class="reference-grid">${items.map(a=>`<article class="reference-card"><span class="eyebrow">${a.priority?'SOCLE PRIORITAIRE':'REPÈRE COMPLÉMENTAIRE'}</span><h2>${esc(a.title)}</h2><p>Que permet-il de décider ? Quelles conditions dois-tu vérifier ?</p><details class="exam-article-answer"><summary>Vérifier la règle et le piège</summary><p>${esc(a.rule)}</p><p class="pitfall"><strong>À vérifier :</strong> ${esc(a.trap)}</p></details><a class="source-link" href="${esc(a.url)}" target="_blank" rel="noopener">${icon('external')}Lire le texte officiel</a>${a.more?`<a class="source-link" href="${esc(a.more)}" target="_blank" rel="noopener">Texte complémentaire</a>`:''}</article>`).join('')}</div>`;
  }
  function receivedRecapPage() {
    const r=E.receivedRecap;if(!r)return notFound();
    return `${header(r.title,'Repartir de tes trois pages, rectifier les références et apprendre à les appliquer.','DROIT PRIVÉ · DOCUMENT REÇU',button('Articles à mémoriser','#examens/articles',false,'book')+button('M’entraîner en 20 minutes','#examens/controle',true,'clock'))}<section class="panel recap-intro"><span class="eyebrow">6 PHOTOS · 3 PAGES DISTINCTES</span><h2>Une référence, une fonction, des conditions.</h2><p>${esc(r.scope)}</p><p class="small">Explications vérifiées le ${dateLabel(r.checked)}. Les textes officiels et leurs versions applicables priment sur ces résumés.</p><nav class="recap-index" aria-label="Repères du récapitulatif">${r.sections.map(s=>`<a href="#recap-${s.id}" data-scroll="recap-${s.id}">${esc(s.title)}</a>`).join('')}</nav></section><article class="reader spaced"><div class="reader-body td-prose">${r.sections.map(s=>`<section id="recap-${s.id}" class="recap-section"><span class="eyebrow">PAGE ${s.page} DU DOCUMENT REÇU · EXPLICATION AJOUTÉE</span><h2>${esc(s.title)}</h2><p class="recap-received"><strong>Dans tes photos :</strong> ${esc(s.received)}</p><p>${esc(s.text)}</p><div class="guide-sources">${s.links.map(l=>sourceLink(l)).join('')}</div></section>`).join('')}</div></article><section class="panel spaced"><span class="eyebrow">RAPPEL ACTIF</span><h2>Trois questions avant de relire.</h2><p>Réponds d’abord à voix haute, puis compare ta réponse. Ces microcas sont des exemples pédagogiques inventés.</p>${r.practice.map((p,i)=>`<div class="recap-practice"><h3>${i+1}. ${esc(p.question)}</h3><details class="practice-solution"><summary>Comparer avec l’explication</summary><p>${esc(p.answer)}</p></details></div>`).join('')}<div class="page-actions">${button('Faire une simulation corrigée','#examens/controle',true,'note')}${button('Revoir la correction du TD2','#td/seance/prive-02',false,'book')}</div></section>`;
  }

  function examensPage(route) {
    if(route[1]==='controle')return controlPage(route);
    if(route[1]==='recapitulatif')return receivedRecapPage();
    if(route[1]==='articles')return examArticlesPage(route[2]);
    return route[1]?examPackPage(route[1]):examHome();
  }

  function notFound(){return empty('Cet espace est introuvable.','Retourne au tableau de bord pour retrouver tes matières.',button('Mon tableau de bord','#home',true));}
  function getRoute(){try{return (location.hash.slice(1)||'home').split('/').map(decodeURIComponent);}catch{return ['home'];}}
  function emptyLearning(){return {drafts:{},compared:[]};}
  function learningTasks(l){return [{id:'practice',title:'Mon essai sans le modèle',...l.practice},...l.variants];}
  function cleanLearning(input){
    const result=emptyLearning();
    for(const key of learningKeys)if(typeof input?.drafts?.[key]==='string'&&input.drafts[key].length<=500000)result.drafts[key]=input.drafts[key];
    result.compared=[...new Set((Array.isArray(input?.compared)?input.compared:[]).filter(key=>learningKeys.has(key)&&result.drafts[key]?.trim()))];
    return result;
  }
  function teachingLink(l,phase='comprendre'){return '#apprendre/'+l.id+'/'+phase;}
  function teachingCard(l){
    const tasks=learningTasks(l),started=tasks.some(t=>state.learning.drafts[l.id+'/'+t.id]?.trim()),compared=tasks.filter(t=>state.learning.compared.includes(l.id+'/'+t.id)).length;
    return `<a class="teaching-card panel ${subjects[l.subject].color}" href="${teachingLink(l)}"><span class="eyebrow">${esc(subjectName(l.subject))} · ${l.minutes} MIN ENVIRON</span><h3>${esc(l.title)}</h3><p>${esc(l.summary)}</p><small>${compared?compared+' / '+tasks.length+' essais comparés':started?'Un essai à reprendre':'Comprendre · observer · essayer · transférer'}</small><span class="text-link">Ouvrir la leçon ${icon('arrow')}</span></a>`;
  }
  function teachingOverview(subject='all',chapter=null){
    const items=L.lessons.filter(l=>(subject==='all'||l.subject===subject)&&(!chapter||l.chapters.includes(chapter)));
    if(!items.length)return '';
    return `<section class="panel teaching-overview spaced"><div><span class="eyebrow">COMPRENDRE COMMENT ON RÉDIGE</span><h2>Du raisonnement à ta propre réponse.</h2><p>Lis une réponse rédigée avec le rôle de chaque passage, essaie avec moins d’aide, puis change une donnée du sujet.</p></div>${button('Les leçons expliquées','#apprendre'+(subject==='all'?'':'/matiere/'+subject),true,'book')}${chapter?`<div class="teaching-related">${items.map(l=>`<a href="${teachingLink(l)}">${esc(l.title)} ${icon('arrow')}</a>`).join('')}</div>`:''}</section>`;
  }
  function teachingHome(subject='all'){
    if(!subjects[subject])subject='all';
    const items=L.lessons.filter(l=>subject==='all'||l.subject===subject);
    return `${header('Comprendre comment construire ma réponse.','Une explication, une réponse commentée, un essai personnel et deux changements de situation.','LEÇONS EXPLIQUÉES',button('Mes essais et ateliers','#methodologie/mes-essais',false,'note')+button('Mon programme','#aujourdhui',false,'clock'))}${filters('apprendre/matiere',subject)}<section class="panel teaching-intro"><h2>Quatre passages pour apprendre à faire.</h2><ol class="teaching-cycle"><li><strong>Comprendre</strong><span>Nommer la règle et distinguer les notions.</span></li><li><strong>Observer</strong><span>Voir pourquoi chaque phrase est utile.</span></li><li><strong>Essayer</strong><span>Rédiger avant d’ouvrir la proposition.</span></li><li><strong>Transférer</strong><span>Vérifier ce qui change quand le sujet varie.</span></li></ol><p class="small muted">${esc(L.scope)}</p></section><div class="teaching-grid spaced">${items.map(teachingCard).join('')}</div>`;
  }
  function teachingSources(l){return `<details class="teaching-sources"><summary>Sources et périmètre de cette leçon</summary><p>${esc(l.scope)}</p><p class="small">Explications ajoutées et références vérifiées le ${dateLabel(L.updated)}. Les cas sont fictifs ; les consignes de ton enseignant restent prioritaires.</p><div class="guide-sources">${l.sources.map(s=>sourceLink({url:s.url,label:s.label})).join('')}${l.chapters.map(id=>button('Cours · '+chapterById[id].title,'#chapter/'+id+'/cours',false,'book')).join('')}</div></details>`;}
  function teachingQuestion(q,i){return `<article class="teaching-recall"><h3>${i+1}. ${esc(q.question)}</h3><p class="small muted">Réponds sans relire, à voix haute ou sur papier.</p><details><summary>Vérifier mon explication</summary><p>${esc(q.answer)}</p></details></article>`;}
  function teachingTask(l,t){
    const key=l.id+'/'+t.id,draft=state.learning.drafts[key]||'',compared=state.learning.compared.includes(key);
    return `<section class="panel teaching-task" id="learning-${t.id}"><span class="eyebrow">${t.id==='practice'?'AVEC MOINS D’AIDE':'CHANGER UNE DONNÉE'}</span><h2>${esc(t.title)}</h2><p class="teaching-task-prompt">${esc(t.prompt)}</p>${t.scaffold?.length?`<details class="teaching-scaffold"><summary>Un fil de questions si je bloque</summary><ol>${t.scaffold.map(s=>`<li>${esc(s)}</li>`).join('')}</ol></details>`:''}<label for="learning-draft-${t.id}">Ma réponse avant comparaison</label><textarea id="learning-draft-${t.id}" data-learning-key="${key}" rows="7" maxlength="50000" aria-describedby="learning-status-${t.id}" placeholder="Écris ton raisonnement ; quelques phrases suffisent pour ce petit essai.">${esc(draft)}</textarea><small id="learning-status-${t.id}" role="status">${storageAvailable?'Réponse enregistrée sur cet appareil et incluse dans ta sauvegarde.':'Enregistrement indisponible : copie ton texte avant de fermer.'}</small><details class="teaching-solution"><summary>Comparer avec une réponse expliquée</summary>${(Array.isArray(t.answer)?t.answer:[t.answer]).map(p=>`<p>${esc(p)}</p>`).join('')}${t.why?`<p class="teaching-why"><strong>Le raisonnement à retenir.</strong> ${esc(t.why)}</p>`:''}${t.checks?.length?`<h3>Ce que je cherche dans mon essai</h3><ul>${t.checks.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>`:''}<p class="small muted">Plusieurs formulations peuvent convenir. Compare le raisonnement et les conditions, pas seulement les mots.</p><button class="btn" data-action="learning-compared" data-id="${key}" aria-pressed="${compared}" ${!draft.trim()?'disabled':''}>${compared?'J’ai comparé cette version':'J’ai comparé ma réponse'}</button><p class="small" id="learning-compared-${t.id}" role="status">${compared?'Comparaison déclarée ; cela ne valide pas automatiquement la maîtrise.':'Rédige un essai, puis vérifie-le avant de marquer la comparaison.'}</p></details></section>`;
  }
  function teachingExcerpt(l){return l.excerpt?`<figure class="panel teaching-excerpt"><h2>Le texte à commenter</h2><blockquote>${esc(l.excerpt)}</blockquote><figcaption>Constitution du 4 octobre 1958, article 3, premier alinéa. ${sourceLink(l.excerptSource)}</figcaption></figure>`:'';}
  function teachingLesson(id,phase='comprendre'){
    const l=teachingById[id];if(!l)return notFound();
    const phases=[['comprendre','1 · Comprendre'],['observer','2 · Observer'],['essayer','3 · Essayer'],['transferer','4 · Transférer']];
    if(!phases.some(([key])=>key===phase))return notFound();
    const index=phases.findIndex(([key])=>key===phase),nav=`<nav class="teaching-phases" aria-label="Étapes de la leçon">${phases.map(([key,label])=>`<a href="${teachingLink(l,key)}" class="${key===phase?'active':''}" ${key===phase?'aria-current="step"':''}>${label}</a>`).join('')}</nav>`;
    let body='';
    if(phase==='comprendre')body=`<section class="panel"><h2>À la fin, je dois pouvoir…</h2><ul class="guide-points">${l.objectives.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></section><article class="reader spaced"><div class="reader-body teaching-prose">${l.concepts.map(c=>`<section><h2>${esc(c.title)}</h2><p>${esc(c.text)}</p></section>`).join('')}<h2>Les confusions qui font perdre le raisonnement</h2><ul>${l.pitfalls.map(t=>`<li>${esc(t)}</li>`).join('')}</ul></div></article><section class="panel spaced"><h2>Trois rappels avant de regarder le modèle</h2>${l.retrieval.map(teachingQuestion).join('')}</section>`;
    if(phase==='observer')body=`<section class="panel"><span class="eyebrow">SUJET D’ENTRAÎNEMENT AJOUTÉ</span><h2>La question traitée</h2><p>${esc(l.prompt)}</p></section><section class="teaching-model spaced"><div class="section-heading"><h2>Une réponse, passage par passage</h2><button class="btn" data-action="learning-annotations" aria-pressed="true">Masquer les commentaires</button></div><p class="small muted">Lis d’abord le texte de la réponse. Les commentaires expliquent ensuite son rôle ; ce ne sont pas des phrases à recopier dans une copie.</p><div id="learning-model" class="teaching-model-segments">${l.model.map((s,i)=>`<article class="teaching-segment"><div class="teaching-answer"><span class="teaching-segment-number" aria-hidden="true">${i+1}</span><p>${esc(s.text)}</p></div><aside class="teaching-comment" aria-label="Commentaire du passage ${i+1}"><strong>${esc(s.role)}</strong><p>${esc(s.why)}</p></aside></article>`).join('')}</div>${l.plan?`<section class="panel spaced"><h3>Pourquoi ce plan ?</h3>${l.plan.map(p=>`<h4>${esc(p.title)}</h4><p>${esc(p.text)}</p>`).join('')}</section>`:''}</section>`;
    if(phase==='essayer')body=`<p class="method-scope">Le sujet change : essaie avant de revenir au modèle. Le fil de questions est facultatif et la proposition de réponse reste fermée au départ.</p>${teachingTask(l,{id:'practice',title:'Mon essai sans le modèle',...l.practice})}`;
    if(phase==='transferer')body=`<p class="method-scope">Pour chaque variante, indique ce qui change dans les faits ou la question, puis ce qui change dans ton raisonnement. Les repères de rédaction ne sont plus affichés.</p><div class="teaching-variants">${l.variants.map(t=>teachingTask(l,t)).join('')}</div><section class="panel spaced"><h2>Continuer sur un sujet plus autonome</h2><p>Le modèle de cette leçon ne doit pas devenir une réponse récitée. Passe à un autre atelier, puis compare seulement après ton essai.</p><div class="page-actions">${button('Ouvrir l’atelier','#methodologie/entrainement/'+l.exercise,true,'note')}${button('Essayer en mode examen','#examen/'+l.exercise,false,'clock')}${button('Revoir la méthode','#methodologie/'+l.method,false,'book')}</div></section>`;
    return `${header(l.title,l.summary,'LEÇON EXPLIQUÉE · '+subjectName(l.subject).toUpperCase(),button('Toutes les leçons','#apprendre/matiere/'+l.subject,false,'back')+(['comprendre','observer'].includes(phase)?`<button class="btn" data-action="print">${icon('print')}Imprimer cette étape</button>`:''))}${nav}${teachingExcerpt(l)}${body}<div class="teaching-next page-actions">${index?button('Étape précédente',teachingLink(l,phases[index-1][0]),false,'back'):''}${index<3?button(phases[index+1][1],teachingLink(l,phases[index+1][0]),true,'arrow'):button('Mes difficultés','#difficultes',false,'note')}</div>${teachingSources(l)}`;
  }
  function teachingPage(route){return !route[1]||route[1]==='matiere'?teachingHome(route[2]):teachingLesson(route[1],route[2]);}
  function teachingToReview(subject='all'){
    return L.lessons.filter(l=>(subject==='all'||l.subject===subject)&&learningTasks(l).some(t=>state.learning.drafts[l.id+'/'+t.id]?.trim()&&!state.learning.compared.includes(l.id+'/'+t.id)));
  }
  function teachingDifficultySection(subject){
    const items=teachingToReview(subject);if(!items.length)return '';
    return `<section class="spaced"><h2>Mes essais de leçons à comparer</h2><p>Tu as rédigé une réponse dont la dernière version n’est pas encore marquée comparée. Aucun résultat n’est déduit automatiquement de ton texte.</p><div class="study-weak-list">${items.map(l=>{const task=learningTasks(l).find(t=>state.learning.drafts[l.id+'/'+t.id]?.trim()&&!state.learning.compared.includes(l.id+'/'+t.id));return `<article class="panel"><span class="eyebrow">${esc(subjectName(l.subject))} · LEÇON EXPLIQUÉE</span><h3>${esc(l.title)}</h3>${button('Reprendre ma réponse',teachingLink(l,task.id==='practice'?'essayer':'transferer'),true,'note')}</article>`;}).join('')}</div></section>`;
  }
  function handleLearningInput(target){
    const key=target.dataset?.learningKey;if(!learningKeys.has(key))return false;
    state.learning.drafts[key]=String(target.value).slice(0,50000);state.learning.compared=state.learning.compared.filter(k=>k!==key);
    const success=persist(),task=key.split('/')[1],status=document.getElementById('learning-status-'+task);
    if(status)status.textContent=success?'Réponse enregistrée sur cet appareil et incluse dans ta sauvegarde.':'Enregistrement indisponible : copie ton texte avant de fermer.';
    const button=main.querySelector('[data-action="learning-compared"][data-id="'+key+'"]');if(button){button.disabled=!target.value.trim();button.textContent='J’ai comparé ma réponse';button.setAttribute('aria-pressed','false');}
    const compared=document.getElementById('learning-compared-'+task);if(compared)compared.textContent='Nouvelle version : compare ton raisonnement avant de marquer la comparaison.';
    return true;
  }
  function handleLearningAction(action,id,target){
    if(action==='learning-compared'){
      if(!learningKeys.has(id)||!state.learning.drafts[id]?.trim())return true;
      const compared=state.learning.compared.includes(id);state.learning.compared=compared?state.learning.compared.filter(k=>k!==id):[...state.learning.compared,id];persist();
      target.textContent=compared?'J’ai comparé ma réponse':'J’ai comparé cette version';target.setAttribute('aria-pressed',String(!compared));
      const status=document.getElementById('learning-compared-'+id.split('/')[1]);if(status)status.textContent=compared?'Comparaison à reprendre.':'Comparaison déclarée ; cela ne valide pas automatiquement la maîtrise.';
      return true;
    }
    if(action==='learning-annotations'){
      const model=document.getElementById('learning-model');if(!model)return true;
      const hidden=model.classList.toggle('without-comments');target.setAttribute('aria-pressed',String(!hidden));target.textContent=hidden?'Afficher les commentaires':'Masquer les commentaires';return true;
    }
    return false;
  }

  function emptyPathways(){return {drafts:{},first:{},reviews:{},issues:{},repairs:{}};}
  function pathForms(){return R.chapters.flatMap(p=>p.tasks.flatMap(t=>['base','variante'].map(form=>({key:p.chapter+'/'+t.id+'/'+form,taskKey:p.chapter+'/'+t.id,p,t,form}))));}
  function recallReview(previous,grade,now=Date.now()){
    const success=grade==='known',prior=previous||{},last=Number(prior.reviewedAt)||0;
    const streak=success?Math.min(6,Math.max(1,(Number(prior.streak)||0)+(prior.grade!=='known'||now-last>=20*3600000?1:0))):0;
    const days=success?[0,1,3,7,14,30,60][streak]:0;
    return {grade:success?'known':'again',streak,intervalDays:days,reviewedAt:now,due:now+(success?days*86400000:10*60000)};
  }
  function cleanRecall(value){
    if(!value||!['again','known'].includes(value.grade)||!Number.isFinite(value.due)||value.due<=0||value.due>=1e14)return null;
    return {grade:value.grade,due:value.due,streak:Math.max(0,Math.min(6,Math.floor(Number(value.streak)||0))),intervalDays:Math.max(0,Math.min(60,Number(value.intervalDays)||0)),reviewedAt:Math.max(0,Math.min(1e14,Number(value.reviewedAt)||0))};
  }
  function knownIssueContext(context,exams=state.study.exams){
    if(typeof context!=='string')return false;
    if(context.startsWith('atelier:'))return Object.hasOwn(methodExercises,context.slice(8));
    if(context.startsWith('copie:'))return Object.hasOwn(exams,context.slice(6));
    if(context.startsWith('controle:'))return C.copies.some(c=>c.id===context.slice(9));
    if(context.startsWith('question:'))return pathTaskKeys.has(context.slice(9));
    return false;
  }
  function cleanPathways(input,exams={}){
    const out=emptyPathways();
    for(const field of ['drafts','first'])for(const [key,text] of Object.entries(input?.[field]||{}))if(pathFormKeys.has(key)&&typeof text==='string'&&text.length<=500000)out[field][key]=text;
    for(const [key,value] of Object.entries(input?.reviews||{})){const clean=cleanRecall(value);if(pathReviewKeys.has(key)&&clean)out.reviews[key]={...clean,valid:value.valid===true,form:value.form==='variante'?'variante':'base',signature:typeof value.signature==='string'?value.signature.slice(0,60):''};}
    for(const [context,value] of Object.entries(input?.issues||{}))if(knownIssueContext(context,exams)&&value){const selected=[...new Set((Array.isArray(value.selected)?value.selected:[]).filter(id=>R.errors.some(e=>e.id===id)))];out.issues[context]={selected,resolved:[...new Set((Array.isArray(value.resolved)?value.resolved:[]).filter(id=>selected.includes(id)))]};}
    for(const [key,text] of Object.entries(input?.repairs||{})){const split=key.lastIndexOf('|');if(split>0&&knownIssueContext(key.slice(0,split),exams)&&R.errors.some(e=>e.id===key.slice(split+1))&&typeof text==='string'&&text.length<=500000)out.repairs[key]=text;}
    return out;
  }
  function pathSource(source){return source.url?sourceLink(source):sourceLink(source,source.label||'Passage du cours ou de la fiche');}
  function pathSources(p){
    const review=p.review?`<p class="small"><strong>Relecture du ${dateLabel(p.review.date)}</strong> : objectifs, explications, modèle commenté, quatre questions et quatre variantes, réponses et critères de comparaison.</p>${p.review.notes.length?`<h3>Précisions apportées à ce parcours</h3><ul>${p.review.notes.map(note=>`<li>${esc(note)}</li>`).join('')}</ul>`:''}`:'';
    return `<details class="path-sources"><summary>Sources et périmètre du parcours</summary><p>${esc(p.scope)}</p>${review}<p class="small">Explications, questions et modèles pédagogiques ajoutés le ${dateLabel(R.updated)}. Les références contrôlées figurent ci-dessous. Les consignes du professeur priment ; ces propositions ne constituent pas un corrigé officiel. Aucune note n’est calculée sur ton texte.</p><div class="guide-sources">${p.sources.map(pathSource).join('')}${button('Cours reçu','#chapter/'+p.chapter+'/cours',false,'book')}${button('Fiche','#chapter/'+p.chapter+'/fiche',false,'cards')}</div></details>`;
  }
  function pathNav(p,phase){return `<nav class="path-phase" aria-label="Étapes du parcours">${[['comprendre','1 · Comprendre'],['observer','2 · Observer'],['essayer','3 · Répondre seul'],['revoir','4 · Changer de situation']].map(([id,label])=>`<a class="${phase===id?'selected':''}" ${phase===id?'aria-current="step"':''} href="#parcours/${p.chapter}/${id}">${label}</a>`).join('')}</nav>`;}
  function pathTaskStatus(key){const review=state.pathways.reviews[key];return !review?'À découvrir':!review.valid?'Réponse modifiée : à comparer':review.grade==='again'?'À reprendre':review.due<=Date.now()?'À réactiver sans aide':'Prochain rappel le '+new Date(review.due).toLocaleDateString('fr-FR',{day:'numeric',month:'long'});}
  function pathwaySubjectCards(){return D.subjects.map(s=>`<article class="panel path-card"><span class="eyebrow">L1 · SEMESTRE 1</span><h2>${esc(s.title)}</h2><p>${R.chapters.filter(p=>p.subject===s.id).length} parcours avec explications, exemple commenté et questions ouvertes. Choisis un chapitre dans cette matière.</p>${button('Mes parcours de cette matière','#parcours/matiere/'+s.id,true,'book')}</article>`).join('');}
  function pathwayHome(subject='all'){
    if(!subjects[subject])subject='all';const chapters=R.chapters.filter(p=>subject==='all'||p.subject===subject);
    return `${header('Apprendre un chapitre, étape par étape.','Comprendre les notions, observer une réponse, essayer puis réactiver sur une autre situation.','MES PARCOURS',button('Mes rappels à faire','#revisions',true,'refresh')+button('Mon contrôle privé','#examens/controle',false,'clock'))}<nav class="filters" aria-label="Choisir une matière">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,label])=>`<a class="filter-chip ${id===subject?'active':''}" href="#parcours/matiere/${id}">${esc(label)}</a>`).join('')}</nav><section class="panel path-intro"><h2>Un même fil, des contenus propres à chaque chapitre.</h2><p>Chaque parcours contient trois objectifs, une explication, un exemple commenté et quatre questions ouvertes avec leurs variantes. Les réponses restent cachées avant ton essai. Tes repères de réussite viennent de ta comparaison, pas d’une analyse automatique du texte.</p><div class="page-actions">${button('Les six modèles détaillés déjà disponibles','#apprendre',false,'book')}${button('Les méthodes de rédaction','#methodologie',false,'note')}</div></section><div class="path-grid spaced">${subject==='all'?pathwaySubjectCards():chapters.map(p=>{const c=chapterById[p.chapter],reviews=p.tasks.map(t=>state.pathways.reviews[p.chapter+'/'+t.id]),compared=reviews.filter(r=>r?.valid).length;return `<article class="panel path-card"><span class="eyebrow">${esc(subjectName(p.subject))} · CHAPITRE ${c.number}</span><h2>${esc(c.title)}</h2><p>${esc(p.goals[0])}</p><p class="small">${compared} / 4 questions comparées · repère personnel${c.partial?' · cours reçu partiel':''}${c.generated?' · complément UNJF':''}</p>${button('Commencer ce parcours','#parcours/'+p.chapter+'/comprendre',true)}</article>`;}).join('')}</div>`;
  }
  function pathwayTask(p,t,form){
    const isVariant=form==='variante',q=isVariant?t.variant:t,key=p.chapter+'/'+t.id+'/'+form,taskKey=p.chapter+'/'+t.id,review=state.pathways.reviews[taskKey],draft=state.pathways.drafts[key]||'',first=state.pathways.first[p.chapter+'/'+t.id+'/base'];
    return `<section class="panel path-task"><span class="eyebrow">${isVariant?'VARIANTE · RÉACTIVER SANS LE MODÈLE':'QUESTION OUVERTE · ESSAI PERSONNEL'}</span><h2>${esc(t.title)}</h2><p class="path-question">${esc(q.prompt)}</p><p class="small">Réponds sans regarder, à voix haute ou par écrit. Un texte te permet de comparer tes essais plus tard.</p><label for="path-draft">Ma réponse</label><textarea id="path-draft" data-path-key="${key}" rows="8" maxlength="20000" placeholder="J’explique, je justifie et je donne un exemple utile…">${esc(draft)}</textarea><p class="small" id="path-save-status" role="status">${draft?'Texte enregistré sur cet appareil.':'Ton texte sera enregistré sur cet appareil et inclus dans la sauvegarde.'}</p>${!isVariant&&t.hint?`<details class="path-hint"><summary>Un indice pour commencer</summary><p>${esc(t.hint)}</p></details>`:''}<details class="path-solution"><summary>J’ai essayé : comparer avec la réponse expliquée</summary><div class="path-answer">${q.answer.map(text=>`<p>${esc(text)}</p>`).join('')}<h3>Les points à retrouver dans ma réponse</h3><ul>${q.checks.map(text=>`<li>${esc(text)}</li>`).join('')}</ul><p class="small">Compare la dernière version de ton texte. Les boutons ci-dessous sont ton autoévaluation ; le site ne vérifie pas ta réponse rédigée.</p><div class="review-actions"><button class="btn again" data-action="path-rate" data-id="${key}" data-grade="again">${icon('cross')} À reprendre</button><button class="btn known" data-action="path-rate" data-id="${key}" data-grade="known">${icon('check')} Je l’explique sans aide</button></div><p class="path-rating ${review?.valid?review.grade:''}" id="path-rating" role="status">${esc(pathTaskStatus(taskKey))}</p></div></details>${isVariant&&first?`<details class="path-first"><summary>Après mon essai : comparer avec ma première réponse</summary><div class="path-own-text">${esc(first)}</div><p>Qu’as-tu mieux défini, mieux justifié ou réussi à appliquer dans cette nouvelle situation ?</p></details>`:''}</section>${errorAudit('question:'+taskKey,p.subject)}`;
  }
  function pathwayPage(route){
    if(!route[1]||route[1]==='matiere')return pathwayHome(route[2]);
    const p=pathByChapter[route[1]],phase=route[2]||'comprendre';if(!p||!['comprendre','observer','essayer','revoir'].includes(phase))return notFound();
    const c=chapterById[p.chapter],head=header(c.title,'Un parcours pédagogique ajouté, relié au cours et à sa fiche.','APPRENDRE · '+subjectName(p.subject).toUpperCase(),button('Tous mes parcours','#parcours/matiere/'+p.subject,false,'back')+button('Cours complet','#chapter/'+p.chapter+'/cours',false,'book'))+pathNav(p,phase);
    let body='';
    if(phase==='comprendre')body=`<section class="panel path-objectives"><h2>À la fin, je dois pouvoir…</h2><ul>${p.goals.map(g=>`<li>${esc(g)}</li>`).join('')}</ul></section><article class="reader spaced"><div class="reader-body path-prose"><h2>Comprendre les liens entre les notions</h2>${p.explanation.map(text=>`<p>${esc(text)}</p>`).join('')}</div></article><div class="page-actions spaced">${button('Observer une réponse commentée','#parcours/'+p.chapter+'/observer',true)}${button('Tester ce que je sais déjà','#parcours/'+p.chapter+'/essayer',false,'note')}</div>`;
    if(phase==='observer')body=`<section class="panel"><span class="eyebrow">MODÈLE PÉDAGOGIQUE AJOUTÉ</span><h2>${esc(p.model.title)}</h2><p class="path-question">${esc(p.model.prompt)}</p><p class="small">Les commentaires expliquent le rôle des phrases. Un scénario éventuel est un exemple d’entraînement, sans prédiction du sujet d’examen.</p></section><div class="path-model spaced">${p.model.segments.map((seg,i)=>`<article class="path-model-row"><div><span class="eyebrow">${i+1} · ${esc(seg.role)}</span><p>${esc(seg.text)}</p></div><aside><strong>Pourquoi ce passage ?</strong><p>${esc(seg.why)}</p></aside></article>`).join('')}</div><div class="page-actions spaced">${button('Essayer sans le modèle','#parcours/'+p.chapter+'/essayer',true,'note')}</div>`;
    if(['essayer','revoir'].includes(phase)){
      const task=route[3]?p.tasks.find(t=>t.id===route[3]):p.tasks[0];if(!task)return notFound();
      const form=phase==='revoir'?'variante':'base',index=p.tasks.indexOf(task);
      body=`<nav class="path-task-nav" aria-label="Choisir une question ouverte">${p.tasks.map((t,i)=>`<a class="pill ${task.id===t.id?'selected':''}" href="#parcours/${p.chapter}/${phase}/${t.id}">${i+1} · ${esc(t.title)}</a>`).join('')}</nav>${phase==='revoir'?notice('La situation ou l’angle de la question change. Réponds avant de consulter la correction ou ton premier essai ; une réussite immédiate ne garantit pas une réussite quelques jours plus tard.'):''}${pathwayTask(p,task,form)}<div class="path-paging">${index>0?button('Question précédente','#parcours/'+p.chapter+'/'+phase+'/'+p.tasks[index-1].id,false,'back'):'<span></span>'}${index<3?button('Question suivante','#parcours/'+p.chapter+'/'+phase+'/'+p.tasks[index+1].id,true):button('Retrouver mes rappels','#revisions',true,'clock')}</div>`;
    }
    const scope=c.partial?notice(c.partialNote||'Le cours reçu pour ce chapitre est partiel. Ce parcours suit les éléments disponibles ; il ne complète pas les séances manquantes.'):c.generated?notice('Parcours fondé sur le complément UNJF et ses sources, distinct du CM de ton professeur.'):'';
    return head+scope+body+pathSources(p);
  }
  function pathRecallItems(subject='all'){
    const items=[];
    for(const p of R.chapters)if(subject==='all'||p.subject===subject)for(const t of p.tasks){const key=p.chapter+'/'+t.id,r=state.pathways.reviews[key];if(r)items.push({kind:'question',subject:p.subject,title:t.title+' · '+chapterById[p.chapter].title,key,due:r.valid?r.due:0,grade:r.grade,needsCompare:!r.valid,url:'#parcours/'+p.chapter+'/'+(!r.valid?(r.form==='base'?'essayer':'revoir'):(r.form==='base'?'revoir':'essayer'))+'/'+t.id});}
    for(const a of C.articles){const key='controle/article:'+a.id,r=state.pathways.reviews[key];if(r)items.push({kind:'article',subject:'prive',title:a.title,key,due:r.valid?r.due:0,grade:r.grade,needsCompare:!r.valid,url:'#examens/controle/articles/'+a.group+'/'+a.id});}
    for(const q of C.td3){const key='controle/td3:'+q.id,r=state.pathways.reviews[key];if(r)items.push({kind:'td3',subject:'prive',title:q.title,key,due:r.valid?r.due:0,grade:r.grade,needsCompare:!r.valid,url:'#examens/controle/td3/'+q.group+'/'+q.id});}
    return items.filter(x=>subject==='all'||x.subject===subject);
  }
  function recallOverview(){
    const all=pathRecallItems(),due=all.filter(x=>x.due<=Date.now()),future=all.filter(x=>x.due>Date.now()),cards=D.cards.filter(c=>state.reviews[c.id]&&state.reviews[c.id].due<=Date.now());
    return `<section class="panel recall-overview"><div><span class="eyebrow">RÉACTIVER CE QUE J’AI DÉJÀ TRAVAILLÉ</span><h2>${due.length+cards.length} rappels à reprendre.</h2><p>${due.length} questions ouvertes ou repères de contrôle · ${cards.length} cartes déjà vues arrivées à échéance. ${future.length} autres rappels sont programmés pour plus tard.</p></div>${button('Ouvrir mes rappels','#revisions',true,'refresh')}</section>`;
  }
  function recallPage(subject='all'){
    if(!subjects[subject])subject='all';const items=pathRecallItems(subject),due=items.filter(x=>x.due<=Date.now()).sort((a,b)=>a.due-b.due),future=items.filter(x=>x.due>Date.now()).sort((a,b)=>a.due-b.due),cards=D.cards.filter(c=>(subject==='all'||c.subject===subject)&&state.reviews[c.id]&&state.reviews[c.id].due<=Date.now());
    return `${header('Retrouver sans relire.','Revenir sur une question après un délai, puis vérifier ce qui tient encore sans le modèle.','MES RAPPELS',button('Apprendre un chapitre','#parcours',false,'book'))}<nav class="filters" aria-label="Filtrer les rappels">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,label])=>`<a class="filter-chip ${subject===id?'active':''}" href="#revisions/${id}">${esc(label)}</a>`).join('')}</nav><section class="panel"><h2>Comment les délais évoluent</h2><p>Après ton autoévaluation « Je l’explique sans aide », les intervalles proposés progressent : 1, 3, 7, 14, 30 puis 60 jours. « À reprendre » fait revenir la question dans environ 10 minutes. Plusieurs clics ou réussites le même jour ne font pas monter artificiellement le niveau.</p><p>Le rappel change entre la question initiale et sa variante. Les articles du contrôle et les questions du TD3 reviennent également ; leurs prochaines dates apparaissent après comparaison. Ce sont des repères de révision, pas une preuve de maîtrise ni des notifications.</p></section>${cards.length?`<section class="panel spaced"><h2>${cards.length} cartes déjà vues à réactiver</h2><button class="btn primary" data-action="study-launch-cards" data-id="${subject}" data-kind="scheduled" data-limit="10">Réviser dix cartes au maximum ${icon('cards')}</button></section>`:''}<section class="spaced"><h2>À reprendre maintenant · ${due.length}</h2>${due.length?`<div class="path-grid">${due.map(x=>`<article class="panel"><span class="eyebrow">${esc(subjectName(x.subject))} · ${x.needsCompare?'VERSION À COMPARER':x.grade==='again'?'À REPRENDRE':'RAPPEL DIFFÉRÉ'}</span><h3>${esc(x.title)}</h3>${button('Répondre sans le modèle',x.url,true,'note')}</article>`).join('')}</div>`:empty('Aucun rappel de question à cette heure.','Travaille une question ouverte et compare ta réponse : son prochain passage sera programmé ici.',button('Choisir un chapitre','#parcours',true))}</section>${future.length?`<details class="panel spaced"><summary>Les prochains rappels · ${future.length}</summary><div class="recall-future">${future.map(x=>`<p><strong>${new Date(x.due).toLocaleString('fr-FR',{day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'})}</strong> · ${esc(x.title)}</p>`).join('')}</div></details>`:''}`;
  }
  function issueContextInfo(context){
    if(context.startsWith('question:')){const [chapter,task]=context.slice(9).split('/'),p=pathByChapter[chapter],t=p?.tasks.find(t=>t.id===task);return t?{title:chapterById[chapter].title+' · '+t.title,subject:p.subject,url:'#parcours/'+chapter+'/essayer/'+task,text:state.pathways.drafts[chapter+'/'+task+'/variante']||state.pathways.drafts[chapter+'/'+task+'/base']||''}:null;}
    if(context.startsWith('atelier:')){const id=context.slice(8),e=methodExercises[id];return e?{title:e.title,subject:e.subject,url:'#methodologie/entrainement/'+id,text:state.methodology.drafts[id]||''}:null;}
    if(context.startsWith('controle:')){const id=context.slice(9),c=C.copies.find(c=>c.id===id);return c?{title:c.title,subject:'prive',url:'#examens/controle/copie/'+id,text:C.copySteps.map(s=>s.label+'\n'+(state.control.answers['copy:'+id+'/'+s.id]||'')).join('\n\n')}:null;}
    if(context.startsWith('copie:')){const id=context.slice(6),a=state.study.exams[id],e=a&&methodExercises[a.exercise];return e?{title:e.title,subject:e.subject,url:'#examen/'+a.exercise+'/'+id,text:a.draft}:null;}
    return null;
  }
  function errorAudit(context,subject){
    if(!knownIssueContext(context))return '';const data=state.pathways.issues[context]||{selected:[],resolved:[]},errors=R.errors.filter(e=>!e.subjects||subject==='all'||e.subjects.includes(subject));
    return `<section class="panel error-audit spaced"><span class="eyebrow">APRÈS LA COMPARAISON · MON BILAN D’ERREURS</span><h2>Qu’est-ce que je dois retravailler ?</h2><p>Coche les difficultés que tu constates dans cette production. Un exercice court t’aide à réécrire le passage concerné ; cette grille n’analyse pas automatiquement ta copie.</p><div class="error-checks">${errors.map(e=>`<label><input type="checkbox" data-path-issue="${esc(context)}" data-error="${e.id}" ${data.selected.includes(e.id)?'checked':''}><span>${esc(e.title)}</span></label>`).join('')}</div><div id="error-audit-links">${errorAuditLinks(context,errors)}</div></section>`;
  }
  function errorAuditLinks(context,errors=R.errors){const data=state.pathways.issues[context]||{selected:[],resolved:[]};return data.selected.filter(id=>errors.some(e=>e.id===id)).map(id=>{const e=R.errors.find(e=>e.id===id);return `<a class="error-repair-link ${data.resolved.includes(id)?'resolved':''}" href="#reparer/${id}/${encodeURIComponent(context)}">${icon(data.resolved.includes(id)?'check':'note')} ${esc(e.title)} · ${data.resolved.includes(id)?'retravaillé, revoir mon essai':'faire le petit exercice'}</a>`;}).join('');}
  function errorRepairPage(id,context){
    const error=R.errors.find(e=>e.id===id),info=knownIssueContext(context)&&issueContextInfo(context);if(!error||!info)return notFound();const key=context+'|'+id,data=state.pathways.issues[context]||{selected:[],resolved:[]};
    return `${header(error.title,'Un petit exercice, puis la réécriture d’un passage de ta propre production.','REPRENDRE UNE DIFFICULTÉ',button('Retour à ma production',info.url,false,'back'))}<section class="panel"><h2>Ma cible</h2><p>${esc(error.goal)}</p><p class="small">Production concernée : ${esc(info.title)}. Atelier pédagogique ajouté ; aucune nouvelle règle de droit à mémoriser ici.</p><h3>Le petit exercice</h3><p class="path-question">${esc(error.prompt)}</p></section><section class="panel spaced"><h2><label for="path-repair">Mon essai et ma réécriture</label></h2><p>Résous d’abord le petit exercice, puis reprends un passage de ta production avec le même critère.</p><textarea id="path-repair" data-path-repair="${esc(key)}" rows="8" maxlength="20000" placeholder="Mon analyse, puis la phrase que je réécris…">${esc(state.pathways.repairs[key]||'')}</textarea><p id="path-save-status" class="small" role="status">Texte conservé sur cet appareil et dans l’export de progression.</p></section><details class="path-solution spaced"><summary>Comparer avec l’explication et les critères</summary><div class="path-answer">${error.answer.map(p=>`<p>${esc(p)}</p>`).join('')}<ul>${error.checks.map(p=>`<li>${esc(p)}</li>`).join('')}</ul><button class="btn ${data.resolved.includes(id)?'':'primary'}" data-action="path-resolve" data-id="${esc(key)}" aria-pressed="${data.resolved.includes(id)}">${data.resolved.includes(id)?'Difficulté retravaillée · la rouvrir':'J’ai retravaillé ce point'}</button></div></details><details class="panel spaced"><summary>Retrouver ma production de départ</summary><div class="path-own-text">${esc(info.text)||'Aucun texte saisi dans cette production.'}</div></details>`;
  }
  function pathwayDifficulties(subject='all'){
    const items=[];for(const [context,data] of Object.entries(state.pathways.issues)){const info=issueContextInfo(context);if(info&&(subject==='all'||info.subject===subject))for(const id of data.selected)if(!data.resolved.includes(id)){const error=R.errors.find(e=>e.id===id);items.push({title:error.title+' · '+info.title,url:'#reparer/'+id+'/'+encodeURIComponent(context)});}}
    for(const p of R.chapters)if(subject==='all'||subject===p.subject)for(const t of p.tasks){const key=p.chapter+'/'+t.id,r=state.pathways.reviews[key],started=['base','variante'].some(f=>state.pathways.drafts[key+'/'+f]?.trim());if(started&&(!r?.valid||r.grade==='again'))items.push({title:t.title+' · '+chapterById[p.chapter].title,url:'#parcours/'+p.chapter+'/'+(r?.form==='variante'?'revoir':'essayer')+'/'+t.id});}
    return items;
  }
  function pathwayDifficultySection(subject){const items=pathwayDifficulties(subject);return items.length?`<section class="spaced"><h2>Mes questions ouvertes et erreurs ciblées</h2><div class="path-grid">${items.map(x=>`<article class="panel"><h3>${esc(x.title)}</h3>${button('Reprendre ce point',x.url,true,'note')}</article>`).join('')}</div></section>`:'';}
  function invalidateIssueContext(context){const issue=state.pathways.issues[context];if(issue)issue.resolved=[];}
  function pathSignature(text,form){let hash=2166136261;for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);return form+':'+text.length+':'+(hash>>>0);}
  function handlePathInput(target){
    const key=target.dataset?.pathKey,repair=target.dataset?.pathRepair;
    if(key&&pathFormKeys.has(key)){state.pathways.drafts[key]=String(target.value).slice(0,20000);const taskKey=key.split('/').slice(0,2).join('/'),r=state.pathways.reviews[taskKey];if(r){r.valid=false;r.form=key.split('/')[2];}invalidateIssueContext('question:'+taskKey);const ok=persist(),status=document.getElementById('path-save-status');if(status)status.textContent=ok?'Réponse enregistrée. Compare cette nouvelle version.':'Enregistrement indisponible : copie ton texte ou exporte ta progression.';const badge=document.getElementById('path-rating');if(badge){badge.className='path-rating';badge.textContent='Réponse modifiée : à comparer';}return true;}
    if(repair){const split=repair.lastIndexOf('|');if(!knownIssueContext(repair.slice(0,split))||!R.errors.some(e=>e.id===repair.slice(split+1)))return true;state.pathways.repairs[repair]=String(target.value).slice(0,20000);const issue=state.pathways.issues[repair.slice(0,split)];if(issue)issue.resolved=issue.resolved.filter(id=>id!==repair.slice(split+1));const ok=persist();const status=document.getElementById('path-save-status');if(status)status.textContent=ok?'Réécriture enregistrée sur cet appareil.':'Enregistrement indisponible : copie ton texte.';const button=main.querySelector('[data-action="path-resolve"]');if(button){button.textContent='J’ai retravaillé ce point';button.setAttribute('aria-pressed','false');}return true;}
    return false;
  }
  function handlePathAction(action,id,target){
    if(action==='path-rate'){
      if(!pathFormKeys.has(id)||!['again','known'].includes(target.dataset.grade))return true;const parts=id.split('/'),taskKey=parts.slice(0,2).join('/'),form=parts[2],text=state.pathways.drafts[id]||'',signature=pathSignature(text,form),prior=state.pathways.reviews[taskKey];
      if(prior?.valid&&prior.signature===signature&&Date.now()<prior.due){showToast('Cette version est déjà comparée. Reviens au prochain rappel ou essaie sa variante.');return true;}
      if(text.trim()&&!state.pathways.first[id])state.pathways.first[id]=text;
      state.pathways.reviews[taskKey]={...recallReview(prior,target.dataset.grade),valid:true,form,signature};persist();const status=document.getElementById('path-rating');if(status){status.className='path-rating '+target.dataset.grade;status.textContent=pathTaskStatus(taskKey);}showToast('Autoévaluation enregistrée et prochain rappel programmé.');return true;
    }
    if(action==='path-resolve'){
      const split=id.lastIndexOf('|'),context=id.slice(0,split),error=id.slice(split+1);if(!knownIssueContext(context)||!R.errors.some(e=>e.id===error))return true;
      if(!state.pathways.repairs[id]?.trim()){showToast('Rédige d’abord un essai ou une réécriture pour garder une trace de ce travail.');return true;}
      const issue=state.pathways.issues[context]||{selected:[error],resolved:[]};if(!issue.selected.includes(error))issue.selected.push(error);issue.resolved=issue.resolved.includes(error)?issue.resolved.filter(x=>x!==error):[...issue.resolved,error];state.pathways.issues[context]=issue;persist();const resolved=issue.resolved.includes(error);target.textContent=resolved?'Difficulté retravaillée · la rouvrir':'J’ai retravaillé ce point';target.setAttribute('aria-pressed',String(resolved));showToast(resolved?'Réécriture et comparaison enregistrées.':'Difficulté rouverte.');return true;
    }
    return false;
  }
  function handlePathChange(event){
    const context=event.target.dataset?.pathIssue,id=event.target.dataset?.error;if(!context)return false;if(!knownIssueContext(context)||!R.errors.some(e=>e.id===id))return true;
    const issue=state.pathways.issues[context]||{selected:[],resolved:[]};issue.selected=event.target.checked?[...new Set([...issue.selected,id])]:issue.selected.filter(x=>x!==id);issue.resolved=issue.resolved.filter(x=>issue.selected.includes(x));state.pathways.issues[context]=issue;persist();const links=document.getElementById('error-audit-links');if(links)links.innerHTML=errorAuditLinks(context);return true;
  }
  function mergePathways(imported,examMap={},changedContexts=new Set()){
    const remap=context=>context.startsWith('copie:')&&examMap[context.slice(6)]?'copie:'+examMap[context.slice(6)]:context;
    const conflicts=new Set();for(const field of ['drafts','first','repairs'])for(const [originalKey,text] of Object.entries(imported[field])){const split=originalKey.lastIndexOf('|'),key=field==='repairs'?remap(originalKey.slice(0,split))+originalKey.slice(split):originalKey;const previous=state.pathways[field][key]||'';if(previous&&previous!==text){state.pathways[field][key]=previous+'\n\n—— Texte de la sauvegarde importée ——\n'+text;if(field==='drafts')conflicts.add(key.split('/').slice(0,2).join('/'));}else state.pathways[field][key]=text;}
    for(const [key,r] of Object.entries(imported.reviews))if(!state.pathways.reviews[key]||r.reviewedAt>state.pathways.reviews[key].reviewedAt)state.pathways.reviews[key]=r;
    for(const key of conflicts)if(state.pathways.reviews[key])state.pathways.reviews[key].valid=false;
    for(const [key,r] of Object.entries(state.pathways.reviews))if(key.startsWith('controle/')&&r.signature&&r.signature!==pathSignature(state.control.answers[key.slice(9)]||'','base'))r.valid=false;
    for(const [originalContext,issue] of Object.entries(imported.issues)){const context=remap(originalContext),previous=state.pathways.issues[context],conflict=changedContexts.has(context)||context.startsWith('question:')&&conflicts.has(context.slice(9));state.pathways.issues[context]={selected:[...new Set([...(previous?.selected||[]),...issue.selected])],resolved:conflict?[]:previous?previous.resolved.filter(id=>issue.resolved.includes(id)):issue.resolved};}
  }

  function emptyControl(){return {answers:{},ratings:{}};}
  function cleanControl(input){
    const clean=emptyControl();
    for(const [key,text] of Object.entries(input?.answers||{}))if(controlKeys.has(key)&&typeof text==='string'&&text.length<=500000)clean.answers[key]=text;
    for(const [key,rating] of Object.entries(input?.ratings||{}))if(controlKeys.has(key)&&['again','known'].includes(rating))clean.ratings[key]=rating;
    return clean;
  }
  function controlLinks(sources=[]){return `<div class="guide-sources">${sources.map(s=>s.url.startsWith('#')?`<a class="source-link" href="${esc(s.url)}">${icon('book')}${esc(s.label||s.title)}</a>`:sourceLink({url:s.url,label:s.label||s.title})).join('')}</div>`;}
  function controlStrip(){return `<nav class="control-method" aria-label="La méthode du contrôle"><a href="#examens/controle/methode"><strong>1</strong> Faits utiles</a><a href="#examens/controle/methode"><strong>2</strong> Question</a><a href="#examens/controle/methode"><strong>3</strong> Compétence matérielle</a><a href="#examens/controle/methode"><strong>4</strong> Compétence territoriale</a></nav>`;}
  function controlHeader(title,subtitle){return header(title,subtitle,'CONTRÔLE PRIVÉ · MARDI 20 OCTOBRE',button('Mon dossier de contrôle','#examens/controle',false,'back'));}
  function controlHub(){
    const sections=[['articles','Retenir les articles','Retrouver la référence, dire la règle et l’appliquer. Commence par les cinq repères prioritaires.','book'],['td3','Répondre aux questions du TD3','Instance, ressort, appel, pourvoi : expliquer avec tes mots, puis travailler les vraies questions du TD.','cards'],['entrainement','Rédiger une copie','D’abord une copie guidée avec un espace par syllogisme, puis 20 minutes sans aide.','note']];
    const known=Object.values(state.control.ratings).filter(r=>r==='known').length,again=Object.values(state.control.ratings).filter(r=>r==='again').length;
    return `${header('Mon contrôle de compétence.','Un parcours centré sur tes TD et sur la façon de rédiger ta réponse.','DROIT PRIVÉ · SÉANCE 7',button('Ma méthode en une page','#examens/controle/methode',false,'note'))}<section class="panel control-brief"><div><span class="eyebrow">MARDI 20 OCTOBRE 2026</span><h2>20 minutes. Un raisonnement à construire.</h2><p><strong>Cas pratique de compétence + question de cours sur les TD.</strong> Pendant le TD de 18 h 30 à 20 h ; le début exact du contrôle n’est pas précisé.</p><p class="small">Modalités d’après tes indications. Le TD3 et les voies de recours sont à revoir ; la question exacte du contrôle n’est pas confirmée.</p></div><div class="control-duration"><strong>20</strong><span>minutes</span></div></section>${controlStrip()}<div class="control-path">${sections.map(([id,title,text,symbol],i)=>`<a class="panel control-path-card" href="#examens/controle/${id}"><span class="control-number">${i+1}</span><h2>${title}</h2><p>${text}</p><span class="text-link">Commencer ${icon(symbol)}</span></a>`).join('')}</div><section class="panel spaced"><span class="eyebrow">AVANT DE RÉDIGER</span><h2>Quel juge, puis quel lieu ?</h2><p>Huit cas courts pour t’entraîner à choisir l’ordre, la matière et la règle territoriale. Les exemples sont ajoutés pour l’entraînement.</p>${button('Choisir la bonne juridiction','#examens/controle/decider',true,'scheme')}</section><section class="control-bottom spaced"><div class="panel"><h2>Mon suivi personnel</h2><p><strong class="control-good">${known}</strong> repères de révision positifs · <strong class="control-bad">${again}</strong> à revoir.</p><p class="small">Tu t’évalues après comparaison. Tes textes sont enregistrés sur cet appareil et inclus dans ta sauvegarde ; aucune note n’est déduite de tes réponses rédigées.</p>${button('Retrouver mes points à revoir','#difficultes/prive',false,'note')}</div><div class="panel"><h2>Mes supports de départ</h2><div class="page-actions">${button('TD2 et corrections','#td/seance/prive-02',false,'folder')}${button('TD3 et décisions','#td/seance/prive-03',false,'folder')}${button('Le récapitulatif des articles','#examens/recapitulatif',false,'book')}</div><p class="small">Les supports fournis, les notes d’étudiants et les explications ajoutées restent identifiés. Le partiel blanc du 14 novembre est préparé à part.</p></div></section>`;
  }
  function controlMethodPage(){return `${controlHeader('Ma méthode, dans l’ordre.','Pour chaque difficulté : règle de droit → faits qualifiés → conclusion. Ce guide est une proposition de méthode ajoutée.')}${controlStrip()}<article class="reader"><div class="reader-body td-prose">${C.method.map((s,i)=>`<section class="control-method-section"><span class="eyebrow">ÉTAPE ${i+1}</span><h2>${esc(s.title)}</h2>${s.text.map(p=>`<p>${esc(p)}</p>`).join('')}${s.example?`<div class="control-model"><strong>Dans ma copie</strong><p>${esc(s.example)}</p></div>`:''}</section>`).join('')}<section><h2>Répartir les 20 minutes</h2><p>Suggestion à adapter au sujet : 3 min pour la question de cours, 2 min pour les faits et la question, 5 min pour la compétence matérielle, 7 min pour la compétence territoriale, 3 min de relecture. Ce n’est ni un barème ni une consigne du professeur.</p><p>À la relecture : ai-je cité le texte utile, vérifié ses conditions avec les faits et nommé le type de juge ainsi que le lieu ? Ai-je répondu à la compétence sans résoudre le fond du litige ?</p></section>${controlLinks(C.sources)}</div></article><div class="page-actions spaced">${button('M’entraîner à rédiger','#examens/controle/entrainement',true,'note')}${button('Retrouver les articles','#examens/controle/articles',false,'book')}</div>`;}
  function controlPool(kind,group){return (kind==='articles'?C.articles:C.td3).filter(x=>x.group===group);}
  function controlRecallPage(kind,group,id){
    const groups=kind==='articles'?C.articleGroups:C.tdGroups;
    if(!group)group=groups[0].id;
    const g=groups.find(x=>x.id===group);if(!g)return notFound();
    const pool=controlPool(kind,group),item=id?pool.find(x=>x.id===id):pool[0];if(!item)return notFound();
    const index=pool.indexOf(item),key=(kind==='articles'?'article:':'td3:')+item.id,rating=state.control.ratings[key],draft=state.control.answers[key]||'';
    const base='#examens/controle/'+kind;
    return `${controlHeader(kind==='articles'?'Retrouver les articles.':'Expliquer le TD3.','Lis la question, réponds à voix haute ou par écrit, puis ouvre la réponse pour comparer.')}${controlStrip()}<nav class="control-group-nav" aria-label="Choisir une série">${groups.map(x=>`<a class="pill ${x.id===group?'selected':''}" ${x.id===group?'aria-current="page"':''} href="${base}/${x.id}">${esc(x.title)}</a>`).join('')}</nav><p class="method-scope">${esc(g.description)}</p><section class="panel control-recall"><div class="section-heading"><span class="eyebrow">QUESTION ${index+1} / ${pool.length} · ${esc(g.title)}</span><span class="control-rating ${rating||''}">${rating==='known'?'Je sais l’expliquer':rating==='again'?'À revoir':'Pas encore évaluée'}</span></div><label class="control-select" for="control-question">Aller à une question<select id="control-question">${pool.map((x,i)=>`<option value="${base}/${group}/${x.id}" ${x.id===item.id?'selected':''}>${i+1}. ${esc(x.title)}</option>`).join('')}</select></label><h2>${esc(item.title)}</h2><p class="control-prompt">${esc(item.question)}</p>${item.context?`<p class="small">${esc(item.context)}</p>`:''}<label class="control-answer-label" for="control-response">Ma réponse sans regarder <span class="muted">(facultatif, tu peux répondre à voix haute)</span></label><textarea id="control-response" data-control-key="${key}" rows="5" maxlength="20000" placeholder="Je retrouve la règle et je l’explique avec mes mots…">${esc(draft)}</textarea><p class="small" id="control-save-status" role="status">${draft?'Réponse enregistrée sur cet appareil.':'Ton texte sera enregistré sur cet appareil.'}</p><details class="practice-solution control-solution"><summary>Voir la réponse et comparer</summary><div class="control-answer">${(Array.isArray(item.answer)?item.answer:[item.answer]).map(p=>`<p>${esc(p)}</p>`).join('')}${item.trap?`<p><strong>À éviter :</strong> ${esc(item.trap)}</p>`:''}${item.checks?.length?`<h3>Je vérifie ma réponse</h3><ul>${item.checks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}${item.sourceNote?`<p class="small">${esc(item.sourceNote)}</p>`:''}${controlLinks(item.sources)}<p class="small">Après comparaison, choisis ton repère personnel. Il ne s’agit pas d’une correction automatique de ton texte.</p><div class="review-actions"><button class="btn again" data-action="control-rate" data-id="${key}" data-rating="again">${icon('cross')} À revoir</button><button class="btn known" data-action="control-rate" data-id="${key}" data-rating="known">${icon('check')} Je sais l’expliquer</button></div></div></details><div class="control-paging">${index?button('Question précédente',base+'/'+group+'/'+pool[index-1].id,false,'back'):'<span></span>'}${index+1<pool.length?button('Question suivante',base+'/'+group+'/'+pool[index+1].id,true):button('Retour à mon dossier','#examens/controle',true)}</div></section>${kind==='td3'?notice('Les questions du support de TD sont signalées avec leur exercice ou leur arrêt. Les réponses et modèles ajoutés ne sont pas un corrigé officiel. Le sujet exact du contrôle n’est pas connu.'):notice('Les cinq premiers repères sont prioritaires pour le parcours. Les attributions spéciales et le pénal sont à reconnaître selon les faits ; tu n’as pas à réciter tous les textes dans chaque cas.')}<div class="page-actions spaced">${button(kind==='articles'?'Appliquer dans une copie':'Revoir le support TD3',kind==='articles'?'#examens/controle/entrainement':'#td/seance/prive-03',false,'note')}</div>`;
  }
  function controlTrainingPage(){return `${controlHeader('Du raisonnement à la copie.','Apprends les étapes avec une copie guidée, puis recommence en temps limité.')}${controlStrip()}<div class="control-bottom">${C.copies.map(copy=>`<section class="panel"><span class="eyebrow">${esc(copy.label)}</span><h2>${esc(copy.title)}</h2><p>${esc(copy.description)}</p><div class="page-actions">${button('Rédiger avec la méthode','#examens/controle/copie/'+copy.id,true,'note')}${copy.exam?button('20 min sans aide','#examen/'+copy.exam,false,'clock'):''}</div></section>`).join('')}</div><section class="panel spaced"><h2>Reconnaître les attributions spéciales</h2><p>Commerce, travail, famille, protection, proximité et pénal : choisis la branche utile, puis le texte territorial qui lui correspond.</p><div class="page-actions">${button('Faire les huit cas courts','#examens/controle/decider',false,'scheme')}${button('Lire l’arbre des compétences','#examens/controle/tribunaux',false,'book')}</div></section>`;}
  function controlCopyPage(id){
    const copy=C.copies.find(x=>x.id===id);if(!copy)return notFound();
    const ex=methodExercises[copy.exercise];
    return `${controlHeader(copy.title,'Entraînement guidé sans chronomètre. Chaque partie de ta réponse est enregistrée séparément.')}${controlStrip()}<section class="panel"><span class="eyebrow">${esc(copy.label)}</span><h2>Le sujet</h2><p class="control-prompt">${esc(copy.prompt||ex.prompt)}</p><p><strong>Question de cours d’entraînement :</strong> ${esc(copy.courseQuestion)}</p><p class="small">${esc(copy.sourceNote)}</p></section><div class="control-copy-layout spaced"><aside class="panel control-copy-guide"><h2>Un bloc par difficulté</h2><p><strong>Règle</strong> : le texte utile et ses conditions.</p><p><strong>Faits</strong> : « En l’espèce… », avec les éléments qui remplissent ces conditions.</p><p><strong>Conclusion</strong> : « Donc… », avec le juge ou le lieu justifié.</p><p>Un principe territorial puis une option éventuelle demandent deux démonstrations. Le lieu de signature n’est pas à lui seul une option de CPC 46.</p>${button('Ma méthode complète','#examens/controle/methode',false,'book')}</aside><section class="panel control-copy-fields"><h2>Ma copie guidée</h2>${C.copySteps.map((step,i)=>{const key='copy:'+copy.id+'/'+step.id;return `<div class="control-copy-step"><label for="control-copy-${step.id}"><span class="eyebrow">${i+1} · ${esc(step.label)}</span></label><p>${esc(step.hint)}</p><textarea id="control-copy-${step.id}" data-control-key="${key}" maxlength="20000" rows="${step.id==='faits'||step.id==='question'?3:5}" placeholder="${esc(step.placeholder)}">${esc(state.control.answers[key]||'')}</textarea></div>`;}).join('')}<p id="control-save-status" role="status" class="small">Tes réponses sont conservées sur cet appareil et dans l’export de ta progression.</p></section></div><details class="practice-solution control-solution spaced"><summary>J’ai essayé : comparer avec la proposition de correction</summary><div class="control-answer">${ex.correction.map(s=>`<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join('')}<h3>Question de cours</h3>${copy.courseAnswer.map(p=>`<p>${esc(p)}</p>`).join('')}<h3>Ma relecture</h3><ul>${ex.checks.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="small">Explications et modèle ajoutés. Compare tes arguments et tes conditions, pas seulement les mots employés.</p>${controlLinks(copy.sources)}<div class="review-actions"><button class="btn again" data-action="control-rate" data-id="copy:${copy.id}/bilan" data-rating="again">${icon('cross')} Je dois retravailler cette copie</button><button class="btn known" data-action="control-rate" data-id="copy:${copy.id}/bilan" data-rating="known">${icon('check')} J’ai comparé et expliqué mes choix</button></div></div></details><div class="page-actions spaced">${copy.exam?button('Refaire en 20 minutes sans aide','#examen/'+copy.exam,true,'clock'):button('Passer à une simulation de 20 minutes','#examen/controle-competence-a',true,'clock')}${button('Choisir une autre copie','#examens/controle/entrainement',false,'note')}</div>${errorAudit('controle:'+copy.id,'prive')}`;
  }
  function controlCourtsPage(){return `${controlHeader('Choisir le tribunal.','Vérifie la nature de la demande avant le lieu. Les détails spéciaux se travaillent seulement quand le sujet les rend utiles.')}${controlStrip()}<article class="reader"><div class="reader-body td-prose">${C.branches.map(b=>`<section class="control-method-section"><span class="eyebrow">${esc(b.priority)}</span><h2>${esc(b.branch)}</h2><p><strong>Les conditions :</strong> ${esc(b.conditions)}</p><p><strong>Le juge :</strong> ${esc(b.court)}</p><p><strong>Le territoire :</strong> ${esc(b.territory)}</p><p><strong>Le piège :</strong> ${esc(b.pitfall)}</p>${controlLinks(b.sources)}</section>`).join('')}</div></article>${button('Essayer les huit cas courts','#examens/controle/decider',true,'check')}`;}
  function controlDrillPage(id){
    const item=id?C.drills.find(x=>x.id===id):C.drills[0];if(!item)return notFound();
    const index=C.drills.indexOf(item),choice=controlChoices[item.id],answered=Number.isInteger(choice),correct=choice===item.correct;
    return `${controlHeader('Quel juge, puis quel lieu ?','Un cas court à la fois. Choisis, lis l’explication puis reformule le raisonnement sans les propositions.')}${controlStrip()}<section class="panel control-recall"><span class="eyebrow">CAS FICTIF AJOUTÉ · ${index+1} / ${C.drills.length}</span><h2>${esc(item.title)}</h2><p class="control-prompt">${esc(item.prompt)}</p><div class="quiz-options">${item.options.map((option,i)=>`<button class="quiz-option ${answered?(i===item.correct?'correct':i===choice?'incorrect':''):''}" data-action="control-choice" data-id="${item.id}" data-index="${i}" ${answered?'disabled':''}><span class="option-letter">${String.fromCharCode(65+i)}</span><span>${esc(option)}${answered&&(i===item.correct||i===choice)?`<small class="quiz-option-result">${i===item.correct?'Bonne réponse':'Réponse incorrecte'}</small>`:''}</span></button>`).join('')}</div>${answered?`<div class="quiz-feedback ${correct?'correct':'incorrect'}" role="status"><h3>${correct?'Bonne réponse':'Réponse incorrecte'}</h3><p>${esc(item.answer)}</p><p>${esc(item.why)}</p>${controlLinks(item.sources)}</div>`:''}<div class="control-paging">${button('Arbre des compétences','#examens/controle/tribunaux',false,'scheme')}${answered?index+1<C.drills.length?button('Cas suivant','#examens/controle/decider/'+C.drills[index+1].id,true):button('Rédiger une copie','#examens/controle/entrainement',true):''}</div>${answered?`<button class="btn" data-action="control-retry" data-id="${item.id}">Réessayer ce cas sans la réponse ${icon('refresh')}</button>`:''}</section>`;
  }
  function controlPage(route){
    if(!route[2])return controlHub();
    if(route[2]==='methode')return controlMethodPage();
    if(['articles','td3'].includes(route[2]))return controlRecallPage(route[2],route[3],route[4]);
    if(route[2]==='entrainement')return controlTrainingPage();
    if(route[2]==='copie')return controlCopyPage(route[3]);
    if(route[2]==='tribunaux')return controlCourtsPage();
    if(route[2]==='decider')return controlDrillPage(route[3]);
    return notFound();
  }
  function controlToReview(subject='all'){
    if(!['all','prive'].includes(subject))return [];
    const items=[...C.articles.map(x=>({key:'article:'+x.id,title:x.title,url:'#examens/controle/articles/'+x.group+'/'+x.id})),...C.td3.map(x=>({key:'td3:'+x.id,title:x.title,url:'#examens/controle/td3/'+x.group+'/'+x.id})),...C.copies.map(x=>({key:'copy:'+x.id+'/bilan',title:x.title,url:'#examens/controle/copie/'+x.id})),...C.drills.map(x=>({key:'drill:'+x.id,title:x.title,url:'#examens/controle/decider/'+x.id}))];
    return items.filter(x=>state.control.ratings[x.key]==='again');
  }
  function controlDifficultySection(subject){const items=controlToReview(subject);return items.length?`<section class="spaced"><h2>Mon contrôle privé : les points à revoir</h2><div class="study-weak-list">${items.map(x=>`<article class="panel"><span class="eyebrow">COMPÉTENCE · CONTRÔLE DU 20 OCTOBRE</span><h3>${esc(x.title)}</h3>${button('Reprendre ce point',x.url,true,'note')}</article>`).join('')}</div></section>`:'';}
  function handleControlInput(target){
    const key=target.dataset?.controlKey;if(!controlKeys.has(key))return false;
    state.control.answers[key]=String(target.value).slice(0,20000);delete state.control.ratings[key];
    const recall=state.pathways.reviews['controle/'+key];if(recall)recall.valid=false;
    if(key.startsWith('copy:'))invalidateIssueContext('controle:'+key.split('/')[0].slice(5));
    if(key.startsWith('copy:'))delete state.control.ratings[key.split('/')[0]+'/bilan'];
    const success=persist(),status=document.getElementById('control-save-status');if(status)status.textContent=success?'Réponse enregistrée sur cet appareil.':'Enregistrement indisponible : copie tes réponses ou exporte ta progression.';
    const badge=main.querySelector('.control-rating');if(badge){badge.className='control-rating';badge.textContent='À comparer après modification';}return true;
  }
  function handleControlAction(action,id,target){
    if(action==='control-rate'){
      if(!controlKeys.has(id)||!['again','known'].includes(target.dataset.rating))return true;
      state.control.ratings[id]=target.dataset.rating;
      if(id.startsWith('article:')||id.startsWith('td3:')){const key='controle/'+id;state.pathways.reviews[key]={...recallReview(state.pathways.reviews[key],target.dataset.rating),valid:true,form:'base',signature:pathSignature(state.control.answers[id]||'','base')};}
      persist();const badge=main.querySelector('.control-rating');if(badge){badge.className='control-rating '+target.dataset.rating;const r=state.pathways.reviews['controle/'+id];badge.textContent=(target.dataset.rating==='again'?'À revoir':'Je sais l’expliquer')+(r?' · rappel le '+new Date(r.due).toLocaleString('fr-FR',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'');}showToast(target.dataset.rating==='again'?'Ajouté aux points à revoir ; rappel proposé dans environ 10 minutes.':'Repère enregistré ; prochain rappel dans Mes rappels.');return true;
    }
    if(action==='control-choice'){
      const item=C.drills.find(x=>x.id===id),index=Number(target.dataset.index);if(!item||!Number.isInteger(index)||index<0||index>=item.options.length||Number.isInteger(controlChoices[id]))return true;
      controlChoices[id]=index;state.control.ratings['drill:'+id]=index===item.correct?'known':'again';persist();render(false);return true;
    }
    if(action==='control-retry'){delete controlChoices[id];render(false);return true;}
    return false;
  }
  function mergeControl(imported){
    const conflicts=new Set();
    for(const [key,text] of Object.entries(imported.answers)){const prior=state.control.answers[key]||'';if(prior&&prior!==text){state.control.answers[key]=prior+'\n\n—— Réponse de la sauvegarde importée ——\n'+text;delete state.control.ratings[key];if(key.startsWith('copy:')){const bilan=key.split('/')[0]+'/bilan';delete state.control.ratings[bilan];conflicts.add(bilan);}conflicts.add(key);}else state.control.answers[key]=text;}
    for(const [key,rating] of Object.entries(imported.ratings))if(!conflicts.has(key)&&!state.control.ratings[key])state.control.ratings[key]=rating;
  }

  function emptyStudy() { return {budget:30,days:{},exams:{},resolvedMethods:[]}; }
  function cleanStudy(input) {
    const next=emptyStudy();if(!input||typeof input!=='object')return next;
    if([15,30,45].includes(input.budget))next.budget=input.budget;
    for(const [key,d] of Object.entries(input.days||{})){
      if(!/^\d{4}-\d{2}-\d{2}:(15|30|45)$/.test(key)||!d||!methodExercises[d.exercise]||!subjects[d.subject]||typeof d.signature!=='string'||d.signature.length>200)continue;
      next.days[key]={exercise:d.exercise,subject:d.subject,signature:d.signature,completed:[...new Set((Array.isArray(d.completed)?d.completed:[]).filter(x=>['reading','cards','practice'].includes(x)))]};
    }
    for(const [id,a] of Object.entries(input.exams||{})){
      if(!/^[a-z0-9-]{1,100}$/.test(id)||!a||!methodExercises[a.exercise]||!['running','finished'].includes(a.phase)||!Number.isFinite(a.startedAt)||a.startedAt<=0||a.startedAt>1e14||!Number.isFinite(a.durationMs)||a.durationMs<60000||a.durationMs>86400000)continue;
      const text=value=>typeof value==='string'?value.slice(0,500000):'';
      const deadline=a.startedAt+a.durationMs;
      next.exams[id]={id,exercise:a.exercise,phase:a.phase,startedAt:a.startedAt,durationMs:a.durationMs,deadline,draft:text(a.draft),checks:[...new Set((Array.isArray(a.checks)?a.checks:[]).filter(i=>Number.isInteger(i)&&i>=0&&i<methodExercises[a.exercise].checks.length))],reviewed:a.reviewed===true,rework:text(a.rework),resolved:a.resolved===true};
      if(a.phase==='finished'){next.exams[id].finishedAt=Number.isFinite(a.finishedAt)?Math.max(a.startedAt,Math.min(deadline,a.finishedAt)):deadline;next.exams[id].reason=a.reason==='manual'?'manual':'timeout';}
    }
    next.resolvedMethods=[...new Set((Array.isArray(input.resolvedMethods)?input.resolvedMethods:[]).filter(id=>methodExercises[id]))];
    return next;
  }
  function parisDay(now=Date.now()) {
    const parts=new Intl.DateTimeFormat('fr-FR',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now));
    const part=type=>parts.find(p=>p.type===type).value;return part('year')+'-'+part('month')+'-'+part('day');
  }
  function upcomingAssessments(day=parisDay()) { return E.assessments.filter(a=>a.date>=day).sort((a,b)=>a.date.localeCompare(b.date)); }
  function dailyPlan(day=parisDay(),budget=state.study.budget) {
    if(![15,30,45].includes(budget))budget=30;
    const key=day+':'+budget,saved=state.study.days[key],upcoming=upcomingAssessments(day),assessment=upcoming[0];
    const subject=saved?.subject||assessment?.subject||chapterById[state.lastChapter]?.subject||D.subjects.slice().sort((a,b)=>done(a.id)/D.chapters.filter(c=>c.subject===a.id).length-done(b.id)/D.chapters.filter(c=>c.subject===b.id).length)[0].id;
    const readingMinutes=budget===15?3:5,cardsMinutes=budget===15?4:5,practiceMinutes=budget-readingMinutes-cardsMinutes;
    const pack=assessment?.pack==='controle'?E.packs.find(p=>p.id==='controle'):null;
    let candidates=M.exercises.filter(e=>e.subject===subject&&(!pack||pack.exercises.includes(e.id)));
    const fits=candidates.filter(e=>e.minutes<=practiceMinutes);if(fits.length)candidates=fits;
    else candidates=candidates.slice().sort((a,b)=>a.minutes-b.minutes).slice(0,1);
    const dayNumber=Math.floor(Date.parse(day+'T12:00:00Z')/86400000);
    const ranked=candidates.map((ex,i)=>({ex,score:methodProgress(ex).todo?0:methodProgress(ex).reviewed?2:1,rotation:(i+dayNumber)%candidates.length})).sort((a,b)=>a.score-b.score||a.rotation-b.rotation);
    const exercise=methodExercises[saved?.exercise]||ranked[0]?.ex;
    const minutes=Math.min(practiceMinutes,exercise.minutes),partial=exercise.minutes>practiceMinutes;
    const chapter=D.chapters.find(c=>c.subject===subject&&state.chapters[c.id]!=='done')||D.chapters.find(c=>c.subject===subject);
    const reading=subject==='prive'&&assessment?.pack==='controle'?{title:'Expliquer les articles de compétence',text:'Choisis quelques références prioritaires. Dis ce que chacune permet de décider et une condition à vérifier.',url:'#examens/controle/articles'}:{title:'Rappeler une notion sans relire',text:'Ferme la fiche, explique une notion en quelques phrases, puis compare avec le passage et ses annotations.',url:'#parcours/'+chapter.id+'/essayer'};
    const signature=[budget,subject,exercise.id].join('|');
    return {day,key,budget,subject,assessment,upcoming,exercise,signature,completed:saved?.signature===signature?saved.completed:[],steps:[{id:'reading',minutes:readingMinutes,...reading},{id:'cards',minutes:cardsMinutes,title:'Faire un rappel avec les cartes',text:budget===15?'Cinq cartes au maximum. Réponds avant de les retourner.':'Dix cartes au maximum. Commence par celles qui te résistent.',cards:budget===15?5:10},{id:'practice',minutes,title:partial?'Préparer le début d’une réponse':'Faire un essai sans aide',text:partial?`Pendant ${minutes} minutes, formule la question, tes idées et un début de réponse pour « ${exercise.title} ». L’atelier complet propose ${exercise.minutes} minutes ; cette étape ne le remplace pas.`:exercise.title,url:partial?'#methodologie/entrainement/'+exercise.id:'#examen/'+exercise.id,partial}]};
  }
  function examResume() {
    const items=Object.values(state.study.exams).filter(a=>a.phase==='running');
    if(!items.length)return '';
    return `<section class="panel exam-resume spaced"><span class="eyebrow">MES COPIES EN COURS</span><h2>Reprendre un essai commencé.</h2><p>Le compte à rebours continue quand tu changes de page. Retrouve ici ta copie sans en créer une autre.</p><div class="page-actions">${items.map(a=>button(methodExercises[a.exercise].title,'#examen/'+a.exercise+'/'+a.id,false,'clock')).join('')}</div></section>`;
  }
  function dailyOverview() {
    const p=dailyPlan();
    return `<section class="panel today-overview"><div><span class="eyebrow">MON PROGRAMME DU JOUR</span><h2>Que réviser aujourd’hui ?</h2><p>${p.assessment?`Priorité : ${esc(p.assessment.title)}, le ${dateLabel(p.assessment.date)}.`:'Un parcours court pour continuer ton semestre.'} Choisis 15, 30 ou 45 minutes : rappeler, mémoriser, puis t’entraîner.</p></div><div class="page-actions">${p.assessment?.id==='controle-prive'?button('Mon contrôle privé','#examens/controle',true,'note'):''}${button('Ouvrir mon programme','#aujourdhui',p.assessment?.id!=='controle-prive','clock')}${button('Mes difficultés','#difficultes',false,'note')}</div></section>`;
  }
  function dailyPage() {
    const p=dailyPlan();
    if(!state.study.days[p.key]){state.study.days[p.key]={exercise:p.exercise.id,subject:p.subject,signature:p.signature,completed:[]};persist();}
    return `${header('Mon programme du jour.','Trois étapes courtes à répartir comme tu veux. Les durées sont des propositions de travail.','RÉVISER · '+dateLabel(p.day).toUpperCase(),button('Mes difficultés','#difficultes',false,'note'))}${recallOverview()}<section class="panel today-priority"><div><span class="eyebrow">${esc(subjectName(p.subject))}</span><h2>${p.assessment?esc(p.assessment.title):'Avancer dans mon semestre'}</h2><p>${p.assessment?'Échéance renseignée : '+dateLabel(p.assessment.date)+'. '+esc(p.assessment.scope):'Aucune nouvelle échéance future n’est renseignée dans le site. Tu peux choisir une autre matière depuis Mes matières.'}</p>${p.upcoming[1]?`<p class="small">À préparer ensuite : ${esc(p.upcoming[1].title)}, le ${dateLabel(p.upcoming[1].date)}.</p>`:''}</div><label class="study-budget" for="study-budget">Temps disponible<select id="study-budget">${[15,30,45].map(n=>`<option value="${n}" ${p.budget===n?'selected':''}>${n} minutes</option>`).join('')}</select></label></section><p class="method-scope">Ce programme s’appuie sur les échéances renseignées et ton suivi local. L’exercice choisi reste le même pour cette journée et cette durée. Les cases sont un repère personnel de réalisation, pas une validation de maîtrise.</p><div class="today-steps">${p.steps.map((s,i)=>`<article class="panel today-step"><span class="eyebrow">ÉTAPE ${i+1} · ${s.minutes} MIN ENVIRON</span><h2>${esc(s.title)}</h2><p>${esc(s.text)}</p><div class="page-actions">${s.cards?`<button class="btn primary" data-action="study-launch-cards" data-id="${p.subject}" data-kind="${p.assessment?.pack==='controle'?'controle':'all'}" data-limit="${s.cards}">Travailler ${s.cards} cartes au maximum ${icon('cards')}</button>`:button(s.id==='practice'?(s.partial?'Préparer mon début de réponse':'Ouvrir le mode examen'):'Commencer',s.url,true,s.id==='practice'?'note':'book')}</div><label class="daily-check"><input type="checkbox" data-daily-step="${s.id}" data-signature="${p.signature}" ${p.completed.includes(s.id)?'checked':''}>J’ai fait cette étape</label></article>`).join('')}</div><p id="daily-count" class="study-count" role="status">${p.completed.length} / 3 étapes cochées aujourd’hui</p><div class="page-actions">${button('Mon contrôle privé','#examens/controle',true,'note')}${button('Revoir mes articles','#examens/controle/articles',false,'book')}${button('Mes évaluations','#examens',false,'clock')}${button('Mes autres matières','#subjects',false,'book')}</div>`;
  }
  function difficultyItems(subject='all') {
    const matches=s=>subject==='all'||s===subject;
    const quizzes=D.quizzes.filter(q=>matches(q.subject)&&state.quizzes[q.id]&&(state.quizzes[q.id].lastCorrect===false||state.quizzes[q.id].lastCorrect===undefined&&!state.quizzes[q.id].correct));
    const cards=D.cards.filter(c=>matches(c.subject)&&state.reviews[c.id]?.grade==='again');
    const methods=M.exercises.filter(e=>matches(e.subject)&&methodProgress(e).todo);
    const exams=Object.values(state.study.exams).filter(a=>matches(methodExercises[a.exercise].subject)&&a.phase==='finished'&&(!a.reviewed||!a.resolved&&(a.rework.trim()||a.checks.length<methodExercises[a.exercise].checks.length)));
    return {quizzes,cards,methods,exams};
  }
  function difficultiesPage(subject='all') {
    if(!subjects[subject])subject='all';const items=difficultyItems(subject);
    const total=Object.values(items).reduce((n,a)=>n+a.length,0)+teachingToReview(subject).length+controlToReview(subject).length+pathwayDifficulties(subject).length;
    return `${header('Mes difficultés, au même endroit.','Reprendre une erreur, retrouver la règle puis essayer à nouveau.','MON SUIVI · RÉVISIONS',button('Mon programme du jour','#aujourdhui',true,'clock')+button('Sauvegarder','#settings',false,'download'))}${filters('difficultes',subject)}<p class="method-scope">Les quiz utilisent ton dernier résultat lorsqu’il est disponible ; une ancienne sauvegarde peut seulement indiquer une réussite déjà obtenue. Les cartes « À revoir » restent ici jusqu’à ton prochain bilan. Les essais et critères viennent de ton autoévaluation. Ces repères ne constituent pas une note universitaire.</p><div class="study-metrics"><div><strong>${items.quizzes.length}</strong><span>questions à refaire</span></div><div><strong>${items.cards.length}</strong><span>cartes à revoir</span></div><div><strong>${items.methods.length}</strong><span>ateliers à reprendre</span></div><div><strong>${items.exams.length}</strong><span>copies à comparer ou retravailler</span></div><div><strong>${teachingToReview(subject).length}</strong><span>leçons à comparer</span></div><div><strong>${controlToReview(subject).length}</strong><span>points du contrôle à revoir</span></div><div><strong>${pathwayDifficulties(subject).length}</strong><span>questions ou erreurs ciblées</span></div></div>${!total?empty('Aucune difficulté enregistrée ici.','Après un quiz, une session de cartes ou un essai, tu retrouveras les points à travailler. Cela ne signifie pas que tout le programme est acquis.',button('Choisir un entraînement','#methodologie/mes-essais',true)):''}${items.quizzes.length?`<section class="spaced"><h2>Les questions à refaire</h2><div class="study-weak-list">${items.quizzes.map(q=>`<article class="panel"><span class="eyebrow">${esc(subjectName(q.subject))} · QUIZ</span><h3>${esc(q.question)}</h3><p>Reformule d’abord la notion, puis refais la question sans afficher sa correction.</p><div class="page-actions"><button class="btn primary" data-action="study-retry-quiz" data-id="${q.id}">Refaire cette question ${icon('check')}</button>${button('Revoir la fiche','#chapter/'+q.chapter+'/fiche',false,'book')}</div></article>`).join('')}</div></section>`:''}${items.cards.length?`<section class="spaced"><div class="section-heading"><h2>Les cartes qui me résistent</h2><button class="btn" data-action="study-launch-cards" data-id="${subject}" data-kind="weak" data-limit="10">Revoir ce lot ${icon('cards')}</button></div><div class="study-weak-list">${items.cards.map(c=>`<article class="panel"><span class="eyebrow">${esc(subjectName(c.subject))} · CARTE</span><h3>${esc(c.question)}</h3><p>Retrouve l’explication, puis vérifie si tu sais la reformuler.</p><button class="btn" data-action="study-retry-card" data-id="${c.id}">Revoir cette carte ${icon('cards')}</button></article>`).join('')}</div></section>`:''}${items.methods.length?`<section class="spaced"><h2>Mes essais à comparer ou retravailler</h2><div class="study-weak-list">${items.methods.map(ex=>{const p=methodProgress(ex);return `<article class="panel"><span class="eyebrow">${esc(subjectName(ex.subject))} · ATELIER</span><h3>${esc(ex.title)}</h3><p>${p.reviewed?'Après comparaison, reprends un critère manquant ou ton point personnel.':'Tu as commencé cet atelier. Compare ton essai avant de conclure sur tes difficultés.'}</p>${p.reworkActive?`<p class="study-personal">${esc(p.rework)}</p><button class="btn" data-action="study-resolve-method" data-id="${ex.id}">J’ai retravaillé ce point personnel</button>`:''}<div class="page-actions">${button('Reprendre mon essai','#methodologie/entrainement/'+ex.id,true,'note')}${button('Revoir la méthode','#methodologie/'+ex.method,false,'book')}</div></article>`;}).join('')}</div></section>`:''}${items.exams.length?`<section class="spaced"><h2>Mes copies en mode examen</h2><div class="study-weak-list">${items.exams.slice().sort((a,b)=>b.startedAt-a.startedAt).map(a=>`<article class="panel"><span class="eyebrow">COPIE DU ${dateLabel(parisDay(a.startedAt))}</span><h3>${esc(methodExercises[a.exercise].title)}</h3><p>${a.reviewed?'Reprendre les critères manquants et le bilan de cette copie.':'Cette copie est terminée : comparer le raisonnement avec la proposition de correction.'}</p>${button('Retrouver cette copie','#examen/'+a.exercise+'/'+a.id,true,'note')}</article>`).join('')}</div></section>`:''}${teachingDifficultySection(subject)}${controlDifficultySection(subject)}${pathwayDifficultySection(subject)}`;
  }
  function finishExam(id,reason='manual') {
    const a=state.study.exams[id];if(!a||a.phase!=='running')return false;
    a.phase='finished';a.finishedAt=Math.min(a.deadline,Date.now());a.reason=reason==='timeout'?'timeout':'manual';persist();return true;
  }
  function syncExamAttempts() {
    let changed=false;for(const a of Object.values(state.study.exams))if(a.phase==='running'&&Date.now()>=a.deadline){a.phase='finished';a.finishedAt=a.deadline;a.reason='timeout';changed=true;}
    if(changed)persist();return changed;
  }
  function startExam(id) {
    const ex=methodExercises[id];if(!ex)return null;syncExamAttempts();
    const running=Object.values(state.study.exams).find(a=>a.exercise===id&&a.phase==='running');if(running)return running.id;
    if(Object.keys(state.study.exams).length>=100){showToast('Tes 100 copies sont conservées. Exporte ta sauvegarde avant de poursuivre dans un autre navigateur.');return null;}
    const startedAt=Date.now();let ident=id+'-'+startedAt.toString(36);let n=1;while(Object.hasOwn(state.study.exams,ident))ident=id+'-'+startedAt.toString(36)+'-'+n++;
    state.study.exams[ident]={id:ident,exercise:id,phase:'running',startedAt,durationMs:ex.minutes*60000,deadline:startedAt+ex.minutes*60000,draft:'',checks:[],reviewed:false,rework:'',resolved:false};persist();return ident;
  }
  function examSubject(ex) {return `<article class="reader"><div class="reader-body method-prose"><h2>Le sujet</h2>${ex.rules.length?`<h3>Règles fournies dans ce sujet</h3>${ex.rules.map(t=>`<p>${esc(t)}</p>`).join('')}`:''}<p>${esc(ex.prompt)}</p>${ex.id==='controle-competence-a'?`<h3>Question de cours ajoutée pour cet entraînement</h3><p>${esc(C.copies.find(x=>x.id===ex.id).courseQuestion)}</p>`:''}</div></article>`;}
  function examPage(exercise,id) {
    const ex=methodExercises[exercise];if(!ex)return notFound();
    const a=id&&Object.hasOwn(state.study.exams,id)?state.study.exams[id]:null;if(id&&(!a||a.exercise!==exercise))return notFound();
    const head=header(ex.title,'Un sujet, une copie personnelle et une comparaison après la fin.','MODE EXAMEN · '+(ex.subject==='all'?'SOCLE COMMUN':subjectName(ex.subject).toUpperCase()),button('Mes évaluations','#examens',false,'back'));
    if(!a){
      const previous=Object.values(state.study.exams).filter(x=>x.exercise===exercise).sort((a,b)=>b.startedAt-a.startedAt);
      return `${head}<section class="panel exam-start"><span class="eyebrow">${ex.minutes} MINUTES PROPOSÉES</span><h2>Essayer sans les aides.</h2><p>Le sujet apparaît au démarrage. Les indices, le canevas, le corrigé et la grille sont absents pendant l’essai. Le compte à rebours continue si tu changes de page ou recharges le site. À la fin du temps, la copie est figée et reste consultable.</p><p>Chaque copie est conservée séparément de tes brouillons habituels. Il s’agit d’un entraînement proposé, sans note automatique ni format officiel garanti. Tes éventuelles consignes d’épreuve restent prioritaires.</p><button class="btn primary" data-action="study-start-exam" data-id="${exercise}">${previous.some(a=>a.phase==='running')?'Reprendre la copie en cours':'Commencer une nouvelle copie'} ${icon('clock')}</button><p class="small spaced">Enregistrement sur cet appareil. Exporte régulièrement ta sauvegarde depuis Mon espace personnel.</p></section>${previous.length?`<section class="spaced"><h2>Mes copies conservées pour ce sujet</h2><div class="study-weak-list">${previous.map(x=>`<article class="panel"><h3>${dateLabel(parisDay(x.startedAt))} · ${new Date(x.startedAt).toLocaleTimeString('fr-FR',{timeZone:'Europe/Paris',hour:'2-digit',minute:'2-digit'})}</h3><p>${x.phase==='running'?'Compte à rebours en cours':'Copie terminée'} · ${x.draft.length} caractères</p>${button(x.phase==='running'?'Reprendre':'Voir cette copie','#examen/'+exercise+'/'+x.id,false,'note')}</article>`).join('')}</div></section>`:''}`;
    }
    if(a.phase==='running')return `${head}<section class="exam-live panel"><div><span class="eyebrow">TEMPS RESTANT</span><strong id="exam-clock" role="timer" aria-live="off">${methodClockText(Math.max(0,a.deadline-Date.now()))}</strong><p>Le compte à rebours continue si tu quittes cette page.</p></div><button class="btn" data-action="study-finish-exam" data-id="${a.id}">Terminer ma copie et comparer ${icon('check')}</button></section>${examSubject(ex)}<section class="method-draft"><h2><label for="exam-draft">Ma copie</label></h2><textarea id="exam-draft" data-attempt="${a.id}" class="note-editor exam-editor" maxlength="50000" aria-describedby="exam-save-status" placeholder="Rédige ta réponse sans ouvrir les supports…">${esc(a.draft)}</textarea><p id="exam-save-status" role="status" class="small">${storageAvailable?'Copie enregistrée sur cet appareil.':'Enregistrement indisponible : copie ton texte et exporte ta sauvegarde.'}</p></section>`;
    const elapsed=Math.max(0,a.finishedAt-a.startedAt);
    return `${head}<section class="panel exam-finish"><span class="eyebrow">COPIE CONSERVÉE</span><h2>${a.reason==='timeout'?'Le temps proposé est écoulé.':'Tu as terminé cette copie.'}</h2><p>${methodClockText(elapsed)} utilisées sur ${ex.minutes} minutes proposées. La copie ci-dessous est figée ; ton bilan reste modifiable. Aucune note n’est calculée automatiquement.</p><div class="page-actions">${button('Autre essai sur ce sujet','#examen/'+exercise,false,'refresh')}${button('Mes difficultés','#difficultes',false,'note')}${button('Exporter ma sauvegarde','#settings',false,'download')}</div></section>${examSubject(ex)}<section class="panel exam-copy spaced"><h2>Ma réponse conservée</h2><div class="exam-copy-text">${esc(a.draft)||'<span class="muted">Aucun texte n’a été saisi dans cette copie.</span>'}</div></section><details class="method-correction spaced"><summary>Comparer avec la proposition de correction</summary><div class="reader-body method-prose"><p class="source-note">Support pédagogique ajouté, sans barème officiel. Compare la démarche et justifie les différences avec ta réponse.</p>${ex.correction.map(s=>`<h3>${esc(s.title)}</h3><p>${esc(s.text)}</p>`).join('')}${ex.id==='controle-competence-a'?`<h3>Question de cours ajoutée</h3>${C.copies.find(x=>x.id===ex.id).courseAnswer.map(p=>`<p>${esc(p)}</p>`).join('')}`:''}<div class="guide-sources">${ex.links.map(methodLink).join('')}</div></div></details><section class="panel exam-checklist spaced"><h2>Mon bilan après comparaison</h2><p>Coche uniquement les critères réellement présents dans cette copie.</p><div class="method-checks">${ex.checks.map((t,i)=>`<label><input type="checkbox" data-exam-check="${a.id}" data-index="${i}" ${a.checks.includes(i)?'checked':''}><span>${esc(t)}</span></label>`).join('')}</div><p id="exam-check-count" role="status" class="small">${a.checks.length} / ${ex.checks.length} critères cochés</p><button class="btn ${a.reviewed?'':'primary'}" data-action="study-review-exam" data-id="${a.id}" aria-pressed="${a.reviewed}">${a.reviewed?'Copie comparée':'J’ai comparé cette copie'}</button><h3 class="spaced"><label for="exam-rework">Un point à retravailler</label></h3><textarea id="exam-rework" data-attempt="${a.id}" rows="4" maxlength="50000" placeholder="Ma difficulté et ce que je vais refaire…">${esc(a.rework)}</textarea><p id="exam-rework-status" role="status" class="small muted">Bilan conservé avec cette copie.</p><button class="btn" data-action="study-resolve-exam" data-id="${a.id}" aria-pressed="${a.resolved}">${a.resolved?'Point retravaillé · le rouvrir':'J’ai retravaillé le bilan de cette copie'}</button></section>${errorAudit('copie:'+a.id,ex.subject)}`;
  }
  function setupExamClock(route) {
    if(examClockInterval){clearInterval(examClockInterval);examClockInterval=null;}
    if(route[0]!=='examen')return;const a=state.study.exams[route[2]];if(a?.phase!=='running')return;
    examClockInterval=setInterval(()=>{if(Date.now()>=a.deadline){finishExam(a.id,'timeout');render(false);document.getElementById('main')?.focus({preventScroll:true});}else{const output=document.getElementById('exam-clock');if(output)output.textContent=methodClockText(Math.max(0,a.deadline-Date.now()));}},1000);
  }
  function handleStudyAction(action,id,target) {
    if(!action.startsWith('study-'))return false;
    if(action==='study-start-exam'){const attempt=startExam(id);if(attempt)location.hash='#examen/'+id+'/'+attempt;}
    if(action==='study-finish-exam'){const a=state.study.exams[id];if(a?.phase==='running'){finishExam(id,Date.now()>=a.deadline?'timeout':'manual');render(false);}}
    if(action==='study-review-exam'){const a=state.study.exams[id];if(a?.phase==='finished'){a.reviewed=!a.reviewed;persist();target.setAttribute('aria-pressed',String(a.reviewed));target.textContent=a.reviewed?'Copie comparée':'J’ai comparé cette copie';target.classList.toggle('primary',!a.reviewed);}}
    if(action==='study-resolve-exam'){const a=state.study.exams[id];if(a?.phase==='finished'){a.resolved=!a.resolved;persist();target.setAttribute('aria-pressed',String(a.resolved));target.textContent=a.resolved?'Point retravaillé · le rouvrir':'J’ai retravaillé le bilan de cette copie';}}
    if(action==='study-resolve-method'&&methodExercises[id]){state.study.resolvedMethods=state.study.resolvedMethods.includes(id)?state.study.resolvedMethods.filter(x=>x!==id):[...state.study.resolvedMethods,id];persist();render(false);}
    if(action==='study-retry-quiz'){
      const q=D.quizzes.find(q=>q.id===id);if(q){const options=shuffled(q.options.map((label,index)=>({label,index})));quizSession={questions:[{...q,options:options.map(o=>o.label),correct:options.findIndex(o=>o.index===q.correct)}],index:0,score:0,chosen:null,returnRoute:location.hash};location.hash='#quiz/'+q.subject;}
    }
    if(action==='study-retry-card'){
      const c=D.cards.find(c=>c.id===id);if(c){session={cards:[c],index:0,flipped:false,known:0,returnRoute:location.hash};location.hash='#cards/'+c.subject;}
    }
    if(action==='study-launch-cards'){
      let items=D.cards.filter(c=>id==='all'||c.subject===id);
      if(target.dataset.kind==='controle')items=items.filter(c=>c.collection==='td-competence'||['prive-02','prive-03'].includes(c.chapter));
      if(target.dataset.kind==='scheduled')items=items.filter(c=>state.reviews[c.id]&&state.reviews[c.id].due<=Date.now());
      else if(target.dataset.kind==='weak')items=items.filter(c=>state.reviews[c.id]?.grade==='again');
      else {const due=items.filter(c=>state.reviews[c.id]?.grade==='again'||!state.reviews[c.id]||state.reviews[c.id].due<=Date.now());if(due.length)items=due;}
      const count=Math.max(1,Math.min(10,Number(target.dataset.limit)||10)),weak=items.filter(c=>state.reviews[c.id]?.grade==='again'),other=items.filter(c=>state.reviews[c.id]?.grade!=='again');const cards=[...balancedSample(weak,count),...balancedSample(other,Math.max(0,count-weak.length))].slice(0,count);
      if(cards.length){session={cards,index:0,flipped:false,known:0,returnRoute:location.hash};location.hash='#cards/'+id;}else showToast('Aucune carte dans cette sélection.');
    }
    return true;
  }
  function handleStudyInput(event) {
    const target=event.target;if(!['exam-draft','exam-rework'].includes(target.id))return false;
    const a=state.study.exams[target.dataset.attempt];if(!a)return true;
    if(target.id==='exam-draft'){
      if(a.phase!=='running'||Date.now()>=a.deadline){syncExamAttempts();render(false);return true;}
      a.draft=target.value.slice(0,50000);invalidateIssueContext('copie:'+a.id);const saved=persist();document.getElementById('exam-save-status').textContent=saved?'Copie enregistrée sur cet appareil.':'Enregistrement indisponible : copie ton texte et exporte ta sauvegarde.';
    }else if(a.phase==='finished'){a.rework=target.value.slice(0,50000);a.resolved=false;const saved=persist();document.getElementById('exam-rework-status').textContent=saved?'Bilan enregistré avec cette copie.':'Enregistrement indisponible : copie ton bilan.';const button=main.querySelector('[data-action="study-resolve-exam"]');if(button){button.textContent='J’ai retravaillé le bilan de cette copie';button.setAttribute('aria-pressed','false');}}
    return true;
  }
  function handleStudyChange(event) {
    const target=event.target;
    if(target.id==='study-budget'){const value=Number(target.value);if([15,30,45].includes(value)){state.study.budget=value;persist();render(false);}return true;}
    if(target.dataset?.dailyStep){const p=dailyPlan();if(target.dataset.signature===p.signature&&p.steps.some(s=>s.id===target.dataset.dailyStep)){const entry=state.study.days[p.key]||{exercise:p.exercise.id,subject:p.subject,signature:p.signature,completed:[]};entry.completed=target.checked?[...new Set([...entry.completed,target.dataset.dailyStep])]:entry.completed.filter(x=>x!==target.dataset.dailyStep);state.study.days[p.key]=entry;persist();document.getElementById('daily-count').textContent=entry.completed.length+' / 3 étapes cochées aujourd’hui';}return true;}
    if(target.dataset?.examCheck){const a=state.study.exams[target.dataset.examCheck],index=Number(target.dataset.index);if(a?.phase==='finished'&&Number.isInteger(index)&&index>=0&&index<methodExercises[a.exercise].checks.length){a.checks=target.checked?[...new Set([...a.checks,index])]:a.checks.filter(x=>x!==index);a.resolved=false;persist();document.getElementById('exam-check-count').textContent=a.checks.length+' / '+methodExercises[a.exercise].checks.length+' critères cochés';const button=main.querySelector('[data-action="study-resolve-exam"]');if(button){button.textContent='J’ai retravaillé le bilan de cette copie';button.setAttribute('aria-pressed','false');}}return true;}
    return false;
  }

  function render(resetScroll=true) {
    syncExamAttempts();
    const route=getRoute();
    if(route[0]!=='examens'||route[1]!=='controle'||route[2]!=='decider')controlChoices=Object.create(null);
    if(!(route[0]==='methodologie'&&route[1]==='pas-a-pas'&&route[2]===guidedSession?.id))guidedSession=null;
    if(methodTimer?.running&&!(route[0]==='methodologie'&&route[1]==='entrainement'&&route[2]===methodTimer.id))pauseMethodClock();
    const routeKey=location.hash||'#home',highlights=!resetScroll&&renderedRoute===routeKey?snapshotHighlights():[];
    const labels={actualites:'Actualité juridique',parcours:'Apprendre un chapitre',revisions:'Mes rappels',reparer:'Reprendre une difficulté',apprendre:'Leçons expliquées',aujourdhui:'Mon programme du jour',difficultes:'Mes difficultés',examen:'Mode examen',td:'Mes TD',examens:'Préparer mes examens',methodologie:'Méthodologie',home:'Tableau de bord',subjects:'Mes matières',subject:subjectName(route[1]),chapter:subjectName(chapterById[route[1]]?.subject),document:'Bibliothèque',sources:'Bibliothèque',cards:'Flashcards',quiz:'Quiz corrigés',timeline:'Frises',schemes:'Schémas',references:'Approfondir',favorites:'Favoris',settings:'Mon espace',corrections:'Corrections & précisions',search:'Recherche'};
    sidebar(route);topbar(labels[route[0]]||'Mon espace',route[0]==='search'?route[1]||'':'');
    let html;
    switch(route[0]){
      case 'home':html=home();break;
      case 'actualites':html=newsPage(route);break;
      case 'aujourdhui':html=dailyPage();break;
      case 'difficultes':html=difficultiesPage(route[1]);break;
      case 'examen':html=examPage(route[1],route[2]);break;
      case 'td':html=tdPage(route);break;
      case 'examens':html=examensPage(route);break;
      case 'methodologie':html=methodologyPage(route);break;
      case 'apprendre':html=teachingPage(route);break;
      case 'parcours':html=pathwayPage(route);break;
      case 'revisions':html=recallPage(route[1]);break;
      case 'reparer':html=errorRepairPage(route[1],route[2]);break;
      case 'subjects':html=header('Mes matières du semestre.','Retrouve le plan de chaque matière et avance chapitre par chapitre.','MES MATIÈRES')+`<div class="cards-grid" data-count="${D.subjects.length}">${D.subjects.map(subjectCard).join('')}</div>`;break;
      case 'subject':html=subjectPage(route[1]);break;
      case 'chapter':html=chapterPage(route[1],route[2]);break;
      case 'document':html=documentPage(route[1],route[2]);break;
      case 'sources':html=sourcesPage(route[1]);break;
      case 'cards':html=session?sessionPage():route[1]==='collection'&&route[2]==='competence'?cardStart('prive',null,'td-competence'):route[1]==='chapter'?cardStart(chapterById[route[2]]?.subject,route[2]):cardStart(subjects[route[1]]?route[1]:'all');break;
      case 'quiz':html=quizSession?quizPage():route[1]==='chapter'?quizLanding(chapterById[route[2]]?.subject,route[2]):quizLanding(subjects[route[1]]?route[1]:'all');break;
      case 'timeline':html=timelinePage(route[1]);break;
      case 'schemes':html=schemesPage(route[1]);break;
      case 'references':html=referencesPage(route[1],['additions','articles','decisions','bibliography'].includes(route[2])?route[2]:'authors',route[3]);break;
      case 'corrections':html=correctionsPage(route[1]);break;
      case 'favorites':html=favoritesPage();break;
      case 'settings':html=settingsPage();break;
      case 'search':html=searchPage(route[1]||'',route[2],route[3]);break;
      default:html=notFound();
    }
    main.innerHTML=html;
    setupHighlighter(highlights);renderedRoute=routeKey;setupExamClock(route);
    document.title=`${labels[route[0]]||'Mon espace'} · L’Atelier du droit`;
    if(resetScroll){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
    if(route[0]==='methodologie'&&route[1]==='sources'&&route[2])requestAnimationFrame(()=>document.getElementById('method-source-'+route[2])?.scrollIntoView({block:'center'}));
    if(route[0]==='corrections'&&route[2])requestAnimationFrame(()=>document.getElementById('note-'+route[2])?.scrollIntoView({block:'center'}));
    if(route[0]==='references'&&route[2]==='additions'&&route[3])requestAnimationFrame(()=>document.getElementById('guide-'+route[3])?.scrollIntoView({block:'center'}));
    if(route[0]==='chapter'&&chapterById[route[1]]){let changed=state.lastChapter!==route[1];state.lastChapter=route[1];if(['cours','fiche',undefined].includes(route[2])&&!state.chapters[route[1]]){state.chapters[route[1]]='started';changed=true;}if(changed)persist();}
    if(route[0]==='td'&&route[1]==='document'&&route[3]!==undefined)requestAnimationFrame(()=>document.getElementById('td-p-'+Number(route[3]))?.scrollIntoView({block:'center'}));
    if(route[0]==='document'&&route[2]!==undefined){requestAnimationFrame(()=>document.getElementById(`p-${Number(route[2])}`)?.scrollIntoView({block:'center'}));}
  }
  document.addEventListener('click',event=>{
    const scrollLink=event.target.closest('[data-scroll]');if(scrollLink){event.preventDefault();document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const target=event.target.closest('[data-action]');
    if(!target){if(event.target.closest('a[href^="#"]')&&!event.target.closest('#sidebar'))document.body.classList.remove('menu-open');return;}
    const id=target.dataset.id;
    if(handleNewsAction(target.dataset.action,id,target))return;
    if(handlePathAction(target.dataset.action,id,target))return;
    if(handleControlAction(target.dataset.action,id,target))return;
    if(handleLearningAction(target.dataset.action,id,target))return;
    if(handleStudyAction(target.dataset.action,id,target))return;
    switch(target.dataset.action){
      case 'guided-answer':{
        if(getRoute()[1]!=='pas-a-pas'||getRoute()[2]!==id)return;
        const selected=main.querySelector('input[name="guided-choice"]:checked');
        if(!selected){document.getElementById('guided-selection-status').textContent='Choisis une proposition avant de vérifier ton raisonnement.';break;}
        if(guidedAnswer(id,Number(target.dataset.step),Number(selected.value))){render(false);const feedback=document.getElementById('guided-feedback');feedback?.focus({preventScroll:true});feedback?.scrollIntoView({block:'nearest'});}break;
      }
      case 'guided-next':{
        if(guidedSession?.id===id&&guidedSession.index===Number(target.dataset.step)&&guidedSession.answers[guidedSession.index]!==undefined){guidedSession.index++;render();}break;
      }
      case 'guided-restart':if(guidedLessons[id]&&getRoute()[1]==='pas-a-pas'&&getRoute()[2]===id){guidedSession=null;render();}break;
      case 'highlight-selection':applyHighlight();break;
      case 'clear-highlights':clearHighlights();break;
      case 'menu':document.body.classList.toggle('menu-open');target.setAttribute('aria-expanded',String(document.body.classList.contains('menu-open')));break;
      case 'favorite':if(!chapterById[id])return;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];persist();render(false);showToast(state.favorites.includes(id)?'Chapitre ajouté aux favoris.':'Chapitre retiré des favoris.');break;
      case 'complete':if(!chapterById[id])return;state.chapters[id]=state.chapters[id]==='done'?'started':'done';persist();render(false);showToast(state.chapters[id]==='done'?'Chapitre marqué révisé.':'Chapitre marqué en cours.');break;
      case 'print':window.print();break;
      case 'method-timer':{
        if(!methodExercises[id])return;
        if(methodTimer?.id!==id){pauseMethodClock();methodTimer={id,elapsed:0,running:false,started:0};}
        if(methodTimer.running)pauseMethodClock();else{methodTimer.started=Date.now();methodTimer.running=true;methodClockInterval=setInterval(updateMethodClock,1000);}
        updateMethodTimerControls(id);break;
      }
      case 'method-timer-reset':if(methodExercises[id]){pauseMethodClock();methodTimer={id,elapsed:0,running:false,started:0};updateMethodTimerControls(id);}break;
      case 'method-template':{
        const exercise=methodExercises[id];if(!exercise||state.methodology.drafts[id]?.trim())return;
        state.methodology.drafts[id]=exercise.starter||'Question posée\n\nIdées et références utiles\n\nMa réponse\n\nPoint à reprendre après comparaison';const saved=persist();
        const editor=document.getElementById('method-draft');editor.value=state.methodology.drafts[id];target.disabled=true;editor.focus();
        document.getElementById('method-draft-status').textContent=saved?'Canevas enregistré sur cet appareil.':'Enregistrement indisponible : copie ton texte ou exporte ta progression.';break;
      }
      case 'method-reviewed':{
        if(!methodExercises[id])return;const reviewed=!state.methodology.reviewed.includes(id);
        state.methodology.reviewed=reviewed?[...state.methodology.reviewed,id]:state.methodology.reviewed.filter(x=>x!==id);persist();
        target.setAttribute('aria-pressed',String(reviewed));target.classList.toggle('primary',!reviewed);target.innerHTML=icon('check')+(reviewed?'Comparaison effectuée':'J’ai comparé mon essai');break;
      }
      case 'start-quiz':{
        const targetId=target.dataset.target,chapter=targetId.startsWith('chapter:')?targetId.slice(8):null;
        const items=(D.quizzes||[]).filter(q=>chapter?q.chapter===chapter:(targetId==='all'||q.subject===targetId));
        if(!items.length)return;
        const questions=balancedSample(items,10).map(q=>{const options=shuffled(q.options.map((label,index)=>({label,index})));return {...q,options:options.map(o=>o.label),correct:options.findIndex(o=>o.index===q.correct)};});
        quizSession={questions,index:0,score:0,chosen:null,returnRoute:location.hash};
        const route=chapter?`#quiz/chapter/${chapter}`:`#quiz/${targetId}`;
        if(location.hash===route)render();else location.hash=route;
        break;
      }
      case 'quiz-answer':{
        if(!quizSession||quizSession.chosen!==null||quizSession.index>=quizSession.questions.length)return;
        const q=quizSession.questions[quizSession.index],chosen=Number(target.dataset.option);
        if(!Number.isInteger(chosen)||chosen<0||chosen>=q.options.length)return;
        quizSession.chosen=chosen;const correct=chosen===q.correct;
        if(correct)quizSession.score++;
        state.quizzes[q.id]={correct:!!(correct||state.quizzes[q.id]?.correct),attempts:(state.quizzes[q.id]?.attempts||0)+1,lastCorrect:correct,wrongAttempts:(state.quizzes[q.id]?.wrongAttempts||0)+(correct?0:1)};
        persist();render(false);break;
      }
      case 'quiz-next':if(quizSession&&quizSession.chosen!==null){quizSession.index++;quizSession.chosen=null;render(false);}break;
      case 'end-quiz':{const route=quizSession?.returnRoute||'#quiz';quizSession=null;if(location.hash===route)render();else location.hash=route;break;}
      case 'start-session':{
        const targetId=target.dataset.target,chapter=targetId.startsWith('chapter:')?targetId.slice(8):null;
        const collection=targetId.startsWith('collection:')?targetId.slice(11):null;
        let cards=D.cards.filter(c=>collection?c.collection===collection:chapter?c.chapter===chapter:(targetId==='all'||c.subject===targetId));
        if(target.dataset.mode==='due')cards=cards.filter(c=>!state.reviews[c.id]||state.reviews[c.id].due<=Date.now());
        cards=balancedSample(cards,10);if(!cards.length)return;
        session={cards,index:0,flipped:false,known:0,returnRoute:location.hash};render();break;
      }
      case 'flip':if(session&&session.index<session.cards.length){session.flipped=!session.flipped;render(false);}break;
      case 'grade':if(session&&session.flipped&&session.index<session.cards.length){const card=session.cards[session.index],grade=target.dataset.grade==='known'?'known':'again';state.reviews[card.id]={...recallReview(state.reviews[card.id],grade),seen:(state.reviews[card.id]?.seen||0)+1};if(grade==='known')session.known++;session.index++;session.flipped=false;persist();render(false);}break;
      case 'end-session':{const route=session?.returnRoute||'#cards';session=null;if(location.hash===route)render();else location.hash=route;break;}
      case 'export':{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`atelier-droit-progression-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Sauvegarde téléchargée.');break;}
      case 'restore':document.getElementById('restore-file').click();break;
    }
  });
  document.addEventListener('submit',event=>{if(event.target.id==='search-form'){event.preventDefault();const query=event.target.elements.q.value.trim().slice(0,180);location.hash=`search/${encodeURIComponent(query)}`;}});
  document.addEventListener('selectionchange',captureHighlightSelection);
  document.addEventListener('pointerdown',event=>{if(event.target.closest('.study-highlighter button'))event.preventDefault();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearHighlights();else {const expired=syncExamAttempts();if(expired&&getRoute()[0]==='examen')render(false);}});
  window.addEventListener('pagehide',clearHighlights);
  window.addEventListener('pageshow',event=>{if(event.persisted)clearHighlights();});
  document.addEventListener('input',event=>{
    if(handleStudyInput(event))return;
    if(event.target.id==='method-draft'){
      const id=event.target.dataset.exercise;if(!methodExercises[id])return;
      state.methodology.drafts[id]=event.target.value.slice(0,500000);invalidateIssueContext('atelier:'+id);const success=persist();
      document.getElementById('method-draft-status').textContent=success?'Brouillon enregistré sur cet appareil.':'Enregistrement indisponible : copie ton texte ou exporte ta progression.';
      const template=main.querySelector('[data-action="method-template"]');if(template)template.disabled=!!event.target.value.trim();
    }
    if(event.target.id==='method-rework'){
      const id=event.target.dataset.exercise;if(!methodExercises[id])return;
      state.methodology.rework[id]=event.target.value.slice(0,500000);state.study.resolvedMethods=state.study.resolvedMethods.filter(x=>x!==id);const success=persist();
      document.getElementById('method-rework-status').textContent=success?'Point à retravailler enregistré sur cet appareil.':'Enregistrement indisponible : copie ton bilan ou exporte ta progression.';
    }
    if(event.target.id==='method-instructions'){
      const id=event.target.dataset.profile;if(!['all',...M.profiles.map(p=>p.id)].includes(id))return;
      state.methodology.instructions[id]=event.target.value.slice(0,500000);const success=persist();
      document.getElementById('method-instructions-status').textContent=success?'Consignes enregistrées sur cet appareil.':'Enregistrement indisponible : copie tes consignes ou exporte ta progression.';
    }
  });
  document.addEventListener('change',event=>{
    if(handlePathChange(event))return;
    if(event.target.id==='control-question'){if(/^#examens\/controle\/(articles|td3)\/[a-z0-9-]+\/[a-z0-9-]+$/.test(event.target.value))location.hash=event.target.value;return;}
    if(handleStudyChange(event))return;
    if(['method-subject-filter','method-time-filter'].includes(event.target.id)){
      const status=event.target.dataset.status,subject=document.getElementById('method-subject-filter').value,time=document.getElementById('method-time-filter').value;
      location.hash=`#methodologie/mes-essais/${status}/${subject}/${time}`;return;
    }
    const id=event.target.dataset?.methodCheck;if(!methodExercises[id])return;
    const index=Number(event.target.dataset.index);if(!Number.isInteger(index)||index<0||index>=methodExercises[id].checks.length)return;
    const values=state.methodology.checks[id]||[];state.methodology.checks[id]=event.target.checked?[...new Set([...values,index])]:values.filter(x=>x!==index);persist();
    document.getElementById('method-check-count').textContent=`${state.methodology.checks[id].length} / ${methodExercises[id].checks.length} critères cochés · autoévaluation`;
  });
  document.addEventListener('input',event=>{if(handlePathInput(event.target))return;if(handleControlInput(event.target))return;if(handleLearningInput(event.target))return;if(event.target.id==='chapter-note'){const id=event.target.dataset.chapter;state.notes[id]=event.target.value;const success=persist();document.getElementById('note-status').textContent=success?'Notes enregistrées sur cet appareil.':'Enregistrement indisponible. Exporte tes notes avant de fermer.';}});
  document.getElementById('restore-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>10_000_000)throw new Error('Ce fichier dépasse la taille maximale de 10 Mo.');
      const imported=cleanState(JSON.parse(await file.text()));
      const importedExamMap=Object.create(null),pathImportConflicts=new Set();
      for(const [id,text] of Object.entries(imported.methodology.drafts))if(state.methodology.drafts[id]&&state.methodology.drafts[id]!==text)pathImportConflicts.add('atelier:'+id);
      for(const [key,text] of Object.entries(imported.control.answers))if(key.startsWith('copy:')&&state.control.answers[key]&&state.control.answers[key]!==text)pathImportConflicts.add('controle:'+key.split('/')[0].slice(5));
      // Merge and preserve existing notes when the import has a different text.
      for(const [id,text] of Object.entries(imported.notes)){const current=state.notes[id]||'';state.notes[id]=current&&current!==text?`${current}\n\n—— Notes de la sauvegarde importée ——\n${text}`:text;}
      for(const [id,status] of Object.entries(imported.chapters))if(state.chapters[id]!=='done')state.chapters[id]=status;
      state.favorites=[...new Set([...state.favorites,...imported.favorites])];
      for(const [id,review] of Object.entries(imported.reviews))if(!state.reviews[id]||review.seen>state.reviews[id].seen)state.reviews[id]=review;
      for(const [id,q] of Object.entries(imported.quizzes)){const prior=state.quizzes[id],result={correct:!!(q.correct||prior?.correct),attempts:Math.max(q.attempts,prior?.attempts||0)};const last=(q.attempts>(prior?.attempts||0)?q:prior)||q;if(typeof last.lastCorrect==='boolean')result.lastCorrect=last.lastCorrect;if(Number.isInteger(q.wrongAttempts)||Number.isInteger(prior?.wrongAttempts))result.wrongAttempts=Math.max(q.wrongAttempts||0,prior?.wrongAttempts||0);state.quizzes[id]=result;}
      for(const field of ['drafts','instructions','rework'])for(const [id,text] of Object.entries(imported.methodology[field])){
        const current=state.methodology[field][id]||'';
        state.methodology[field][id]=current&&current!==text?`${current}\n\n—— Texte de la sauvegarde importée ——\n${text}`:text;
      }
      for(const [id,checks] of Object.entries(imported.methodology.checks))state.methodology.checks[id]=[...new Set([...(state.methodology.checks[id]||[]),...checks])];
      state.methodology.reviewed=[...new Set([...state.methodology.reviewed,...imported.methodology.reviewed])];
      if(!state.lastChapter&&imported.lastChapter)state.lastChapter=imported.lastChapter;
      for(const [key,day] of Object.entries(imported.study.days)){
        const current=state.study.days[key];
        if(!current)state.study.days[key]=day;
        else if(current.signature===day.signature)current.completed=[...new Set([...current.completed,...day.completed])];
      }
      for(const [id,attempt] of Object.entries(imported.study.exams)){
        if(!Object.hasOwn(state.study.exams,id)){state.study.exams[id]=attempt;importedExamMap[id]=id;}
        else if(JSON.stringify(state.study.exams[id])!==JSON.stringify(attempt)){
          let key=id.slice(0,75)+'-import-'+Date.now().toString(36),n=1;
          while(Object.hasOwn(state.study.exams,key))key=id.slice(0,70)+'-import-'+Date.now().toString(36)+'-'+n++;
          state.study.exams[key]={...attempt,id:key};importedExamMap[id]=key;
        }
      }
      state.study.resolvedMethods=[...new Set([...state.study.resolvedMethods,...imported.study.resolvedMethods])].filter(id=>!imported.methodology.rework[id]||state.methodology.rework[id]===imported.methodology.rework[id]);
      for(const [key,text] of Object.entries(imported.learning.drafts)){
        const current=state.learning.drafts[key]||'';
        state.learning.drafts[key]=current&&current!==text?current+'\n\n—— Réponse de la sauvegarde importée ——\n'+text:text;
        if(current&&current!==text)state.learning.compared=state.learning.compared.filter(k=>k!==key);
      }
      state.learning.compared=[...new Set([...state.learning.compared,...imported.learning.compared.filter(key=>state.learning.drafts[key]===imported.learning.drafts[key])])];
      mergeControl(imported.control);
      mergePathways(imported.pathways,importedExamMap,pathImportConflicts);
      persist();session=null;quizSession=null;controlChoices=Object.create(null);render(false);showToast('Sauvegarde ajoutée à ta progression.');
    }catch(error){showToast(error.message||'Impossible de lire cette sauvegarde.');}
    event.target.value='';
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('menu-open');document.querySelector('.mobile-menu')?.setAttribute('aria-expanded','false');}});
  window.addEventListener('hashchange',()=>{document.body.classList.remove('menu-open');render();});
  render();
})();
