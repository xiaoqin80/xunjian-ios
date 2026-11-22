/* 寻见 · 跨页迷你播放条
 * 作用：在首页 / 经库 / 我的 等页面底部显示「上次在听什么」，点它回到乐库接着放。
 * 说明：页面之间是整页跳转，音频本身不能跨页续播；这里是状态续接，不是后台播放。
 */
(function () {
  if (location.pathname.indexOf('乐库') >= 0) return;
  if (window.name === "xj-embed" || /[?&]embed=1/.test(location.search)) return;   // 壳里有自己的迷你条   // 乐库自己有迷你条

  var KEY = 'xj_music_last';
  var raw = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { raw = null; }
  if (!raw || typeof raw.i !== 'number') return;

  var name = raw.name || '上次播放的诗歌';
  var book = raw.book || '';
  var t = raw.t || 0, d = raw.dur || 0;
  function fmt(s){ s = Math.max(0, s | 0); return (s / 60 | 0) + ':' + ('0' + (s % 60)).slice(-2); }

  var css = ''
    + '.xj-mini{position:fixed;left:12px;right:12px;bottom:calc(72px + env(safe-area-inset-bottom));z-index:60;'
    + 'display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:12px;background:rgba(252,249,242,.98);'
    + 'border:1px solid #E4DBC9;box-shadow:0 4px 18px rgba(38,35,30,.14);font-family:"PingFang SC","Microsoft YaHei",sans-serif;cursor:pointer}'
    + '.xj-mini .c{width:30px;height:30px;border-radius:7px;flex:none;background:linear-gradient(145deg,#B5924F,#8A6A3B);'
    + 'display:flex;align-items:center;justify-content:center;color:#fff;font-family:STSong,serif;font-size:13px}'
    + '.xj-mini .n{flex:1;min-width:0;font-size:11.5px;color:#26231E;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.xj-mini .n i{font-style:normal;color:#93897A;font-size:9.5px;margin-left:6px}'
    + '.xj-mini .b{width:28px;height:28px;flex:none;display:flex;align-items:center;justify-content:center}'
    + '.xj-mini .b svg{width:15px;height:15px;fill:#8A6A3B}'
    + '.xj-mini .p{position:absolute;left:10px;right:10px;bottom:2px;height:1.5px;background:#E4DBC9;border-radius:2px;overflow:hidden}'
    + '.xj-mini .p i{display:block;height:100%;background:#8A6A3B;width:' + (d > 0 ? Math.min(100, t / d * 100) : 0) + '%}';

  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);


  /* 给主滚动区留出底部空间，避免最后一行被迷你条压住 */
  (function pad(){
    var cands = ['#list', '.list', '.scroll', '.wrap', 'main', '.detail', '.deck'];
    for (var i = 0; i < cands.length; i++) {
      var el = document.querySelector(cands[i]);
      if (el) {
        var cs = getComputedStyle(el);
        if (/(auto|scroll)/.test(cs.overflowY) && el.scrollHeight > el.clientHeight) {
          el.style.paddingBottom = (parseInt(cs.paddingBottom || '0', 10) + 92) + 'px';
          return;
        }
      }
    }
  })();

  var el = document.createElement('div');
  el.className = 'xj-mini';
  el.innerHTML = '<div class="c">' + name.charAt(0) + '</div>'
    + '<div class="n">' + name + (book ? '<i>' + book + '</i>' : '') + '</div>'
    + '<div class="b"><svg viewBox="0 0 24 24"><path d="M7 5v14l11-7z"/></svg></div>'
    + '<div class="p"><i></i></div>';
  document.body.appendChild(el);

  function go(autoplay) {
    location.href = '乐库.html?resume=1' + (autoplay ? '&autoplay=1' : '') + '&t=' + (t | 0);
  }
  el.addEventListener('click', function (e) {
    go(!!e.target.closest('.b'));
  });
})();
