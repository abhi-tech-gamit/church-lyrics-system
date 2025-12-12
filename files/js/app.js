// app.js (ES module)
'use strict';

/* ===== fetchJSON: fetch with XHR fallback (file:// tolerant) ===== */
export async function fetchJSON(path) {
  // prefer fetch
  try {
    const resp = await fetch(path);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } catch (err) {
    // fallback: XMLHttpRequest (works when fetch blocked on file:// in some browsers)
    return new Promise((resolve, reject) => {
      try {
        const xhr = new XMLHttpRequest();
        xhr.overrideMimeType('application/json');
        xhr.open('GET', path, true);
        xhr.onreadystatechange = () => {
          if (xhr.readyState === 4) {
            if (xhr.status === 200 || xhr.status === 0) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch (e) {
                reject(new Error('Invalid JSON: ' + e.message));
              }
            } else {
              reject(new Error('XHR status ' + xhr.status));
            }
          }
        };
        xhr.send(null);
      } catch (e) {
        reject(e);
      }
    });
  }
}

/* ===== Theme toggle with localStorage persistence ===== */
export function setupThemeToggle() {
  const btns = Array.from(document.querySelectorAll('#theme-toggle'));
  const key = 'musicians_theme';
  const stored = localStorage.getItem(key);
  if (stored === 'light') document.body.classList.add('light');
  else document.body.classList.remove('light');

  const updateBtnText = (btn) => {
    if (!btn) return;
    btn.textContent = document.body.classList.contains('light') ? 'Dark Mode' : 'Light Mode';
    btn.setAttribute('aria-pressed', document.body.classList.contains('light'));
  };

  btns.forEach(btn => {
    updateBtnText(btn);
    btn.addEventListener('click', () => {
      document.body.classList.toggle('light');
      localStorage.setItem(key, document.body.classList.contains('light') ? 'light' : 'dark');
      btns.forEach(updateBtnText);
    });
  });
}

/* ===== UI helpers ===== */
function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k,v]) => {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach(c => { if (typeof c === 'string') node.appendChild(document.createTextNode(c)); else if (c) node.appendChild(c); });
  return node;
}

/* ===== Song List page loader ===== */
export async function loadSongList() {
  setupThemeToggle();
  const listEl = document.getElementById('song-list');
  const searchInput = document.getElementById('search-input');

  if (!listEl) return;

  let songs;
  try {
    songs = await fetchJSON('songs.json');
  } catch (err) {
    console.error('Failed to load songs.json', err);
    listEl.innerHTML = '';
    listEl.appendChild(el('li', { class: 'error' , text: 'Unable to load songs.json — check console.' }));
    return;
  }

  // store and render
  let songIndex = songs.slice();
  function renderList(items) {
    listEl.innerHTML = '';
    if (!items.length) {
      listEl.appendChild(el('li', { class: 'loading', text: 'No songs match your search.' }));
      return;
    }
    items.forEach(s => {
      const li = el('li', {}, 
        el('span', { text: s.title }),
        el('span', { class: 'muted', text: s.artist ? ` ${s.artist}` : '' })
      );
      li.addEventListener('click', () => {
        window.location.href = `viewer.html?file=${encodeURIComponent(s.filename)}`;
      });
      listEl.appendChild(li);
    });
  }

  renderList(songIndex);

  // search handler: filter by title, artist, tags
  searchInput && searchInput.addEventListener('input', (e) => {
    const q = (e.target.value || '').trim().toLowerCase();
    if (!q) return renderList(songIndex);
    const filtered = songIndex.filter(s => {
      return (s.title && s.title.toLowerCase().includes(q)) ||
             (s.artist && s.artist.toLowerCase().includes(q)) ||
             (s.tags && s.tags.join(' ').toLowerCase().includes(q));
    });
    renderList(filtered);
  });

  // Keyboard shortcut: press / to focus search
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput && (searchInput.focus(), searchInput.select());
    }
  });
}

