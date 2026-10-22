/* 현상대응컴퍼니 공식 아카이브 — 사이트 공통 스크립트 */
(function () {
  'use strict';

  /* 1) 목차: 지금 보고 있는 섹션 표시 */
  var toc = document.querySelector('.s-toc');
  if (toc) {
    var links = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'));
    var targets = links.map(function (a) { return document.getElementById(a.getAttribute('href').slice(1)); });
    var ticking = false;
    var update = function () {
      ticking = false;
      var line = window.innerHeight * 0.28;
      var current = -1;
      for (var i = 0; i < targets.length; i++) {
        if (targets[i] && targets[i].getBoundingClientRect().top <= line) current = i;
      }
      links.forEach(function (a, i) { a.classList.toggle('is-on', i === current); });
      var on = toc.querySelector('a.is-on');
      if (on && window.matchMedia('(max-width:1100px)').matches) {
        var ul = on.closest('ul');
        if (ul) ul.scrollLeft = on.offsetLeft - ul.clientWidth / 2 + on.clientWidth / 2;
      }
    };
    window.addEventListener('scroll', function () {
      if (!ticking) { ticking = true; requestAnimationFrame(update); }
    }, { passive: true });
    window.addEventListener('resize', update);
    update();
  }

  /* 2) 게시판 */
  var CATS = { notice: '공지', lore: '설정', bside: 'B컷', chat: '잡담' };
  var posts = (window.HRC_POSTS || []).slice().sort(function (a, b) {
    return a.date < b.date ? 1 : a.date > b.date ? -1 : (a.id < b.id ? 1 : -1);
  });

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function fmtDate(d) { return String(d).replace(/-/g, '.'); }

  /* 2-a) 메인 화면의 최근 글 */
  var latest = document.querySelector('[data-latest]');
  if (latest) {
    var base = latest.getAttribute('data-base') || '';
    var top = posts.slice(0, 4);
    latest.innerHTML = top.length ? top.map(function (p) {
      return '<li><a href="' + base + 'board/#p' + esc(p.id) + '">' +
        '<span><span class="s-tag c-' + esc(p.cat) + '">' + esc(CATS[p.cat] || p.cat) + '</span></span>' +
        '<span class="t">' + esc(p.title) + '</span>' +
        '<span class="d">' + fmtDate(p.date) + '</span></a></li>';
    }).join('') : '<li class="s-empty">아직 등록된 글이 없습니다.</li>';
  }

  /* 2-b) 게시판 목록 */
  var board = document.querySelector('[data-board]');
  if (board) {
    var html = posts.map(function (p) {
      var imgs = (p.images || []).map(function (u) {
        var src = /^(https?:)?\/\//.test(u) ? u : '../images/' + u;
        return '<img src="' + esc(src) + '" alt="" loading="lazy">';
      }).join('');
      var text = p.body || '';
      if (text.indexOf('<') === -1) {
        text = text.trim().split(/\n\s*\n/).map(function (para) {
          return '<p>' + esc(para.trim()).replace(/\n/g, '<br>') + '</p>';
        }).join('');
      }
      return '<div class="s-post" id="p' + esc(p.id) + '" data-cat="' + esc(p.cat) + '">' +
        '<button type="button" class="s-post-row" aria-expanded="false">' +
        '<span class="no">' + esc(p.id) + '</span>' +
        '<span><span class="s-tag c-' + esc(p.cat) + '">' + esc(CATS[p.cat] || p.cat) + '</span></span>' +
        '<span class="ti">' + esc(p.title) + '</span>' +
        '<span class="dt">' + fmtDate(p.date) + '</span></button>' +
        '<div class="s-post-body"><div class="tx">' + text + '</div>' +
        (imgs ? '<figure>' + imgs + '</figure>' : '') + '</div></div>';
    }).join('');
    board.innerHTML = '<div class="s-board-h"><span>번호</span><span>분류</span><span>제목</span><span>작성일</span></div>' +
      (html || '<div class="s-empty">아직 등록된 글이 없습니다.</div>');

    var open = function (post, yes) {
      post.classList.toggle('is-open', yes);
      post.querySelector('.s-post-row').setAttribute('aria-expanded', yes ? 'true' : 'false');
    };
    board.addEventListener('click', function (e) {
      var row = e.target.closest('.s-post-row');
      if (!row) return;
      var post = row.parentNode;
      var willOpen = !post.classList.contains('is-open');
      open(post, willOpen);
      if (willOpen && history.replaceState) history.replaceState(null, '', '#' + post.id);
    });

    var filters = document.querySelectorAll('[data-filter]');
    Array.prototype.forEach.call(filters, function (b) {
      b.addEventListener('click', function () {
        var f = b.getAttribute('data-filter');
        Array.prototype.forEach.call(filters, function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        Array.prototype.forEach.call(board.querySelectorAll('.s-post'), function (p) {
          p.classList.toggle('s-hidden', f !== 'all' && p.getAttribute('data-cat') !== f);
        });
      });
    });

    /* 주소에 #p001 처럼 붙어 있으면 그 글을 바로 열기 */
    var openFromHash = function () {
      var id = location.hash.slice(1);
      var el = id && document.getElementById(id);
      if (el && el.classList.contains('s-post')) {
        open(el, true);
        el.scrollIntoView({ block: 'start' });
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
  }

  /* 3) 소개글 안의 인원 카드를 눌렀을 때 이동 (링크가 걸린 카드만) */
  Array.prototype.forEach.call(document.querySelectorAll('.cm.s-linked'), function (c) {
    c.addEventListener('click', function (e) {
      if (e.target.closest('a')) return;
      var a = c.querySelector('.s-cover');
      if (a) a.click();
    });
  });
})();
