/* 글 작성 도우미: 입력 → posts.js에 붙일 블록 생성 */
(function () {
  var $ = function (i) { return document.getElementById(i); };
  var d = new Date(), z = function (n) { return (n < 10 ? '0' : '') + n; };
  $('w-date').value = d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate());
  $('w-files').addEventListener('change', function () {
    $('w-imgs').value = Array.prototype.map.call(this.files, function (f) { return f.name; }).join('\n');
  });
  var q = function (s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; };
  $('w-make').addEventListener('click', function () {
    var ids = (window.HRC_POSTS || []).map(function (p) { return parseInt(p.id, 10) || 0; });
    var next = (ids.length ? Math.max.apply(null, ids) : 0) + 1;
    var id = ('000' + next).slice(-3);
    var imgs = $('w-imgs').value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
    var body = $('w-body').value.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
    var out = "  {\n    id: '" + id + "',\n    date: '" + $('w-date').value + "',\n    cat: '" + $('w-cat').value + "',\n    title: " + q($('w-title').value) +
      ",\n    images: [" + imgs.map(q).join(', ') + "],\n    body: `\n" + body + "\n    `\n  },";
    $('w-out').textContent = out; $('w-out').hidden = false; $('w-copy').hidden = false;
  });
  $('w-copy').addEventListener('click', function () {
    var t = $('w-out').textContent, b = this;
    (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = '복사됨'; }, function () {
      var r = document.createRange(); r.selectNodeContents($('w-out')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = '선택됨 — Ctrl+C';
    });
  });
})();