/* ===== Song Viewer loader ===== */
export async function loadViewer() {
  setupThemeToggle();

  // get file param
  const params = new URLSearchParams(window.location.search);
  const file = params.get('file');
  const viewEl = document.getElementById('song-view');
  const titleEl = document.getElementById('song-title');

  if (!viewEl || !titleEl) return;

  if (!file) {
    viewEl.textContent = 'No song specified.';
    return;
  }

  let song;
  try {
    song = await fetchJSON(`songs/${file}`);
  } catch (err) {
    console.error('Error loading song file', err);
    viewEl.textContent = 'Error loading song file.';
    return;
  }

  titleEl.textContent = song.title + (song.key ? ` [Key: ${song.key}]` : '');
  let transpose = 0;

  function renderSong() {
    viewEl.innerHTML = '';
    if (!song.lines || !song.lines.length) {
      viewEl.textContent = 'Song file is empty or invalid format.';
      return;
    }
    song.lines.forEach(line => {
      const lineDiv = el('div', { class: 'lyric-line' });
      const chordsRow = el('div', { class: 'chords-row' });
      const lyricsRow = el('div', { class: 'lyrics-row' });

      // chords: an array aligned with lyrics tokens (if provided)
      (line.chords || []).forEach(c => {
        const span = el('span', { text: transposeChord(c, transpose) });
        chordsRow.appendChild(span);
      });

      (line.lyrics || []).forEach(w => {
        const span = el('span', { text: w });
        lyricsRow.appendChild(span);
      });

      // if chords array is empty but a chordLine string exists, render it as one element
      if ((!line.chords || !line.chords.length) && line.chordLine) {
        const chordLine = el('div', { class: 'chords-row', text: transposeChord(line.chordLine, transpose) });
        lineDiv.appendChild(chordLine);
      } else {
        lineDiv.appendChild(chordsRow);
      }

      lineDiv.appendChild(lyricsRow);
      viewEl.appendChild(lineDiv);
    });
  }

  // Wire transpose controls
  const upBtn = document.getElementById('transpose-up');
  const downBtn = document.getElementById('transpose-down');

  if (upBtn) upBtn.onclick = () => { transpose++; renderSong(); };
  if (downBtn) downBtn.onclick = () => { transpose--; renderSong(); };

  // keyboard + and - for transpose
  document.addEventListener('keydown', (e) => {
    if (e.key === '+' || e.key === '=') { transpose++; renderSong(); }
    if (e.key === '-' || e.key === '_') { transpose--; renderSong(); }
    if (e.key === '/' ) {
      // forward to index search by opening index in same tab and focusing? We'll not navigate automatically.
    }
  });

  renderSong();
}

/* ===== Improved chord transposing (supports suffixes and slash bass) ===== */
/* Note: this is intentionally conservative — it will preserve suffixes like m7, sus4, add9, (no full parsing of extensions) */
const CHORDS = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const FLAT_MAP = {'Db':'C#','Eb':'D#','Gb':'F#','Ab':'G#','Bb':'A#'};

export function transposeChord(chordText, steps) {
  if (!chordText) return '';
  // if chordText contains spaces (a chord line), transpose each token
  if (/\s/.test(chordText) && chordText.trim().includes(' ')) {
    return chordText.split(/\s+/).map(tok => transposeChord(tok, steps)).join(' ');
  }

  // handle slash chords like "G/B" or "D/F#"
  const slashParts = chordText.split('/');
  if (slashParts.length === 2) {
    const main = transposeChord(slashParts[0], steps);
    const bass = transposeChord(slashParts[1], steps);
    return `${main}/${bass}`;
  } else if (slashParts.length > 2) {
    // unexpected multiple slashes: fallback to naive approach
    return chordText;
  }

  // match root letter + optional accidental + rest as suffix
  const m = chordText.match(/^([A-G])([b#]?)(.*)$/);
  if (!m) return chordText;
  let [, root, accidental, suffix] = m;
  let full = root + (accidental || '');
  if (FLAT_MAP[full]) full = FLAT_MAP[full];
  let idx = CHORDS.indexOf(full);
  if (idx === -1) return chordText;
  let newIdx = (idx + (steps || 0)) % 12;
  if (newIdx < 0) newIdx += 12;
  let newRoot = CHORDS[newIdx];
  return newRoot + (suffix || '');
}

/* ===== Auto-run depending on page ===== */
(function autoRun() {
  // If index has #song-list -> load list
  if (document.getElementById('song-list')) {
    loadSongList().catch(e => console.error('loadSongList error', e));
  }
  // If viewer page:
  if (document.getElementById('song-view')) {
    loadViewer().catch(e => console.error('loadViewer error', e));
  }
})();
