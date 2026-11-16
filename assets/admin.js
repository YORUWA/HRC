/* 현상대응컴퍼니 게시판 관리자 — 글 쓰기·수정·삭제·사진 첨부 (GitHub 저장소에 직접 저장) */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var CATS = { notice: '공지', lore: '설정', bside: '에셋', chat: '잡담' };
  var KEY = 'hrc_admin_token', CFG = 'hrc_admin_repo';
  var app = $('#adm');

  /* ---------- 저장소 설정 ---------- */
  function guessRepo() {
    var host = location.hostname, seg = location.pathname.split('/')[1] || '';
    if (/\.github\.io$/.test(host)) return host.split('.')[0] + '/' + seg;
    return '';
  }
  function store(k, v) { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {} }
  function load(k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } }
  var token = load(KEY), repo = load(CFG) || guessRepo();
  var posts = [], pending = {}, editing = null, busy = false;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function msg(t, kind) { var m = $('#adm-msg'); if (m) { m.textContent = t || ''; m.className = 'adm-msg' + (kind ? ' ' + kind : ''); } }

  /* ---------- GitHub API ---------- */
  function api(path, opt) {
    opt = opt || {};
    var h = { 'Authorization': 'Bearer ' + token, 'Accept': opt.raw ? 'application/vnd.github.raw+json' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (opt.body) h['Content-Type'] = 'application/json';
    return fetch('https://api.github.com/repos/' + repo + path, { method: opt.method || 'GET', headers: h, cache: 'no-store', body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) {
        if (r.status === 401) throw new Error('열쇠(토큰)가 올바르지 않거나 만료됐어요. 다시 입력해 주세요.');
        if (r.status === 403 || r.status === 404) throw new Error('이 저장소에 쓸 권한이 없어요. 토큰 권한(Contents: Read and write)과 저장소 이름(' + repo + ')을 확인해 주세요.');
        if (!r.ok) throw new Error('GitHub 오류 ' + r.status);
        return opt.raw ? r.text() : r.json();
      });
  }

  function fetchPosts(branch) {
    return api('/contents/assets/posts.js?ref=' + encodeURIComponent(branch), { raw: true }).then(function (txt) {
      var w = {};
      try { (new Function('window', txt))(w); } catch (e) { throw new Error('posts.js를 읽을 수 없어요.'); }
      return Array.isArray(w.HRC_POSTS) ? w.HRC_POSTS : [];
    });
  }

  /* ---------- 본문 변환 ---------- */
  var TAGS = {
    '작게': ['<span class="t-sm">', '</span>'], '크게': ['<span class="t-lg">', '</span>'],
    '빨강': ['<span class="t-red">', '</span>'], '파랑': ['<span class="t-blue">', '</span>'], '초록': ['<span class="t-green">', '</span>'],
    '보라': ['<span class="t-purple">', '</span>'], '주황': ['<span class="t-orange">', '</span>'], '회색': ['<span class="t-gray">', '</span>'],
    '밑줄': ['<u>', '</u>'], '기울임': ['<i>', '</i>'], '취소선': ['<s>', '</s>']
  };
  function inline(s) {
    s = esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    Object.keys(TAGS).forEach(function (k) {
      s = s.replace(new RegExp('\\[' + k + '\\]([\\s\\S]*?)\\[\\/' + k + '\\]', 'g'), TAGS[k][0] + '$1' + TAGS[k][1]);
    });
    return s.replace(/\[링크 (https?:\/\/[^\]\s]+)\]([\s\S]*?)\[\/링크\]/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$2</a>');
  }
  function textHtml(v) {
    v = String(v || '').replace(/\r/g, '');
    var lead = (v.match(/^\n*/) || [''])[0].length;
    var rest = v.slice(lead), trail = (rest.match(/\n*$/) || [''])[0].length;
    var core = rest.slice(0, rest.length - trail);
    if (!core.trim()) return '';
    var gap = function (n) { var o = ''; for (var i = 0; i < n; i++) o += '<div class="gap"></div>'; return o; };
    var parts = core.split(/(\n{2,})/), out = gap(lead);
    parts.forEach(function (seg, i) {
      if (i % 2) return void (out += gap(Math.max(0, seg.length - 2)));
      var para = seg.trim(); if (!para) return;
      if (/^---+$/.test(para)) out += '<hr>';
      else if (/^## /.test(para)) out += '<h4>' + inline(para.slice(3)) + '</h4>';
      else if (/^\[가운데\]/.test(para)) out += '<p class="ctr">' + inline(para.replace(/^\[가운데\]\s*/, '')).replace(/\n/g, '<br>') + '</p>';
      else out += '<p>' + inline(para).replace(/\n/g, '<br>') + '</p>';
    });
    return out + gap(Math.max(0, trail - 1));
  }
  function blocksHtml(blocks, resolve) {
    resolve = resolve || function (it) { return '../' + it.src; };
    return blocks.map(function (b) {
      if (b.t === 'text') return textHtml(b.v || '');
      if (b.t === 'file') {
        return (b.items || []).map(function (it) {
          var u = esc(resolve(it));
          return it.kind === 'video'
            ? '<figure class="media"><video controls controlsList="nodownload" playsinline preload="metadata" src="' + u + '"></video></figure>'
            : '<figure class="media"><audio controls controlsList="nodownload" preload="none" src="' + u + '"></audio></figure>';
        }).join('');
      }
      var n = (b.items || []).length, lay = n > 1 ? (b.layout || 'big') : 'big';
      var cls = lay === 'two' ? 'gal gal-two' : lay === 'three' ? 'gal gal-three' : lay === 'grid' ? 'gal gal-sq ' + (n === 2 || n === 4 ? 'gal-c2' : 'gal-c3') : '';
      var imgs = (b.items || []).map(function (it) { return '<img src="' + esc(resolve(it)) + '" alt="" loading="lazy">'; }).join('');
      return imgs ? '<figure' + (cls ? ' class="' + cls + '"' : '') + '>' + imgs + '</figure>' : '';
    }).join('\n');
  }
  function toBlocks(p) {
    if (p.blocks) return JSON.parse(JSON.stringify(p.blocks));
    var out = [], txt = (p.body || '').trim();
    if (txt && txt.indexOf('<') === -1) out.push({ t: 'text', v: txt });
    else if (txt) out.push({ t: 'text', v: txt.replace(/<br\s*\/?>/g, '\n').replace(/<\/p>\s*/g, '\n\n').replace(/<[^>]+>/g, '').trim() });
    var imgs = (p.images || []).map(function (u) { return { src: /^images\//.test(u) ? u : 'images/' + u }; });
    if (imgs.length) out.push({ t: 'img', items: imgs });
    return out.length ? out : [{ t: 'text', v: '' }];
  }
  function srcsOf(p) {
    var s = [];
    (p.blocks || []).forEach(function (b) { if (b.t === 'img' || b.t === 'file') b.items.forEach(function (i) { s.push(i.src); }); });
    return s;
  }

  /* ---------- 사진 처리 ---------- */
  function shrink(file) {
    return new Promise(function (res, rej) {
      if (/gif$/.test(file.type)) return res({ blob: file, ext: 'gif' });
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1800, sc = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas'); c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        var cx = c.getContext('2d');
        cx.drawImage(img, 0, 0, c.width, c.height);
        // 거의 불투명한 픽셀은 완전 불투명(255)으로 맞춰요. (알파 채널에 몰래 담긴 생성 정보 등이 남지 않게 하기 위함이에요. 진짜 투명한 부분은 그대로 유지돼요.)
        try {
          var id = cx.getImageData(0, 0, c.width, c.height), px = id.data;
          for (var q = 3; q < px.length; q += 4) if (px[q] >= 240) px[q] = 255;
          cx.putImageData(id, 0, 0);
        } catch (err) {}
        URL.revokeObjectURL(url);
        c.toBlob(function (b) {
          if (b && b.type === 'image/webp') return res({ blob: b, ext: 'webp' });
          c.toBlob(function (j) { res({ blob: j, ext: 'jpg' }); }, 'image/jpeg', 0.88);
        }, 'image/webp', 0.86);
      };
      img.onerror = function () { rej(new Error('사진을 읽을 수 없어요: ' + file.name)); };
      img.src = url;
    });
  }
  function toB64(blob) {
    return new Promise(function (res) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1]); };
      r.readAsDataURL(blob);
    });
  }
  function utf8b64(s) {
    var b = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  /* ---------- 저장 (한 번의 커밋으로 글 + 사진) ---------- */
  var HEAD = '/* 게시판 글 목록 — 관리자 페이지(board/admin/)에서 자동으로 관리됩니다. 직접 고쳐도 되지만 형식을 지켜 주세요. */\n';
  function commit(newPosts, upload, removePaths, message) {
    var branch, parent, baseTree;
    return api('').then(function (r) { branch = r.default_branch; return api('/git/ref/heads/' + branch); })
      .then(function (ref) { parent = ref.object.sha; return api('/git/commits/' + parent); })
      .then(function (c) {
        baseTree = c.tree.sha;
        var tree = [];
        var chain = Promise.resolve();
        upload.forEach(function (u) {
          chain = chain.then(function () { return api('/git/blobs', { method: 'POST', body: { content: u.b64, encoding: 'base64' } }); })
            .then(function (b) { tree.push({ path: u.path, mode: '100644', type: 'blob', sha: b.sha }); });
        });
        return chain.then(function () {
          return api('/git/blobs', { method: 'POST', body: { content: utf8b64(HEAD + 'window.HRC_POSTS = ' + JSON.stringify(newPosts, null, 1) + ';\n'), encoding: 'base64' } });
        }).then(function (b) {
          tree.push({ path: 'assets/posts.js', mode: '100644', type: 'blob', sha: b.sha });
          removePaths.forEach(function (p) { tree.push({ path: p, mode: '100644', type: 'blob', sha: null }); });
          return api('/git/trees', { method: 'POST', body: { base_tree: baseTree, tree: tree } });
        });
      })
      .then(function (t) { return api('/git/commits', { method: 'POST', body: { message: message, tree: t.sha, parents: [parent] } }); })
      .then(function (c) { return api('/git/refs/heads/' + branch, { method: 'PATCH', body: { sha: c.sha } }); });
  }

  /* ---------- 화면: 로그인 ---------- */
  function viewLogin(err) {
    app.innerHTML = '<div class="adm-card"><h2>관리자 로그인</h2>' +
      '<p>GitHub에서 만든 <b>열쇠(토큰)</b>를 붙여 넣으세요. 이 브라우저에만 저장되고 사이트 파일에는 들어가지 않아요.</p>' +
      '<label>열쇠(토큰)<input id="a-tok" type="password" autocomplete="off" placeholder="github_pat_..."></label>' +
      '<label>저장소 <small>(보통 그대로 두세요)</small><input id="a-repo" type="text" value="' + esc(repo) + '" placeholder="아이디/저장소이름"></label>' +
      '<button type="button" class="s-btn s-btn-d" id="a-go">로그인</button>' +
      '<p id="adm-msg" class="adm-msg' + (err ? ' err' : '') + '">' + esc(err || '') + '</p></div>';
    $('#a-go').onclick = function () {
      token = $('#a-tok').value.trim(); repo = $('#a-repo').value.trim();
      if (!token || !repo) return msg('열쇠와 저장소를 입력해 주세요.', 'err');
      msg('확인하는 중…');
      api('').then(function (r) {
        if (!r.permissions || !r.permissions.push) throw new Error('이 열쇠로는 글을 저장할 수 없어요. 권한을 확인해 주세요.');
        store(KEY, token); store(CFG, repo); start();
      }).catch(function (e) { token = ''; msg(e.message, 'err'); });
    };
  }

  /* ---------- 화면: 목록 ---------- */
  function viewList(note) {
    var rows = posts.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1); }).map(function (p) {
      return '<tr><td class="no">' + esc(p.id) + '</td><td><span class="s-tag c-' + esc(p.cat) + '">' + esc(CATS[p.cat] || p.cat) + '</span></td><td class="ti">' + (p.hidden ? '<span class="adm-hid">🔒 비공개</span> ' : '') + esc(p.title) + '</td><td class="dt">' + esc(p.date) + '</td>' +
        '<td class="ac"><button type="button" data-h="' + esc(p.id) + '">' + (p.hidden ? '공개로' : '비공개로') + '</button><button type="button" data-e="' + esc(p.id) + '">수정</button><button type="button" class="del" data-d="' + esc(p.id) + '">삭제</button></td></tr>';
    }).join('');
    app.innerHTML = '<div class="adm-top"><button type="button" class="s-btn s-btn-d" id="a-new">+ 새 글 쓰기</button><span class="sp"></span><a href="../" class="adm-link">게시판 보기</a><button type="button" class="adm-link" id="a-out">로그아웃</button></div>' +
      '<p id="adm-msg" class="adm-msg ok">' + esc(note || '') + '</p>' +
      (rows ? '<table class="adm-table"><tbody>' + rows + '</tbody></table>' : '<p>아직 글이 없어요.</p>') +
      '<p class="adm-hint">저장하면 1~2분 뒤 사이트에 반영돼요. 반영 전에는 예전 모습이 보일 수 있어요.</p>';
    $('#a-new').onclick = function () { openEditor(null); };
    $('#a-out').onclick = function () { store(KEY, null); token = ''; viewLogin(); };
    app.querySelectorAll('[data-e]').forEach(function (b) { b.onclick = function () { openEditor(b.getAttribute('data-e')); }; });
    app.querySelectorAll('[data-h]').forEach(function (b) { b.onclick = function () { toggleHidden(b.getAttribute('data-h')); }; });
    app.querySelectorAll('[data-d]').forEach(function (b) { b.onclick = function () { removePost(b.getAttribute('data-d')); }; });
  }

  function toggleHidden(id) {
    var p = posts.filter(function (x) { return x.id === id; })[0]; if (!p || busy) return;
    var hide = !p.hidden;
    var next = posts.map(function (x) {
      if (x.id !== id) return x;
      var c = JSON.parse(JSON.stringify(x)); if (hide) c.hidden = true; else delete c.hidden; return c;
    });
    saveAll(next, [], '게시판: ' + (hide ? '비공개' : '공개') + ' (' + id + ')', hide ? '비공개로 바꿨어요. 1~2분 뒤 방문자에게 안 보여요.' : '공개로 바꿨어요. 1~2분 뒤 방문자에게 보여요.', []);
  }

  function removePost(id) {
    var p = posts.filter(function (x) { return x.id === id; })[0];
    if (!p || !confirm('「' + p.title + '」 글을 삭제할까요?\n삭제하면 되돌릴 수 없어요.')) return;
    saveAll(posts.filter(function (x) { return x.id !== id; }), [], '게시판: 글 삭제 (' + id + ')', '삭제했어요. 1~2분 뒤 사이트에서 사라져요.');
  }

  /* ---------- 화면: 편집기 ---------- */
  function openEditor(id) {
    var p = id ? posts.filter(function (x) { return x.id === id; })[0] : null;
    var maxId = posts.reduce(function (m, x) { return Math.max(m, parseInt(x.id, 10) || 0); }, 0);
    var d = new Date(), today = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    editing = p ? { id: p.id, cat: p.cat, date: p.date, title: p.title, hidden: !!p.hidden, blocks: toBlocks(p), isNew: false }
                : { id: ('00' + (maxId + 1)).slice(-3), hidden: false, cat: 'bside', date: today, title: '', blocks: [{ t: 'text', v: '' }], isNew: true };
    drawEditor();
  }
  function prev(it) { return it.pending ? pending[it.pending].url : '../../' + it.src; }

  function drawEditor() {
    var e = editing;
    var opts = Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (e.cat === k ? ' selected' : '') + '>' + CATS[k] + '</option>'; }).join('');
    var blocks = e.blocks.map(function (b, i) {
      var tools = '<div class="adm-bt"><button type="button" data-up="' + i + '" title="위로">↑</button><button type="button" data-dn="' + i + '" title="아래로">↓</button><button type="button" data-rm="' + i + '" title="삭제">✕</button></div>';
      if (b.t === 'text') return '<div class="adm-b">' + tools + '<textarea data-t="' + i + '" rows="6" placeholder="내용을 쓰세요. 빈 줄로 문단을 나눠요.">' + esc(b.v) + '</textarea></div>';
      if (b.t === 'file') {
        var fl = b.items.map(function (it, j) {
          var pv = prev(it), nm = it.name || it.src.split('/').pop();
          var pl = it.kind === 'video' ? '<video controls playsinline preload="metadata" src="' + esc(pv) + '"></video>' : '<audio controls preload="none" src="' + esc(pv) + '"></audio>';
          return '<div class="adm-file"><span>' + esc(nm) + '</span>' + pl + '<button type="button" data-ri="' + i + ',' + j + '" title="이 파일 빼기">✕</button></div>';
        }).join('');
        return '<div class="adm-b">' + tools + fl + '<label class="adm-add">+ 파일 추가<input type="file" accept="audio/*,video/*" multiple data-m="' + i + '"></label></div>';
      }
      var th = b.items.map(function (it, j) { return '<figure><img src="' + esc(prev(it)) + '" alt=""><button type="button" data-ri="' + i + ',' + j + '" title="이 사진 빼기">✕</button></figure>'; }).join('');
      var lay = b.layout || 'big';
      var sel = b.items.length > 1 ? '<label class="adm-lay">배치 <select data-lay="' + i + '">' +
        [['grid', '정사각 모아보기'], ['two', '2장씩 나란히'], ['three', '3장씩 나란히'], ['big', '세로로 크게']].map(function (o) { return '<option value="' + o[0] + '"' + (lay === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' : '';
      return '<div class="adm-b">' + tools + sel + '<div class="adm-imgs">' + th + '</div><label class="adm-add">+ 사진 추가<input type="file" accept="image/*" multiple data-f="' + i + '"></label></div>';
    }).join('');
    app.innerHTML = '<div class="adm-top"><button type="button" class="adm-link" id="a-back">← 목록으로</button></div>' +
      '<div class="adm-card"><h2>' + (e.isNew ? '새 글' : '글 수정 (' + esc(e.id) + ')') + '</h2>' +
      '<label>제목<input id="e-title" type="text" value="' + esc(e.title) + '"></label>' +
      '<div class="adm-row"><label>분류<select id="e-cat">' + opts + '</select></label><label>작성일<input id="e-date" type="date" value="' + esc(e.date) + '"></label></div>' +
      '<label>공개 상태<select id="e-vis"><option value="0"' + (e.hidden ? '' : ' selected') + '>공개 (방문자에게 보임)</option><option value="1"' + (e.hidden ? ' selected' : '') + '>비공개 (나만 관리자에서 보임)</option></select></label>' +
      toolbar() + '<div class="adm-blocks">' + blocks + '</div>' +
      '<div class="adm-addrow"><button type="button" id="a-addt">+ 글 칸 추가</button><label class="adm-add">+ 사진 칸 추가<input type="file" accept="image/*" multiple id="a-addi"></label><label class="adm-add">+ 소리·영상 칸 추가<input type="file" accept="audio/*,video/*" multiple id="a-addm"></label></div>' +
      '<p class="adm-hint">꾸미기 도구는 글 칸을 클릭하고, 꾸밀 글자를 드래그로 선택한 뒤 버튼을 누르세요. 소제목·구분선·가운데는 앞뒤에 빈 줄이 있어야 해요.</p>' +
      '<div id="adm-prev" class="adm-prev" hidden></div>' +
      '<div class="adm-save"><button type="button" class="s-btn s-btn-l" id="a-prev">미리보기</button><button type="button" class="s-btn s-btn-d" id="a-save">저장하기</button><span id="adm-msg" class="adm-msg"></span></div></div>';
    $('#a-back').onclick = function () { if (confirm('저장하지 않은 내용은 사라져요. 목록으로 갈까요?')) viewList(); };
    $('#e-title').oninput = function () { e.title = this.value; };
    $('#e-cat').onchange = function () { e.cat = this.value; };
    $('#e-date').onchange = function () { e.date = this.value; };
    $('#e-vis').onchange = function () { e.hidden = this.value === '1'; };
    app.querySelectorAll('[data-t]').forEach(function (t) { t.oninput = function () { e.blocks[+t.getAttribute('data-t')].v = t.value; }; t.onfocus = function () { lastTa = t; }; });
    app.querySelectorAll('.adm-tb button').forEach(function (b) {
      b.onmousedown = function (ev) { ev.preventDefault(); };
      b.onclick = function () { applyTool(b); };
    });
    lastTa = app.querySelector('[data-t]');
    app.querySelectorAll('[data-up]').forEach(function (b) { b.onclick = function () { move(+b.getAttribute('data-up'), -1); }; });
    app.querySelectorAll('[data-dn]').forEach(function (b) { b.onclick = function () { move(+b.getAttribute('data-dn'), 1); }; });
    app.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { e.blocks.splice(+b.getAttribute('data-rm'), 1); if (!e.blocks.length) e.blocks.push({ t: 'text', v: '' }); drawEditor(); }; });
    app.querySelectorAll('[data-ri]').forEach(function (b) { b.onclick = function () { var a = b.getAttribute('data-ri').split(','); e.blocks[+a[0]].items.splice(+a[1], 1); if (!e.blocks[+a[0]].items.length) e.blocks.splice(+a[0], 1); if (!e.blocks.length) e.blocks.push({ t: 'text', v: '' }); drawEditor(); }; });
    app.querySelectorAll('[data-lay]').forEach(function (sl) { sl.onchange = function () { e.blocks[+sl.getAttribute('data-lay')].layout = sl.value; }; });
    app.querySelectorAll('[data-f]').forEach(function (f) { f.onchange = function () { addFiles(f.files, +f.getAttribute('data-f')); }; });
    $('#a-addt').onclick = function () { e.blocks.push({ t: 'text', v: '' }); drawEditor(); };
    $('#a-addi').onchange = function () { addFiles(this.files, -1); };
    $('#a-addm').onchange = function () { addMedia(this.files, -1); };
    app.querySelectorAll('[data-m]').forEach(function (f) { f.onchange = function () { addMedia(f.files, +f.getAttribute('data-m')); }; });
    $('#a-save').onclick = savePost;
    $('#a-prev').onclick = function () {
      var box = $('#adm-prev');
      if (!box.hidden) { box.hidden = true; this.textContent = '미리보기'; return; }
      var html = blocksHtml(e.blocks, prev);
      box.innerHTML = '<div class="s-post-body is-prev"><div class="pv-meta"><span class="s-tag c-' + esc(e.cat) + '">' + esc(CATS[e.cat] || e.cat) + '</span><b>' + esc(e.title || '(제목 없음)') + '</b><span class="d">' + esc(e.date) + '</span></div><div class="tx">' + (html || '<p>내용이 없어요.</p>') + '</div></div>';
      box.hidden = false; this.textContent = '미리보기 닫기';
      box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    };
  }
  var COLORS = [['빨강', '#c8363c'], ['주황', '#d9822b'], ['초록', '#2f8f76'], ['파랑', '#3b63c4'], ['보라', '#7a52b8'], ['회색', '#7a8791']];
  function toolbar() {
    var cb = COLORS.map(function (c) { return '<button type="button" class="tb-c" data-tag="' + c[0] + '" title="' + c[0] + '" style="background:' + c[1] + '"></button>'; }).join('');
    return '<div class="adm-tb" role="toolbar" aria-label="꾸미기 도구">' +
      '<button type="button" data-tag="굵게"><b>가</b> 굵게</button><button type="button" data-tag="작게"><small>가</small> 작게</button><button type="button" data-tag="크게"><span style="font-size:1.2em">가</span> 크게</button>' +
      '<button type="button" data-tag="밑줄"><u>가</u> 밑줄</button><button type="button" data-tag="기울임"><i>가</i> 기울임</button><button type="button" data-tag="취소선"><s>가</s> 취소선</button>' +
      '<span class="tb-sep"></span><span class="tb-l">글자색</span>' + cb +
      '<span class="tb-sep"></span><button type="button" data-line="heading">소제목</button><button type="button" data-line="center">가운데</button><button type="button" data-line="hr">구분선</button><button type="button" data-link="1">링크</button></div>';
  }
  var lastTa = null;
  function ensureSep(v, pos) { // pos 앞뒤가 빈 줄 하나로 나뉘게 필요한 줄바꿈을 채워요
    var before = v.slice(0, pos), need = 0;
    if (before.length) { var m = before.match(/\n*$/)[0].length; need = Math.max(0, 2 - m); }
    return new Array(need + 1).join('\n');
  }
  function applyTool(btn) {
    var ta = lastTa; if (!ta || !document.body.contains(ta)) return msg('먼저 글 칸을 클릭해 주세요.', 'err');
    var v = ta.value, a = ta.selectionStart, b = ta.selectionEnd, sel = v.slice(a, b), ins, caret;
    var tag = btn.getAttribute('data-tag'), line = btn.getAttribute('data-line');
    if (tag) {
      var open = tag === '굵게' ? '**' : '[' + tag + ']', close = tag === '굵게' ? '**' : '[/' + tag + ']';
      ins = open + (sel || '글자') + close; ta.setRangeText(ins, a, b, 'end');
    } else if (btn.getAttribute('data-link')) {
      var url = prompt('연결할 주소(https://...)를 입력하세요'); if (!url) return;
      if (!/^https?:\/\//.test(url)) return msg('주소는 http:// 또는 https:// 로 시작해야 해요.', 'err');
      ins = '[링크 ' + url + ']' + (sel || '여기를 누르세요') + '[/링크]'; ta.setRangeText(ins, a, b, 'end');
    } else if (line === 'hr') {
      var pre = ensureSep(v, a); ins = pre + '---\n\n'; ta.setRangeText(ins, a, b, 'end');
    } else if (line) {
      var ls = v.lastIndexOf('\n', a - 1) + 1, le = v.indexOf('\n', b); if (le < 0) le = v.length;
      var txt = v.slice(ls, le).replace(/^(## |\[가운데\]\s*)/, ''), mark = line === 'heading' ? '## ' : '[가운데]';
      var has = v.slice(ls, le).indexOf(mark) === 0;
      ins = ensureSep(v, ls) + (has ? txt : mark + (txt || '글자'));
      ta.setRangeText(ins, ls, le, 'end');
    }
    ta.focus();
    editing.blocks[+ta.getAttribute('data-t')].v = ta.value;
  }
  function move(i, d) { var b = editing.blocks, j = i + d; if (j < 0 || j >= b.length) return; var t = b[i]; b[i] = b[j]; b[j] = t; drawEditor(); }
  function addFiles(files, idx) {
    var list = Array.prototype.slice.call(files); if (!list.length) return;
    msg('사진을 준비하는 중…');
    Promise.all(list.map(shrink)).then(function (rs) {
      var items = rs.map(function (r, k) {
        var pid = 'p' + Date.now() + '_' + k + '_' + Math.floor(Math.random() * 1e4);
        pending[pid] = { blob: r.blob, ext: r.ext, url: URL.createObjectURL(r.blob) };
        return { pending: pid };
      });
      if (idx >= 0) {
        var bl = editing.blocks[idx], was = bl.items.length;
        bl.items = bl.items.concat(items);
        if (was === 1 && (bl.layout || 'big') === 'big' && bl.items.length > 1) bl.layout = 'grid';
      } else editing.blocks.push({ t: 'img', items: items, layout: items.length > 1 ? 'grid' : 'big' });
      drawEditor();
    }).catch(function (e) { msg(e.message, 'err'); });
  }

  var MAX_MEDIA = 30 * 1024 * 1024;
  function addMedia(files, idx) {
    var list = Array.prototype.slice.call(files), items = [], big = [];
    list.forEach(function (f, k) {
      var kind = /^video\//.test(f.type) ? 'video' : /^audio\//.test(f.type) ? 'audio' : '';
      if (!kind) return;
      if (f.size > MAX_MEDIA) return big.push(f.name);
      var pid = 'm' + Date.now() + '_' + k + '_' + Math.floor(Math.random() * 1e4);
      var ext = (f.name.split('.').pop() || (kind === 'video' ? 'mp4' : 'mp3')).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
      pending[pid] = { blob: f, ext: ext, url: URL.createObjectURL(f) };
      items.push({ pending: pid, kind: kind, name: f.name });
    });
    if (big.length) msg('30MB보다 큰 파일은 올릴 수 없어요: ' + big.join(', ') + ' (긴 영상은 유튜브 링크를 추천해요)', 'err');
    if (!items.length) return;
    if (idx >= 0) editing.blocks[idx].items = editing.blocks[idx].items.concat(items);
    else editing.blocks.push({ t: 'file', items: items });
    drawEditor();
  }

  /* ---------- 저장 처리 ---------- */
  function savePost() {
    if (busy) return;
    var e = editing;
    if (!e.title.trim()) return msg('제목을 입력해 주세요.', 'err');
    var blocks = e.blocks.filter(function (b) { return b.t === 'text' ? (b.v || '').trim() : b.items.length; });
    if (!blocks.length) return msg('내용을 입력해 주세요.', 'err');
    busy = true; msg('저장하는 중… 사진이 많으면 조금 걸려요.');
    var upload = [], clean = [];
    var chain = Promise.resolve();
    blocks.forEach(function (b) {
      if (b.t === 'text') return clean.push({ t: 'text', v: b.v });
      var nb = { t: b.t, items: [] }; if (b.layout) nb.layout = b.layout; clean.push(nb);
      b.items.forEach(function (it) {
        if (!it.pending) return nb.items.push(it.kind ? { src: it.src, kind: it.kind, name: it.name } : { src: it.src });
        var pd = pending[it.pending], path = 'images/board/' + e.id + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) + '.' + pd.ext;
        nb.items.push(it.kind ? { src: path, kind: it.kind, name: it.name } : { src: path });
        chain = chain.then(function () { return toB64(pd.blob); }).then(function (b64) { upload.push({ path: path, b64: b64 }); });
      });
    });
    chain.then(function () {
      var post = { id: e.id, date: e.date, cat: e.cat, title: e.title.trim(), images: [], blocks: clean, body: blocksHtml(clean) };
      if (e.hidden) post.hidden = true;
      var next = posts.filter(function (x) { return x.id !== e.id; }).concat([post]);
      var still = {}; next.forEach(function (p) { srcsOf(p).forEach(function (s) { still[s] = 1; }); });
      var old = posts.filter(function (x) { return x.id === e.id; })[0];
      var gone = old ? srcsOf(old).filter(function (s) { return !still[s] && /^images\/board\//.test(s); }) : [];
      return saveAll(next, upload, '게시판: ' + (e.isNew ? '새 글' : '글 수정') + ' (' + e.id + ')', '저장했어요! 1~2분 뒤 사이트에 반영돼요.', gone);
    }).catch(function (er) { busy = false; msg(er.message, 'err'); });
  }
  function saveAll(next, upload, message, done, remove) {
    busy = true; msg('저장하는 중…');
    if (!remove) {
      var still = {}; next.forEach(function (p) { srcsOf(p).forEach(function (s) { still[s] = 1; }); });
      remove = [];
      posts.forEach(function (p) { srcsOf(p).forEach(function (s) { if (!still[s] && /^images\/board\//.test(s)) remove.push(s); }); });
    }
    return commit(next, upload, remove, message).then(function () {
      posts = next; pending = {}; busy = false; viewList(done);
    }).catch(function (er) { busy = false; msg(er.message, 'err'); });
  }

  /* ---------- 시작 ---------- */
  function start() {
    if (!token || !repo) return viewLogin();
    app.innerHTML = '<p class="adm-msg">불러오는 중…</p>';
    api('').then(function (r) { return fetchPosts(r.default_branch); })
      .then(function (list) { posts = list; viewList(); })
      .catch(function (e) { token = ''; store(KEY, null); viewLogin(e.message); });
  }
  start();
})();
