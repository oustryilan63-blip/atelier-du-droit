(() => {
  'use strict';
  const D = window.STUDY_DATA;
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

  let state = { version: 1, chapters: {}, notes: {}, favorites: [], reviews: {}, quizzes: {}, lastChapter: null };
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
    const next = {version:1,chapters:{},notes:{},favorites:[],reviews:{},quizzes:{},lastChapter:chapterById[input.lastChapter]?input.lastChapter:null};
    for (const [id,status] of Object.entries(input.chapters || {})) if(chapterById[id] && ['started','done'].includes(status)) next.chapters[id]=status;
    for (const [id,text] of Object.entries(input.notes || {})) if(chapterById[id] && typeof text==='string' && text.length<=100000) next.notes[id]=text;
    next.favorites = [...new Set((Array.isArray(input.favorites)?input.favorites:[]).filter(id=>chapterById[id]))];
    for (const [id,r] of Object.entries(input.reviews || {})) if(D.cards.some(c=>c.id===id) && r && Number.isFinite(r.due) && r.due>0 && r.due<1e14) next.reviews[id]={due:r.due,seen:Math.max(1,Math.min(100000,Number(r.seen)||1)),grade:r.grade==='again'?'again':'known'};
    for (const [id,q] of Object.entries(input.quizzes || {})) if((D.quizzes||[]).some(item=>item.id===id) && q) next.quizzes[id]={correct:!!q.correct,attempts:Math.max(1,Math.min(100000,Number(q.attempts)||1))};
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
  const documentLabel = doc => doc?.kind==='cours'?'Cours fourni':doc?.kind==='fiche'?(doc.generated?'Fiche préparée':'Fiche fournie'):doc?.kind==='officiel'?'Plan officiel':'Archive';
  const sourceLabel = source => source?.url?'Source institutionnelle':documentLabel(docs[source?.doc]);
  function sourceLink(source, label = 'Voir le passage source') {
    if(source.url) return `<a class="source-link" href="${esc(source.url)}" target="_blank" rel="noopener">${icon('external')}${esc(source.label||label)}</a>`;
    return `<a class="source-link" href="#document/${esc(source.doc)}/${source.index}">${icon('book')}${esc(label)}</a>`;
  }
  function button(label, href, primary=false, symbol='arrow') {
    return `<a class="btn ${primary?'primary':''}" href="${esc(href)}">${esc(label)}${icon(symbol)}</a>`;
  }
  function header(title, subtitle, eyebrow='L1 DROIT · SEMESTRE 1', actions='') {
    return `<div class="page-head ${actions?'row':''}"><div><span class="eyebrow">${esc(eyebrow)}</span><h1>${esc(title)}</h1>${subtitle?`<p class="lead">${esc(subtitle)}</p>`:''}</div>${actions?`<div class="page-actions">${actions}</div>`:''}</div>`;
  }
  function empty(title,text,action='') { return `<div class="empty-state">${icon('book')}<h2>${esc(title)}</h2><p>${esc(text)}</p>${action}</div>`; }
  function notice(text) {return `<div class="notice">${icon('info')}<p>${esc(text)}</p></div>`;}
  function tabs(items,active) {return `<nav class="section-tabs" aria-label="Sections">${items.map(([id,label,url])=>`<a href="${url}" class="${active===id?'active':''}" ${active===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;}
  function filters(page, selected='all', section='') {return `<nav class="filters" aria-label="Filtrer par matière">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,title])=>`<a class="filter-chip ${selected===id?'active':''}" href="#${page}/${id}${section?'/'+section:''}" ${selected===id?'aria-current="page"':''}>${esc(title)}</a>`).join('')}</nav>`;}
  const subjectName = id => subjects[id]?.title || 'Toutes les matières';
  function sidebar(route) {
    const nav=[['home','Mon tableau de bord','home'],['subjects','Mes matières','book'],['cards','Flashcards','cards'],['quiz','Quiz corrigés','check'],['timeline','Frises chronologiques','timeline'],['schemes','Schémas','scheme'],['references','Approfondir','feather'],['corrections','Corrections & précisions','info'],['favorites','Mes favoris','star']];
    const active = route[0]||'home';
    document.getElementById('sidebar').innerHTML = `<a class="brand" href="#home" aria-label="L’Atelier du droit, accueil"><span class="brand-mark">${icon('balance','lg')}</span><span><strong>L’Atelier<br>du droit</strong><small>Apprendre & comprendre</small></span></a><div class="semester"><span>L1 Droit</span><small>Semestre 1</small></div><nav><div class="nav-label">Mon espace</div>${nav.map(([id,label,symbol])=>`<a class="nav-link ${active===id?'active':''}" href="#${id}" ${active===id?'aria-current="page"':''}>${icon(symbol)}${label}</a>`).join('')}<div class="nav-label">Mes matières</div>${D.subjects.map(s=>`<a class="nav-link ${s.color} ${active==='subject'&&route[1]===s.id?'active':''}" href="#subject/${s.id}"><span class="subject-dot"></span>${s.title}</a>`).join('')}<div class="nav-label">Ma bibliothèque</div><a class="nav-link ${active==='sources'||active==='document'?'active':''}" href="#sources">${icon('folder')}Cours & documents</a><a class="nav-link ${active==='settings'?'active':''}" href="#settings">${icon('settings')}Mon espace personnel</a></nav><div class="sidebar-end">${icon('lock')}<span>Un chapitre à la fois.<br>À ton rythme.</span></div>`;
  }
  function topbar(title, query='') {
    document.getElementById('topbar').innerHTML=`<button class="mobile-menu" data-action="menu" aria-label="Ouvrir ou fermer la navigation" aria-expanded="${document.body.classList.contains('menu-open')}">${icon('menu')}</button><div class="crumb"><span>L1 Droit</span>${icon('chevron')}<strong>${esc(title)}</strong></div><div class="top-right"><form class="search-box" id="search-form" role="search"><label class="screen-reader-only" for="global-search">Rechercher dans les cours et fiches</label><input id="global-search" name="q" value="${esc(query)}" placeholder="Rechercher une notion…" autocomplete="off"><button type="submit" aria-label="Rechercher">${icon('search')}</button></form><span class="avatar" aria-label="Espace personnel">L1</span></div>`;
  }
  function subjectCard(s) {
    const chapters=D.chapters.filter(c=>c.subject===s.id), count=done(s.id), percent=Math.round(count/chapters.length*100);
    return `<a class="subject-card ${s.color}" href="#subject/${s.id}"><div class="subject-card-top"><span class="subject-visual">${icon(s.icon)}</span><span class="pill small">S1</span></div><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><div class="subject-meta">${chapters.length} chapitres <span>·</span> Cours & fiche</div><div class="progress" aria-label="${percent} % des chapitres marqués révisés"><span style="width:${percent}%"></span></div><div class="subject-bottom"><span>${count} / ${chapters.length} révisés</span>${icon('arrow')}</div></a>`;
  }
  function home() {
    const recent=(chapterById[state.lastChapter]&&state.chapters[state.lastChapter]!=='done'?chapterById[state.lastChapter]:null) || D.chapters.find(c=>state.chapters[c.id]==='started') || D.chapters.find(c=>state.chapters[c.id]!=='done') || D.chapters[0];
    return `${header('Mon semestre, à mon rythme.','Un espace pour retrouver tes cours, comprendre les notions et réviser un peu chaque jour.','BIENVENUE DANS TON ATELIER',`<span class="pill date-pill">${icon('book')}${D.subjects.length} matières · S1</span>`)}<section class="hero"><div><span class="eyebrow">Le prochain petit pas</span><h2>${state.chapters[recent.id]==='started'?'Reprendre là où tu en étais.':'Un chapitre aujourd’hui,<br>une notion en plus.'}</h2><p>${esc(subjectName(recent.subject))} · ${esc(recent.title)}<br>Le cours et ta fiche sont réunis au même endroit.</p>${button('Ouvrir mon chapitre',`#chapter/${recent.id}/cours`,true)}</div><div class="hero-art" aria-hidden="true"><span class="floating-label one">Comprendre</span><div class="hero-orbit">${icon('balance')}</div><span class="floating-label two">Puis mémoriser</span></div></section><div class="stats"><div class="stat"><span class="stat-icon">${icon('book')}</span><div><strong>${D.chapters.length}</strong><small>chapitres disponibles</small></div></div><div class="stat"><span class="stat-icon">${icon('cards')}</span><div><strong>${dueCards().length}</strong><small>cartes à découvrir ou revoir</small></div></div><div class="stat"><span class="stat-icon">${icon('check')}</span><div><strong>${done()}<span class="muted" style="font-size:13px"> / ${D.chapters.length}</span></strong><small>chapitres marqués révisés</small></div></div></div><section><div class="section-heading"><h2>Mes matières</h2><a class="text-link" href="#sources">Voir mes documents ${icon('arrow')}</a></div><div class="cards-grid" data-count="${D.subjects.length}">${D.subjects.map(subjectCard).join('')}</div></section><div class="lower-grid"><section class="panel training-panel"><div class="deck-art" aria-hidden="true">${icon('cards')}</div><div><span class="eyebrow">Révision active</span><h2>Faire travailler ma mémoire.</h2><p>Définitions et questions de compréhension, avec leur passage source.</p>${button('Lancer une session','#cards/all',true)}</div></section><section class="panel"><span class="eyebrow">Changer de perspective</span><h2>Relier les idées.</h2><div class="tool-list"><a class="tool-row" href="#quiz"><span>${icon('check')}${D.quizzes.length} questions avec correction</span>${icon('arrow')}</a><a class="tool-row" href="#timeline"><span>${icon('timeline')}${D.timelines.length} repères chronologiques</span>${icon('arrow')}</a><a class="tool-row" href="#schemes"><span>${icon('scheme')}${D.schemes.length} schémas pour comprendre</span>${icon('arrow')}</a><a class="tool-row" href="#corrections"><span>${icon('info')}${readingNotes.length} corrections & précisions</span>${icon('arrow')}</a><a class="tool-row" href="#references"><span>${icon('feather')}Auteurs & approfondissements</span>${icon('arrow')}</a></div></section></div>`;
  }
  function chapterRow(c) {
    const status=state.chapters[c.id], starred=state.favorites.includes(c.id);
    return `<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/cours"><span class="chapter-number">${status==='done'?icon('check'):String(c.number).padStart(2,'0')}</span><span class="chapter-title"><h3>${esc(c.title)} ${starred?`<span class="pinned-star">${icon('star')}</span>`:''}</h3><small>Cours · Fiche · ${c.minutes} min de lecture${c.partial?' · Contenu partiel':''}</small></span><span class="status ${status==='done'?'complete':''}"><span class="status-dot"></span>${status==='done'?'Révisé':status==='started'?'En cours':'À découvrir'}</span>${icon('chevron')}</a>`;
  }
  function subjectPage(id) {
    const s=subjects[id];if(!s)return notFound();
    const chapters=D.chapters.filter(c=>c.subject===id);
    let last='';
    return `${header(s.title,s.description,'MA MATIÈRE · SEMESTRE 1',button('Réviser les cartes',`#cards/${id}`,false,'cards')+button('Fiche complète',`#document/${id}-fiche`,false,'book')+button('Les compléments',`#references/${id}/additions`,false,'feather')+button('Points vérifiés',`#corrections/${id}`,false,'info'))}${tabs([['chapters','Mes chapitres',`#subject/${id}`],['timeline','Frise',`#timeline/${id}`],['references','Approfondir',`#references/${id}`],['sources','Documents',`#sources/${id}`]],'chapters')}${D.notices.filter(n=>n.subject===id).map(n=>notice(n.text)).join('')}<div class="section-heading"><h2>Le plan de ma matière</h2><span class="small muted">${done(id)} / ${chapters.length} révisés</span></div><div class="chapter-list">${chapters.map(c=>{const part=c.part!==last?`<h3 class="part-heading">${esc(c.part)}</h3>`:'';last=c.part;return part+chapterRow(c);}).join('')}</div>${id==='histoire'?`<section class="panel spaced"><h2>Ma fiche complète et l’archive</h2><p>La fiche et les exercices suivent uniquement le cours actuel jusqu’au CM5. L’ancien cours reste accessible à part.</p><div class="page-actions">${button('Lire la fiche complète','#document/histoire-fiche',false,'book')}${button('Consulter l’archive','#document/histoire-archive',false,'folder')}</div></section>`:''}`;
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
    return `<${tag} id="p-${p.index}" class="${cls} ${highlight?'spotlight':''}">${esc(p.text)}</${tag}>`;
  }
  function renderReader(doc,ps,label,highlight=null) {
    const headings=ps.filter(p=>(p.level!==null&&p.level<2)||(!p.style&&p.text.length<150&&/^(CHAPITRE|Chapitre|PARTIE|Partie|Section|INTRODUCTION|Introduction générale|[IVX]+\s*[-:.]|[A-D]\s*[.-])/.test(p.text)));
    const kind=doc.kind==='cours'?'Cours fourni · notes originales':doc.kind==='fiche'?(doc.generated?'Fiche préparée à partir du cours':'Fiche de révision fournie'):doc.kind==='officiel'?'Plan officiel conservé dans le projet':'Archive du projet';
    return `<details class="reading-index"><summary>Sommaire de cette lecture</summary><nav aria-label="Sommaire sur téléphone">${headings.map(p=>`<a href="#p-${p.index}" data-scroll="p-${p.index}">${esc(p.text.slice(0,125))}</a>`).join('')}</nav><button class="btn" data-action="print">${icon('print')}Imprimer la lecture</button></details><div class="reader-layout"><article class="reader"><div class="source-strip"><span>${icon('book')} ${kind}</span><a class="source-link" href="${doc.url}" download="${esc(doc.name)}">${icon('download')}${doc.generated?'Fiche Word':'Document original'}</a></div><div class="reader-body">${ps.map(p=>paragraph(p,p.index===highlight)+passageNotes(doc.id,p.index).map(n=>readingNote(n,true)).join('')).join('')}</div></article><aside class="reading-tools" aria-label="Sommaire de la lecture"><button class="btn" data-action="print">${icon('print')}Imprimer la lecture</button><h3>Dans cette lecture</h3>${headings.map(p=>`<a href="#p-${p.index}" data-scroll="p-${p.index}">${esc(p.text.slice(0,125))}</a>`).join('')}<p>La lecture reprend le texte du document. Pour les tableaux et illustrations dans leur mise en page, ouvre l’original.</p></aside></div>`;
  }
  function chapterPage(id,tab='cours') {
    const c=chapterById[id];if(!c)return notFound();
    if(!['cours','fiche','cartes','quiz','notes','plus','corrections'].includes(tab))tab='cours';
    const star=state.favorites.includes(id),status=state.chapters[id];
    const actions=`<button class="btn ${star?'pinned-star':''}" data-action="favorite" data-id="${id}" aria-pressed="${star}">${icon('star')}${star?'En favoris':'Favori'}</button><button class="btn ${status==='done'?'':'primary'}" data-action="complete" data-id="${id}" aria-pressed="${status==='done'}">${icon('check')}${status==='done'?'Marqué révisé':'Marquer révisé'}</button>`;
    const intro=`<a class="text-link back" href="#subject/${c.subject}">${icon('back')}${esc(subjectName(c.subject))}</a>${header(c.title,c.part,`CHAPITRE ${String(c.number).padStart(2,'0')} · ${subjectName(c.subject).toUpperCase()}`,actions)}${tabs([['cours','Cours',`#chapter/${id}/cours`],['fiche','Fiche',`#chapter/${id}/fiche`],['cartes','Flashcards',`#chapter/${id}/cartes`],['quiz','Quiz',`#chapter/${id}/quiz`],['plus','Approfondir',`#chapter/${id}/plus`],['corrections','Points vérifiés',`#chapter/${id}/corrections`],['notes','Mes notes',`#chapter/${id}/notes`]],tab)}`;
    if(tab==='quiz')return intro+quizLanding(c.subject,id,false);
    if(tab==='corrections'){
      const notes=readingNotes.filter(n=>n.targets.some(t=>[c.course,c.fiche].some(r=>r.doc===t.doc&&t.index>=r.start&&t.index<r.end)));
      return intro+(notes.length?`<p class="lead">Corrections et précisions ajoutées après comparaison des documents et vérification des points signalés. Le texte original reste visible.</p><div class="reference-grid">${notes.map(n=>readingNote(n)).join('')}</div>`:notice('Aucun point particulier n’a été signalé pour ce chapitre lors de la relecture du 14 octobre 2026. Les compléments et les consignes du professeur restent accessibles séparément.'));
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
    const courseNote=tab==='cours'?notice('Notes de cours conservées telles que fournies. Les corrections et nuances présentes dans ta fiche ne sont pas appliquées silencieusement aux notes originales.'):'';
    const partial=c.partial?notice(c.partialNote||'Le document s’arrête au début des immunités diplomatiques. La suite du programme n’est pas encore fournie.'):'';
    const chapters=D.chapters.filter(x=>x.subject===c.subject),position=chapters.indexOf(c);
    const nav=`<div class="reader-nav">${position?button('Chapitre précédent',`#chapter/${chapters[position-1].id}/${tab}`,false,'back'):'<span></span>'}${position<chapters.length-1?button('Chapitre suivant',`#chapter/${chapters[position+1].id}/${tab}`):button('Retour à la matière',`#subject/${c.subject}`)}</div>`;
    const corrections=readingNotes.filter(n=>n.targets.some(t=>t.doc===doc.id&&t.index>=range.start&&t.index<range.end));
    const checked=corrections.length?`<div class="reading-alert"><strong>${corrections.length} point${corrections.length>1?'s':''} corrigé${corrections.length>1?'s':''} ou précisé${corrections.length>1?'s':''} dans cette lecture.</strong><span>Les notes ajoutées apparaissent sous les passages concernés.</span><a class="source-link" href="#chapter/${id}/corrections">Voir les points vérifiés ${icon('arrow')}</a></div>`:'';
    return intro+courseNote+partial+checked+renderReader(doc,ps,tab)+nav;
  }
  function documentPage(id,index) {
    const doc=docs[id];if(!doc)return notFound();
    const p=Number(index),highlight=index!==undefined&&Number.isInteger(p)&&p>=0&&p<doc.paragraphs.length?p:null;
    return `<a class="text-link back" href="#sources/${doc.subject}">${icon('back')}Cours & documents</a>${header(doc.displayTitle||(doc.kind==='cours'?`Cours de ${subjectName(doc.subject).toLowerCase()}`:doc.kind==='fiche'?`Fiche · ${subjectName(doc.subject)}`:doc.kind==='officiel'?'Plan officiel des institutions internationales':'Archive nommée Syllabus'),doc.name,doc.generated?'FICHE PRÉPARÉE · COURS ACTUEL':doc.kind==='archive'?'ARCHIVE · ANNÉE ANTÉRIEURE':'DOCUMENT FOURNI · TEXTE INTÉGRAL')}${doc.note?notice(doc.note):''}${notice('Les tableaux sont présentés ici dans leur ordre de lecture. Les illustrations et la mise en page d’origine sont disponibles dans le document à télécharger.')}${renderReader(doc,doc.paragraphs,'Document',highlight)}`;
  }
  function sourcesPage(selected='all') {
    if(!subjects[selected])selected='all';
    const list=D.documents.filter(d=>(selected==='all'||d.subject===selected)&&['cours','fiche'].includes(d.kind));
    return `${header('Ma bibliothèque de cours.','Les documents que tu as transmis, les ressources du projet et leur provenance.','COURS & DOCUMENTS')}${filters('sources',selected)}<div class="reference-grid">${list.map(d=>`<article class="reference-card ${subjects[d.subject].color}"><span class="eyebrow">${esc(subjectName(d.subject))} · ${documentLabel(d)}</span><h3>${d.kind==='cours'?'Mes notes de cours':'Ma fiche de révision'}</h3><p class="file-name">${esc(d.name)}</p><p>${d.paragraphs.length} paragraphes accessibles en lecture.<br>${d.generated?'Fiche préparée à partir du cours actuel, dans la présentation des autres fiches.':'Document original conservé à l’identique.'}</p><div class="page-actions">${button('Lire',`#document/${d.id}`,true,'book')}<a class="btn" href="${d.url}" download="${esc(d.name)}">${icon('download')}${d.generated?'Fiche Word':'Original'}</a></div></article>`).join('')}</div>${selected==='all'||selected==='histoire'?`<section class="panel spaced"><h2>Histoire du droit : cours actuel et archive</h2><p>Le cours actuel et la fiche s’arrêtent au CM5. L’archive de l’année précédente est séparée et ne sert pas aux exercices de cette année.</p><div class="page-actions">${button('Fiche complète','#document/histoire-fiche',false,'book')}${button('Archive de l’année précédente','#document/histoire-archive',false,'folder')}</div></section>`:''}${selected==='all'||selected==='international'?`<section class="spaced"><h2>Références du cours d’institutions internationales</h2><p class="lead">Plan officiel, leçons UNJF et bibliographie du cours conservés dans le projet. Ces ressources restent distinctes de tes notes.</p>${D.notices.filter(n=>n.subject==='international').map(n=>notice(n.text)).join('')}<div class="resource-row"><div><h3>Plan du cours · L1 groupe 3 · 2026</h3><p>Contenu officiel conservé dans le projet. Moodle reste la référence actuelle.</p></div>${button('Consulter','#document/international-plan',false,'book')}</div><div class="resources-list spaced">${D.resources.map(r=>`<article class="resource-row"><div><h3>${esc(r.name.replace(/^UNJF \d+\. /,''))}</h3><p>${r.kind==='bibliography'?'Bibliographie officielle du cours':'UNJF'} · ${r.pages} pages · Ressource complémentaire du projet</p></div><a class="btn" href="${r.url}" target="_blank" rel="noopener">Ouvrir le PDF ${icon('external')}</a></article>`).join('')}</div><p class="count-caption">Seules les ressources accessibles dans ce projet ont été ajoutées. L’ensemble de ta bibliothèque ChatGPT n’a pas été parcouru.</p></section>`:''}`;
  }
  function cardStart(subject='all',chapter=null) {
    const filtered=D.cards.filter(c=>chapter?c.chapter===chapter:(subject==='all'||c.subject===subject));
    const available=filtered.filter(c=>!state.reviews[c.id]||state.reviews[c.id].due<=Date.now());
    const title=chapter?chapterById[chapter]?.title:subjectName(subject);
    const startId=chapter?`chapter:${chapter}`:subject;
    return `${header('Retrouver, sans relire.','Teste tes définitions et ta compréhension des mécanismes. Retourne chaque carte, puis indique si tu l’as retenue.','FLASHCARDS')}${!chapter?filters('cards',subject):`<a class="text-link back" href="#chapter/${chapter}/cartes">${icon('back')}Retour au chapitre</a>`}<section class="panel"><span class="eyebrow">${esc(title)}</span><h2>${available.length?'Une courte session pour avancer.':'Les cartes de ce lot ont été revues.'}</h2><p>${filtered.length} cartes dans ce lot · ${available.length} nouvelles ou à revoir aujourd’hui.</p><div class="page-actions"><button class="btn primary" data-action="start-session" data-target="${startId}" data-mode="due" ${!available.length?'disabled':''}>${icon('cards')}Commencer ${Math.min(10,available.length)} cartes</button><button class="btn" data-action="start-session" data-target="${startId}" data-mode="all" ${!filtered.length?'disabled':''}>Réviser aussi les cartes déjà vues ${icon('refresh')}</button></div><p class="small spaced">Les définitions sont reprises de tes fiches ; les questions de compréhension sont des supports ajoutés avec leur source. « À revoir » programme un rappel dans 1 jour ; « Bien retenu » dans 3 jours. Le suivi est enregistré sur cet appareil.</p></section>${!chapter&&subject==='all'?`<div class="deck-summary">${D.subjects.map(s=>`<section class="deck-card ${s.color}"><span class="subject-visual">${icon(s.icon)}</span><h3 class="spaced">${esc(s.title)}</h3><p>${D.cards.filter(c=>c.subject===s.id).length} cartes · ${dueCards(s.id).length} à découvrir ou revoir</p>${button('Ouvrir le lot',`#cards/${s.id}`,false,'cards')}</section>`).join('')}</div>`:''}`;
  }
  function sessionPage() {
    if(!session)return cardStart();
    if(session.index>=session.cards.length)return `${header('Une session de plus.','Tu viens de travailler tes notions. Les prochaines dates de révision sont enregistrées.','FLASHCARDS')}<div class="empty-state">${icon('check')}<h2>${session.cards.length} cartes travaillées.</h2><p>${session.known} bien retenues · ${session.cards.length-session.known} à revoir demain.</p><div class="page-actions" style="justify-content:center"><button class="btn" data-action="end-session">Retour aux lots ${icon('back')}</button>${button('Continuer ma lecture','#subjects',true,'book')}</div></div>`;
    const card=session.cards[session.index];
    return `${header('Un instant pour mémoriser.','Réponds à voix haute ou dans ta tête avant de retourner la carte.','FLASHCARDS')}<div class="flash-workspace"><button class="btn ghost" data-action="end-session">${icon('back')}Quitter la session</button><div class="flash-meta"><span>${esc(subjectName(card.subject))}</span><span>Carte ${session.index+1} / ${session.cards.length}</span></div><div class="progress"><span style="width:${session.index/session.cards.length*100}%"></span></div><button class="flashcard spaced ${subjects[card.subject].color}" data-action="flip" aria-label="${session.flipped?'Afficher la question':'Afficher la réponse'}"><span class="eyebrow">${session.flipped?'La réponse · '+esc(sourceLabel(card.source)):esc(card.type)+' · '+(card.added?'Support ajouté':sourceLabel(card.source))}</span>${session.flipped?`<span class="answer">${esc(card.answer)}</span>`:`<span class="question">${esc(card.question)}</span>`}<small>${icon('refresh')}Cliquer pour ${session.flipped?'revoir la question':'retourner la carte'}</small></button>${session.flipped?`<div class="review-actions"><button class="btn again" data-action="grade" data-grade="again">${icon('refresh')}À revoir</button><button class="btn known" data-action="grade" data-grade="known">${icon('check')}Bien retenu</button></div><div class="flash-source">${sourceLink(card.source)}</div>`:`<div class="review-actions"><button class="btn primary" data-action="flip">Afficher la réponse ${icon('arrow')}</button></div>`}</div>`;
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
    return `${intro}<section class="panel"><span class="eyebrow">${esc(chapter?chapterById[chapter].title:subjectName(selected))}</span><h2>${items.length===1?'Une question pour ce chapitre.':'Un petit test de compréhension.'}</h2><p>${items.length} question${items.length>1?'s':''} disponible${items.length>1?'s':''} · ${passed} déjà réussie${passed>1?'s':''} au moins une fois.</p><button class="btn primary" data-action="start-quiz" data-target="${esc(target)}">${icon('check')}Commencer ${Math.min(items.length,10)} question${items.length===1?'':'s'}</button><p class="small spaced">Exercices ajoutés à partir de tes fiches. Ils servent à t’entraîner ; les consignes et le format du partiel restent ceux du professeur.</p></section>${showHeader&&!chapter?`<div class="chapter-list spaced">${quizChapters.map(c=>{const questions=items.filter(q=>q.chapter===c.id),score=questions.filter(q=>state.quizzes[q.id]?.correct).length;return `<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/quiz"><span class="chapter-number">${icon(score===questions.length?'check':'book')}</span><span class="chapter-title"><h3>${esc(c.title)}</h3><small>${esc(subjectName(c.subject))} · ${questions.length} questions corrigées · ${score} réussie${score>1?'s':''}</small></span>${icon('chevron')}</a>`;}).join('')}</div>`:''}`;
  }
  function quizPage() {
    if(!quizSession)return quizLanding();
    if(quizSession.index>=quizSession.questions.length)return `${header('Un point sur ma compréhension.','Relis les corrections des questions qui t’ont posé problème et retourne aux passages de ta fiche.','RÉSULTAT DU QUIZ')}<div class="empty-state">${icon('check')}<h2>${quizSession.score} / ${quizSession.questions.length} bonnes réponses</h2><p>Ce résultat sert à orienter tes révisions. Il ne remplace pas un entraînement à la rédaction.</p><button class="btn primary" data-action="end-quiz">Retour aux quiz ${icon('back')}</button></div>`;
    const q=quizSession.questions[quizSession.index],answered=quizSession.chosen!==null,correct=quizSession.chosen===q.correct;
    return `${header('Comprendre, puis choisir.','Une seule réponse est attendue. La correction s’affiche après ton choix.','QUIZ CORRIGÉS')}<div class="flash-workspace"><button class="btn ghost" data-action="end-quiz">${icon('back')}Quitter le quiz</button><div class="flash-meta"><span>${esc(subjectName(q.subject))}</span><span>Question ${quizSession.index+1} / ${quizSession.questions.length}</span></div><div class="progress"><span style="width:${quizSession.index/quizSession.questions.length*100}%"></span></div><section class="quiz-question spaced"><span class="eyebrow">${esc(chapterById[q.chapter].title)} · Exercice ajouté</span><h2>${esc(q.question)}</h2><div class="quiz-options" role="group" aria-label="Réponses proposées">${q.options.map((option,index)=>`<button class="quiz-option ${answered&&index===q.correct?'correct':answered&&index===quizSession.chosen?'incorrect':''}" data-action="quiz-answer" data-option="${index}" ${answered?'disabled':''}><span>${String.fromCharCode(65+index)}</span>${esc(option)}${answered&&index===q.correct?icon('check'):''}</button>`).join('')}</div>${answered?`<div class="quiz-feedback ${correct?'correct':'incorrect'}" role="status"><strong>${correct?'Bonne réponse.':'Une distinction à revoir.'}</strong><p>${esc(q.explanation)}</p>${sourceLink(q.source)}</div><button class="btn primary spaced" data-action="quiz-next">${quizSession.index+1===quizSession.questions.length?'Voir mon résultat':'Question suivante'}${icon('arrow')}</button>`:''}</section></div>`;
  }

  function readingNote(note,inline=false) {
    const target=note.targets[0];
    const source=sourceLink(note.source,note.source.url?'Source officielle':'Lire la synthèse de la fiche');
    const links=inline?source:`${source}${sourceLink(target,'Lire le passage concerné')}${note.ficheSource&&(note.source.doc!==note.ficheSource.doc||note.source.index!==note.ficheSource.index)?sourceLink(note.ficheSource,'Comparer avec la fiche'):''}`;
    return `<${inline?'aside':'article'} ${inline?'role="note"':`id="note-${note.id}"`} class="${inline?'reading-correction':'reference-card correction-card'} ${subjects[note.subject].color}"><span class="eyebrow">${inline?'Note ajoutée':esc(subjectName(note.subject))+' · Support ajouté'} · ${esc(note.kind)}</span><h3>${esc(note.title)}</h3><p>${esc(note.text)}</p><div class="guide-sources">${links}${note.secondarySource?sourceLink(note.secondarySource,'Autre source officielle'):''}</div><small class="muted">Point vérifié le ${dateLabel(note.checked)} · Le document original est conservé.</small></${inline?'aside':'article'}>`;
  }
  function correctionsPage(selected='all') {
    if(!subjects[selected])selected='all';
    const notes=readingNotes.filter(n=>selected==='all'||n.subject===selected);
    const coverage=(D.audit?.subjects||[]).filter(s=>selected==='all'||s.subject===selected);
    return `${header('Apprendre avec les bonnes distinctions.','Les erreurs de transcription, dates et formulations à nuancer repérées lors de la relecture. Chaque note est reliée au passage concerné et à une source officielle.','CORRECTIONS & PRÉCISIONS')}${filters('corrections',selected)}<section class="panel audit-overview"><h2>Ce qui a été revu</h2><p>Les quatre matières ont été comparées aux documents transmis : texte des cours et fiches, découpage des chapitres, cartes, quiz, schémas, frises et renvois de sources. Les points ci-dessous ont fait l’objet d’une vérification ciblée ; cette relecture ne constitue pas une validation intégrale par le professeur.</p><div class="audit-subjects">${coverage.map(s=>`<div><strong>${esc(subjectName(s.subject))}</strong><span>${esc(s.scope)}</span></div>`).join('')}</div><p class="small">Les originaux restent inchangés. Les corrections ajoutées apparaissent aussi pendant la lecture. Dernière relecture : ${dateLabel(D.updated)}.</p></section><p class="count-caption">${notes.length} correction${notes.length>1?'s':''} ou précision${notes.length>1?'s':''} dans cette sélection</p>${notes.length?`<div class="reference-grid">${notes.map(n=>readingNote(n)).join('')}</div>`:notice('Aucun contresens manifeste repéré dans le cours actuel et la fiche de cette matière. Les limites du cours reçu sont indiquées ci-dessus.')}`;
  }

  function favoritesPage() {
    const favorites=D.chapters.filter(c=>state.favorites.includes(c.id));
    return `${header('Garder mes repères à portée de main.','Les chapitres que tu as ajoutés à tes favoris.','MES FAVORIS')}${favorites.length?`<div class="chapter-list">${favorites.map(chapterRow).join('')}</div>`:empty('Ta sélection commence ici.','Clique sur « Favori » dans un chapitre pour le retrouver dans cet espace.',button('Explorer mes matières','#subjects',true,'book'))}`;
  }

  function searchPage(query,selected='all',kind='all') {
    if(!subjects[selected])selected='all';
    if(!['cours','fiche','officiel','supports'].includes(kind))kind='all';
    const term=normalize(query).trim();
    if(!term)return header('Chercher une notion.','Entre un mot pour retrouver les passages des cours, fiches, corrections et compléments.','RECHERCHE');
    const results=[];
    if(kind!=='supports')for(const d of D.documents.filter(d=>['cours','fiche','officiel'].includes(d.kind)&&(selected==='all'||d.subject===selected)&&(kind==='all'||d.kind===kind))){
      for(const p of d.paragraphs)if(normalize(p.text).includes(term))results.push({subject:d.subject,label:documentLabel(d),text:p.text,url:`#document/${d.id}/${p.index}`,hasCorrection:passageNotes(d.id,p.index).length>0});
    }
    if(kind==='all'||kind==='supports'){
      const added=[
        ...readingNotes.map(n=>({subject:n.subject,label:n.kind+' ajoutée',title:n.title,text:n.text,url:`#corrections/${n.subject}/${n.id}`})),
        ...D.enrichments.filter(n=>n.added).map(n=>({subject:n.subject,label:'Mini-fiche ajoutée',title:n.title,text:[n.text,...n.points,n.practice.question,n.practice.answer,n.pitfall].join('\n'),url:`#references/${n.subject}/additions/${n.id}`})),
        ...(D.articles||[]).map(n=>({subject:n.subject,label:'Lecture d’article ajoutée',title:n.reference+' · '+n.title,text:n.summary+'\n'+n.pitfall,url:`#chapter/${n.chapter}/plus`}))
      ];
      for(const item of added)if((selected==='all'||item.subject===selected)&&normalize(item.title+' '+item.text).includes(term))results.push(item);
    }
    // Put verified corrections first so a matching source typo is not learned alone.
    results.sort((a,b)=>Number(b.label.endsWith(' ajoutée'))-Number(a.label.endsWith(' ajoutée')));
    function excerpt(text){const index=normalize(text).indexOf(term);if(index<0)return esc(text.slice(0,260))+(text.length>260?' …':'');const left=Math.max(0,index-90),right=Math.min(text.length,index+term.length+230),clip=text.slice(left,right),pos=normalize(clip).indexOf(term);return(left?'… ':'')+esc(clip.slice(0,pos))+'<mark>'+esc(clip.slice(pos,pos+term.length))+'</mark>'+esc(clip.slice(pos+term.length))+(right<text.length?' …':'');}
    const filter=`<nav class="filters" aria-label="Filtrer la recherche par matière">${[['all','Toutes les matières'],...D.subjects.map(s=>[s.id,s.title])].map(([id,title])=>`<a class="filter-chip ${selected===id?'active':''}" href="#search/${encodeURIComponent(query)}/${id}/${kind}" ${selected===id?'aria-current="page"':''}>${esc(title)}</a>`).join('')}</nav><nav class="section-tabs" aria-label="Filtrer la recherche par document">${[['all','Tous les contenus'],['cours','Cours'],['fiche','Fiches'],['officiel','Plan officiel'],['supports','Supports ajoutés']].map(([id,label])=>`<a class="${kind===id?'active':''}" href="#search/${encodeURIComponent(query)}/${selected}/${id}" ${kind===id?'aria-current="page"':''}>${label}</a>`).join('')}</nav>`;
    return `${header(`Résultats pour « ${query} »`,`${results.length} passage${results.length>1?'s':''} trouvé${results.length>1?'s':''}. ${results.length>100?'Les 100 premiers sont affichés ; précise ta recherche pour affiner.':''}`,'RECHERCHE DANS MES CONTENUS')}${filter}<div class="search-results">${results.slice(0,100).map(item=>`<a class="result" href="${esc(item.url)}"><span class="eyebrow">${esc(subjectName(item.subject))} · ${esc(item.label)}</span>${item.title?`<h3>${excerpt(item.title)}</h3>`:''}<p>${excerpt(item.text)}</p>${item.hasCorrection?'<span class="result-correction">Une correction ou précision accompagne ce passage.</span>':''}<span class="text-link">Ouvrir le passage ${icon('arrow')}</span></a>`).join('')}</div>${!results.length?empty('Aucun passage trouvé.','Essaie un mot plus court, un synonyme ou le nom d’un auteur.'):''}`;
  }
  function settingsPage() {
    const noteCount=Object.values(state.notes).filter(n=>n.trim()).length;
    const ownNotes=D.chapters.filter(c=>state.notes[c.id]?.trim());
    return `${header('Un espace qui suit mon travail.','Tes notes, favoris et révisions sont enregistrés dans ce navigateur. Tu peux exporter une sauvegarde pour les conserver ou les transférer.','MON ESPACE PERSONNEL')}${!storageAvailable?notice('Le stockage du navigateur est indisponible. Exporte tes données avant de fermer cette page.'):''}<section class="panel"><div class="settings-row"><div><h3>Ma progression</h3><p>${done()} chapitre${done()>1?'s':''} révisé${done()>1?'s':''} · ${state.favorites.length} favori${state.favorites.length>1?'s':''} · ${noteCount} chapitre${noteCount>1?'s':''} avec des notes</p></div><span class="pill">Cet appareil</span></div><div class="settings-row"><div><h3>Conserver ou transférer mes données</h3><p>La sauvegarde contient tes notes et ton suivi. Les cours sont conservés dans le site.</p></div><div class="page-actions"><button class="btn primary" data-action="export">${icon('download')}Exporter</button><button class="btn" data-action="restore">${icon('upload')}Restaurer</button></div></div><div class="settings-row"><div><h3>Ajouter de nouveaux cours et supports</h3><p>Envoie-les dans notre conversation. Je pourrai les intégrer à la matière et au chapitre concernés.</p></div></div></section>${ownNotes.length?`<section class="spaced"><h2>Retrouver mes notes</h2><div class="chapter-list">${ownNotes.map(c=>`<a class="chapter-row ${subjects[c.subject].color}" href="#chapter/${c.id}/notes"><span class="chapter-number">${icon('note')}</span><span class="chapter-title"><h3>${esc(c.title)}</h3><small>${esc(state.notes[c.id].slice(0,140))}${state.notes[c.id].length>140?'…':''}</small></span>${icon('arrow')}</a>`).join('')}</div></section>`:''}<section class="panel spaced"><h2>Comprendre la provenance</h2><p><strong>Cours fourni</strong> : tes notes originales, conservées sans correction silencieuse.</p><p><strong>Fiche fournie</strong> : ton document de révision, avec ses propres corrections et compléments.</p><p><strong>Fiche préparée</strong> : la fiche d’histoire du droit a été rédigée à partir de ton cours actuel jusqu’au CM5. L’archive de l’année précédente est consultable séparément.</p><p><strong>Contenu officiel</strong> : le plan du professeur conservé dans le projet. Moodle reste la référence actuelle.</p><p><strong>Support ajouté</strong> : questions de compréhension, quiz corrigés et schémas préparés à partir des fiches. Les fiches de lecture d’articles comportent leurs liens vers les sources officielles.</p><p>Dernière relecture et mise à jour : ${dateLabel(D.updated)}. Le cours d’institutions internationales et le syllabus présentent les limites indiquées dans la bibliothèque.</p>${button('Consulter mes documents','#sources',false,'folder')}</section>`;
  }
  function notFound(){return empty('Cet espace est introuvable.','Retourne au tableau de bord pour retrouver tes matières.',button('Mon tableau de bord','#home',true));}
  function getRoute(){try{return (location.hash.slice(1)||'home').split('/').map(decodeURIComponent);}catch{return ['home'];}}
  function render(resetScroll=true) {
    const route=getRoute();
    const routeKey=location.hash||'#home',highlights=!resetScroll&&renderedRoute===routeKey?snapshotHighlights():[];
    const labels={home:'Tableau de bord',subjects:'Mes matières',subject:subjectName(route[1]),chapter:subjectName(chapterById[route[1]]?.subject),document:'Bibliothèque',sources:'Bibliothèque',cards:'Flashcards',quiz:'Quiz corrigés',timeline:'Frises',schemes:'Schémas',references:'Approfondir',favorites:'Favoris',settings:'Mon espace',corrections:'Corrections & précisions',search:'Recherche'};
    sidebar(route);topbar(labels[route[0]]||'Mon espace',route[0]==='search'?route[1]||'':'');
    let html;
    switch(route[0]){
      case 'home':html=home();break;
      case 'subjects':html=header('Mes matières du semestre.','Retrouve le plan de chaque matière et avance chapitre par chapitre.','MES MATIÈRES')+`<div class="cards-grid" data-count="${D.subjects.length}">${D.subjects.map(subjectCard).join('')}</div>`;break;
      case 'subject':html=subjectPage(route[1]);break;
      case 'chapter':html=chapterPage(route[1],route[2]);break;
      case 'document':html=documentPage(route[1],route[2]);break;
      case 'sources':html=sourcesPage(route[1]);break;
      case 'cards':html=session?sessionPage():route[1]==='chapter'?cardStart(chapterById[route[2]]?.subject,route[2]):cardStart(subjects[route[1]]?route[1]:'all');break;
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
    setupHighlighter(highlights);renderedRoute=routeKey;
    document.title=`${labels[route[0]]||'Mon espace'} · L’Atelier du droit`;
    if(resetScroll){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
    if(route[0]==='corrections'&&route[2])requestAnimationFrame(()=>document.getElementById('note-'+route[2])?.scrollIntoView({block:'center'}));
    if(route[0]==='references'&&route[2]==='additions'&&route[3])requestAnimationFrame(()=>document.getElementById('guide-'+route[3])?.scrollIntoView({block:'center'}));
    if(route[0]==='chapter'&&chapterById[route[1]]){let changed=state.lastChapter!==route[1];state.lastChapter=route[1];if(['cours','fiche',undefined].includes(route[2])&&!state.chapters[route[1]]){state.chapters[route[1]]='started';changed=true;}if(changed)persist();}
    if(route[0]==='document'&&route[2]!==undefined){requestAnimationFrame(()=>document.getElementById(`p-${Number(route[2])}`)?.scrollIntoView({block:'center'}));}
  }
  document.addEventListener('click',event=>{
    const scrollLink=event.target.closest('[data-scroll]');if(scrollLink){event.preventDefault();document.getElementById(scrollLink.dataset.scroll)?.scrollIntoView({behavior:'smooth',block:'start'});return;}
    const target=event.target.closest('[data-action]');
    if(!target){if(event.target.closest('a[href^="#"]')&&!event.target.closest('#sidebar'))document.body.classList.remove('menu-open');return;}
    const id=target.dataset.id;
    switch(target.dataset.action){
      case 'highlight-selection':applyHighlight();break;
      case 'clear-highlights':clearHighlights();break;
      case 'menu':document.body.classList.toggle('menu-open');target.setAttribute('aria-expanded',String(document.body.classList.contains('menu-open')));break;
      case 'favorite':if(!chapterById[id])return;state.favorites=state.favorites.includes(id)?state.favorites.filter(x=>x!==id):[...state.favorites,id];persist();render(false);showToast(state.favorites.includes(id)?'Chapitre ajouté aux favoris.':'Chapitre retiré des favoris.');break;
      case 'complete':if(!chapterById[id])return;state.chapters[id]=state.chapters[id]==='done'?'started':'done';persist();render(false);showToast(state.chapters[id]==='done'?'Chapitre marqué révisé.':'Chapitre marqué en cours.');break;
      case 'print':window.print();break;
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
        state.quizzes[q.id]={correct:!!(correct||state.quizzes[q.id]?.correct),attempts:(state.quizzes[q.id]?.attempts||0)+1};
        persist();render(false);break;
      }
      case 'quiz-next':if(quizSession&&quizSession.chosen!==null){quizSession.index++;quizSession.chosen=null;render(false);}break;
      case 'end-quiz':{const route=quizSession?.returnRoute||'#quiz';quizSession=null;if(location.hash===route)render();else location.hash=route;break;}
      case 'start-session':{
        const targetId=target.dataset.target,chapter=targetId.startsWith('chapter:')?targetId.slice(8):null;
        let cards=D.cards.filter(c=>chapter?c.chapter===chapter:(targetId==='all'||c.subject===targetId));
        if(target.dataset.mode==='due')cards=cards.filter(c=>!state.reviews[c.id]||state.reviews[c.id].due<=Date.now());
        cards=balancedSample(cards,10);if(!cards.length)return;
        session={cards,index:0,flipped:false,known:0,returnRoute:location.hash};render();break;
      }
      case 'flip':if(session&&session.index<session.cards.length){session.flipped=!session.flipped;render(false);}break;
      case 'grade':if(session&&session.flipped&&session.index<session.cards.length){const card=session.cards[session.index],grade=target.dataset.grade==='known'?'known':'again';state.reviews[card.id]={due:Date.now()+(grade==='known'?3:1)*86400000,seen:(state.reviews[card.id]?.seen||0)+1,grade};if(grade==='known')session.known++;session.index++;session.flipped=false;persist();render(false);}break;
      case 'end-session':{const route=session?.returnRoute||'#cards';session=null;if(location.hash===route)render();else location.hash=route;break;}
      case 'export':{const blob=new Blob([JSON.stringify({...state,exportedAt:new Date().toISOString()},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`atelier-droit-progression-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Sauvegarde téléchargée.');break;}
      case 'restore':document.getElementById('restore-file').click();break;
    }
  });
  document.addEventListener('submit',event=>{if(event.target.id==='search-form'){event.preventDefault();const query=event.target.elements.q.value.trim().slice(0,180);location.hash=`search/${encodeURIComponent(query)}`;}});
  document.addEventListener('selectionchange',captureHighlightSelection);
  document.addEventListener('pointerdown',event=>{if(event.target.closest('.study-highlighter button'))event.preventDefault();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearHighlights();});
  window.addEventListener('pagehide',clearHighlights);
  window.addEventListener('pageshow',event=>{if(event.persisted)clearHighlights();});
  document.addEventListener('input',event=>{if(event.target.id==='chapter-note'){const id=event.target.dataset.chapter;state.notes[id]=event.target.value;const success=persist();document.getElementById('note-status').textContent=success?'Notes enregistrées sur cet appareil.':'Enregistrement indisponible. Exporte tes notes avant de fermer.';}});
  document.getElementById('restore-file').addEventListener('change',async event=>{
    const file=event.target.files?.[0];if(!file)return;
    try{
      if(file.size>2_000_000)throw new Error('Ce fichier dépasse la taille maximale de 2 Mo.');
      const imported=cleanState(JSON.parse(await file.text()));
      // Merge and preserve existing notes when the import has a different text.
      for(const [id,text] of Object.entries(imported.notes)){const current=state.notes[id]||'';state.notes[id]=current&&current!==text?`${current}\n\n—— Notes de la sauvegarde importée ——\n${text}`:text;}
      for(const [id,status] of Object.entries(imported.chapters))if(state.chapters[id]!=='done')state.chapters[id]=status;
      state.favorites=[...new Set([...state.favorites,...imported.favorites])];
      for(const [id,review] of Object.entries(imported.reviews))if(!state.reviews[id]||review.seen>state.reviews[id].seen)state.reviews[id]=review;
      for(const [id,q] of Object.entries(imported.quizzes))state.quizzes[id]={correct:!!(q.correct||state.quizzes[id]?.correct),attempts:Math.max(q.attempts,state.quizzes[id]?.attempts||0)};
      if(!state.lastChapter&&imported.lastChapter)state.lastChapter=imported.lastChapter;
      persist();session=null;quizSession=null;render(false);showToast('Sauvegarde ajoutée à ta progression.');
    }catch(error){showToast(error.message||'Impossible de lire cette sauvegarde.');}
    event.target.value='';
  });
  document.addEventListener('keydown',event=>{if(event.key==='Escape'){document.body.classList.remove('menu-open');document.querySelector('.mobile-menu')?.setAttribute('aria-expanded','false');}});
  window.addEventListener('hashchange',()=>{document.body.classList.remove('menu-open');render();});
  render();
})();
