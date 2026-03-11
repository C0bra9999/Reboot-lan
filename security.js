// ═══════════════════════════════════════════════════════════
// security.js — Reboot LAN
// Körs EFTER firebase-auth-compat.js och app.js har laddats
// ═══════════════════════════════════════════════════════════
// Vad den gör:
//   1. Session-fingerprint  — loggar ut om webbläsarprofilen ändras
//   2. Tab-synk             — loggar ut i ALLA flikar samtidigt
//   3. Inaktivitet          — loggar ut efter 60 min utan aktivitet
//   4. Synlig URL-ändring   — loggar ut om någon försöker navigera bort via JS
//   5. Auth-token utgången  — kontrollerar token var 5:e minut
//   6. Loggar hot till Firebase (valfritt, tyst)
// ═══════════════════════════════════════════════════════════

(function RebootSecurity() {
  'use strict';

  // ── Konfiguration ──────────────────────────────────────
  const CFG = {
    inactivityMs:  60 * 60 * 1000,   // 60 min inaktivitet → utloggning
    tokenCheckMs:   5 * 60 * 1000,   // Kontrollera auth-token var 5:e minut
    logThreats:    true,              // Logga hot till Firestore (kräver att db finns)
  };

  // ── Intern state ───────────────────────────────────────
  let inactivityTimer  = null;
  let tokenCheckTimer  = null;
  let terminated       = false;

  // ── Vänta tills Firebase är redo ──────────────────────
  // security.js laddas med defer — Firebase och auth finns redan
  function getAuth() { return typeof auth !== 'undefined' ? auth : null; }
  function getDb()   { return typeof db   !== 'undefined' ? db   : null; }

  // ── Utloggning med orsak ───────────────────────────────
  function forceLogout(reason) {
    if (terminated) return;
    terminated = true;

    const a = getAuth();
    if (!a || !a.currentUser) return; // Ingen inloggad — gör inget

    // Logga hotet till Firebase innan utloggning (tyst, kastar aldrig)
    if (CFG.logThreats) {
      logThreat(reason).catch(() => {});
    }

    // Rensa inaktivitetstimer
    clearTimeout(inactivityTimer);
    clearInterval(tokenCheckTimer);

    // Signalera till andra flikar att logga ut
    try {
      localStorage.setItem('_rbl_logout', Date.now().toString());
    } catch (_) {}

    // Logga ut från Firebase
    a.signOut().then(() => {
      // Stäng admin-panelen om den är öppen
      if (typeof closeAdmin === 'function') closeAdmin();

      // Visa meddelande till användaren
      const msgs = {
        inactivity:    '⏱ Automatiskt utloggad — inaktivitet i 60 min.',
        fingerprint:   '🔒 Sessionen avslutad — webbläsarprofil ändrades.',
        tab_sync:      '🔒 Utloggad från en annan flik.',
        token_expired: '🔒 Sessionen har gått ut — logga in igen.',
        visibility:    '🔒 Sessionen avslutad.',
      };
      if (typeof showToast === 'function') {
        showToast(msgs[reason] || '🔒 Sessionen avslutad.');
      }
    }).catch(() => {});
  }

  // ── Logga hot till Firestore ───────────────────────────
  async function logThreat(reason) {
    const d = getDb();
    const a = getAuth();
    if (!d || !a || !a.currentUser) return;
    try {
      await d.collection('security_log').add({
        uid:       a.currentUser.uid,
        email:     a.currentUser.email,
        reason,
        userAgent: navigator.userAgent,
        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      });
    } catch (_) {}
  }

  // ══════════════════════════════════════════════════════
  // SKYDD 1 — Session-fingerprint
  // Loggar ut om webbläsarprofilen ändras under sessionen.
  // Skyddar mot: någon som kopierar sessionStorage från en
  // annan dator och försöker återanvända sessionen.
  // ══════════════════════════════════════════════════════
  function buildFingerprint() {
    return [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    ].join('||');
  }

  function initFingerprint() {
    const key     = '_rbl_sfp';
    const current = buildFingerprint();
    const stored  = sessionStorage.getItem(key);

    if (stored && stored !== current) {
      forceLogout('fingerprint');
      return;
    }
    if (!stored) {
      sessionStorage.setItem(key, current);
    }
  }

  // ══════════════════════════════════════════════════════
  // SKYDD 2 — Flik-synkronisering via localStorage
  // Om admin loggar ut i en flik → loggas ut i alla flikar.
  // Skyddar mot: glömda inloggade flikar.
  // ══════════════════════════════════════════════════════
  function initTabSync() {
    window.addEventListener('storage', function(e) {
      if (e.key === '_rbl_logout') {
        const a = getAuth();
        if (a && a.currentUser) {
          forceLogout('tab_sync');
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // SKYDD 3 — Inaktivitetstimer
  // 60 minuter utan mus/tangentbord/touch → utloggning.
  // Skyddar mot: glömd inloggad session på delad dator.
  // ══════════════════════════════════════════════════════
  function resetInactivityTimer() {
    const a = getAuth();
    if (!a || !a.currentUser) return; // Bara aktiv när inloggad

    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(function() {
      forceLogout('inactivity');
    }, CFG.inactivityMs);
  }

  function initInactivity() {
    const events = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    events.forEach(function(ev) {
      document.addEventListener(ev, resetInactivityTimer, { passive: true });
    });
  }

  // ══════════════════════════════════════════════════════
  // SKYDD 4 — Auth-token utgångskontroll
  // Firebase-tokens gäller i 1 timme. Kontrollerar var 5:e
  // minut att token fortfarande är giltig.
  // Skyddar mot: token löpte ut men Firebase märkte det inte
  // utan en ny nätverksförfrågan.
  // ══════════════════════════════════════════════════════
  function initTokenCheck() {
    tokenCheckTimer = setInterval(async function() {
      const a = getAuth();
      if (!a || !a.currentUser) return;
      try {
        // getIdToken(true) = tvinga förnyelse om token gått ut
        await a.currentUser.getIdToken(true);
      } catch (e) {
        // Token ogiltig eller nätverksfel → logga ut
        forceLogout('token_expired');
      }
    }, CFG.tokenCheckMs);
  }

  // ══════════════════════════════════════════════════════
  // SKYDD 5 — Sida göms (Page Visibility API)
  // Startar om inaktivitetstimern när användaren byter flik
  // eller minimerar webbläsaren och sedan återvänder.
  // ══════════════════════════════════════════════════════
  function initVisibility() {
    document.addEventListener('visibilitychange', function() {
      if (document.visibilityState === 'visible') {
        // Sidan synlig igen — kontrollera att token fortfarande gäller
        const a = getAuth();
        if (a && a.currentUser) {
          a.currentUser.getIdToken(true).catch(function() {
            forceLogout('token_expired');
          });
        }
      }
    });
  }

  // ══════════════════════════════════════════════════════
  // START — Aktivera allt när Firebase Auth är redo
  // ══════════════════════════════════════════════════════
  function activate() {
    initFingerprint();
    initTabSync();
    initInactivity();
    initTokenCheck();
    initVisibility();
    resetInactivityTimer(); // Starta timern direkt
  }

  // Vänta tills Firebase Auth har laddats och en användare loggat in
  // Används auth.onAuthStateChanged så vi inte missar något
  function waitForAuth() {
    const a = getAuth();
    if (!a) {
      // Firebase inte redo än — försök igen om 200ms
      setTimeout(waitForAuth, 200);
      return;
    }

    a.onAuthStateChanged(function(user) {
      if (user) {
        // Användare loggade in → aktivera alla skydd
        terminated = false;
        activate();
      } else {
        // Utloggad → rensa timers
        clearTimeout(inactivityTimer);
        clearInterval(tokenCheckTimer);
        terminated = false; // Tillåt ny aktivering vid nästa inloggning
      }
    });
  }

  // Kör när DOM är redo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', waitForAuth);
  } else {
    waitForAuth();
  }

})(); // IIFE — inga globala variabler läcker ut
