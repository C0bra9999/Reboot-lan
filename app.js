firebase.initializeApp({
  apiKey: "AIzaSyBq681fh3bzoLt7V8vdOX5vYC7b9yU-HyA",
  authDomain: "reboot-lan.firebaseapp.com",
  projectId: "reboot-lan",
  storageBucket: "reboot-lan.firebasestorage.app",
  messagingSenderId: "440516751117",
  appId: "1:440516751117:web:703ca3275a8383b44dca44"
});
const db = firebase.firestore();
const auth = firebase.auth();

// ── STATE ──
let paymentMethod = 'swish';
let publicDay = 0;
let adminDay = 0;
let scheduleDays = [
  [{time:'10:00',event:'Dörrarna öppnar',info:'Välkommen! Installera din utrustning'},{time:'11:00',event:'Turneringarna börjar',info:'CS2 & LoL gruppspel startar'},{time:'14:00',event:'Lunchpaus',info:'Mat tillgänglig på plats'},{time:'15:00',event:'Playoff-ronder',info:'Top 4 lag går vidare'},{time:'22:00',event:'Dag 1 avslutas',info:'Vi ses imorgon!'}],
  [{time:'10:00',event:'Dag 2 börjar',info:'Dörrarna öppnar igen'},{time:'11:00',event:'Semifinaler',info:'Top lag möts'},{time:'14:00',event:'Lunchpaus',info:'Mat tillgänglig på plats'},{time:'16:00',event:'Finaler dag 2',info:'Spänning på topp'},{time:'22:00',event:'Dag 2 avslutas',info:'Nästan där!'}],
  [{time:'10:00',event:'Sista dagen börjar',info:'Finaldagen är här'},{time:'12:00',event:'Stora finaler',info:'Huvudscen – alla välkomna'},{time:'16:00',event:'Prisutdelning',info:'Vinnare koras!'},{time:'18:00',event:'LAN avslutas',info:'Tack för en fantastisk helg! 🎮'}],
];
let siteSettings = {date:'9 APRIL 2026',swish:'0703 87 66 60',discordLink:'',email:'kontakt@rebootlan.se',location:'Adress uppdateras snart',countdownDate:'2026-04-09',seats:30};
let webhooks = {url1:'',url2:'',url3:''};
let tickets = [
  {name:'DELTAGARE', price:'150', suffix:'kr', features:['Plats på LAN','Tillgång till alla turneringar','Fri strömning hela dagen','High-speed internet'], btnText:'ANMÄL', btnLink:'#anmalan', featured:false},
  {name:'ÅSKÅDARE', price:'Fri', suffix:'entré', features:['Se matcherna live','Huvudscen-finaler','Mat och dricka tillgänglig'], btnText:'MER INFO', btnLink:'#kontakt', featured:false},
];
let tournaments = [
  {name:'CS2',badge:'FPS',format:'5v5',extraFormats:['1v1 Wingman','2v2','5v5'],prize:'PRIS TBA',maxTeams:'8',info:'Ålder: Alla'},
  {name:'League of Legends',badge:'MOBA',format:'5v5',extraFormats:['5v5'],prize:'PRIS TBA',maxTeams:'8',info:'Draft Pick'},
  {name:'Fortnite',badge:'BR',format:'Solo',extraFormats:['Solo','Duos','Trios','Squads'],prize:'PRIS TBA',maxTeams:'',info:'Poängsystem'},
  {name:'Rocket League',badge:'RACING',format:'3v3',extraFormats:['1v1','2v2','3v3'],prize:'PRIS TBA',maxTeams:'8',info:'Alla välkomna'},
];

// ── HELPERS ──
function $(id){ return document.getElementById(id); }
function esc(str){ // XSS sanitering — escaped all user-generated content
  return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#x27;');
}
function showToast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3500); }

// ── SCROLL REVEAL ──
const obs = new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible');}),{threshold:0.1});
document.querySelectorAll('.reveal').forEach(el=>obs.observe(el));

// ── LOAD SETTINGS ──
async function loadSettings(){
  try{
    const snap = await db.collection('config').doc('settings').get();
    if(snap.exists){
      const d = snap.data();
      if(d.date) siteSettings.date=d.date;
      if(d.swish) siteSettings.swish=d.swish;
      if(d.discordLink) siteSettings.discordLink=d.discordLink;
      if(d.email) siteSettings.email=d.email;
      if(d.location) siteSettings.location=d.location;
      if(d.countdownDate) siteSettings.countdownDate=d.countdownDate;
      if(d.seats) siteSettings.seats=d.seats;
      if(d.scheduleObj) scheduleDays=[d.scheduleObj.day0||[], d.scheduleObj.day1||[], d.scheduleObj.day2||[]];
      if(d.tournaments) tournaments=d.tournaments;
      if(d.tickets) tickets=d.tickets;
      if(d.seatLayout) seatLayout=d.seatLayout;
      if(d.webhook1) webhooks.url1=d.webhook1;
      if(d.webhook2) webhooks.url2=d.webhook2;
      if(d.webhook3) webhooks.url3=d.webhook3;
    }
  }catch(e){ console.log('loadSettings:',e); }
  applySettings();
  loadBookings();
}

function applySettings(){
  $('hero-date-display').textContent = '📅 '+siteSettings.date;
  $('swish-number-display').textContent = siteSettings.swish;
  $('contact-email').textContent = siteSettings.email;
  $('contact-location').textContent = siteSettings.location;
  if(siteSettings.discordLink) $('discord-link').href=siteSettings.discordLink;
  renderPublicSchedule();
  renderPublicTournaments();
  renderPublicTickets();
  renderTicketSelector();
  updateSwishQR();
  startCountdown();
  renderSeats();
}

function getSwishNumber(){
  const raw = siteSettings.swish.replace(/\D/g,'');
  // Validera att det är ett riktigt nummer (9-12 siffror)
  if(!/^[0-9]{9,12}$/.test(raw)){
    console.warn('Ogiltigt Swish-nummer:', raw);
    return '';
  }
  return raw.startsWith('0') ? '46'+raw.slice(1) : raw;
}

// ── BILJETTVAL ──
let selectedTicketIndex = null;

function renderTicketSelector(){
  const container = $('ticket-selector');
  if(!container) return;
  if(!tickets || tickets.length === 0){
    container.innerHTML = '<div style="color:var(--text-dim);font-size:0.9rem;padding:10px;">Inga biljetter konfigurerade ännu.</div>';
    return;
  }
  container.innerHTML = tickets.map((t, i) => {
    const isAvailable = t.available !== false; // standard: tillgänglig
    const isSelected = selectedTicketIndex === i;
    return `<div onclick="${isAvailable ? 'selectTicket('+i+')' : ''}"
      style="border:2px solid ${isSelected ? 'var(--purple)' : isAvailable ? 'rgba(155,48,255,0.25)' : 'rgba(255,255,255,0.07)'};
             background:${isSelected ? 'rgba(155,48,255,0.12)' : 'var(--bg2)'};
             padding:16px 20px;cursor:${isAvailable ? 'pointer' : 'not-allowed'};
             opacity:${isAvailable ? '1' : '0.4'};transition:all 0.2s;position:relative;">
      ${isSelected ? '<div style="position:absolute;top:10px;right:12px;font-size:0.7rem;color:var(--purple);">✓ VALD</div>' : ''}
      ${!isAvailable ? '<div style="position:absolute;top:10px;right:12px;font-family:\'Orbitron\',monospace;font-size:0.5rem;letter-spacing:2px;color:var(--text-dim);">STÄNGD</div>' : ''}
      <div style="font-family:'Orbitron',monospace;font-size:0.9rem;color:${isSelected ? 'var(--purple-bright)' : 'var(--text)'};margin-bottom:6px;">${esc(t.name)}</div>
      <div style="font-family:'Orbitron',monospace;font-size:1.4rem;font-weight:900;color:${isSelected ? 'var(--purple-bright)' : '#fff'};">${esc(t.price)} <span style="font-size:0.7rem;color:var(--text-dim);">${esc(t.suffix||'kr')}</span></div>
      ${(t.features||[]).length ? '<div style="margin-top:8px;font-size:0.82rem;color:var(--text-dim);">'+t.features.slice(0,2).map(f=>'• '+esc(f)).join('<br>')+'</div>' : ''}
    </div>`;
  }).join('');

  // Auto-välj första tillgängliga biljett
  if(selectedTicketIndex === null){
    const firstAvail = tickets.findIndex(t => t.available !== false);
    if(firstAvail >= 0) selectTicket(firstAvail);
  }
}

window.selectTicket = function(i){
  const t = tickets[i];
  if(!t || t.available === false) return;
  selectedTicketIndex = i;
  renderTicketSelector();
  // Uppdatera Swish-beloppet automatiskt
  const price = parseInt(String(t.price).replace(/\D/g,'')) || 150;
  const inp = $('swish-amount-input');
  const disp = $('swish-amount-display');
  if(inp) inp.value = price;
  if(disp) disp.textContent = price;
  updateSwishQR();
};

function setSwishAmount(amt){
  const inp = $('swish-amount-input');
  const disp = $('swish-amount-display');
  if(inp) inp.value = amt;
  if(disp) disp.textContent = amt;
  updateSwishQR();
}

function openSwish(e){
  e.preventDefault();
  const num = getSwishNumber();
  const amount = parseInt($('swish-amount-input')?.value||150);
  const url = `swish://payment?data={"version":1,"payee":{"value":"${num}","editable":false},"amount":{"value":${amount},"editable":false},"message":{"value":"Reboot LAN","editable":true}}`;
  window.location.href = url;
}

let swishQrDebounce = null;
async function updateSwishQR(){
  const num = getSwishNumber();
  const amount = parseInt($('swish-amount-input')?.value||150);

  // Uppdatera deep link
  const deepUrl = `swish://payment?data={"version":1,"payee":{"value":"${num}","editable":false},"amount":{"value":${amount},"editable":false},"message":{"value":"Reboot LAN","editable":true}}`;
  const link = $('swish-link');
  if(link) link.href = deepUrl;

  clearTimeout(swishQrDebounce);
  swishQrDebounce = setTimeout(() => {
    window.swishQrFallback();
  }, 200);
}

window.swishQrFallback = function(){
  const loading = $('swish-qr-loading');
  const img = $('swish-qr-img');
  if(loading) loading.style.display = 'none';
  if(img) img.style.display = 'none';
  const wrap = $('swish-qr-wrap');
  if(!wrap) return;
  // Ta bort gammal QR om den finns
  const old = wrap.querySelector('#swish-qr-fallback');
  if(old) old.remove();
  const num = getSwishNumber();
  const amount = parseInt($('swish-amount-input')?.value||150);
  const swishUrl = `swish://payment?data={"version":1,"payee":{"value":"${num}","editable":false},"amount":{"value":${amount},"editable":false},"message":{"value":"Reboot LAN","editable":true}}`;
  const fb = document.createElement('div');
  fb.id = 'swish-qr-fallback';
  wrap.appendChild(fb);
  new QRCode(fb, { text: swishUrl, width: 160, height: 160, colorDark:'#000', colorLight:'#fff', correctLevel: QRCode.CorrectLevel.M });
}

// ── PUBLIC TICKETS ──
function renderPublicTickets(){
  const grid = $('public-pricing-grid');
  if(!grid) return;
  grid.innerHTML = tickets.map(t=>`
    <div class="pricing-card ${t.featured?'featured':''} reveal">
      ${t.featured?'<div class="pricing-badge">POPULÄRAST</div>':''}
      <div class="pricing-name">${esc(t.name)}</div>
      <div class="pricing-amount">${esc(t.price)}<span> ${esc(t.suffix)}</span></div>
      <ul class="pricing-features">${(t.features||[]).map(f=>`<li>${esc(f)}</li>`).join('')}</ul>
      <a href="${/^https?:\/\/|^#/.test(t.btnLink||'#anmalan')?esc(t.btnLink||'#anmalan'):'#anmalan'}" class="${t.featured?'btn-primary':'btn-secondary'}" style="display:block;text-align:center;">${esc(t.btnText||'ANMÄL')}</a>
    </div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
}

// ── ADMIN TICKETS ──
function renderAdminTickets(){
  $('tickets-list').innerHTML = tickets.length===0
    ? '<p style="color:var(--text-dim);padding:10px 0;">Inga biljetter ännu.</p>'
    : tickets.map((t,i)=>{
    const isAvail = t.available !== false;
    return `
    <div style="background:var(--bg);border:2px solid ${isAvail?'rgba(0,255,170,0.3)':'rgba(255,48,96,0.3)'};padding:16px 20px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px;">
        <span style="font-family:'Orbitron',monospace;font-size:0.8rem;color:${t.featured?'var(--purple-bright)':'var(--text)'};">${esc(t.name)} — ${esc(t.price)} ${esc(t.suffix)}</span>
        <div style="display:flex;gap:8px;align-items:center;">
          <!-- PÅ/AV-knapp -->
          <button onclick="toggleTicketAvailable(${i})" style="padding:6px 16px;font-family:'Orbitron',monospace;font-size:0.55rem;letter-spacing:2px;cursor:pointer;border:none;background:${isAvail?'rgba(0,255,170,0.15)':'rgba(255,48,96,0.15)'};color:${isAvail?'var(--green)':'var(--red)'};border:1px solid ${isAvail?'var(--green)':'var(--red)'};">
            ${isAvail?'✅ AKTIV — KLICKA FÖR ATT STÄNGA':'🔴 STÄNGD — KLICKA FÖR ATT ÖPPNA'}
          </button>
          <button onclick="deleteTicket(${i})" style="background:transparent;border:1px solid var(--red);color:var(--red);width:32px;height:32px;font-size:1rem;cursor:pointer;">✕</button>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
        <div class="admin-field" style="margin:0;"><label>Namn</label><input type="text" value="${esc(t.name)}" oninput="tickets[${i}].name=this.value" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;font-family:'Rajdhani',sans-serif;font-size:1rem;outline:none;"></div>
        <div class="admin-field" style="margin:0;"><label>Pris</label><input type="text" value="${esc(t.price)}" oninput="tickets[${i}].price=this.value" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;font-family:'Rajdhani',sans-serif;font-size:1rem;outline:none;"></div>
        <div class="admin-field" style="margin:0;"><label>Suffix</label><input type="text" value="${esc(t.suffix)}" oninput="tickets[${i}].suffix=this.value" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;font-family:'Rajdhani',sans-serif;font-size:1rem;outline:none;"></div>
        <div class="admin-field" style="margin:0;"><label>Knapp-text</label><input type="text" value="${esc(t.btnText)}" oninput="tickets[${i}].btnText=this.value" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;font-family:'Rajdhani',sans-serif;font-size:1rem;outline:none;"></div>
      </div>
      <div class="admin-field"><label>Vad ingår (en per rad)</label>
        <textarea oninput="tickets[${i}].features=this.value.split('\\n').filter(x=>x.trim())" rows="3" style="width:100%;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:8px;font-family:'Rajdhani',sans-serif;font-size:0.95rem;outline:none;">${(t.features||[]).join('\n')}</textarea>
      </div>
    </div>`;}).join('');
}

window.toggleTicketAvailable = function(i){
  tickets[i].available = tickets[i].available === false ? true : false;
  renderAdminTickets();
  renderTicketSelector();
  showToast(tickets[i].available === false ? '🔴 Biljett stängd! Klicka Spara.' : '✅ Biljett öppnad! Klicka Spara.');
};

window.deleteTicket = function(i){
  tickets.splice(i,1);
  renderAdminTickets();
  showToast('🗑 Biljett borttagen! Klicka Spara för att bekräfta.');
};

document.getElementById('add-ticket-btn').addEventListener('click', ()=>{
  const name=$('new-ticket-name').value.trim();
  const price=$('new-ticket-price').value.trim();
  if(!name||!price){ showToast('⚠ Fyll i namn och pris!'); return; }
  tickets.push({
    name,
    price,
    suffix: $('new-ticket-suffix').value.trim()||'kr',
    features: $('new-ticket-features').value.split('\n').filter(x=>x.trim()),
    btnText: $('new-ticket-btn').value.trim()||'ANMÄL',
    btnLink: $('new-ticket-link').value.trim()||'#anmalan',
    featured: $('new-ticket-featured').value==='1'
  });
  ['new-ticket-name','new-ticket-price','new-ticket-suffix','new-ticket-btn','new-ticket-link','new-ticket-features'].forEach(id=>$(id).value='');
  $('new-ticket-featured').value='0';
  renderAdminTickets();
  showToast('✅ Biljett tillagd! Klicka Spara för att bekräfta.');
});

document.getElementById('save-tickets-btn').addEventListener('click', async()=>{
  try{
    await db.collection('config').doc('settings').set({tickets},{merge:true});
    renderPublicTickets();
    showToast('✅ Biljetter sparade!');
  }catch(e){ showToast('❌ Fel: '+e.message); console.error(e); }
});

// ── PUBLIC TOURNAMENTS ──
function renderPublicTournaments(){
  const grid = $('public-tournaments-grid');
  if(!grid) return;
  grid.innerHTML = tournaments.map(t=>`
    <div class="tournament-card reveal">
      <div class="tournament-badge">${esc(t.badge||'GAME')}</div>
      <div class="tournament-game">${esc(t.name)}</div>
      <div class="tournament-info">${esc(t.format)}${t.maxTeams?' · Max '+esc(t.maxTeams)+' lag':''}${t.info?'<br>'+esc(t.info):''}</div>
      <div class="tournament-prize">${esc(t.prize||'PRIS TBA')}</div>
    </div>`).join('');
  grid.querySelectorAll('.reveal').forEach(el=>obs.observe(el));
  const sel=$('reg-tournament');
  if(sel){
    const cur=sel.value;
    sel.innerHTML='<option value="">Välj turnering...</option>'+
      tournaments.map(t=>`<option value="${esc(t.name.toLowerCase().replace(/\s/g,'_'))}">${esc(t.name)}</option>`).join('');
    sel.value=cur;
  }
}

// ── ADMIN TOURNAMENTS ──
function renderAdminTournaments(){
  $('tournaments-list').innerHTML = tournaments.length===0
    ? '<p style="color:var(--text-dim);padding:10px 0;">Inga turneringar ännu.</p>'
    : tournaments.map((t,i)=>`
    <div style="background:var(--bg);border:1px solid var(--border);padding:16px 20px;margin-bottom:10px;">
      <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <input type="text" value="${t.badge||''}" placeholder="Badge" oninput="tournaments[${i}].badge=this.value" style="background:var(--bg2);border:1px solid var(--purple);color:var(--purple-bright);padding:6px 10px;font-family:'Orbitron',monospace;font-size:0.65rem;width:80px;outline:none;letter-spacing:1px;">
        <input type="text" value="${t.name}" placeholder="Spelnamn" oninput="tournaments[${i}].name=this.value" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:'Orbitron',monospace;font-size:0.8rem;flex:1;min-width:120px;outline:none;">
        <input type="text" value="${t.format}" placeholder="Format t.ex. 5v5" oninput="tournaments[${i}].format=this.value" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:'Rajdhani',sans-serif;font-size:0.95rem;width:110px;outline:none;">
        <input type="text" value="${t.prize||''}" placeholder="Pris" oninput="tournaments[${i}].prize=this.value" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:'Rajdhani',sans-serif;font-size:0.95rem;width:100px;outline:none;">
        <input type="text" value="${t.maxTeams||''}" placeholder="Max lag" oninput="tournaments[${i}].maxTeams=this.value" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:'Rajdhani',sans-serif;font-size:0.95rem;width:80px;outline:none;">
        <input type="text" value="${t.info||''}" placeholder="Extra info" oninput="tournaments[${i}].info=this.value" style="background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 10px;font-family:'Rajdhani',sans-serif;font-size:0.95rem;width:150px;outline:none;">
        <button onclick="deleteTournament(${i})" style="background:transparent;border:1px solid var(--red);color:var(--red);width:32px;height:32px;font-size:1rem;cursor:pointer;flex-shrink:0;">✕</button>
      </div>
    </div>`).join('');
}

window.deleteTournament = function(i){
  tournaments.splice(i,1);
  renderAdminTournaments();
  showToast('🗑 Turnering borttagen! Klicka Spara för att bekräfta.');
};

document.getElementById('add-tournament-btn').addEventListener('click', ()=>{
  const name = $('new-t-name').value.trim();
  const format = $('new-t-format').value.trim();
  if(!name||!format){ showToast('⚠ Fyll i spelnamn och format!'); return; }
  tournaments.push({
    name,
    format,
    badge: $('new-t-badge').value.trim()||'GAME',
    prize: $('new-t-prize').value.trim()||'PRIS TBA',
    maxTeams: $('new-t-maxteams').value.trim(),
    info: $('new-t-info').value.trim()
  });
  $('new-t-name').value=''; $('new-t-format').value=''; $('new-t-badge').value='';
  $('new-t-prize').value=''; $('new-t-maxteams').value=''; $('new-t-info').value='';
  renderAdminTournaments();
  showToast('✅ Turnering tillagd! Glöm inte spara.');
});

document.getElementById('save-tournaments-btn').addEventListener('click', async()=>{
  try{
    await db.collection('config').doc('settings').set({tournaments},{merge:true});
    renderPublicTournaments();
    showToast('✅ Turneringar sparade!');
  }catch(e){ showToast('❌ Fel: '+e.message); console.error(e); }
});

// ── COUNTDOWN ──
let countdownInterval = null;
function startCountdown(){
  if(countdownInterval) clearInterval(countdownInterval);
  const target = new Date(siteSettings.countdownDate + 'T10:00:00');
  function tick(){
    const now = new Date();
    const diff = target - now;
    if(diff <= 0){
      $('cd-days').textContent='00'; $('cd-hours').textContent='00';
      $('cd-mins').textContent='00'; $('cd-secs').textContent='00';
      clearInterval(countdownInterval);
      return;
    }
    const days = Math.floor(diff/86400000);
    const hours = Math.floor((diff%86400000)/3600000);
    const mins = Math.floor((diff%3600000)/60000);
    const secs = Math.floor((diff%60000)/1000);
    $('cd-days').textContent = String(days).padStart(2,'0');
    $('cd-hours').textContent = String(hours).padStart(2,'0');
    $('cd-mins').textContent = String(mins).padStart(2,'0');
    $('cd-secs').textContent = String(secs).padStart(2,'0');
  }
  tick();
  countdownInterval = setInterval(tick, 1000);
}

// ── BORDSBOKNING ──
let selectedSeat = null;
let bookedSeats = {};

async function loadBookings(){
  try{
    const snap = await db.collection('bookings').get();
    bookedSeats = {};
    snap.docs.forEach(d=>{ bookedSeats[d.id]=d.data(); });
  }catch(e){ console.log('loadBookings:',e); }
  renderSeats();
}

// ── FLOORPLAN SEAT SYSTEM ──
// seatLayout sparas i Firebase: array av {id, x, y} där x/y är % av bildens bredd/höjd
let seatLayout = []; // laddas från Firebase config/settings.seatLayout

function renderSeats(){
  const container = $('floorplan-seats');
  if(!container) return;
  const img = $('floorplan-img');
  if(!img) return;

  container.innerHTML = seatLayout.map(seat => {
    const isCrew = seat.type === 'crew';
    const booked = bookedSeats[seat.id];
    const isSelected = selectedSeat === seat.id;
    const label = seat.id.replace(/^[SC]/,'');

    if(isCrew){
      // Crew — orange rektangel med "CREW" text, ej klickbar
      return `<div title="👷 Crew — ${esc(seat.id)}"
        style="position:absolute;left:${seat.x}%;top:${seat.y}%;
               transform:translate(-50%,-50%);
               width:42px;height:28px;border-radius:3px;
               background:rgba(245,166,35,0.25);border:2px solid #f5a623;
               display:flex;align-items:center;justify-content:center;
               font-family:'Orbitron',monospace;font-size:0.38rem;font-weight:700;
               color:#f5a623;letter-spacing:1px;pointer-events:all;cursor:default;
               box-shadow:0 0 8px rgba(245,166,35,0.3);">
        CREW
      </div>`;
    }

    // Spelarplatser — rektangel (bord-känsla)
    let bg, border, glow;
    if(booked){
      bg='rgba(255,48,96,0.35)'; border='var(--red)'; glow='rgba(255,48,96,0.4)';
    } else if(isSelected){
      bg='rgba(155,48,255,0.5)'; border='var(--purple-bright)'; glow='rgba(155,48,255,0.6)';
    } else {
      bg='rgba(0,238,255,0.15)'; border='var(--cyan)'; glow='rgba(0,238,255,0.3)';
    }

    const tooltip = booked
      ? `❌ Bokad av ${esc(booked.name)}`
      : (isSelected ? `✓ Vald — ${seat.id}` : `Boka bord ${seat.id}`);

    return `<div onclick="${booked ? '' : `selectSeat('${esc(seat.id)}')`}"
      title="${tooltip}"
      style="position:absolute;left:${seat.x}%;top:${seat.y}%;
             transform:translate(-50%,-50%);
             width:44px;height:30px;border-radius:3px;
             background:${bg};border:2px solid ${border};
             cursor:${booked?'not-allowed':'pointer'};pointer-events:all;
             display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
             font-family:'Orbitron',monospace;color:#fff;
             box-shadow:0 0 8px ${glow};
             transition:transform 0.12s,box-shadow 0.12s;"
      onmouseover="if(${!booked}){ this.style.transform='translate(-50%,-50%) scale(1.18)'; this.style.boxShadow='0 0 16px ${glow}'; }"
      onmouseout="this.style.transform='translate(-50%,-50%) scale(1)'; this.style.boxShadow='0 0 8px ${glow}';">
      <div style="font-size:0.42rem;font-weight:700;line-height:1;">${label}</div>
      ${booked ? '<div style="font-size:0.3rem;color:rgba(255,120,120,0.9);line-height:1;">BOKAD</div>' : ''}
    </div>`;
  }).join('');
}

window.selectSeat = function(id){
  if(bookedSeats[id]) return;
  selectedSeat = id;
  renderSeats();
  $('booking-seat-label').textContent = id;
  $('booking-form').style.display='block';
  $('booking-form').scrollIntoView({behavior:'smooth'});
};

window.cancelSeatSelection = function(){
  selectedSeat = null;
  renderSeats();
  $('booking-form').style.display='none';
};

$('confirm-booking-btn').addEventListener('click', async()=>{
  if(!selectedSeat){ showToast('⚠ Välj ett bord först!'); return; }
  let name = $('booking-name').value.trim();
  let discord = $('booking-discord').value.trim();
  if(!name||!discord){ showToast('⚠ Fyll i namn och Discord!'); return; }

  // Längdbegränsning
  if(name.length > 60) name = name.slice(0, 60);
  if(discord.length > 60) discord = discord.slice(0, 60);

  // Validera seat-ID mot förväntad struktur (t.ex. S01, S12)
  if(!/^S\d{2,3}$/.test(selectedSeat)){ showToast('⚠ Ogiltigt bord!'); return; }

  const btn = $('confirm-booking-btn');
  btn.innerHTML='<span class="spinner"></span>BOKAR...'; btn.disabled=true;
  try{
    // Transaction — förhindrar race condition om två bokar samma plats samtidigt
    await db.runTransaction(async (tx) => {
      const ref = db.collection('bookings').doc(selectedSeat);
      const doc = await tx.get(ref);
      if(doc.exists){
        throw new Error('Platsen är redan bokad av någon annan!');
      }
      tx.set(ref, {
        name,
        discord,
        seat: selectedSeat,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
    bookedSeats[selectedSeat] = {name, discord};
    // XSS-säker toast — använd textContent istället för innerHTML
    showToast('✅ Plats ' + esc(selectedSeat) + ' bokad av ' + esc(name) + '!');
    $('booking-form').style.display='none';
    $('booking-name').value=''; $('booking-discord').value='';
    selectedSeat = null;
    renderSeats();
  }catch(e){
    showToast('❌ ' + (e.message === 'Platsen är redan bokad av någon annan!' ? e.message : 'Kunde inte boka. Försök igen!'));
    // Uppdatera seat-vyn ifall platsen togs av annan
    const snap = await db.collection('bookings').get();
    snap.docs.forEach(d=>{ bookedSeats[d.id]=d.data(); });
    renderSeats();
  }
  btn.innerHTML='BEKRÄFTA BOKNING'; btn.disabled=false;
});

// ── SCHEDULE ──
function renderPublicSchedule(){
  const dayNames=['DAG 1','DAG 2','DAG 3'];
  $('public-day-label').textContent = dayNames[publicDay];
  document.querySelectorAll('#public-day-tabs .day-tab').forEach((b,i)=>b.classList.toggle('active',i===publicDay));
  const rows = scheduleDays[publicDay]||[];
  $('schedule-body').innerHTML = rows.length
    ? rows.map(r=>`<tr><td class="schedule-time">${esc(r.time)}</td><td class="schedule-event">${esc(r.event)}</td><td>${esc(r.info)}</td></tr>`).join('')
    : '<tr><td colspan="3" style="color:var(--text-dim);padding:20px;text-align:center;">Inget schema för denna dag ännu.</td></tr>';
}

document.querySelectorAll('#public-day-tabs .day-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{ publicDay=parseInt(btn.dataset.day); renderPublicSchedule(); });
});

// ── PAYMENT ──
$('pay-swish-btn').addEventListener('click',()=>{
  paymentMethod='swish';
  $('pay-swish-btn').classList.add('active');
  $('pay-cash-btn').classList.remove('active');
  $('swish-panel').classList.add('visible');
});
$('pay-cash-btn').addEventListener('click',()=>{
  paymentMethod='cash';
  $('pay-cash-btn').classList.add('active');
  $('pay-swish-btn').classList.remove('active');
  $('swish-panel').classList.remove('visible');
});

// ── REGISTRATION ──
// Rate limiting för registrering
let lastRegTime = 0;
const REG_COOLDOWN = 10000; // 10 sekunder mellan anmälningar

$('submit-btn').addEventListener('click', async()=>{
  // Rate limiting
  if(Date.now() - lastRegTime < REG_COOLDOWN){ showToast('⚠ Vänta lite innan du skickar igen!'); return; }

  let fn=$('reg-firstname').value.trim(), ln=$('reg-lastname').value.trim();
  let discord=$('reg-discord').value.trim(), email=$('reg-email').value.trim();
  let tournament=$('reg-tournament').value, team=$('reg-team').value.trim();

  // Längdbegränsning — skyddar mot skräpdata
  if(fn.length>50) fn=fn.slice(0,50);
  if(ln.length>50) ln=ln.slice(0,50);
  if(discord.length>50) discord=discord.slice(0,50);
  if(email.length>100) email=email.slice(0,100);
  if(team.length>50) team=team.slice(0,50);

  // Validering
  if(!fn||!ln||!discord||!email||!tournament){ showToast('⚠ Fyll i alla obligatoriska fält!'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showToast('⚠ Ogiltig e-postadress!'); return; }
  if(selectedTicketIndex === null || tickets[selectedTicketIndex]?.available === false){ showToast('⚠ Välj en tillgänglig biljett!'); return; }
  if(paymentMethod==='swish' && !$('swish-confirmed').checked){ showToast('⚠ Du måste bekräfta att du swishat först!'); return; }

  const selectedTicket = tickets[selectedTicketIndex];
  const ticketName = selectedTicket?.name || 'Standard';
  const ticketPrice = selectedTicket?.price || '—';

  const btn=$('submit-btn');
  btn.innerHTML='<span class="spinner"></span>SKICKAR...'; btn.disabled=true;
  try{
    await db.collection('registrations').add({name:`${fn} ${ln}`,discord,email,tournament,team,payment:paymentMethod,ticketName,ticketPrice,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    lastRegTime = Date.now();
    const tN={cs2:'CS2',lol:'League of Legends',fortnite:'Fortnite',rocket:'Rocket League',casual:'Casual'};
    const pL=paymentMethod==='swish'?'💳 Swish i förväg':'💵 Betalar på plats';
    if(webhooks.url1){
      // Kolla om personen har förbokat en plats
      const bookedSeatEntry = Object.entries(bookedSeats).find(([,v])=>
        v.discord && v.discord.toLowerCase()===discord.toLowerCase()
      );
      const seatInfo = bookedSeatEntry ? `🪑 Plats: ${bookedSeatEntry[0]}` : '🪑 Plats: Ej förbokad';
      const msg = [
        `**🎮 NY ANMÄLAN — Reboot LAN**`,
        `👤 Namn: ${fn} ${ln}`,
        `💬 Discord: ${discord}`,
        `📧 E-post: ${email}`,
        `🎯 Turnering: ${tN[tournament]||tournament}`,
        team ? `🏆 Lag: ${team}` : null,
        `🎟 Biljett: ${ticketName} (${ticketPrice} kr)`,
        `💳 Betalning: ${pL}`,
        seatInfo,
      ].filter(Boolean).join('\n');
      await sendWebhook(webhooks.url1, {content: msg});
    }
    if(webhooks.url2) await sendWebhook(webhooks.url2,{embeds:[{
      title:'✅ Ny spelare har anmält sig!',
      color:0x00ffaa,
      description:`**${fn} ${ln}** har anmält sig till **${tN[tournament]||tournament}**!${team?' (Lag: '+team+')':''}`,
      footer:{text:'Reboot LAN'},
      timestamp:new Date().toISOString()
    }]});
    showToast('✅ Anmälan skickad! Vi ses på LAN! 🎮');
    ['reg-firstname','reg-lastname','reg-discord','reg-email','reg-team'].forEach(id=>$(id).value='');
    $('reg-tournament').value='';
    $('swish-confirmed').checked=false;
  }catch(e){ showToast('❌ Något gick fel. Försök igen!'); console.error(e); }
  btn.innerHTML='SKICKA ANMÄLAN'; btn.disabled=false;
});

async function sendWebhook(url, payload){
  if(!url) return;
  try{
    let body;
    if(payload.content){
      body = JSON.stringify({content: payload.content});
    } else if(payload.embeds && payload.embeds[0]){
      const e = payload.embeds[0];
      const fields = (e.fields||[]).map(f=>`**${f.name}:** ${f.value}`).join('\n');
      body = JSON.stringify({content: `**${e.title||''}**\n${e.description||''}\n${fields}`.trim()});
    } else {
      body = JSON.stringify(payload);
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body,
    });
    if(!res.ok) console.warn('Webhook HTTP fel:', res.status, await res.text());
    return res.ok;
  }catch(e){ console.warn('Webhook fel:', e); return false; }
}

// ── CONTACT ──
$('contact-send-btn').addEventListener('click', async()=>{
  const name=$('contact-name-input').value.trim(), msg=$('contact-msg-input').value.trim();
  if(!name||!msg){ showToast('⚠ Fyll i namn och meddelande!'); return; }
  try{
    await db.collection('messages').add({name,message:msg,createdAt:firebase.firestore.FieldValue.serverTimestamp()});
    showToast('✅ Meddelande skickat!');
    $('contact-name-input').value=''; $('contact-msg-input').value='';
  }catch(e){ showToast('❌ Kunde inte skicka.'); }
});

// ── ADMIN OVERLAY ──
// Skydda dashboard — kan aldrig öppnas utan isAdmin=true
function openDashboard(){
  if(!isAdmin){ return; }
  $('admin-login-screen').style.display='none';
  $('admin-dashboard').style.display='flex';
  loadAdminData();
}

$('admin-btn').addEventListener('click', openAdmin);
$('admin-close-dash').addEventListener('click', closeAdmin);
$('admin-overlay').addEventListener('click', e=>{ if(e.target===$('admin-overlay')) closeAdmin(); });

// ── LOGIN ──
$('admin-email').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
$('admin-password').addEventListener('keydown', e=>{ if(e.key==='Enter') doLogin(); });
$('login-btn').addEventListener('click', doLogin);

// ── SÄKERHET — Firebase Auth + Hårdnat inloggningsskydd ──
let isAdmin = false;

// Brute-force: exponentiell back-off — 1min, 2min, 4min, 8min...
const MAX_ATTEMPTS  = 5;
const BASE_LOCKOUT  = 60000; // 1 minut
let loginAttempts   = parseInt(sessionStorage.getItem('_la')||'0');
let lockoutUntil    = parseInt(sessionStorage.getItem('_lu')||'0');
let lockoutLevel    = parseInt(sessionStorage.getItem('_ll')||'0'); // hur många lockouts

// Rensa om lockout gått ut
if(Date.now() >= lockoutUntil && lockoutUntil > 0){
  sessionStorage.removeItem('_la');
  sessionStorage.removeItem('_lu');
  loginAttempts = 0;
  lockoutUntil  = 0;
  // Behåll _ll — nivån ökar vid varje lockout och nollställs bara vid lyckad inloggning
}

// Visa kvarvarande låstid om sidan laddas om under lockout
window.addEventListener('DOMContentLoaded', ()=>{
  if(Date.now() < lockoutUntil){
    const disp = $('login-error-msg');
    if(disp){
      disp.style.display='block';
      const iv = setInterval(()=>{
        const s = Math.ceil((lockoutUntil - Date.now())/1000);
        if(s <= 0){
          clearInterval(iv);
          disp.style.display='none';
          sessionStorage.removeItem('_lu');
          sessionStorage.removeItem('_la');
        } else {
          disp.textContent = `🔒 LÅST — ${s}s kvar`;
        }
      }, 1000);
    }
  }
});

// Session-fingerprint: logga ut om webbläsarens profil ändras under sessionen
// (skyddar mot session-hijacking om någon kopierar sessionStorage)
(function initSessionFingerprint(){
  const fp = [navigator.userAgent, navigator.language, screen.colorDepth].join('|');
  const stored = sessionStorage.getItem('_sfp');
  if(stored && stored !== fp){
    // Fingerprintet matchar inte — avsluta sessionen
    auth.signOut().catch(()=>{});
    sessionStorage.clear();
  } else if(!stored){
    sessionStorage.setItem('_sfp', fp);
  }
})();

// Auto-logga ut efter 60 minuter inaktivitet
let inactivityTimer = null;
const INACTIVITY_LIMIT = 60 * 60 * 1000; // 60 min

function resetInactivityTimer(){
  clearTimeout(inactivityTimer);
  if(!isAdmin) return;
  inactivityTimer = setTimeout(()=>{
    showToast('⏱ Automatiskt utloggad pga inaktivitet.');
    auth.signOut();
    closeAdmin();
  }, INACTIVITY_LIMIT);
}
['click','keydown','mousemove','touchstart'].forEach(ev =>
  document.addEventListener(ev, resetInactivityTimer, { passive:true })
);

async function doLogin(){
  const now = Date.now();

  // Kolla lockout
  if(now < lockoutUntil){
    const s = Math.ceil((lockoutUntil - now)/1000);
    showToast(`🔒 För många försök! Vänta ${s}s.`);
    return;
  }

  const email = $('admin-email').value.trim();
  const pw    = $('admin-password').value;
  if(!email || !pw){ showToast('⚠ Fyll i e-post och lösenord!'); return; }

  const btn = $('login-btn');
  btn.innerHTML='<span class="spinner"></span>LOGGAR IN...'; btn.disabled=true;

  try {
    await auth.signInWithEmailAndPassword(email, pw);
    // Lyckad inloggning — nollställ allt
    loginAttempts = 0;
    lockoutLevel  = 0;
    sessionStorage.removeItem('_la');
    sessionStorage.removeItem('_lu');
    sessionStorage.removeItem('_ll');
  } catch(e) {
    $('admin-password').value = '';
    loginAttempts++;
    sessionStorage.setItem('_la', loginAttempts);

    let msg = 'Fel e-post eller lösenord!';
    if(e.code === 'auth/too-many-requests')      msg = 'För många försök! Firebase har låst kontot temporärt.';
    if(e.code === 'auth/network-request-failed') msg = 'Nätverksfel — kontrollera anslutningen.';
    if(e.code === 'auth/invalid-credential')     msg = 'Fel e-post eller lösenord!';

    // Lokal brute-force back-off (ovanpå Firebases egna)
    if(loginAttempts >= MAX_ATTEMPTS){
      lockoutLevel++;
      const lockMs = BASE_LOCKOUT * Math.pow(2, lockoutLevel - 1); // 1min, 2min, 4min...
      lockoutUntil = Date.now() + lockMs;
      loginAttempts = 0;
      sessionStorage.setItem('_lu', lockoutUntil);
      sessionStorage.setItem('_ll', lockoutLevel);
      sessionStorage.setItem('_la', '0');
      msg = `🔒 ${MAX_ATTEMPTS} misslyckade försök — låst i ${Math.round(lockMs/60000)} min.`;

      // Visa nedräkning
      const disp = $('login-error-msg');
      if(disp){
        disp.style.display='block';
        const iv = setInterval(()=>{
          const s = Math.ceil((lockoutUntil - Date.now())/1000);
          if(s <= 0){ clearInterval(iv); disp.style.display='none'; }
          else disp.textContent = `🔒 LÅST — ${s}s kvar`;
        }, 1000);
      }
    } else {
      const left = MAX_ATTEMPTS - loginAttempts;
      msg += ` (${left} försök kvar)`;
    }

    const disp = $('login-error-msg');
    if(disp){ disp.style.display='block'; disp.textContent=`⚠ ${msg}`; }
    showToast(`❌ ${msg}`);
    btn.innerHTML='LOGGA IN'; btn.disabled=false;
  }
}

// Lyssna på auth-tillstånd
auth.onAuthStateChanged(user => {
  const btn = $('login-btn');
  if(btn){ btn.innerHTML='LOGGA IN'; btn.disabled=false; }
  if(user && $('admin-overlay').classList.contains('open')){
    isAdmin = true;
    resetInactivityTimer();
    openDashboard();
  } else if(!user){
    isAdmin = false;
    clearTimeout(inactivityTimer);
  }
});

function openAdmin(){
  $('admin-overlay').classList.add('open');
  $('admin-login-screen').style.display='flex';
  $('admin-dashboard').style.display='none';
}

function closeAdmin(){
  $('admin-overlay').classList.remove('open');
  isAdmin = false;
  auth.signOut();
}

$('logout-btn').addEventListener('click', async ()=>{
  await auth.signOut();
  closeAdmin();
  showToast('✅ Utloggad!');
});

// ── ADMIN NAV ──
const tabTitles = {
  registrations:'// ANMÄLDA DELTAGARE',
  'bookings-admin':'// BORDSBOKNING',
  tournaments:'// TURNERINGAR',
  tickets:'// BILJETTER',
  schedule:'// SCHEMA',
  settings:'// INSTÄLLNINGAR',
  webhooks:'// DISCORD WEBHOOKS',
  security:'// 🛡 SÄKERHET',
  'seatmap-editor':'// 🗺 PLATSKARTA'
};

// ── SEATMAP EDITOR ──
let currentSeatType = 'player'; // 'player' eller 'crew'

window.setSeatType = function(type){
  currentSeatType = type;
  const pb = $('type-btn-player'), cb = $('type-btn-crew');
  if(type === 'player'){
    pb.style.border='2px solid var(--cyan)'; pb.style.background='rgba(0,238,255,0.15)'; pb.style.color='var(--cyan)';
    cb.style.border='1px solid var(--border)'; cb.style.background='transparent'; cb.style.color='var(--text-dim)';
    // Auto-sätt ID-prefix till S
    const inp = $('next-seat-id');
    if(inp && inp.value.startsWith('C')) autoIncrementSeatId();
  } else {
    cb.style.border='2px solid #f5a623'; cb.style.background='rgba(245,166,35,0.15)'; cb.style.color='#f5a623';
    pb.style.border='1px solid var(--border)'; pb.style.background='transparent'; pb.style.color='var(--text-dim)';
    // Auto-sätt ID-prefix till C för crew
    const inp = $('next-seat-id');
    if(inp && !inp.value.startsWith('C')){
      const crewCount = seatLayout.filter(s=>s.type==='crew').length;
      inp.value = 'C'+String(crewCount+1).padStart(2,'0');
    }
  }
};

function initSeatmapEditor(){
  const wrap = $('admin-floorplan-wrap');
  if(!wrap || wrap.dataset.init) return;
  wrap.dataset.init = '1';

  let isDragging = false;
  let lastPlacedX = -999, lastPlacedY = -999;
  const MIN_DIST = 5; // % avstånd mellan platser

  // Förhandsvisnings-cursor
  const preview = document.createElement('div');
  preview.style.cssText = `position:absolute;pointer-events:none;z-index:10;
    transform:translate(-50%,-50%);opacity:0.6;transition:opacity 0.1s;
    border-radius:3px;display:flex;align-items:center;justify-content:center;
    font-family:'Orbitron',monospace;font-size:0.38rem;font-weight:700;color:#fff;`;
  wrap.appendChild(preview);

  function updatePreviewStyle(){
    if(currentSeatType === 'crew'){
      preview.style.width='42px'; preview.style.height='28px';
      preview.style.background='rgba(245,166,35,0.3)';
      preview.style.border='2px dashed #f5a623';
      preview.style.color='#f5a623';
      preview.textContent='CREW';
    } else {
      const id = ($('next-seat-id')?.value||'S?').replace(/^S/,'');
      preview.style.width='44px'; preview.style.height='30px';
      preview.style.background='rgba(0,238,255,0.15)';
      preview.style.border='2px dashed var(--cyan)';
      preview.style.color='#fff';
      preview.textContent=id;
    }
  }
  updatePreviewStyle();

  // Uppdatera preview när typ eller ID ändras
  const nextIdInp = $('next-seat-id');
  if(nextIdInp) nextIdInp.addEventListener('input', updatePreviewStyle);

  function getXY(e){
    const rect = wrap.getBoundingClientRect();
    const img  = $('admin-floorplan-img');
    return {
      x: parseFloat(((e.clientX - rect.left) / img.offsetWidth  * 100).toFixed(2)),
      y: parseFloat(((e.clientY - rect.top)  / img.offsetHeight * 100).toFixed(2)),
    };
  }

  function tryPlaceSeat(e){
    const {x, y} = getXY(e);
    const dist = Math.sqrt(Math.pow(x-lastPlacedX,2) + Math.pow(y-lastPlacedY,2));
    if(dist < MIN_DIST) return;
    const tooClose = seatLayout.some(s => Math.sqrt(Math.pow(s.x-x,2)+Math.pow(s.y-y,2)) < MIN_DIST);
    if(tooClose) return;
    const id = $('next-seat-id').value.trim() || (currentSeatType==='crew'?'C01':'S01');
    if(seatLayout.find(s=>s.id===id)) return;
    seatLayout.push({id, x, y, type: currentSeatType});
    lastPlacedX = x; lastPlacedY = y;
    autoIncrementSeatId();
    updatePreviewStyle();
    renderAdminSeatmap();
  }

  // Rör musen — flytta preview
  wrap.addEventListener('mousemove', function(e){
    const {x, y} = getXY(e);
    preview.style.left = x + '%';
    preview.style.top  = y + '%';
    preview.style.opacity = '0.65';
    if(isDragging) tryPlaceSeat(e);
  });

  wrap.addEventListener('mouseleave', ()=>{ preview.style.opacity='0'; });

  wrap.addEventListener('mousedown', function(e){
    if(e.button !== 0) return;
    if(e.target.closest('.admin-seat-dot')) return;
    isDragging = true;
    lastPlacedX = -999; lastPlacedY = -999;
    tryPlaceSeat(e);
    e.preventDefault();
  });

  window.addEventListener('mouseup', function(){
    if(!isDragging) return;
    isDragging = false;
    renderSeats();
  });

  // Högerklick = ta bort
  wrap.addEventListener('contextmenu', function(e){
    e.preventDefault();
    const dot = e.target.closest('.admin-seat-dot');
    if(!dot) return;
    seatLayout = seatLayout.filter(s=>s.id!==dot.dataset.id);
    renderAdminSeatmap();
    renderSeats();
    showToast('🗑 ' + dot.dataset.id + ' borttagen');
  });

  // Enkelt klick utan drag = placera en plats
  wrap.addEventListener('click', function(e){
    if(e.target.closest('.admin-seat-dot')) return;
    tryPlaceSeat(e);
    lastPlacedX = -999; lastPlacedY = -999; // reset så nästa klick alltid funkar
    renderSeats();
  });
}

function autoIncrementSeatId(){
  const existing = new Set(seatLayout.map(s=>s.id));
  const prefix = currentSeatType==='crew' ? 'C' : 'S';
  const relevantSeats = seatLayout.filter(s=>(s.type||'player')===currentSeatType);
  let n = relevantSeats.length + 1;
  while(existing.has(prefix+String(n).padStart(2,'0'))) n++;
  const inp = $('next-seat-id');
  if(inp) inp.value = prefix+String(n).padStart(2,'0');
}

window.clearAllSeats = function(){
  if(!confirm('Rensa alla platser?')) return;
  seatLayout = [];
  renderAdminSeatmap();
  renderSeats();
};

async function saveSeatLayout(){
  try{
    await db.collection('config').doc('settings').set({seatLayout}, {merge:true});
    const players = seatLayout.filter(s=>(s.type||'player')==='player').length;
    const crew = seatLayout.filter(s=>s.type==='crew').length;
    showToast(`✅ Sparat! ${players} spelarplatser + ${crew} crew-platser.`);
    renderSeats();
  }catch(e){ showToast('❌ '+e.message); }
}

function renderAdminSeatmap(){
  const markers = $('admin-seat-markers');
  const list = $('seat-list-admin');
  const counter = $('seat-count-display');
  if(!markers) return;
  const players = seatLayout.filter(s=>(s.type||'player')==='player').length;
  const crew = seatLayout.filter(s=>s.type==='crew').length;
  if(counter) counter.textContent = `${players} spelare + ${crew} crew`;

  markers.innerHTML = seatLayout.map(seat => {
    const isCrew = seat.type === 'crew';
    const booked = bookedSeats[seat.id];
    const label = seat.id.replace(/^[SC]/,'');

    if(isCrew){
      return `<div class="admin-seat-dot" data-id="${esc(seat.id)}"
        title="${esc(seat.id)} — CREW · högerklicka för att ta bort"
        style="position:absolute;left:${seat.x}%;top:${seat.y}%;
               transform:translate(-50%,-50%);
               width:42px;height:28px;border-radius:3px;
               background:rgba(245,166,35,0.3);border:2px solid #f5a623;
               display:flex;align-items:center;justify-content:center;
               font-family:'Orbitron',monospace;font-size:0.38rem;font-weight:700;
               color:#f5a623;letter-spacing:1px;
               cursor:context-menu;pointer-events:all;
               box-shadow:0 0 8px rgba(245,166,35,0.4);">
        CREW
      </div>`;
    }

    const color = booked ? 'var(--red)' : 'var(--green)';
    const bg    = booked ? 'rgba(255,48,96,0.4)' : 'rgba(0,255,170,0.25)';
    return `<div class="admin-seat-dot" data-id="${esc(seat.id)}"
      title="${esc(seat.id)}${booked?' — BOKAD':''} · högerklicka för att ta bort"
      style="position:absolute;left:${seat.x}%;top:${seat.y}%;
             transform:translate(-50%,-50%);
             width:44px;height:30px;border-radius:3px;
             background:${bg};border:2px solid ${color};
             display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;
             font-family:'Orbitron',monospace;font-size:0.42rem;font-weight:700;color:#fff;
             cursor:context-menu;pointer-events:all;
             box-shadow:0 0 6px ${color};">
      <div style="line-height:1;">${label}</div>
      ${booked?'<div style="font-size:0.3rem;color:rgba(255,120,120,0.9);">BOKAD</div>':''}
    </div>`;
  }).join('');

  if(list){
    const playerSeats = seatLayout.filter(s=>(s.type||'player')==='player');
    const crewSeats   = seatLayout.filter(s=>s.type==='crew');
    list.innerHTML = [
      playerSeats.length ? `<div style="width:100%;font-family:'Orbitron',monospace;font-size:0.55rem;color:var(--cyan);letter-spacing:2px;margin-bottom:4px;">🎮 SPELARE</div>` : '',
      ...playerSeats.map(s=>`<div style="background:var(--bg2);border:1px solid rgba(0,238,255,0.2);padding:4px 10px;font-family:'Orbitron',monospace;font-size:0.6rem;color:var(--text-dim);display:flex;align-items:center;gap:6px;">${esc(s.id)}<span style="color:var(--red);cursor:pointer;" onclick="removeSeat('${esc(s.id)}')">✕</span></div>`),
      crewSeats.length ? `<div style="width:100%;font-family:'Orbitron',monospace;font-size:0.55rem;color:#f5a623;letter-spacing:2px;margin:8px 0 4px;">👷 CREW</div>` : '',
      ...crewSeats.map(s=>`<div style="background:var(--bg2);border:1px solid rgba(245,166,35,0.2);padding:4px 10px;font-family:'Orbitron',monospace;font-size:0.6rem;color:#f5a623;display:flex;align-items:center;gap:6px;">${esc(s.id)}<span style="color:var(--red);cursor:pointer;" onclick="removeSeat('${esc(s.id)}')">✕</span></div>`),
    ].join('') || '<span style="color:var(--text-dim);font-size:0.85rem;">Inga platser placerade ännu.</span>';
  }
}

window.removeSeat = function(id){
  seatLayout = seatLayout.filter(s=>s.id!==id);
  renderAdminSeatmap();
  renderSeats();
};

// ── SÄKERHET — JS-FUNKTIONER ──

// Kontrollera Firestore-regler — försök skriva utan auth (ska blockeras)
async function checkSecurityStatus(){
  const rulesCard = $('sec-rules-card');
  const rulesStatus = rulesCard ? rulesCard.querySelector('.stat-card-value') : null;
  try{
    await db.collection('registrations').add({ _sectest: true });
    // Om vi kom hit är reglerna INTE aktiva — dåligt!
    if(rulesCard) rulesCard.style.borderColor='rgba(255,48,96,0.3)';
    if(rulesStatus){ rulesStatus.textContent='⚠ ÖPPNA'; rulesStatus.style.color='var(--red)'; }
  } catch(e){
    if(e.code === 'permission-denied'){
      // Reglerna blockerar oautentiserade skrivningar — rätt!
      if(rulesCard) rulesCard.style.borderColor='rgba(0,255,170,0.3)';
      if(rulesStatus){ rulesStatus.textContent='✅ AKTIVA'; rulesStatus.style.color='var(--green)'; }
    }
  }
}

// Byt lösenord via Firebase Auth — inget lösenord lagras i källkoden
async function changeAdminPassword(){
  const pw = $('new-admin-pw').value;
  const pw2 = $('confirm-admin-pw').value;
  const result = $('pw-change-result');
  if(!pw || pw.length < 8){ result.textContent='⚠ Lösenordet måste vara minst 8 tecken.'; result.style.color='orange'; return; }
  if(pw !== pw2){ result.textContent='⚠ Lösenorden matchar inte!'; result.style.color='orange'; return; }
  try{
    const user = auth.currentUser;
    if(!user){ result.textContent='⚠ Inte inloggad!'; result.style.color='var(--red)'; return; }
    await user.updatePassword(pw);
    $('new-admin-pw').value=''; $('confirm-admin-pw').value='';
    result.textContent='✅ Nytt lösenord sparat i Firebase Authentication!'; result.style.color='var(--green)';
  }catch(e){
    if(e.code === 'auth/requires-recent-login'){
      result.textContent='⚠ Logga ut och in igen för att byta lösenord (säkerhetskrav).'; result.style.color='orange';
    } else {
      result.textContent='❌ Fel: '+e.message; result.style.color='var(--red)';
    }
  }
}

function copyFirestoreRules(){
  const code = $('firestore-rules-code');
  const btn = $('copy-rules-btn');
  if(!code) return;
  navigator.clipboard.writeText(code.textContent).then(()=>{
    btn.textContent='✅ KOPIERAT!';
    setTimeout(()=>{ btn.textContent='📋 KOPIERA'; }, 2000);
  });
}
document.querySelectorAll('.admin-nav-item').forEach(item=>{
  item.addEventListener('click',()=>{
    const tab = item.dataset.tab;
    document.querySelectorAll('.admin-nav-item').forEach(i=>i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.admin-section').forEach(s=>s.classList.remove('active'));
    const sec = $('tab-'+tab);
    if(sec) sec.classList.add('active');
    const title = $('admin-topbar-title');
    if(title) title.textContent = tabTitles[tab]||'';
    if(tab==='bookings-admin') renderBookingsAdminTable();
    if(tab==='security') checkSecurityStatus();
    if(tab==='seatmap-editor'){ initSeatmapEditor(); renderAdminSeatmap(); }
  });
});

// Admin clock
function updateClock(){ const el=$('admin-clock'); if(el) el.textContent=new Date().toLocaleTimeString('sv-SE'); }
setInterval(updateClock,1000); updateClock();

// Bookings admin table
function renderBookingsAdminTable(){
  const tbody = $('bookings-admin-body');
  if(!tbody) return;
  const total = parseInt(siteSettings.seats)||30;
  const booked = Object.keys(bookedSeats);
  $('stat-booked').textContent = booked.length;
  $('stat-free').textContent = total - booked.length;
  if(booked.length===0){ tbody.innerHTML='<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:30px;">Inga bokningar ännu.</td></tr>'; return; }
  tbody.innerHTML = booked.sort().map(id=>{
    const b = bookedSeats[id];
    const time = b.createdAt ? new Date(b.createdAt.toDate()).toLocaleString('sv-SE') : '—';
    return `<tr><td><strong style="color:var(--purple-bright)">${esc(id)}</strong></td><td style="color:var(--text)">${esc(b.name)||'—'}</td><td>${esc(b.discord)||'—'}</td><td>${time}</td><td><button onclick="adminDeleteBooking('${esc(id)}')" class="admin-delete-btn">✕</button></td></tr>`;
  }).join('');
}
window.adminDeleteBooking = async function(id){
  try{
    await db.collection('bookings').doc(id).delete();
    delete bookedSeats[id];
    renderSeats();
    renderBookingsAdminTable();
    showToast('🗑 Bokning '+id+' borttagen!');
  }catch(e){ showToast('❌ '+e.message); }
};

// ── LOAD ADMIN DATA ──
async function loadAdminData(){
  try{
    const snap=await db.collection('registrations').orderBy('createdAt','desc').get();
    const tN={cs2:'CS2',lol:'LoL',fortnite:'Fortnite',rocket:'Rocket League',casual:'Casual'};
    $('stat-total').textContent=snap.size;
    const swishPaid = snap.docs.filter(d=>d.data().payment==='swish'&&d.data().paid);
    $('stat-paid').textContent=snap.docs.filter(d=>d.data().payment==='swish').length;
    $('stat-cash').textContent=snap.docs.filter(d=>d.data().payment==='cash').length;
    const revenue = swishPaid.reduce((sum, d) => {
      const price = parseInt(String(d.data().ticketPrice).replace(/\D/g,'')) || 150;
      return sum + price;
    }, 0);
    if($('stat-revenue')) $('stat-revenue').textContent=revenue+' kr';
    $('registrations-body').innerHTML=snap.size===0
      ?'<tr><td colspan="8" style="text-align:center;color:var(--text-dim);padding:30px;">Inga anmälningar ännu</td></tr>'
      :snap.docs.map((d,i)=>{
        const r=d.data(); const docId=d.id;
        const safeName=esc(r.name); const safeDiscord=esc(r.discord); const safeTeam=esc(r.team);
        const safeTournament=esc(tN[r.tournament]||r.tournament);
        const paidBadge=r.paid
          ?'<span class="badge-paid">✅ BETALD</span>'
          :`<button onclick="markPaid('${esc(docId)}','${safeName}','${safeDiscord}')" style="background:transparent;border:1px solid var(--green);color:var(--green);padding:4px 10px;font-size:0.7rem;font-family:'Orbitron',monospace;cursor:pointer;letter-spacing:1px;">MARKERA BETALD</button>`;
        return `<tr><td>${i+1}</td><td>${safeName}</td><td>${safeDiscord}</td><td>${safeTournament}</td><td>${safeTeam||'–'}</td><td>${r.payment==='swish'?'<span class="badge-paid">SWISH</span>':'<span class="badge-cash">PÅ PLATS</span>'}</td><td>${paidBadge}</td><td style="font-size:0.8rem;">${r.createdAt?.toDate?r.createdAt.toDate().toLocaleString('sv-SE'):'–'}</td><td><button onclick="deleteReg('${esc(docId)}','${safeName}')" style="background:transparent;border:1px solid var(--red);color:var(--red);width:32px;height:32px;font-size:1rem;cursor:pointer;">✕</button></td></tr>`;
      }).join('');
  }catch(e){ console.error('loadRegs:',e); }
  $('setting-date').value=siteSettings.date;
  $('setting-swish').value=siteSettings.swish;
  $('setting-discord-link').value=siteSettings.discordLink;
  $('setting-email').value=siteSettings.email;
  $('setting-location').value=siteSettings.location;
  $('setting-countdown').value=siteSettings.countdownDate||'2026-04-09';
  $('setting-seats').value=siteSettings.seats||30;
  $('webhook1-url').value=webhooks.url1;
  $('webhook2-url').value=webhooks.url2;
  $('webhook3-url').value=webhooks.url3||'';
  renderAdminTournaments();
  renderAdminTickets();
  loadScheduleEditor();
}

// ── RADERA ANMÄLAN ──
window.deleteReg = async function(docId, name){
  try{
    await db.collection('registrations').doc(docId).delete();
    showToast('🗑 '+name+' borttagen!');
    loadAdminData();
  }catch(e){ showToast('❌ Kunde inte ta bort!'); console.error(e); }
};
window.markPaid = async function(docId, name, discord){
  try{
    await db.collection('registrations').doc(docId).update({paid:true});
    showToast('✅ '+name+' markerad som betald!');
    if(webhooks.url3) await sendWebhook(webhooks.url3,{embeds:[{title:'✅ Betalning Bekräftad — Reboot LAN',color:0x00ffaa,fields:[{name:'Namn',value:name,inline:true},{name:'Discord',value:discord,inline:true},{name:'Status',value:'✅ Betalning verifierad av admin',inline:false}],timestamp:new Date().toISOString()}]});
    loadAdminData();
  }catch(e){ showToast('❌ Kunde inte uppdatera!'); console.error(e); }
};

// ── SCHEDULE EDITOR ──
function loadScheduleEditor(){
  const rows=scheduleDays[adminDay]||[];
  $('schedule-editor').innerHTML=rows.map((r,i)=>`
    <div class="schedule-row-admin">
      <input type="text" value="${r.time}" id="s-time-${i}" placeholder="TID">
      <input type="text" value="${r.event}" id="s-event-${i}" placeholder="Aktivitet">
      <input type="text" value="${r.info}" id="s-info-${i}" placeholder="Info/Plats">
      <button class="delete-row-btn" data-idx="${i}">✕</button>
    </div>`).join('')||'<p style="color:var(--text-dim);padding:10px 0;">Inga rader ännu.</p>';
  // Bind delete buttons
  document.querySelectorAll('.delete-row-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{ scheduleDays[adminDay].splice(parseInt(btn.dataset.idx),1); loadScheduleEditor(); });
  });
}

function saveCurrentEditorState(){
  const count=document.querySelectorAll('[id^="s-time-"]').length;
  scheduleDays[adminDay]=Array.from({length:count},(_,i)=>({
    time:$(`s-time-${i}`).value,
    event:$(`s-event-${i}`).value,
    info:$(`s-info-${i}`).value
  }));
}

document.querySelectorAll('#admin-day-tabs .day-tab').forEach(btn=>{
  btn.addEventListener('click',()=>{
    saveCurrentEditorState();
    adminDay=parseInt(btn.dataset.day);
    document.querySelectorAll('#admin-day-tabs .day-tab').forEach((b,i)=>b.classList.toggle('active',i===adminDay));
    loadScheduleEditor();
  });
});

$('add-row-btn').addEventListener('click',()=>{
  scheduleDays[adminDay].push({time:'00:00',event:'Ny aktivitet',info:''});
  loadScheduleEditor();
});

$('save-schedule-btn').addEventListener('click', async()=>{
  saveCurrentEditorState();
  await saveAllSettings();
  renderPublicSchedule();
  showToast('✅ Alla 3 dagars schema sparat!');
});

// ── SETTINGS ──
$('save-settings-btn').addEventListener('click', async()=>{
  siteSettings={
    date:$('setting-date').value,
    swish:$('setting-swish').value,
    discordLink:$('setting-discord-link').value,
    email:$('setting-email').value,
    location:$('setting-location').value,
    countdownDate:$('setting-countdown').value||'2026-04-09',
    seats:parseInt($('setting-seats').value)||30
  };
  await saveAllSettings();
  applySettings();
  showToast('✅ Inställningar sparade!');
});

// ── WEBHOOKS ──
$('save-wh1-btn').addEventListener('click', async()=>{ webhooks.url1=$('webhook1-url').value; await saveAllSettings(); showToast('✅ Webhook 1 sparad!'); });
$('save-wh2-btn').addEventListener('click', async()=>{ webhooks.url2=$('webhook2-url').value; await saveAllSettings(); showToast('✅ Webhook 2 sparad!'); });
$('save-wh3-btn').addEventListener('click', async()=>{ webhooks.url3=$('webhook3-url').value; await saveAllSettings(); showToast('✅ Webhook 3 sparad!'); });
$('test-wh1-btn').addEventListener('click', async()=>{ if(!webhooks.url1){showToast('⚠ Ange URL först!');return;} await sendWebhook(webhooks.url1,{embeds:[{title:'🔧 Test Webhook 1 — Reboot LAN',description:'Fungerar! ✅',color:0x9b30ff}]}); showToast('✅ Test skickat!'); });
$('test-wh2-btn').addEventListener('click', async()=>{ if(!webhooks.url2){showToast('⚠ Ange URL först!');return;} await sendWebhook(webhooks.url2,{embeds:[{title:'🔧 Test Webhook 2 — Reboot LAN',description:'Fungerar! ✅',color:0x9b30ff}]}); showToast('✅ Test skickat!'); });
$('test-wh3-btn').addEventListener('click', async()=>{ if(!webhooks.url3){showToast('⚠ Ange URL först!');return;} await sendWebhook(webhooks.url3,{embeds:[{title:'🔧 Test Webhook 3 — Reboot LAN',description:'Betalning bekräftad webhook fungerar! ✅',color:0x00ffaa}]}); showToast('✅ Test skickat!'); });

async function saveAllSettings(){
  try{
    const scheduleObj={day0:scheduleDays[0],day1:scheduleDays[1],day2:scheduleDays[2]};
    const data = {...siteSettings, scheduleObj, tournaments, tickets, seatLayout, webhook1:webhooks.url1, webhook2:webhooks.url2, webhook3:webhooks.url3||''};
    console.log('Sparar till Firebase:', data);
    await db.collection('config').doc('settings').set(data);
    console.log('✅ Sparat!');
  }catch(e){
    console.error('❌ Firebase fel:', e);
    showToast('❌ Firebase fel: '+e.message);
  }
}

// ── QR KOD & SWISH-LÄNK ──
// updateSwishQR definieras ovan — anropas vid inladdning av inställningar

// ── INIT ──
loadSettings();

// ══════════════════════════════════════════
// KIOSK / KASSASYSTEM
// ══════════════════════════════════════════
let kioskCart = [];
let kioskDiscount = 0;
let kioskDiscountType = 'kr';
let kNumpadVal = '';
let kioskActiveCategory = 'Alla';
let kioskHistory = JSON.parse(localStorage.getItem('kiosk-history')||'[]');
let kioskProducts = JSON.parse(localStorage.getItem('kiosk-products')||'null') || [
  {id:1,name:'Monster Energy',price:25,emoji:'🥤',category:'Dryck',stock:null},
  {id:2,name:'Red Bull',price:25,emoji:'🐂',category:'Dryck',stock:null},
  {id:3,name:'Coca-Cola',price:20,emoji:'🥫',category:'Dryck',stock:null},
  {id:4,name:'Vatten',price:10,emoji:'💧',category:'Dryck',stock:null},
  {id:5,name:'Chips',price:20,emoji:'🥔',category:'Godis',stock:null},
  {id:6,name:'Snickers',price:15,emoji:'🍫',category:'Godis',stock:null},
  {id:7,name:'Haribo',price:20,emoji:'🐻',category:'Godis',stock:null},
  {id:8,name:'Korv',price:30,emoji:'🌭',category:'Mat',stock:null},
  {id:9,name:'Smörgås',price:25,emoji:'🥪',category:'Mat',stock:null},
  {id:10,name:'Reboot T-shirt',price:150,emoji:'👕',category:'Merch',stock:20},
  {id:11,name:'Reboot Hoodie',price:299,emoji:'🧥',category:'Merch',stock:10},
];

// ── KIOSK LOCKSCREEN ──
// PIN är hashad med SHA-256 + salt — klartext syns inte i koden
// Standard PIN: 9876 — ändra genom att räkna om hash
const KIOSK_PIN_HASH = '968cbcf76896a555d02af89e6ec2f9e095c5eba818ee1f76a3784ac7279647f5';
const KIOSK_PIN_SALT = 'reboot-kiosk-x91z';
let kioskPinInput = '';
let kioskPinAttempts = 0;
let kioskPinLockedUntil = 0;
const KIOSK_MAX_ATTEMPTS = 5;
const KIOSK_LOCKOUT_MS = 30000;

function openKioskFullscreen(){
  // Stäng adminpanelen
  document.getElementById('admin-overlay').classList.remove('open');
  // Visa kiosk-overlay
  const ov = document.getElementById('kiosk-fullscreen-overlay');
  ov.style.display = 'flex';
  // Begär fullscreen (F11-läge)
  const el = document.documentElement;
  if(el.requestFullscreen) el.requestFullscreen();
  else if(el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  else if(el.mozRequestFullScreen) el.mozRequestFullScreen();
  // Visa lockscreen, dölj appen
  kioskLock();
}

function closeKioskFullscreen(){
  document.getElementById('kiosk-fullscreen-overlay').style.display = 'none';
  // Lämna fullscreen
  if(document.exitFullscreen) document.exitFullscreen();
  else if(document.webkitExitFullscreen) document.webkitExitFullscreen();
  else if(document.mozCancelFullScreen) document.mozCancelFullScreen();
}

// Om användaren trycker Escape ur fullscreen → lås kiosken
document.addEventListener('fullscreenchange', ()=>{
  const ov = document.getElementById('kiosk-fullscreen-overlay');
  if(!document.fullscreenElement && ov && ov.style.display !== 'none'){
    kioskLock();
  }
});

function kioskLock(){
  kioskPinInput = '';
  kioskUpdatePinDots();
  const ls = document.getElementById('kiosk-lockscreen');
  const app = document.getElementById('kiosk-app');
  if(ls) ls.style.display = 'flex';
  if(app) app.style.display = 'none';
  const err = document.getElementById('kiosk-pin-error');
  if(err) err.textContent = '';
}

function kioskUnlockFree(){
  const ls = document.getElementById('kiosk-lockscreen');
  const app = document.getElementById('kiosk-app');
  if(ls) ls.style.display = 'none';
  if(app) app.style.display = 'flex';
  kioskRenderCategories(); kioskRenderProducts(); kioskRenderCart();
}

function kioskPinPress(val){
  if(val==='⌫'){ kioskPinInput=kioskPinInput.slice(0,-1); }
  else { if(kioskPinInput.length>=4) return; kioskPinInput+=val; }
  kioskUpdatePinDots();
  document.getElementById('kiosk-pin-error').textContent='';
  if(kioskPinInput.length===4) kioskCheckPin();
}

function kioskUpdatePinDots(){
  const dots=document.querySelectorAll('#kiosk-pin-dots .pin-dot');
  dots.forEach((d,i)=>d.classList.toggle('filled',i<kioskPinInput.length));
}

async function kioskCheckPin(){
  // Kolla lockout
  if(Date.now() < kioskPinLockedUntil){
    const s = Math.ceil((kioskPinLockedUntil - Date.now())/1000);
    document.getElementById('kiosk-pin-error').textContent = `🔒 LÅST ${s}s`;
    kioskPinInput=''; kioskUpdatePinDots(); return;
  }
  // Hash PIN + salt
  const msgBuf = new TextEncoder().encode(kioskPinInput + KIOSK_PIN_SALT);
  const h1 = await crypto.subtle.digest('SHA-256', msgBuf);
  const h2 = await crypto.subtle.digest('SHA-256', h1);
  const hex = Array.from(new Uint8Array(h2)).map(b=>b.toString(16).padStart(2,'0')).join('');
  // Timing-safe compare
  let diff = hex.length === KIOSK_PIN_HASH.length ? 0 : 1;
  for(let i=0;i<Math.max(hex.length,KIOSK_PIN_HASH.length);i++) diff |= (hex.charCodeAt(i)||0)^(KIOSK_PIN_HASH.charCodeAt(i)||0);
  if(diff === 0){
    kioskPinAttempts = 0;
    const ls = document.getElementById('kiosk-lockscreen');
    const app = document.getElementById('kiosk-app');
    if(ls) ls.style.display = 'none';
    if(app) app.style.display = 'flex';
    kioskRenderCategories(); kioskRenderProducts(); kioskRenderCart();
    kioskPinInput=''; kioskUpdatePinDots();
  } else {
    kioskPinAttempts++;
    kioskPinInput=''; kioskUpdatePinDots();
    if(kioskPinAttempts >= KIOSK_MAX_ATTEMPTS){
      kioskPinLockedUntil = Date.now() + KIOSK_LOCKOUT_MS;
      kioskPinAttempts = 0;
      document.getElementById('kiosk-pin-error').textContent = '🔒 FÖR MÅNGA FÖRSÖK — LÅST 30s';
      const interval = setInterval(()=>{
        const s=Math.ceil((kioskPinLockedUntil-Date.now())/1000);
        const el=document.getElementById('kiosk-pin-error');
        if(!el||s<=0){ clearInterval(interval); if(el) el.textContent=''; return; }
        el.textContent=`🔒 LÅST ${s}s`;
      },1000);
    } else {
      const left = KIOSK_MAX_ATTEMPTS - kioskPinAttempts;
      document.getElementById('kiosk-pin-error').textContent=`❌ FEL PIN — ${left} försök kvar`;
      const dots=document.getElementById('kiosk-pin-dots');
      dots.style.animation='shake 0.4s ease';
      setTimeout(()=>dots.style.animation='',450);
    }
  }
}

// Kiosk clock
setInterval(()=>{
  const el=document.getElementById('kiosk-clock');
  if(el){const n=new Date();el.textContent=[n.getHours(),n.getMinutes(),n.getSeconds()].map(x=>String(x).padStart(2,'0')).join(':');}
},1000);

function kioskToast(msg){ showToast(msg); }

function kioskGetCategories(){ return ['Alla',...new Set(kioskProducts.map(p=>p.category))]; }

function kioskRenderCategories(){
  const bar=document.getElementById('kiosk-cat-bar');
  if(!bar) return;
  bar.innerHTML=kioskGetCategories().map(c=>`
    <button onclick="kioskSetCategory('${c}')" style="padding:10px 18px;background:transparent;border:none;border-bottom:3px solid ${kioskActiveCategory===c?'var(--purple)':'transparent'};color:${kioskActiveCategory===c?'var(--purple-bright)':'var(--text-dim)'};font-family:'Orbitron',monospace;font-size:0.55rem;letter-spacing:3px;cursor:pointer;white-space:nowrap;flex-shrink:0;">${c}</button>
  `).join('');
}

function kioskSetCategory(c){ kioskActiveCategory=c; kioskRenderCategories(); kioskRenderProducts(); }

function kioskRenderProducts(){
  const grid=document.getElementById('kiosk-grid');
  if(!grid) return;
  const search=(document.getElementById('kiosk-search')||{}).value||'';
  const filtered=kioskProducts.filter(p=>{
    const matchCat=kioskActiveCategory==='Alla'||p.category===kioskActiveCategory;
    const matchSearch=p.name.toLowerCase().includes(search.toLowerCase());
    return matchCat&&matchSearch;
  });
  grid.innerHTML=filtered.map(p=>{
    const out=p.stock!==null&&p.stock<=0;
    return `<div onclick="${out?'':'kioskAddToCart('+p.id+')'}" style="background:#0a0a18;border:1px solid ${out?'rgba(255,48,96,0.2)':'var(--border)'};padding:12px 10px;cursor:${out?'not-allowed':'pointer'};opacity:${out?0.4:1};transition:all 0.15s;display:flex;flex-direction:column;gap:6px;" onmouseover="this.style.borderColor='${out?'rgba(255,48,96,0.2)':'var(--purple)'}'" onmouseout="this.style.borderColor='${out?'rgba(255,48,96,0.2)':'var(--border)'}'">
      <div style="font-size:1.8rem;line-height:1;">${esc(p.emoji)}</div>
      <div style="font-weight:700;font-size:0.9rem;color:var(--text);line-height:1.2;">${esc(p.name)}</div>
      <div style="font-family:'Share Tech Mono',monospace;font-size:0.9rem;color:var(--cyan);">${esc(String(p.price))} kr</div>
      ${p.stock!==null?`<div style="font-size:0.7rem;color:${out?'var(--red)':'var(--text-dim)'};">${out?'SLUT':esc(String(p.stock))+' kvar'}</div>`:''}
    </div>`;
  }).join('');
}

function kioskFilter(){ kioskRenderProducts(); }

function kioskAddToCart(id){
  const p=kioskProducts.find(x=>x.id===id);
  if(!p) return;
  const ex=kioskCart.find(x=>x.id===id);
  if(ex){ ex.qty++; } else { kioskCart.push({...p,qty:1}); }
  if(p.stock!==null) p.stock--;
  kioskRenderCart();
  kioskRenderProducts();
  kioskToast('✅ '+p.name);
}

function kioskChangeQty(id,delta){
  const item=kioskCart.find(x=>x.id===id);
  if(!item) return;
  item.qty+=delta;
  const p=kioskProducts.find(x=>x.id===id);
  if(p&&p.stock!==null) p.stock-=delta;
  if(item.qty<=0) kioskCart=kioskCart.filter(x=>x.id!==id);
  kioskRenderCart();
  kioskRenderProducts();
}

function kioskRenderCart(){
  const container=document.getElementById('kiosk-cart-items');
  const empty=document.getElementById('kiosk-empty');
  if(!container) return;
  const totalItems=kioskCart.reduce((s,x)=>s+x.qty,0);
  document.getElementById('kiosk-cart-count').textContent=totalItems+' st';
  if(!kioskCart.length){
    container.innerHTML=`<div id="kiosk-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-dim);gap:10px;"><div style="font-size:2rem;opacity:0.3;">🛒</div><div style="font-family:'Orbitron',monospace;font-size:0.6rem;letter-spacing:3px;">TOM</div></div>`;
    kioskUpdateTotals(); return;
  }
  container.innerHTML=kioskCart.map(item=>`
    <div style="display:grid;grid-template-columns:1fr auto;gap:6px;padding:10px 0;border-bottom:1px solid rgba(155,48,255,0.08);align-items:center;">
      <div>
        <div style="font-weight:600;font-size:0.9rem;">${esc(item.emoji)} ${esc(item.name)}</div>
        <div style="font-size:0.8rem;color:var(--text-dim);">${esc(String(item.price))} kr/st</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
        <div style="font-family:'Share Tech Mono',monospace;font-size:0.9rem;color:var(--cyan);">${item.price*item.qty} kr</div>
        <div style="display:flex;align-items:center;gap:4px;">
          <button onclick="kioskChangeQty(${item.id},-1)" style="width:26px;height:26px;background:#0d0d1a;border:1px solid var(--border);color:var(--red);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">−</button>
          <span style="font-family:'Share Tech Mono',monospace;font-size:0.9rem;min-width:20px;text-align:center;">${item.qty}</span>
          <button onclick="kioskChangeQty(${item.id},1)" style="width:26px;height:26px;background:#0d0d1a;border:1px solid var(--border);color:var(--purple-bright);cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;">+</button>
        </div>
      </div>
    </div>
  `).join('');
  kioskUpdateTotals();
}

function kioskGetTotal(){
  const sub=kioskCart.reduce((s,x)=>s+x.price*x.qty,0);
  let disc=0;
  if(kioskDiscount>0){ disc=kioskDiscountType==='%'?Math.round(sub*kioskDiscount/100):kioskDiscount; disc=Math.min(disc,sub); }
  return Math.max(0,sub-disc);
}

function kioskUpdateTotals(){
  const sub=kioskCart.reduce((s,x)=>s+x.price*x.qty,0);
  let disc=0;
  if(kioskDiscount>0){ disc=kioskDiscountType==='%'?Math.round(sub*kioskDiscount/100):kioskDiscount; disc=Math.min(disc,sub); }
  const total=Math.max(0,sub-disc);
  document.getElementById('kiosk-subtotal').textContent=sub+' kr';
  document.getElementById('kiosk-total').textContent=total+' kr';
  const dl=document.getElementById('kiosk-discount-line');
  if(disc>0){ dl.style.display='flex'; document.getElementById('kiosk-discount-display').textContent='-'+disc+' kr'; }
  else { dl.style.display='none'; }
}

function kioskApplyDiscount(){
  const val=(document.getElementById('kiosk-discount').value||'').trim();
  if(!val){ kioskDiscount=0; kioskDiscountType='kr'; kioskUpdateTotals(); return; }
  if(val.endsWith('%')){ kioskDiscountType='%'; kioskDiscount=parseFloat(val); }
  else { kioskDiscountType='kr'; kioskDiscount=parseFloat(val)||0; }
  kioskToast('✅ Rabatt tillagd!');
  kioskUpdateTotals();
}

function kioskClearCart(){
  kioskCart.forEach(item=>{ const p=kioskProducts.find(x=>x.id===item.id); if(p&&p.stock!==null) p.stock+=item.qty; });
  kioskCart=[]; kioskDiscount=0;
  document.getElementById('kiosk-discount').value='';
  kioskRenderCart(); kioskRenderProducts();
}

function kioskCheckout(method){
  if(!kioskCart.length){ kioskToast('⚠ Varukorg är tom!'); return; }
  if(method==='swish'){
    kioskCompletePayment('swish',kioskGetTotal(),0);
  } else {
    document.getElementById('kiosk-cash-due').textContent=kioskGetTotal()+' kr';
    kNumpadVal='';
    document.getElementById('kiosk-numpad-display').textContent='0';
    document.getElementById('kiosk-change-display').textContent='— kr';
    document.getElementById('kiosk-cash-modal').style.display='flex';
  }
}

function kNumpad(val){
  if(val==='⌫'){ kNumpadVal=kNumpadVal.slice(0,-1); }
  else { if(kNumpadVal.length>=6) return; kNumpadVal+=val; }
  const n=parseInt(kNumpadVal)||0;
  document.getElementById('kiosk-numpad-display').textContent=n||'0';
  const change=n-kioskGetTotal();
  document.getElementById('kiosk-change-display').textContent=change>=0?change+' kr':'— kr';
}

function kioskCompleteCash(){
  const n=parseInt(kNumpadVal)||0;
  if(n<kioskGetTotal()){ kioskToast('⚠ Inte tillräckligt!'); return; }
  document.getElementById('kiosk-cash-modal').style.display='none';
  kioskCompletePayment('cash',kioskGetTotal(),n-kioskGetTotal());
  kNumpadVal='';
}

function kioskCompletePayment(method,total,change){
  const entry={id:Date.now(),time:new Date().toLocaleTimeString('sv-SE'),date:new Date().toLocaleDateString('sv-SE'),method,total,change,items:kioskCart.map(x=>({name:x.name,qty:x.qty,price:x.price}))};
  kioskHistory.unshift(entry);
  localStorage.setItem('kiosk-history',JSON.stringify(kioskHistory));
  document.getElementById('kiosk-success-icon').textContent=method==='swish'?'💳':'💵';
  document.getElementById('kiosk-success-amount').textContent=total+' kr';
  document.getElementById('kiosk-success-method').textContent=method==='swish'?'SWISH':'KONTANT';
  const ci=document.getElementById('kiosk-change-info');
  if(change>0){ ci.style.display='block'; document.getElementById('kiosk-change-amt').textContent=change; }
  else { ci.style.display='none'; }
  document.getElementById('kiosk-success-modal').style.display='flex';
  kioskSaveProducts();
  kioskCart=[]; kioskDiscount=0;
  document.getElementById('kiosk-discount').value='';
  kioskRenderCart();
}

function kioskCloseSuccess(){ document.getElementById('kiosk-success-modal').style.display='none'; kioskRenderProducts(); }

function openKioskHistory(){
  const swishTotal=kioskHistory.filter(x=>x.method==='swish').reduce((s,x)=>s+x.total,0);
  const grand=kioskHistory.reduce((s,x)=>s+x.total,0);
  document.getElementById('kh-count').textContent=kioskHistory.length;
  document.getElementById('kh-total').textContent=grand+' kr';
  document.getElementById('kh-swish').textContent=swishTotal+' kr';
  const list=document.getElementById('kh-list');
  list.innerHTML=kioskHistory.length?kioskHistory.map(h=>`
    <div style="padding:12px 0;border-bottom:1px solid rgba(155,48,255,0.08);">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-family:'Share Tech Mono',monospace;font-size:0.8rem;color:var(--text-dim);">${h.date} ${h.time}</span>
        <span style="display:flex;gap:8px;align-items:center;">
          <span style="font-size:0.75rem;padding:2px 8px;background:${h.method==='swish'?'rgba(0,177,63,0.2)':'rgba(255,200,0,0.2)'};color:${h.method==='swish'?'#00b13f':'var(--yellow)'};">${h.method.toUpperCase()}</span>
          <span style="font-family:'Orbitron',monospace;font-size:0.9rem;color:var(--cyan);">${h.total} kr</span>
        </span>
      </div>
      <div style="font-size:0.8rem;color:var(--text-dim);">${h.items.map(i=>i.name+' x'+i.qty).join(', ')}</div>
      ${h.change>0?`<div style="font-size:0.75rem;color:var(--green);margin-top:2px;">Växel: ${h.change} kr</div>`:''}
    </div>`).join(''):'<div style="text-align:center;color:var(--text-dim);padding:30px;font-family:\'Orbitron\',monospace;font-size:0.6rem;letter-spacing:3px;">INGEN HISTORIK</div>';
  document.getElementById('kiosk-history-modal').style.display='flex';
}

function kioskClearHistory(){ kioskHistory=[]; localStorage.setItem('kiosk-history','[]'); openKioskHistory(); kioskToast('🗑 Historik rensad'); }

function openKioskAddProduct(){
  ['kn-name','kn-price','kn-emoji','kn-stock'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('kiosk-add-modal').style.display='flex';
}

function kioskSaveNewProduct(){
  const name=document.getElementById('kn-name').value.trim();
  const price=parseFloat(document.getElementById('kn-price').value)||0;
  const emoji=document.getElementById('kn-emoji').value.trim()||'📦';
  const category=document.getElementById('kn-category').value;
  const sv=document.getElementById('kn-stock').value;
  const stock=sv===''?null:parseInt(sv);
  if(!name||!price){ kioskToast('⚠ Fyll i namn och pris!'); return; }
  kioskProducts.push({id:Date.now(),name,price,emoji,category,stock});
  kioskSaveProducts();
  document.getElementById('kiosk-add-modal').style.display='none';
  kioskRenderCategories(); kioskRenderProducts();
  kioskToast('✅ '+name+' tillagd!');
}

function openKioskAdmin(){
  const list=document.getElementById('kiosk-admin-list');
  list.innerHTML=kioskProducts.map((p,i)=>`
    <div style="display:grid;grid-template-columns:36px 1fr 70px 60px 32px;gap:6px;align-items:center;padding:8px 0;border-bottom:1px solid rgba(155,48,255,0.08);">
      <input type="text" value="${p.emoji}" maxlength="2" onchange="kioskProducts[${i}].emoji=this.value" style="background:#0d0d1a;border:1px solid var(--border);color:var(--text);padding:6px;text-align:center;font-size:1.1rem;outline:none;">
      <input type="text" value="${p.name}" onchange="kioskProducts[${i}].name=this.value" style="background:#0d0d1a;border:1px solid var(--border);color:var(--text);padding:6px;font-family:'Rajdhani',sans-serif;font-size:0.9rem;outline:none;width:100%;">
      <input type="number" value="${p.price}" onchange="kioskProducts[${i}].price=parseFloat(this.value)||0" style="background:#0d0d1a;border:1px solid var(--border);color:var(--cyan);padding:6px;font-family:'Share Tech Mono',monospace;outline:none;width:100%;">
      <input type="number" value="${p.stock===null?'':p.stock}" placeholder="∞" onchange="kioskProducts[${i}].stock=this.value===''?null:parseInt(this.value)" style="background:#0d0d1a;border:1px solid var(--border);color:var(--text-dim);padding:6px;font-family:'Share Tech Mono',monospace;outline:none;width:100%;">
      <button onclick="kioskDeleteProduct(${i})" style="background:transparent;border:1px solid var(--red);color:var(--red);width:32px;height:32px;cursor:pointer;font-size:0.9rem;">✕</button>
    </div>
  `).join('');
  document.getElementById('kiosk-admin-modal').style.display='flex';
}

function kioskDeleteProduct(i){ kioskProducts.splice(i,1); openKioskAdmin(); }

function kioskSaveProducts(){
  localStorage.setItem('kiosk-products',JSON.stringify(kioskProducts));
  kioskToast('✅ Produkter sparade!');
  document.getElementById('kiosk-admin-modal').style.display='none';
  kioskRenderCategories(); kioskRenderProducts();
}

// Init kiosk when tab is opened
document.querySelectorAll('.admin-nav-item[data-tab]').forEach(item=>{
  item.addEventListener('click', function(){
  });
});
